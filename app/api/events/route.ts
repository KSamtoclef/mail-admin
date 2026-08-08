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

const eventSchema = z.object({
  event_type: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_.:-]+$/),
  session_id: z.string().uuid().optional().nullable(),
  campaign_id: z.string().uuid().optional().nullable(),
  recipient_id: z.string().uuid().optional().nullable(),
  contact_id: z.string().uuid().optional().nullable(),
  page_url: z.string().url().max(4000).optional().nullable(),
  referrer: z.string().max(2000).optional().nullable(),
  metadata: z.record(z.unknown()).optional().default({})
});

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204, headers: await corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  const headers = await corsHeaders(request);

  if (!(await trackingIsConfigured())) {
    return NextResponse.json({ ok: false, error: "Tracking is not configured" }, { status: 503, headers });
  }

  if (!(await isAllowedTrackingOrigin(request))) {
    return NextResponse.json({ ok: false, error: "Origin not allowed" }, { status: 403, headers });
  }

  try {
    const payload = eventSchema.parse(await request.json());
    const origin = requestOrigin(request);

    if (!pageUrlMatchesOrigin(payload.page_url, origin)) {
      return NextResponse.json({ ok: false, error: "Page URL does not match request origin" }, { status: 400, headers });
    }

    const serializedMetadata = JSON.stringify(payload.metadata);
    if (serializedMetadata.length > 8192) {
      return NextResponse.json({ ok: false, error: "Event metadata is too large" }, { status: 413, headers });
    }

    const supabase = getSupabaseAdmin();
    const country = request.headers.get("x-vercel-ip-country");
    const region = request.headers.get("x-vercel-ip-country-region");
    const userAgent = request.headers.get("user-agent") ?? "";
    const client = classifyClient(userAgent, request);

    const { error } = await supabase.from("events").insert({
      ...payload,
      country_code: country,
      region,
      device_type: client.deviceType,
      browser: client.browser,
      is_bot: client.isBot,
      bot_reason: client.botReason,
      metadata: {
        ...payload.metadata,
        user_agent: userAgent,
        os: client.os
      }
    });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers });
    }

    if (payload.session_id) {
      const { error: sessionError } = await supabase
        .from("sessions")
        .update({
          last_seen_at: new Date().toISOString(),
          country_code: country,
          region,
          device_type: client.deviceType,
          browser: client.browser,
          os: client.os
        })
        .eq("id", payload.session_id);

      if (sessionError) console.error("Unable to update tracking session", sessionError.message);
    }

    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid event payload", issues: error.issues }, { status: 400, headers });
    }

    return NextResponse.json({ ok: false, error: "Unable to record event" }, { status: 500, headers });
  }
}
