import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { getEmailProviderStatus } from "@/lib/email-provider";
import {
  createAndSendBroadcast,
  createBroadcastSegment,
  ensureBroadcastContactProperties,
  syncContactToSegment
} from "@/lib/resend-broadcast";
import { splitContactName } from "@/lib/template-tags";
import { getTrackingBaseUrl, validHttpDestination } from "@/lib/tracking-security";

type CampaignRow = {
  id: string;
  name: string;
  subject: string;
  from_name: string | null;
  reply_to: string | null;
  text_body: string | null;
  status: string;
  primary_link_url: string | null;
  audience_cutoff_at: string | null;
  audience_offset: number;
  audience_total: number | null;
  send_confirmed_at: string | null;
};

type ContactRow = {
  id: string;
  email: string;
  username: string | null;
  country_code: string | null;
  external_user_id: string | null;
  external_session_id: string | null;
  broadcast_tracking_token: string;
  status: string;
  created_at: string;
};

type WaveRow = {
  id: string;
  campaign_id: string;
  wave_no: number;
  day_key: string;
  resend_segment_id: string | null;
  resend_broadcast_id: string | null;
  recipient_count: number;
  synced_count: number;
  status: string;
  last_error: string | null;
};

const SCAN_PAGE_SIZE = 1000;
const MAX_WAVE_SIZE = 5000;
const RESEND_SYNC_PER_RUN = 12;

function cleanError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 1000) : "Broadcast dispatch failed";
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

