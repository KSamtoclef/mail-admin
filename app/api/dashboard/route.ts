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
      events: [],
      warnings: ["Supabase environment variables are not configured."]
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

    const warnings: string[] = [];
    const recordWarning = (label: string, error: { message?: string } | null) => {
      if (error?.message) warnings.push(`${label}: ${error.message}`);
    };

    recordWarning("contacts count", contactsCount.error);
    recordWarning("active contacts", activeContactsCount.error);
    recordWarning("username integrity", missingUsernamesCount.error);
    recordWarning("delivery metrics", deliveredCount.error);
    recordWarning("attributed sessions", attributedSessionsCount.error);
    recordWarning("anonymous sessions", anonymousSessionsCount.error);
    recordWarning("human clicks", humanClicksCount.error);
    recordWarning("bot clicks", botClicksCount.error);
    recordWarning("event count", totalEventsCount.error);
    recordWarning("unique clickers", clickRows.error);
    recordWarning("campaign list", campaigns.error);
    recordWarning("contact list", contacts.error);
    recordWarning("import history", imports.error);
    recordWarning("event feed", events.error);

    // A readable contacts table is enough to prove the database connection itself is live.
    // Optional analytics tables can fail independently without wiping the whole workspace.
    const connected = !contactsCount.error;

    if (!connected) {
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
        warnings,
        error: contactsCount.error?.message ?? "Unable to read contacts table"
      }, { status: 500, headers: noStoreHeaders });
    }

    const uniqueClickers = clickRows.error
      ? 0
      : new Set((clickRows.data ?? []).map((row) => row.contact_id).filter(Boolean)).size;

    return NextResponse.json({
      connected: true,
      authConfigured,
      providerConfigured,
      trackingConfigured,
      trackingBaseUrl,
      schemaHealthy: warnings.length === 0,
      warnings,
      metrics: {
        contacts: contactsCount.count ?? 0,
        activeContacts: activeContactsCount.error ? 0 : (activeContactsCount.count ?? 0),
        missingUsernames: missingUsernamesCount.error ? 0 : (missingUsernamesCount.count ?? 0),
        delivered: deliveredCount.error ? 0 : (deliveredCount.count ?? 0),
        uniqueClickers,
        humanClicks: humanClicksCount.error ? 0 : (humanClicksCount.count ?? 0),
        botClicks: botClicksCount.error ? 0 : (botClicksCount.count ?? 0),
        attributedSessions: attributedSessionsCount.error ? 0 : (attributedSessionsCount.count ?? 0),
        anonymousSessions: anonymousSessionsCount.error ? 0 : (anonymousSessionsCount.count ?? 0),
        totalEvents: totalEventsCount.error ? 0 : (totalEventsCount.count ?? 0)
      },
      campaigns: campaigns.error ? [] : (campaigns.data ?? []),
      contacts: contacts.error ? [] : (contacts.data ?? []),
      imports: imports.error ? [] : (imports.data ?? []),
      events: events.error ? [] : (events.data ?? [])
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
      warnings: [],
      error: error instanceof Error ? error.message : "Unable to load dashboard"
    }, { status: 500, headers: noStoreHeaders });
  }
}
