import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { trackingIsConfigured } from "@/lib/tracking-security";

function hasSupabaseConfig() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
}

const emptyMetrics = {
  contacts: 0,
  activeContacts: 0,
  missingUsernames: 0,
  delivered: 0,
  uniqueClickers: 0,
  humanClicks: 0,
  botClicks: 0,
  attributedSessions: 0,
  anonymousSessions: 0,
  totalEvents: 0
};

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET() {
  const providerConfigured = Boolean(process.env.EMAIL_PROVIDER && process.env.DEFAULT_FROM_EMAIL);
  const trackingConfigured = trackingIsConfigured();
  const trackingBaseUrl = process.env.TRACKING_BASE_URL?.replace(/\/$/, "") ?? null;
  const authConfigured = Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET);

  if (!hasSupabaseConfig()) {
    return NextResponse.json({
      connected: false,
      authConfigured,
      providerConfigured,
      trackingConfigured,
      trackingBaseUrl,
      metrics: emptyMetrics,
      campaigns: [],
      contacts: [],
      imports: [],
      events: []
    }, { headers: noStoreHeaders });
  }

  try {
    const supabase = getSupabaseAdmin();

    const [
      contactsCount,
      activeContactsCount,
      missingUsernamesCount,
      deliveredCount,
      attributedSessionsCount,
      anonymousSessionsCount,
      humanClicksCount,
      botClicksCount,
      totalEventsCount,
      clickRows,
      campaigns,
      contacts,
      imports,
      events
    ] = await Promise.all([
      supabase.from("contacts").select("id", { count: "exact", head: true }),
      supabase.from("contacts").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("contacts").select("id", { count: "exact", head: true }).is("username", null),
      supabase.from("campaign_recipients").select("id", { count: "exact", head: true }).not("delivered_at", "is", null),
      supabase.from("sessions").select("id", { count: "exact", head: true }).not("recipient_id", "is", null),
      supabase.from("sessions").select("id", { count: "exact", head: true }).is("recipient_id", null),
      supabase.from("events").select("id", { count: "exact", head: true }).eq("event_type", "email_link_click").eq("is_bot", false),
      supabase.from("events").select("id", { count: "exact", head: true }).eq("event_type", "email_link_click").eq("is_bot", true),
      supabase.from("events").select("id", { count: "exact", head: true }),
      supabase.from("events").select("contact_id").eq("event_type", "email_link_click").eq("is_bot", false).not("contact_id", "is", null).limit(50000),
      supabase.from("campaigns").select("id,name,status,created_at,scheduled_at").order("created_at", { ascending: false }).limit(12),
      supabase.from("contacts").select("id,external_user_id,external_session_id,username,email,country_code,status,created_at").order("created_at", { ascending: false }).limit(20),
      supabase.from("contact_imports").select("id,filename,total_rows,valid_rows,unique_rows,added_rows,updated_rows,duplicate_rows,invalid_rows,created_at").order("created_at", { ascending: false }).limit(8),
      supabase
        .from("events")
        .select("id,event_type,occurred_at,is_bot,bot_reason,country_code,region,page_url,device_type,browser,contact_id,campaign_id,link_id,contact:contacts(username,email),campaign:campaigns(name),link:tracked_links(label,destination_url)")
        .order("occurred_at", { ascending: false })
        .limit(50)
    ]);

    const errors = [
      contactsCount.error,
      activeContactsCount.error,
      missingUsernamesCount.error,
      deliveredCount.error,
      attributedSessionsCount.error,
      anonymousSessionsCount.error,
      humanClicksCount.error,
      botClicksCount.error,
      totalEventsCount.error,
      clickRows.error,
      campaigns.error,
      contacts.error,
      imports.error,
      events.error
    ].filter(Boolean);

    if (errors.length) {
      return NextResponse.json({
        connected: false,
        authConfigured,
        providerConfigured,
        trackingConfigured,
        trackingBaseUrl,
        metrics: emptyMetrics,
        campaigns: [],
        contacts: [],
        imports: [],
        events: [],
        error: errors[0]?.message ?? "Unable to read dashboard data"
      }, { status: 500, headers: noStoreHeaders });
    }

    const uniqueClickers = new Set((clickRows.data ?? []).map((row) => row.contact_id).filter(Boolean)).size;

    return NextResponse.json({
      connected: true,
      authConfigured,
      providerConfigured,
      trackingConfigured,
      trackingBaseUrl,
      metrics: {
        contacts: contactsCount.count ?? 0,
        activeContacts: activeContactsCount.count ?? 0,
        missingUsernames: missingUsernamesCount.count ?? 0,
        delivered: deliveredCount.count ?? 0,
        uniqueClickers,
        humanClicks: humanClicksCount.count ?? 0,
        botClicks: botClicksCount.count ?? 0,
        attributedSessions: attributedSessionsCount.count ?? 0,
        anonymousSessions: anonymousSessionsCount.count ?? 0,
        totalEvents: totalEventsCount.count ?? 0
      },
      campaigns: campaigns.data ?? [],
      contacts: contacts.data ?? [],
      imports: imports.data ?? [],
      events: events.data ?? []
    }, { headers: noStoreHeaders });
  } catch (error) {
    return NextResponse.json({
      connected: false,
      authConfigured,
      providerConfigured,
      trackingConfigured,
      trackingBaseUrl,
      metrics: emptyMetrics,
      campaigns: [],
      contacts: [],
      imports: [],
      events: [],
      error: error instanceof Error ? error.message : "Unable to load dashboard"
    }, { status: 500, headers: noStoreHeaders });
  }
}
