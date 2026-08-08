import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

const sessionSchema = z.object({
  anonymous_id: z.string().min(8).max(160),
  page_url: z.string().url().optional().nullable(),
  referrer: z.string().max(2000).optional().nullable()
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
    const payload = sessionSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    const country = request.headers.get("x-vercel-ip-country");
    const region = request.headers.get("x-vercel-ip-country-region");
    const userAgent = request.headers.get("user-agent") ?? "";
    const deviceType = /iphone|ipad|android|mobile/i.test(userAgent) ? "mobile" : /windows|macintosh|linux/i.test(userAgent) ? "desktop" : "unknown";

    const { data, error } = await supabase.from("sessions").insert({
      anonymous_id: payload.anonymous_id,
      country_code: country,
      region,
      device_type: deviceType,
      last_seen_at: new Date().toISOString()
    }).select("id").single();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers });

    await supabase.from("events").insert({
      event_type: "session_started",
      session_id: data.id,
      page_url: payload.page_url ?? null,
      referrer: payload.referrer ?? null,
      country_code: country,
      region,
      device_type: deviceType,
      metadata: { anonymous_id: payload.anonymous_id, user_agent: userAgent }
    });

    return NextResponse.json({ ok: true, session_id: data.id }, { headers });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid session payload", issues: error.issues }, { status: 400, headers });
    }
    return NextResponse.json({ ok: false, error: "Unable to start session" }, { status: 500, headers });
  }
}
