import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const eventSchema = z.object({
  event_type: z.string().min(1).max(80),
  session_id: z.string().uuid().optional().nullable(),
  campaign_id: z.string().uuid().optional().nullable(),
  recipient_id: z.string().uuid().optional().nullable(),
  contact_id: z.string().uuid().optional().nullable(),
  page_url: z.string().url().optional().nullable(),
  referrer: z.string().max(2000).optional().nullable(),
  metadata: z.record(z.unknown()).optional().default({})
});

function corsHeaders(request: NextRequest) {
  const origin = request.headers.get("origin");
  const allowedOrigins = (process.env.TRACKING_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const allowOrigin = origin && allowedOrigins.includes(origin) ? origin : "null";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request);

  if (headers["Access-Control-Allow-Origin"] === "null" && request.headers.get("origin")) {
    return NextResponse.json({ ok: false, error: "Origin not allowed" }, { status: 403, headers });
  }

  try {
    const payload = eventSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();

    const country = request.headers.get("x-vercel-ip-country");
    const region = request.headers.get("x-vercel-ip-country-region");
    const userAgent = request.headers.get("user-agent") ?? "";

    const { error } = await supabase.from("events").insert({
      ...payload,
      country_code: country,
      region,
      metadata: {
        ...payload.metadata,
        user_agent: userAgent
      }
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers });
    }

    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid event payload", issues: error.issues }, { status: 400, headers });
    }

    return NextResponse.json({ ok: false, error: "Unable to record event" }, { status: 500, headers });
  }
}
