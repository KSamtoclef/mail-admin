import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const campaignSchema = z.object({
  name: z.string().min(1).max(160),
  subject: z.string().min(1).max(300),
  from_name: z.string().max(160).optional().nullable(),
  reply_to: z.string().email().optional().nullable(),
  text_body: z.string().min(1),
  tracking_mode: z.enum(["clicks_and_site", "clicks_only", "delivery_only"]).default("clicks_and_site"),
  scheduled_at: z.string().datetime().optional().nullable()
});

function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function GET() {
  if (!configured()) return NextResponse.json({ ok: false, error: "Supabase is not configured" }, { status: 503 });
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("campaigns").select("*").order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, campaigns: data ?? [] });
}

export async function POST(request: NextRequest) {
  if (!configured()) return NextResponse.json({ ok: false, error: "Connect Supabase before saving campaigns" }, { status: 503 });

  try {
    const payload = campaignSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from("campaigns").insert({
      ...payload,
      status: payload.scheduled_at ? "scheduled" : "draft"
    }).select("*").single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, campaign: data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid campaign", issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "Unable to save campaign" }, { status: 500 });
  }
}
