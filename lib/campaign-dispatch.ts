import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getEmailProviderStatus, sendProviderBatch } from "@/lib/email-provider";
import { renderTemplate, splitContactName } from "@/lib/template-tags";
import { getTrackingBaseUrl, validHttpDestination } from "@/lib/tracking-security";

type CampaignRow = {
  id: string;
  name: string;
  subject: string;
  from_name: string | null;
  reply_to: string | null;
  text_body: string | null;
  status: string;
  scheduled_at: string | null;
  primary_link_url: string | null;
  audience_cutoff_at: string | null;
  audience_offset: number;
  audience_total: number | null;
  dispatch_started_at: string | null;
  send_confirmed_at: string | null;
};

type ContactRow = {
  id: string;
  email: string;
  username: string | null;
  country_code: string | null;
  external_user_id: string | null;
  external_session_id: string | null;
  status: string;
  created_at: string;
};

type RecipientRow = {
  id: string;
  campaign_id: string;
  contact_id: string;
  tracking_token: string;
  delivery_status: string;
  provider_message_id: string | null;
};

function cleanError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1000) : "Campaign dispatch failed";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function textToHtml(value: string) {
  const escaped = escapeHtml(value);
  const linked = escaped.replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}" rel="noopener noreferrer">${url}</a>`);
  return `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#171717">${linked.replaceAll("\n", "<br>")}</div>`;
}

async function getPrimaryLink(supabase: any, campaign: CampaignRow) {
  const template = `${campaign.subject}\n${campaign.text_body ?? ""}`;
  if (!template.includes("{{tracked_link}}")) return null;
  if (!campaign.primary_link_url || !validHttpDestination(campaign.primary_link_url)) {
    throw new Error("This campaign uses {{tracked_link}} but has no valid destination URL");
  }

  const existing = await supabase
    .from("tracked_links")
    .select("id,destination_url")
    .eq("campaign_id", campaign.id)
    .eq("label", "primary")
    .limit(1)
    .maybeSingle();

  if (existing.error) throw new Error(existing.error.message);
  if (existing.data?.id) {
    if (existing.data.destination_url !== campaign.primary_link_url) {
      const updated = await supabase
        .from("tracked_links")
        .update({ destination_url: campaign.primary_link_url })
        .eq("id", existing.data.id)
        .select("id,destination_url")
        .single();
      if (updated.error) throw new Error(updated.error.message);
      return updated.data;
    }
    return existing.data;
  }

  const created = await supabase
    .from("tracked_links")
    .insert({ campaign_id: campaign.id, label: "primary", destination_url: campaign.primary_link_url })
    .select("id,destination_url")
    .single();
  if (created.error) throw new Error(created.error.message);
  return created.data;
}

export async function startCampaignDispatch(campaignId: string, confirmPermission: boolean) {
  if (!confirmPermission) throw new Error("Confirm that these recipients are permitted to receive this campaign");
  if (!getEmailProviderStatus().configured) throw new Error("Connect the email provider before starting a campaign");

  const supabase = getSupabaseAdmin() as any;
  const current = await supabase
    .from("campaigns")
    .select("id,status,scheduled_at,audience_cutoff_at,audience_offset,audience_total,dispatch_started_at,send_confirmed_at")
    .eq("id", campaignId)
    .single();
  if (current.error || !current.data) throw new Error(current.error?.message ?? "Campaign not found");
  if (["sent"].includes(current.data.status)) throw new Error("This campaign has already been submitted");

  const now = new Date().toISOString();
  const cutoff = current.data.audience_cutoff_at ?? now;
  const totalResult = await supabase
    .from("contacts")
    .select("id", { count: "exact", head: true })
    .lte("created_at", cutoff);
  if (totalResult.error) throw new Error(totalResult.error.message);

  const updated = await supabase
    .from("campaigns")
    .update({
      status: "sending",
      audience_cutoff_at: cutoff,
      audience_total: current.data.audience_total ?? (totalResult.count ?? 0),
      audience_offset: current.data.audience_offset ?? 0,
      dispatch_started_at: current.data.dispatch_started_at ?? now,
      send_confirmed_at: current.data.send_confirmed_at ?? now,
      failed_reason: null
    })
    .eq("id", campaignId)
    .select("*")
    .single();
  if (updated.error) throw new Error(updated.error.message);
  return updated.data;
}

