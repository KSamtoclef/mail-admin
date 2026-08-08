import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  daily_send_limit: z.number().int().min(1).max(1_000_000).optional(),
  max_batch_size: z.number().int().min(1).max(100).optional(),
  timezone: z.string().min(1).max(80).optional(),
  sending_paused: z.boolean().optional()
});

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const [{ data: settings, error: settingsError }, { data: usage, error: usageError }] = await Promise.all([
      supabase.from("send_settings").select("id,daily_send_limit,max_batch_size,timezone,sending_paused,updated_at").eq("id", 1).single(),
      supabase.rpc("mail_daily_send_usage")
    ]);

    if (settingsError) {
      return NextResponse.json({ ok: false, error: settingsError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      settings,
      usage: usageError ? null : (usage?.[0] ?? null),
      usageError: usageError?.message ?? null
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load send settings" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const payload = updateSchema.parse(await request.json());
    if (payload.timezone && !validTimezone(payload.timezone)) {
      return NextResponse.json({ ok: false, error: "Invalid timezone" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("send_settings")
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("id", 1)
      .select("id,daily_send_limit,max_batch_size,timezone,sending_paused,updated_at")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, settings: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid send settings", issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "Unable to update send settings" }, { status: 500 });
  }
}
