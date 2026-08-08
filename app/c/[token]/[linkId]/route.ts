import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function classifyUserAgent(userAgent: string) {
  const ua = userAgent.toLowerCase();
  const scannerPatterns = [
    "proofpoint",
    "mimecast",
    "barracuda",
    "safelinks",
    "urlscan",
    "security scanner",
    "email protection",
    "crawler",
    "spider",
    "bot"
  ];

  const matched = scannerPatterns.find((pattern) => ua.includes(pattern));
  const deviceType = /iphone|ipad|android|mobile/.test(ua) ? "mobile" : /windows|macintosh|linux/.test(ua) ? "desktop" : "unknown";

  return {
    isBot: Boolean(matched),
    botReason: matched ? `user-agent:${matched}` : null,
    deviceType
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string; linkId: string }> }
) {
  const { token, linkId } = await context.params;
  const supabase = getSupabaseAdmin();

  const { data: recipient, error: recipientError } = await supabase
    .from("campaign_recipients")
    .select("id,campaign_id,contact_id")
    .eq("tracking_token", token)
    .maybeSingle();

  if (recipientError || !recipient) {
    return NextResponse.json({ ok: false, error: "Tracking link not found" }, { status: 404 });
  }

  const { data: link, error: linkError } = await supabase
    .from("tracked_links")
    .select("id,destination_url")
    .eq("id", linkId)
    .eq("campaign_id", recipient.campaign_id)
    .maybeSingle();

  if (linkError || !link) {
    return NextResponse.json({ ok: false, error: "Campaign link not found" }, { status: 404 });
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  const country = request.headers.get("x-vercel-ip-country");
  const region = request.headers.get("x-vercel-ip-country-region");
  const classification = classifyUserAgent(userAgent);

  let sessionId: string | null = null;

  if (!classification.isBot) {
    const { data: session } = await supabase
      .from("sessions")
      .insert({
        contact_id: recipient.contact_id,
        campaign_id: recipient.campaign_id,
        recipient_id: recipient.id,
        country_code: country,
        region,
        device_type: classification.deviceType,
        last_seen_at: new Date().toISOString()
      })
      .select("id")
      .single();

    sessionId = session?.id ?? null;
  }

  await supabase.from("events").insert({
    event_type: "email_link_click",
    campaign_id: recipient.campaign_id,
    recipient_id: recipient.id,
    contact_id: recipient.contact_id,
    session_id: sessionId,
    link_id: link.id,
    is_bot: classification.isBot,
    bot_reason: classification.botReason,
    country_code: country,
    region,
    device_type: classification.deviceType,
    metadata: {
      user_agent: userAgent
    }
  });

  const destination = new URL(link.destination_url);
  if (sessionId) {
    destination.searchParams.set("mt_sid", sessionId);
  }

  return NextResponse.redirect(destination, 302);
}
