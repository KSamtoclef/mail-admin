import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function verifySvix(payload: string, request: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");

  if (!secret || !id || !timestamp || !signature) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;
  if (Math.abs(Date.now() / 1000 - timestampNumber) > 5 * 60) return false;

  try {
    const encodedSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const key = Buffer.from(encodedSecret, "base64");
    const signedContent = `${id}.${timestamp}.${payload}`;
    const expected = createHmac("sha256", key).update(signedContent).digest("base64");

    const candidates = signature
      .split(" ")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.includes(",") ? part.split(",").slice(1).join(",") : part);

    return candidates.some((candidate) => {
      const left = Buffer.from(candidate);
      const right = Buffer.from(expected);
      return left.length === right.length && timingSafeEqual(left, right);
    });
  } catch {
    return false;
  }
}

function firstRecipient(payload: any) {
  const to = payload?.data?.to;
  return Array.isArray(to) && typeof to[0] === "string" ? to[0].trim().toLowerCase() : null;
}

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifySvix(raw, request)) {
    return NextResponse.json({ ok: false, error: "Invalid webhook signature" }, { status: 400 });
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = typeof payload?.type === "string" ? payload.type : "unknown";
  const providerMessageId = typeof payload?.data?.email_id === "string" ? payload.data.email_id : null;
  const providerEventId = request.headers.get("svix-id");
  const recipientEmail = firstRecipient(payload);
  const supabase = getSupabaseAdmin();

  const { error: auditError } = await supabase.from("provider_webhook_events").insert({
    provider: "resend",
    provider_event_id: providerEventId,
    event_type: eventType,
    provider_message_id: providerMessageId,
    payload
  });

  if (auditError?.code === "23505") {
    return NextResponse.json({ ok: true, duplicate: true });
  }
  if (auditError) {
    return NextResponse.json({ ok: false, error: auditError.message }, { status: 500 });
  }

  let recipientRow: { id: string; campaign_id: string; contact_id: string } | null = null;
  if (providerMessageId) {
    const { data } = await supabase
      .from("campaign_recipients")
      .select("id,campaign_id,contact_id")
      .eq("provider_message_id", providerMessageId)
      .maybeSingle();
    recipientRow = data ?? null;
  }

  const now = typeof payload?.created_at === "string" ? payload.created_at : new Date().toISOString();
  const recipientPatch: Record<string, unknown> = {};

  if (eventType === "email.sent") {
    recipientPatch.delivery_status = "sent";
    recipientPatch.sent_at = now;
  } else if (eventType === "email.delivered") {
    recipientPatch.delivery_status = "delivered";
    recipientPatch.delivered_at = now;
  } else if (eventType === "email.bounced") {
    recipientPatch.delivery_status = "bounced";
    recipientPatch.bounced_at = now;
  } else if (eventType === "email.complained") {
    recipientPatch.delivery_status = "complained";
    recipientPatch.complained_at = now;
  } else if (eventType === "email.failed") {
    recipientPatch.delivery_status = "failed";
  } else if (eventType === "email.suppressed") {
    recipientPatch.delivery_status = "suppressed";
  }

  if (recipientRow && Object.keys(recipientPatch).length) {
    await supabase.from("campaign_recipients").update(recipientPatch).eq("id", recipientRow.id);
  }

  if (recipientEmail && ["email.bounced", "email.complained", "email.suppressed"].includes(eventType)) {
    const contactStatus = eventType === "email.bounced" ? "bounced" : "suppressed";
    await supabase.from("contacts").update({ status: contactStatus }).eq("email_normalized", recipientEmail);
    await supabase.from("suppression_list").upsert({
      email_normalized: recipientEmail,
      reason: `resend:${eventType}`
    }, { onConflict: "email_normalized" });
  }

  if (recipientRow && ["email.clicked", "email.opened"].includes(eventType)) {
    const pageUrl = typeof payload?.data?.click?.link === "string"
      ? payload.data.click.link
      : typeof payload?.data?.link === "string"
        ? payload.data.link
        : null;

    await supabase.from("events").insert({
      event_type: eventType === "email.clicked" ? "provider_email_click" : "provider_email_open",
      campaign_id: recipientRow.campaign_id,
      recipient_id: recipientRow.id,
      contact_id: recipientRow.contact_id,
      page_url: pageUrl,
      is_bot: false,
      metadata: { provider: "resend", provider_message_id: providerMessageId }
    });
  }

  return NextResponse.json({ ok: true });
}
