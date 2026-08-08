import { NextRequest, NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const BATCH_SIZE = 500;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

type CsvRow = Record<string, string | undefined>;

type CleanContact = {
  external_user_id: string | null;
  external_session_id: string | null;
  username: string;
  email: string;
};

function canonicalHeader(value: string) {
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");

  if (["user_id", "userid", "external_user_id", "id"].includes(key)) return "user_id";
  if (["session_id", "sessionid", "external_session_id"].includes(key)) return "session_id";
  if (["username", "full_name", "fullname", "display_name", "name"].includes(key)) return "username";
  if (["email", "display_email", "user_email", "email_address"].includes(key)) return "email";

  return key;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function mergeContact(existing: CleanContact, incoming: CleanContact): CleanContact {
  return {
    external_user_id: existing.external_user_id || incoming.external_user_id,
    external_session_id: existing.external_session_id || incoming.external_session_id,
    username: existing.username || incoming.username,
    email: existing.email || incoming.email
  };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const uploaded = formData.get("file");

    if (!(uploaded instanceof File)) {
      return NextResponse.json({ ok: false, error: "Choose a CSV file first." }, { status: 400 });
    }

    if (uploaded.size === 0) {
      return NextResponse.json({ ok: false, error: "The selected CSV file is empty." }, { status: 400 });
    }

    if (uploaded.size > MAX_FILE_BYTES) {
      return NextResponse.json({ ok: false, error: "CSV is larger than the 8 MB import limit." }, { status: 413 });
    }

    const csvText = await uploaded.text();
    let rows: CsvRow[];

    try {
      rows = parse(csvText, {
        bom: true,
        columns: (headers: string[]) => headers.map(canonicalHeader),
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true
      }) as CsvRow[];
    } catch (error) {
      return NextResponse.json({
        ok: false,
        error: error instanceof Error ? `Unable to parse CSV: ${error.message}` : "Unable to parse CSV."
      }, { status: 400 });
    }

    if (!rows.length) {
      return NextResponse.json({ ok: false, error: "No data rows were found in the CSV." }, { status: 400 });
    }

    const deduped = new Map<string, CleanContact>();
    const invalidSamples: Array<{ row: number; email: string; reason: string }> = [];
    let invalidRows = 0;
    let validRows = 0;
    let duplicateRows = 0;

    rows.forEach((row, index) => {
      const email = text(row.email);
      const username = text(row.username);
      const userId = text(row.user_id);
      const sessionId = text(row.session_id);
      const rowNumber = index + 2;

      if (!username) {
        invalidRows += 1;
        if (invalidSamples.length < 20) invalidSamples.push({ row: rowNumber, email, reason: "missing username" });
        return;
      }

      if (!email) {
        invalidRows += 1;
        if (invalidSamples.length < 20) invalidSamples.push({ row: rowNumber, email: "", reason: "missing email" });
        return;
      }

      if (!EMAIL_PATTERN.test(email)) {
        invalidRows += 1;
        if (invalidSamples.length < 20) invalidSamples.push({ row: rowNumber, email, reason: "invalid-looking email" });
        return;
      }

      validRows += 1;
      const normalizedEmail = email.toLowerCase();
      const contact: CleanContact = {
        external_user_id: userId || null,
        external_session_id: sessionId || null,
        username,
        email
      };

      const existing = deduped.get(normalizedEmail);
      if (existing) {
        duplicateRows += 1;
        deduped.set(normalizedEmail, mergeContact(existing, contact));
      } else {
        deduped.set(normalizedEmail, contact);
      }
    });

    const contacts = Array.from(deduped.values());
    if (!contacts.length) {
      return NextResponse.json({
        ok: false,
        error: "No importable contacts remained after validation.",
        summary: { totalRows: rows.length, validRows, uniqueRows: 0, duplicateRows, invalidRows },
        invalidSamples
      }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const beforeResult = await supabase.from("contacts").select("id", { count: "exact", head: true });

    if (beforeResult.error) {
      return NextResponse.json({ ok: false, error: beforeResult.error.message }, { status: 500 });
    }

    for (let start = 0; start < contacts.length; start += BATCH_SIZE) {
      const batch = contacts.slice(start, start + BATCH_SIZE);
      const { error } = await supabase
        .from("contacts")
        .upsert(batch, { onConflict: "email_normalized", ignoreDuplicates: false });

      if (error) {
        return NextResponse.json({
          ok: false,
          error: `Import stopped at row batch ${Math.floor(start / BATCH_SIZE) + 1}: ${error.message}`,
          importedBeforeFailure: start
        }, { status: 500 });
      }
    }

    const afterResult = await supabase.from("contacts").select("id", { count: "exact", head: true });
    if (afterResult.error) {
      return NextResponse.json({ ok: false, error: afterResult.error.message }, { status: 500 });
    }

    const beforeCount = beforeResult.count ?? 0;
    const afterCount = afterResult.count ?? beforeCount;
    const addedRows = Math.max(0, afterCount - beforeCount);
    const updatedRows = Math.max(0, contacts.length - addedRows);

    const summary = {
      filename: uploaded.name,
      totalRows: rows.length,
      validRows,
      uniqueRows: contacts.length,
      addedRows,
      updatedRows,
      duplicateRows,
      invalidRows,
      totalContactsAfterImport: afterCount
    };

    const audit = await supabase.from("contact_imports").insert({
      filename: uploaded.name,
      total_rows: summary.totalRows,
      valid_rows: summary.validRows,
      unique_rows: summary.uniqueRows,
      added_rows: summary.addedRows,
      updated_rows: summary.updatedRows,
      duplicate_rows: summary.duplicateRows,
      invalid_rows: summary.invalidRows
    });

    return NextResponse.json({
      ok: true,
      summary,
      invalidSamples,
      auditSaved: !audit.error,
      auditError: audit.error?.message ?? null
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to import contacts."
    }, { status: 500 });
  }
}
