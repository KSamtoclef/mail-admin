import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { classifyClient, validHttpDestination } from "@/lib/tracking-security";

const uuid = z.string().uuid();

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string; linkId: string }> }
) {
  const rawParams = await context.params;
  const parsedToken = uuid.safeParse(rawParams.token);
  const parsedLinkId = uuid.safeParse(rawParams.linkId);

  if (!parsedToken.success || !parsedLinkId.success) {
    return NextResponse.json({ ok: false, error: "Tracking link not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const token = parsedToken.data;
  const linkId = parsedLinkId.data;
  const supabase = getSupabaseAdmin() as any;

  const { data: link, error: linkError } = await supabase
    .from("tracked_links")
    .select("id,campaign_id,destination_url")
    .eq("id", linkId)
    .maybeSingle();

  if (linkError || !link || !validHttpDestination(link.destination_url)) {
    return NextResponse.json({ ok: false, error: "Campaign link not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  let recipient: { id: string; campaign_id: string; contact_id: string } | null = null;

  const directRecipient = await supabase
    .from("campaign_recipients")
    .select("id,campaign_id,contact_id")
    .eq("tracking_token", token)
    .maybeSingle();

  if (!directRecipient.error && directRecipient.data?.campaign_id === link.campaign_id) {
    recipient = directRecipient.data;
  }

  if (!recipient) {
    const contactResult = await supabase
      .from("contacts")
      .select("id")
      .eq("broadcast_tracking_token", token)
      .maybeSingle();

    if (!contactResult.error && contactResult.data?.id) {
      const broadcastRecipient = await supabase
        .from("campaign_recipients")
        .select("id,campaign_id,contact_id")
        .eq("campaign_id", link.campaign_id)
        .eq("contact_id", contactResult.data.id)
        .maybeSingle();
      if (!broadcastRecipient.error && broadcastRecipient.data) recipient = broadcastRecipient.data;
    }
  }

  if (!recipient) {
    return NextResponse.json({ ok: false, error: "Tracking link not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const userAgent = request.headers.get("user-agent") ?? "";
  const country = request.headers.get("x-vercel-ip-country");
  const region = request.headers.get("x-vercel-ip-country-region");
  const classification = classifyClient(userAgent, request);

  let sessionId: string | null = null;

  if (!classification.isBot) {
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .insert({
        contact_id: recipient.contact_id,
        campaign_id: recipient.campaign_id,
        recipient_id: recipient.id,
        country_code: country,
        region,
        device_type: classification.deviceType,
        browser: classification.browser,
        os: classification.os,
        last_seen_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (sessionError) console.error("Unable to create attributed tracking session", sessionError.message);
    sessionId = session?.id ?? null;
  }

  const { error: eventError } = await supabase.from("events").insert({
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
    browser: classification.browser,
    metadata: {
      user_agent: userAgent,
      os: classification.os,
      transport: "resend_broadcast"
    }
  });

  if (eventError) console.error("Unable to record email_link_click event", eventError.message);

  const destination = new URL(link.destination_url);
  if (sessionId) destination.searchParams.set("mt_sid", sessionId);

  const response = NextResponse.redirect(destination, 302);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
