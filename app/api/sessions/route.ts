import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import {
  classifyClient,
  corsHeaders,
  isAllowedTrackingOrigin,
  pageUrlMatchesOrigin,
  requestOrigin,
  trackingIsConfigured
} from "@/lib/tracking-security";

const sessionSchema = z.object({
  anonymous_id: z.string().min(8).max(160),
  page_url: z.string().url().max(4000).optional().nullable(),
  referrer: z.string().max(2000).optional().nullable()
});

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request);

  if (!trackingIsConfigured()) {
    return NextResponse.json({ ok: false, error: "Tracking is not configured" }, { status: 503, headers });
  }

  if (!isAllowedTrackingOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Origin not allowed" }, { status: 403, headers });
  }

  try {
    const payload = sessionSchema.parse(await request.json());
    const origin = requestOrigin(request);

    if (!pageUrlMatchesOrigin(payload.page_url, origin)) {
      return NextResponse.json({ ok: false, error: "Page URL does not match request origin" }, { status: 400, headers });
    }

    const supabase = getSupabaseAdmin();
    const country = request.headers.get("x-vercel-ip-country");
    const region = request.headers.get("x-vercel-ip-country-region");
    const userAgent = request.headers.get("user-agent") ?? "";
    const client = classifyClient(userAgent, request);

    const { data, error } = await supabase.from("sessions").insert({
      anonymous_id: payload.anonymous_id,
      country_code: country,
      region,
      device_type: client.deviceType,
      browser: client.browser,
      os: client.os,
      last_seen_at: new Date().toISOString()
    }).select("id").single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers });
    }

    const { error: eventError } = await supabase.from("events").insert({
      event_type: "session_started",
      session_id: data.id,
      page_url: payload.page_url ?? null,
      referrer: payload.referrer ?? null,
      country_code: country,
      region,
      device_type: client.deviceType,
      browser: client.browser,
      is_bot: client.isBot,
      bot_reason: client.botReason,
      metadata: {
        anonymous_id: payload.anonymous_id,
        user_agent: userAgent,
        os: client.os
      }
    });

    if (eventError) console.error("Unable to record session_started event", eventError.message);

    return NextResponse.json({ ok: true, session_id: data.id }, { headers });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid session payload", issues: error.issues }, { status: 400, headers });
    }

    return NextResponse.json({ ok: false, error: "Unable to start session" }, { status: 500, headers });
  }
}
