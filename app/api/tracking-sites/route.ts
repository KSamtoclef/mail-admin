import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const siteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  site_url: z.string().trim().url().max(2000)
});

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  site_url: z.string().trim().url().max(2000).optional(),
  active: z.boolean().optional()
});

const deleteSchema = z.object({ id: z.string().uuid() });

function normalizeSiteUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http/https sites are supported");
  }

  url.hash = "";
  url.search = "";
  const siteUrl = url.toString();
  const origin = url.origin;
  return { siteUrl, origin };
}

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tracking_sites")
    .select("id,name,site_url,origin,active,created_at,updated_at")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sites: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    const input = siteSchema.parse(await request.json());
    const { siteUrl, origin } = normalizeSiteUrl(input.site_url);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("tracking_sites")
      .upsert({
        name: input.name,
        site_url: siteUrl,
        origin,
        active: true,
        updated_at: new Date().toISOString()
      }, { onConflict: "origin" })
      .select("id,name,site_url,origin,active,created_at,updated_at")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, site: data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid tracking site", issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to save tracking site" }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const input = updateSchema.parse(await request.json());
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (input.name !== undefined) patch.name = input.name;
    if (input.active !== undefined) patch.active = input.active;
    if (input.site_url !== undefined) {
      const { siteUrl, origin } = normalizeSiteUrl(input.site_url);
      patch.site_url = siteUrl;
      patch.origin = origin;
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("tracking_sites")
      .update(patch)
      .eq("id", input.id)
      .select("id,name,site_url,origin,active,created_at,updated_at")
      .single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, site: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid tracking site update", issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to update tracking site" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const input = deleteSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from("tracking_sites").delete().eq("id", input.id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid tracking site id" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "Unable to remove tracking site" }, { status: 500 });
  }
}