export async function processCampaignBatch(campaignId: string) {
  if (!getEmailProviderStatus().configured) throw new Error("Resend is not fully configured");

  const supabase = getSupabaseAdmin() as any;
  const campaignResult = await supabase
    .from("campaigns")
    .select("id,name,subject,from_name,reply_to,text_body,status,scheduled_at,primary_link_url,audience_cutoff_at,audience_offset,audience_total,dispatch_started_at,send_confirmed_at")
    .eq("id", campaignId)
    .single();
  if (campaignResult.error || !campaignResult.data) throw new Error(campaignResult.error?.message ?? "Campaign not found");

  const campaign = campaignResult.data as CampaignRow;
  if (campaign.status !== "sending") return { ok: true, state: campaign.status, sent: 0 };
  if (!campaign.send_confirmed_at) throw new Error("Campaign recipient permission has not been confirmed");
  if (!campaign.audience_cutoff_at) throw new Error("Campaign audience snapshot is not initialized");

  const usage = await supabase.rpc("mail_daily_send_usage");
  if (usage.error) throw new Error(usage.error.message);
  const usageRow = usage.data?.[0];
  if (!usageRow) throw new Error("Daily send settings are unavailable");
  if (usageRow.sending_paused) return { ok: true, state: "paused_by_settings", sent: 0, usage: usageRow };
  if (Number(usageRow.remaining_today) <= 0) return { ok: true, state: "daily_limit_reached", sent: 0, usage: usageRow };

  const desired = Math.min(Number(usageRow.max_batch_size) || 100, Number(usageRow.remaining_today) || 0, 100);
  if (desired < 1) return { ok: true, state: "daily_limit_reached", sent: 0, usage: usageRow };

  const offset = campaign.audience_offset ?? 0;
  const scanSize = Math.min(Math.max(desired * 4, 200), 1000);
  const contactsResult = await supabase
    .from("contacts")
    .select("id,email,username,country_code,external_user_id,external_session_id,status,created_at")
    .lte("created_at", campaign.audience_cutoff_at)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .range(offset, offset + scanSize - 1);
  if (contactsResult.error) throw new Error(contactsResult.error.message);

  const rows = (contactsResult.data ?? []) as ContactRow[];
  if (!rows.length) {
    const completedAt = new Date().toISOString();
    await supabase.from("campaigns").update({ status: "sent", completed_at: completedAt, failed_reason: null }).eq("id", campaign.id);
    return { ok: true, state: "sent", sent: 0, completed: true };
  }

  const contactIds = rows.map((row) => row.id);
  const emails = rows.map((row) => row.email.trim().toLowerCase());
  const [existingRecipientsResult, suppressionsResult] = await Promise.all([
    supabase.from("campaign_recipients").select("id,campaign_id,contact_id,tracking_token,delivery_status,provider_message_id").eq("campaign_id", campaign.id).in("contact_id", contactIds),
    supabase.from("suppression_list").select("email_normalized").in("email_normalized", emails)
  ]);
  if (existingRecipientsResult.error) throw new Error(existingRecipientsResult.error.message);
  if (suppressionsResult.error) throw new Error(suppressionsResult.error.message);

  const existingMap = new Map<string, RecipientRow>((existingRecipientsResult.data ?? []).map((row: RecipientRow) => [row.contact_id, row]));
  const suppressed = new Set<string>((suppressionsResult.data ?? []).map((row: { email_normalized: string }) => row.email_normalized));

  const candidates = rows.filter((row) => {
    const normalized = row.email.trim().toLowerCase();
    const existing = existingMap.get(row.id);
    if (row.status !== "active" || suppressed.has(normalized)) return false;
    if (!existing) return true;
    return !existing.provider_message_id && ["failed", "reserved"].includes(existing.delivery_status);
  });

  if (!candidates.length) {
    const newOffset = offset + rows.length;
    const completed = rows.length < scanSize || (campaign.audience_total !== null && newOffset >= campaign.audience_total);
    await supabase.from("campaigns").update({
      audience_offset: newOffset,
      status: completed ? "sent" : "sending",
      completed_at: completed ? new Date().toISOString() : null
    }).eq("id", campaign.id);
    return { ok: true, state: completed ? "sent" : "sending", sent: 0, skipped: rows.length };
  }

  const requested = Math.min(candidates.length, desired);
  const reserve = await supabase.rpc("mail_reserve_send_quota", { requested });
  if (reserve.error) throw new Error(reserve.error.message);
  const reserveRow = reserve.data?.[0];
  const allowed = Number(reserveRow?.allowed ?? 0);
  if (allowed < 1) return { ok: true, state: reserveRow?.sending_paused ? "paused_by_settings" : "daily_limit_reached", sent: 0, usage: reserveRow };

  const selected = candidates.slice(0, allowed);
  const newContacts = selected.filter((contact) => !existingMap.has(contact.id));
  if (newContacts.length) {
    const created = await supabase
      .from("campaign_recipients")
      .upsert(newContacts.map((contact) => ({
        campaign_id: campaign.id,
        contact_id: contact.id,
        delivery_status: "reserved"
      })), { onConflict: "campaign_id,contact_id" })
      .select("id,campaign_id,contact_id,tracking_token,delivery_status,provider_message_id");
    if (created.error) throw new Error(created.error.message);
    for (const row of (created.data ?? []) as RecipientRow[]) existingMap.set(row.contact_id, row);
  }

  const primaryLink = await getPrimaryLink(supabase, campaign);
  const baseUrl = getTrackingBaseUrl();
  if (!baseUrl) throw new Error("Tracking base URL is unavailable");

  const prepared = selected.map((contact) => {
    const recipient = existingMap.get(contact.id);
    if (!recipient) throw new Error(`Unable to prepare recipient ${contact.id}`);

    const names = splitContactName(contact.username);
    const trackedLink = primaryLink ? `${baseUrl}/c/${recipient.tracking_token}/${primaryLink.id}` : "";
    const unsubscribeUrl = `${baseUrl}/u/${recipient.tracking_token}`;
    const values = {
      full_name: names.fullName,
      first_name: names.firstName,
      last_name: names.lastName,
      email: contact.email,
      country: contact.country_code ?? "",
      user_id: contact.external_user_id ?? "",
      session_id: contact.external_session_id ?? "",
      campaign_name: campaign.name,
      tracked_link: trackedLink,
      unsubscribe_url: unsubscribeUrl
    };
    const renderedSubject = renderTemplate(campaign.subject, values);
    const renderedText = renderTemplate(campaign.text_body ?? "", values);
    const oneClick = `${baseUrl}/api/unsubscribe/one-click?token=${encodeURIComponent(recipient.tracking_token)}`;

    return {
      contact,
      recipient,
      email: {
        to: contact.email,
        subject: renderedSubject,
        text: renderedText,
        html: textToHtml(renderedText),
        replyTo: campaign.reply_to,
        headers: {
          "List-Unsubscribe": `<${oneClick}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
        },
        tags: {
          campaign_id: campaign.id,
          recipient_id: recipient.id
        }
      }
    };
  });

  const lastSelected = selected[selected.length - 1];
  const lastIndex = rows.findIndex((row) => row.id === lastSelected.id);
  const selectedAllEligible = selected.length === candidates.length;
  const advanceBy = selectedAllEligible ? rows.length : Math.max(lastIndex + 1, 1);
  const newOffset = offset + advanceBy;
  const batchKey = `campaign-${campaign.id}-offset-${offset}-count-${prepared.length}`;

  try {
    const providerResult = await sendProviderBatch(prepared.map((item) => item.email), batchKey);
    if (providerResult.data.length !== prepared.length) throw new Error("Provider returned an incomplete batch response");

    const queuedAt = new Date().toISOString();
    await Promise.all(prepared.map(async (item, index) => {
      const providerId = providerResult.data[index]?.id ?? null;
      await supabase.from("campaign_recipients").update({
        provider_message_id: providerId,
        delivery_status: "queued",
        queued_at: queuedAt,
        attempt_count: 1,
        last_error: null
      }).eq("id", item.recipient.id);
    }));

    const completed = (rows.length < scanSize && selectedAllEligible) || (campaign.audience_total !== null && newOffset >= campaign.audience_total);
    await supabase.from("campaigns").update({
      audience_offset: newOffset,
      status: completed ? "sent" : "sending",
      completed_at: completed ? new Date().toISOString() : null,
      failed_reason: null
    }).eq("id", campaign.id);

    return {
      ok: true,
      state: completed ? "sent" : "sending",
      sent: prepared.length,
      offset: newOffset,
      total: campaign.audience_total,
      remainingToday: reserveRow?.remaining_after ?? null,
      completed
    };
  } catch (error) {
    const message = cleanError(error);
    await Promise.all(prepared.map((item) =>
      supabase.from("campaign_recipients").update({
        delivery_status: "failed",
        attempt_count: 1,
        last_error: message
      }).eq("id", item.recipient.id)
    ));
    await supabase.from("campaigns").update({ status: "failed", failed_reason: message }).eq("id", campaign.id);
    throw error;
  }
}
