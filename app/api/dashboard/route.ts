import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function GET() {
  const providerConfigured = Boolean(process.env.EMAIL_PROVIDER && process.env.DEFAULT_FROM_EMAIL);
  const trackingConfigured = Boolean(process.env.TRACKING_BASE_URL && process.env.TRACKING_ALLOWED_ORIGINS);

  if (!hasSupabaseConfig()) {
    return NextResponse.json({
      connected: false,
      providerConfigured,
      trackingConfigured,
      metrics: { contacts: 0, delivered: 0, uniqueClickers: 0, attributedSessions: 0 },
      campaigns: [],
      contacts: [],
      events: []
    });
  }

  try {
    const supabase = getSupabaseAdmin();

    const [contactsCount, deliveredCount, sessionsCount, clickRows, campaigns, contacts, events] = await Promise.all([
      supabase.from("contacts").select("id", { count: "exact", head: true }),
      supabase.from("campaign_recipients").select("id", { count: "exact", head: true }).not("delivered_at", "is", null),
      supabase.from("sessions").select("id", { count: "exact", head: true }).not("recipient_id", "is", null),
      supabase.from("events").select("contact_id").eq("event_type", "email_link_click").eq("is_bot", false).not("contact_id", "is", null).limit(10000),
      supabase.from("campaigns").select("id,name,status,created_at").order("created_at", { ascending: false }).limit(8),
      supabase.from("contacts").select("id,username,email,country_code,status,created_at").order("created_at", { ascending: false }).limit(8),
      supabase.from("events").select("id,event_type,occurred_at,is_bot,country_code,region,page_url,contact_id,campaign_id").order("occurred_at", { ascending: false }).limit(20)
    ]);

    const errors = [contactsCount.error, deliveredCount.error, sessionsCount.error, clickRows.error, campaigns.error, contacts.error, events.error].filter(Boolean);
    if (errors.length) {
      return NextResponse.json({ connected: false, error: errors[0]?.message ?? "Unable to read dashboard data" }, { status: 500 });
    }

    const uniqueClickers = new Set((clickRows.data ?? []).map((row) => row.contact_id).filter(Boolean)).size;

    return NextResponse.json({
      connected: true,
      providerConfigured,
      trackingConfigured,
      metrics: {
        contacts: contactsCount.count ?? 0,
        delivered: deliveredCount.count ?? 0,
        uniqueClickers,
        attributedSessions: sessionsCount.count ?? 0
      },
      campaigns: campaigns.data ?? [],
      contacts: contacts.data ?? [],
      events: events.data ?? []
    });
  } catch (error) {
    return NextResponse.json({
      connected: false,
      providerConfigured,
      trackingConfigured,
      error: error instanceof Error ? error.message : "Unable to load dashboard"
    }, { status: 500 });
  }
}