function dayKey(timezone: string) {
  const formatter = new Intl.DateTimeFormat("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function hasRecipientTags(value: string) {
  return /{{\s*(full_name|first_name|last_name|email|country|user_id|session_id|tracked_link|unsubscribe_url)\s*}}/i.test(value);
}

function broadcastBodyTemplate(template: string, campaign: CampaignRow, trackedLink: string) {
  const replacements: Record<string, string> = {
    full_name: "{{{contact.mail_full_name}}}",
    first_name: "{{{contact.mail_first_name}}}",
    last_name: "{{{contact.mail_last_name}}}",
    email: "{{{contact.email}}}",
    country: "{{{contact.mail_country}}}",
    user_id: "{{{contact.mail_user_id}}}",
    session_id: "{{{contact.mail_session_id}}}",
    campaign_name: campaign.name,
    tracked_link: trackedLink,
    unsubscribe_url: "{{{RESEND_UNSUBSCRIBE_URL}}}"
  };

  return template.replace(/{{\s*([a-z_]+)\s*}}/gi, (match, rawKey: string) => {
    return replacements[rawKey.toLowerCase()] ?? match;
  });
}

function broadcastSubject(template: string, campaign: CampaignRow) {
  if (hasRecipientTags(template)) {
    throw new Error("Resend Broadcasts currently require a static subject in Mail Admin. Put recipient dynamic tags in the message body instead.");
  }
  return template.replace(/{{\s*campaign_name\s*}}/gi, campaign.name);
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

async function loadCampaign(supabase: any, campaignId: string) {
  const result = await supabase
    .from("campaigns")
    .select("id,name,subject,from_name,reply_to,text_body,status,primary_link_url,audience_cutoff_at,audience_offset,audience_total,send_confirmed_at")
    .eq("id", campaignId)
    .single();
  if (result.error || !result.data) throw new Error(result.error?.message ?? "Campaign not found");
  return result.data as CampaignRow;
}

async function latestOpenWave(supabase: any, campaignId: string) {
  const result = await supabase
    .from("campaign_broadcast_waves")
    .select("id,campaign_id,wave_no,day_key,resend_segment_id,resend_broadcast_id,recipient_count,synced_count,status,last_error")
    .eq("campaign_id", campaignId)
    .in("status", ["preparing", "ready", "failed"])
    .order("wave_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? null) as WaveRow | null;
}

async function selectWaveContacts(supabase: any, campaign: CampaignRow, requested: number) {
  let cursor = campaign.audience_offset ?? 0;
  const selected: ContactRow[] = [];
  let exhausted = false;

  while (selected.length < requested && !exhausted) {
    const rowsResult = await supabase
      .from("contacts")
      .select("id,email,username,country_code,external_user_id,external_session_id,broadcast_tracking_token,status,created_at")
      .lte("created_at", campaign.audience_cutoff_at)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(cursor, cursor + SCAN_PAGE_SIZE - 1);
    if (rowsResult.error) throw new Error(rowsResult.error.message);

    const rows = (rowsResult.data ?? []) as ContactRow[];
    if (!rows.length) {
      exhausted = true;
      break;
    }

    const contactIds = rows.map((row) => row.id);
    const emails = rows.map((row) => row.email.trim().toLowerCase());
    const [existingResult, suppressionsResult] = await Promise.all([
      supabase.from("campaign_recipients").select("contact_id").eq("campaign_id", campaign.id).in("contact_id", contactIds),
      supabase.from("suppression_list").select("email_normalized").in("email_normalized", emails)
    ]);
    if (existingResult.error) throw new Error(existingResult.error.message);
    if (suppressionsResult.error) throw new Error(suppressionsResult.error.message);

    const existing = new Set<string>((existingResult.data ?? []).map((row: { contact_id: string }) => row.contact_id));
    const suppressed = new Set<string>((suppressionsResult.data ?? []).map((row: { email_normalized: string }) => row.email_normalized));

    let processed = 0;
    for (const row of rows) {
      processed += 1;
      const normalized = row.email.trim().toLowerCase();
      if (row.status === "active" && !existing.has(row.id) && !suppressed.has(normalized)) {
        selected.push(row);
      }
      if (selected.length >= requested) break;
    }

    cursor += processed;
    if (processed < rows.length) break;
    if (rows.length < SCAN_PAGE_SIZE) exhausted = true;
  }

  return { selected, nextOffset: cursor, exhausted };
}

async function createWave(supabase: any, campaign: CampaignRow) {
  const usage = await supabase.rpc("mail_daily_send_usage");
  if (usage.error) throw new Error(usage.error.message);
  const usageRow = usage.data?.[0];
  if (!usageRow) throw new Error("Daily send settings are unavailable");
  if (usageRow.sending_paused) return { wave: null, state: "paused_by_settings" };

  const remainingToday = Number(usageRow.remaining_today ?? 0);
  if (remainingToday <= 0) return { wave: null, state: "daily_limit_reached" };

  const remainingCampaign = campaign.audience_total == null
    ? remainingToday
    : Math.max(Number(campaign.audience_total) - Number(campaign.audience_offset ?? 0), 0);
  if (remainingCampaign <= 0) {
    await supabase.from("campaigns").update({ status: "sent", completed_at: new Date().toISOString() }).eq("id", campaign.id);
    return { wave: null, state: "sent" };
  }

  const requested = Math.min(remainingToday, remainingCampaign, MAX_WAVE_SIZE);
  const reserve = await supabase.rpc("mail_reserve_broadcast_quota", { requested });
  if (reserve.error) throw new Error(reserve.error.message);
  const reserveRow = reserve.data?.[0];
  const allowed = Number(reserveRow?.allowed ?? 0);
  if (allowed < 1) return { wave: null, state: reserveRow?.sending_paused ? "paused_by_settings" : "daily_limit_reached" };

  let selection;
  try {
    selection = await selectWaveContacts(supabase, campaign, allowed);
  } catch (error) {
    await supabase.rpc("mail_release_send_quota", { release_count: allowed });
    throw error;
  }

  const unused = Math.max(allowed - selection.selected.length, 0);
  if (unused > 0) await supabase.rpc("mail_release_send_quota", { release_count: unused });

  await supabase.from("campaigns").update({ audience_offset: selection.nextOffset }).eq("id", campaign.id);

  if (!selection.selected.length) {
    if (selection.exhausted || (campaign.audience_total !== null && selection.nextOffset >= campaign.audience_total)) {
      await supabase.from("campaigns").update({ status: "sent", completed_at: new Date().toISOString() }).eq("id", campaign.id);
      return { wave: null, state: "sent" };
    }
    return { wave: null, state: "sending" };
  }

  const lastWave = await supabase
    .from("campaign_broadcast_waves")
    .select("wave_no")
    .eq("campaign_id", campaign.id)
    .order("wave_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastWave.error) throw new Error(lastWave.error.message);
  const waveNo = Number(lastWave.data?.wave_no ?? 0) + 1;

  const createdWave = await supabase
    .from("campaign_broadcast_waves")
    .insert({
      campaign_id: campaign.id,
      wave_no: waveNo,
      day_key: dayKey(String(reserveRow?.timezone ?? "UTC")),
      recipient_count: selection.selected.length,
      synced_count: 0,
      status: "preparing"
    })
    .select("id,campaign_id,wave_no,day_key,resend_segment_id,resend_broadcast_id,recipient_count,synced_count,status,last_error")
    .single();
  if (createdWave.error || !createdWave.data) throw new Error(createdWave.error?.message ?? "Unable to create broadcast wave");

  const wave = createdWave.data as WaveRow;
  const segmentId = await createBroadcastSegment(`${campaign.name} · ${wave.day_key} · wave ${wave.wave_no}`);
  const waveUpdate = await supabase
    .from("campaign_broadcast_waves")
    .update({ resend_segment_id: segmentId, last_error: null })
    .eq("id", wave.id);
  if (waveUpdate.error) throw new Error(waveUpdate.error.message);
  wave.resend_segment_id = segmentId;

  for (let index = 0; index < selection.selected.length; index += 500) {
    const slice = selection.selected.slice(index, index + 500);
    const recipients = await supabase
      .from("campaign_recipients")
      .upsert(slice.map((contact) => ({
        campaign_id: campaign.id,
        contact_id: contact.id,
        broadcast_wave_id: wave.id,
        delivery_status: "reserved",
        resend_contact_synced_at: null
      })), { onConflict: "campaign_id,contact_id" });
    if (recipients.error) throw new Error(recipients.error.message);
  }

  return { wave, state: "preparing" };
}

async function syncWaveChunk(supabase: any, campaign: CampaignRow, wave: WaveRow) {
  if (!wave.resend_segment_id) {
    const segmentId = await createBroadcastSegment(`${campaign.name} · ${wave.day_key} · wave ${wave.wave_no}`);
    const result = await supabase.from("campaign_broadcast_waves").update({ resend_segment_id: segmentId }).eq("id", wave.id);
    if (result.error) throw new Error(result.error.message);
    wave.resend_segment_id = segmentId;
  }

  await ensureBroadcastContactProperties();

  const pendingResult = await supabase
    .from("campaign_recipients")
    .select("id,contact_id")
    .eq("broadcast_wave_id", wave.id)
    .is("resend_contact_synced_at", null)
    .order("id", { ascending: true })
    .limit(RESEND_SYNC_PER_RUN);
  if (pendingResult.error) throw new Error(pendingResult.error.message);

  const pending = pendingResult.data ?? [];
  if (!pending.length) return { complete: true, processed: 0 };

  const contactIds = pending.map((row: { contact_id: string }) => row.contact_id);
  const contactsResult = await supabase
    .from("contacts")
    .select("id,email,username,country_code,external_user_id,external_session_id,broadcast_tracking_token,status,created_at")
    .in("id", contactIds);
  if (contactsResult.error) throw new Error(contactsResult.error.message);
  const contacts = new Map<string, ContactRow>((contactsResult.data ?? []).map((row: ContactRow) => [row.id, row]));

  let removed = 0;
  for (const recipient of pending as Array<{ id: string; contact_id: string }>) {
    const contact = contacts.get(recipient.contact_id);
    const now = new Date().toISOString();

    if (!contact || contact.status !== "active") {
      await supabase.from("campaign_recipients").update({
        delivery_status: contact?.status === "unsubscribed" ? "unsubscribed" : "suppressed",
        resend_contact_synced_at: now
      }).eq("id", recipient.id);
      removed += 1;
      continue;
    }

    const names = splitContactName(contact.username);
    const sync = await syncContactToSegment({
      email: contact.email,
      fullName: names.fullName,
      firstName: names.firstName,
      lastName: names.lastName,
      trackingToken: contact.broadcast_tracking_token,
      country: contact.country_code ?? "",
      userId: contact.external_user_id ?? "",
      sessionId: contact.external_session_id ?? "",
      segmentId: wave.resend_segment_id as string
    });

    if (sync.unsubscribed) {
      const normalized = contact.email.trim().toLowerCase();
      await supabase.from("contacts").update({ status: "unsubscribed" }).eq("id", contact.id);
      await supabase.from("suppression_list").upsert({
        email_normalized: normalized,
        reason: "resend:contact_unsubscribed"
      }, { onConflict: "email_normalized" });
      await supabase.from("campaign_recipients").update({
        delivery_status: "unsubscribed",
        unsubscribed_at: now,
        resend_contact_synced_at: now
      }).eq("id", recipient.id);
      removed += 1;
    } else {
      await supabase.from("campaign_recipients").update({ resend_contact_synced_at: now }).eq("id", recipient.id);
    }
  }

  if (removed > 0) {
    await supabase.rpc("mail_release_send_quota", { release_count: removed });
  }

  const syncedCountResult = await supabase
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("broadcast_wave_id", wave.id)
    .not("resend_contact_synced_at", "is", null);
  if (syncedCountResult.error) throw new Error(syncedCountResult.error.message);

  const eligibleCountResult = await supabase
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("broadcast_wave_id", wave.id)
    .not("delivery_status", "in", "(unsubscribed,suppressed,bounced)");
  if (eligibleCountResult.error) throw new Error(eligibleCountResult.error.message);

  const syncedCount = syncedCountResult.count ?? 0;
  const eligibleCount = eligibleCountResult.count ?? 0;
  await supabase.from("campaign_broadcast_waves").update({
    synced_count: syncedCount,
    recipient_count: eligibleCount,
    status: "preparing",
    last_error: null
  }).eq("id", wave.id);
  wave.synced_count = syncedCount;
  wave.recipient_count = eligibleCount;

  const remainingResult = await supabase
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("broadcast_wave_id", wave.id)
    .is("resend_contact_synced_at", null);
  if (remainingResult.error) throw new Error(remainingResult.error.message);

  return { complete: (remainingResult.count ?? 0) === 0, processed: pending.length };
}

async function sendWave(supabase: any, campaign: CampaignRow, wave: WaveRow) {
  if (!wave.resend_segment_id) throw new Error("Broadcast wave has no Resend Segment");
  if (wave.resend_broadcast_id) return wave.resend_broadcast_id;

  if (wave.recipient_count <= 0) {
    await supabase.from("campaign_broadcast_waves").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", wave.id);
    return null;
  }

  const primaryLink = await getPrimaryLink(supabase, campaign);
  const baseUrl = getTrackingBaseUrl();
  if (!baseUrl) throw new Error("Tracking base URL is unavailable");

  const trackedLink = primaryLink
    ? `${baseUrl}/c/{{{contact.mail_tracking_token}}}/${primaryLink.id}`
    : "";
  const text = broadcastBodyTemplate(campaign.text_body ?? "", campaign, trackedLink);
  const subject = broadcastSubject(campaign.subject, campaign);

  const broadcastId = await createAndSendBroadcast({
    segmentId: wave.resend_segment_id,
    name: `${campaign.name} · ${wave.day_key} · wave ${wave.wave_no}`,
    fromName: campaign.from_name,
    replyTo: campaign.reply_to,
    subject,
    text,
    html: textToHtml(text)
  });

  const now = new Date().toISOString();
  await supabase.from("campaign_broadcast_waves").update({
    resend_broadcast_id: broadcastId,
    status: "sent",
    sent_at: now,
    last_error: null
  }).eq("id", wave.id);

  await supabase.from("campaign_recipients").update({
    delivery_status: "queued",
    queued_at: now,
    last_error: null
  }).eq("broadcast_wave_id", wave.id).eq("delivery_status", "reserved");

  return broadcastId;
}

export async function processCampaignBroadcastWave(campaignId: string) {
  if (!getEmailProviderStatus().configured) throw new Error("Resend is not fully configured");
  const supabase = getSupabaseAdmin() as any;
  let campaign = await loadCampaign(supabase, campaignId);

  if (campaign.status !== "sending") return { ok: true, state: campaign.status, sent: 0 };
  if (!campaign.send_confirmed_at) throw new Error("Campaign recipient permission has not been confirmed");
  if (!campaign.audience_cutoff_at) throw new Error("Campaign audience snapshot is not initialized");

  let wave = await latestOpenWave(supabase, campaign.id);
  if (!wave) {
    const created = await createWave(supabase, campaign);
    if (!created.wave) return { ok: true, state: created.state, sent: 0 };
    wave = created.wave;
    campaign = await loadCampaign(supabase, campaignId);
  }

  try {
    const sync = await syncWaveChunk(supabase, campaign, wave);
    if (!sync.complete) {
      return {
        ok: true,
        state: "preparing_broadcast",
        sent: 0,
        waveNo: wave.wave_no,
        synced: wave.synced_count,
        total: wave.recipient_count
      };
    }

    await supabase.from("campaign_broadcast_waves").update({ status: "ready", last_error: null }).eq("id", wave.id);
    const broadcastId = await sendWave(supabase, campaign, wave);

    const refreshed = await loadCampaign(supabase, campaign.id);
    const completed = refreshed.audience_total !== null && refreshed.audience_offset >= refreshed.audience_total;
    if (completed) {
      await supabase.from("campaigns").update({ status: "sent", completed_at: new Date().toISOString(), failed_reason: null }).eq("id", campaign.id);
    }

    return {
      ok: true,
      state: completed ? "sent" : "sending",
      sent: wave.recipient_count,
      waveNo: wave.wave_no,
      broadcastId,
      offset: refreshed.audience_offset,
      total: refreshed.audience_total,
      completed
    };
  } catch (error) {
    const message = cleanError(error);
    await supabase.from("campaign_broadcast_waves").update({ status: "failed", last_error: message }).eq("id", wave.id);
    await supabase.from("campaigns").update({ status: "failed", failed_reason: message }).eq("id", campaign.id);
    throw error;
  }
}
