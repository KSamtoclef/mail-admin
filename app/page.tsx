"use client";

import {
  Activity,
  Cable,
  ContactRound,
  LayoutDashboard,
  LockKeyhole,
  MailPlus,
  MousePointerClick,
  Send,
  Settings,
  ShieldCheck
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type View = "overview" | "contacts" | "campaigns" | "composer" | "tracking" | "events" | "settings";

type EventContact = { username: string | null; email: string };
type EventCampaign = { name: string };
type EventLink = { label: string | null; destination_url: string };

type DashboardEvent = {
  id: number;
  event_type: string;
  occurred_at: string;
  is_bot: boolean;
  bot_reason: string | null;
  country_code: string | null;
  region: string | null;
  page_url: string | null;
  device_type: string | null;
  contact_id: string | null;
  campaign_id: string | null;
  link_id: string | null;
  contact?: EventContact | EventContact[] | null;
  campaign?: EventCampaign | EventCampaign[] | null;
  link?: EventLink | EventLink[] | null;
};

type DashboardData = {
  connected: boolean;
  authConfigured?: boolean;
  providerConfigured?: boolean;
  trackingConfigured?: boolean;
  error?: string;
  metrics: {
    contacts: number;
    activeContacts: number;
    delivered: number;
    uniqueClickers: number;
    humanClicks: number;
    botClicks: number;
    attributedSessions: number;
    anonymousSessions: number;
    totalEvents: number;
  };
  campaigns: Array<{ id: string; name: string; status: string; created_at: string; scheduled_at?: string | null }>;
  contacts: Array<{ id: string; username: string | null; email: string; country_code: string | null; status: string; created_at: string }>;
  events: DashboardEvent[];
};

const emptyData: DashboardData = {
  connected: false,
  authConfigured: false,
  providerConfigured: false,
  trackingConfigured: false,
  metrics: {
    contacts: 0,
    activeContacts: 0,
    delivered: 0,
    uniqueClickers: 0,
    humanClicks: 0,
    botClicks: 0,
    attributedSessions: 0,
    anonymousSessions: 0,
    totalEvents: 0
  },
  campaigns: [],
  contacts: [],
  events: []
};

const navItems: { id: View; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "contacts", label: "Contacts", icon: ContactRound },
  { id: "campaigns", label: "Campaigns", icon: Send },
  { id: "composer", label: "Create Campaign", icon: MailPlus },
  { id: "tracking", label: "Tracking", icon: MousePointerClick },
  { id: "events", label: "Live Events", icon: Activity },
  { id: "settings", label: "Connection Status", icon: Settings }
];

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function Header({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }) {
  return <div className="topbar"><div><h1>{title}</h1><p className="subtitle">{subtitle}</p></div>{actions ? <div className="actions">{actions}</div> : null}</div>;
}

function Metric({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return <div className="card"><div className="metricLabel">{label}</div><div className="metricValue">{typeof value === "number" ? value.toLocaleString() : value}</div>{hint ? <div className="metricHint">{hint}</div> : null}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="note" style={{ padding: "22px 0" }}>{children}</div>;
}

function StatusRow({ icon, title, ready, readyText, waitingText }: { icon: React.ReactNode; title: string; ready: boolean; readyText: string; waitingText: string }) {
  return <div className="event">{icon}<div><div className="eventTitle">{title}</div><div className="eventMeta">{ready ? readyText : waitingText}</div></div></div>;
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [message, setMessage] = useState("");

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [body, setBody] = useState("");
  const [trackingMode, setTrackingMode] = useState("clicks_and_site");
  const [scheduledAt, setScheduledAt] = useState("");

  async function refresh(showLoader = false) {
    if (showLoader) setLoading(true);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const payload = await response.json();
      setData({
        ...emptyData,
        ...payload,
        metrics: { ...emptyData.metrics, ...(payload.metrics ?? {}) },
        campaigns: payload.campaigns ?? [],
        contacts: payload.contacts ?? [],
        events: payload.events ?? []
      });
      setLastUpdated(new Date());
    } catch {
      setData({ ...emptyData, error: "Dashboard API is not reachable." });
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  useEffect(() => {
    refresh(true);
    const timer = window.setInterval(() => refresh(false), 10000);
    return () => window.clearInterval(timer);
  }, []);

  const clickEvents = useMemo(() => data.events.filter((event) => event.event_type === "email_link_click"), [data.events]);
  const previewSubject = useMemo(() => (subject || "Your subject will appear here").replaceAll("{{first_name}}", "Recipient"), [subject]);
  const previewBody = useMemo(() => (body || "Your message preview will appear here.").replaceAll("{{first_name}}", "Recipient").replaceAll("{{tracked_link}}", "[Tracked link]"), [body]);

  async function saveCampaign() {
    setMessage("");
    if (!name.trim() || !subject.trim() || !body.trim()) {
      setMessage("Campaign name, subject and message are required.");
      return;
    }

    const response = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        subject,
        from_name: fromName || null,
        reply_to: replyTo || null,
        text_body: body,
        tracking_mode: trackingMode,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null
      })
    });

    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error ?? "Unable to save campaign.");
      return;
    }

    setMessage(result.campaign?.status === "scheduled" ? "Campaign scheduled." : "Draft saved.");
    await refresh(false);
  }

  const updatedText = lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : "Waiting for first refresh";

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Mail <span>Admin</span></div>
        <nav className="nav">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`navButton ${view === id ? "navButtonActive" : ""}`} onClick={() => setView(id)}><Icon size={17} />{label}</button>
          ))}
        </nav>
      </aside>

      <main className="main">
        {!loading && !data.connected && (
          <section className="card" style={{ marginBottom: 16, borderColor: "#6b4f1d" }}>
            <div className="event"><Cable className="warn" size={18} /><div><div className="eventTitle">Supabase is not connected yet</div><div className="eventMeta">No fake data is being shown. Once the database credentials and schema are added, this dashboard switches to live contacts, campaigns, sessions and events automatically.</div></div></div>
          </section>
        )}

        {data.error ? <section className="card" style={{ marginBottom: 16, borderColor: "#7f1d1d" }}><div className="eventTitle danger">Connection error</div><div className="eventMeta">{data.error}</div></section> : null}

        {view === "overview" && <>
          <Header title="Overview" subtitle={`Live campaign and website intelligence · ${updatedText}`} actions={<button className="button" onClick={() => refresh(true)}>Refresh now</button>} />
          <div className="grid4">
            <Metric label="Total Contacts" value={data.metrics.contacts} hint={`${data.metrics.activeContacts.toLocaleString()} active`} />
            <Metric label="Delivered" value={data.metrics.delivered} hint="provider-confirmed" />
            <Metric label="Unique Clickers" value={data.metrics.uniqueClickers} hint="human email clicks" />
            <Metric label="Attributed Sessions" value={data.metrics.attributedSessions} hint="email → website" />
          </div>
          <div className="twoCol">
            <section className="card">
              <h3 className="sectionTitle">Recent campaigns</h3>
              {data.campaigns.length ? <table><thead><tr><th>Name</th><th>Status</th><th>Created</th></tr></thead><tbody>{data.campaigns.map((row) => <tr key={row.id}><td>{row.name}</td><td><span className="badge">{row.status}</span></td><td>{new Date(row.created_at).toLocaleString()}</td></tr>)}</tbody></table> : <Empty>No campaigns yet.</Empty>}
            </section>
            <section className="card">
              <h3 className="sectionTitle">System readiness</h3>
              <StatusRow icon={<LockKeyhole className={data.authConfigured ? "good" : "warn"} size={18} />} title="Admin protection" ready={Boolean(data.authConfigured)} readyText="Password protection configured" waitingText="Add ADMIN_PASSWORD + ADMIN_SESSION_SECRET" />
              <StatusRow icon={<ShieldCheck className={data.connected ? "good" : "warn"} size={18} />} title="Supabase" ready={data.connected} readyText="Database connected" waitingText="Waiting for Supabase credentials + schema" />
              <StatusRow icon={<MousePointerClick className={data.trackingConfigured ? "good" : "warn"} size={18} />} title="Website tracking" ready={Boolean(data.trackingConfigured)} readyText="Tracking URL and origins configured" waitingText="Add tracking URL and allowed website origin" />
              <StatusRow icon={<Cable className={data.providerConfigured ? "good" : "warn"} size={18} />} title="Email provider" ready={Boolean(data.providerConfigured)} readyText="Base email provider settings detected" waitingText="Connect your reseller/email API later" />
            </section>
          </div>
        </>}

        {view === "contacts" && <>
          <Header title="Contacts" subtitle="Real contacts from your connected database only." />
          <div className="grid4" style={{ marginBottom: 12 }}>
            <Metric label="All Contacts" value={data.metrics.contacts} />
            <Metric label="Active" value={data.metrics.activeContacts} />
            <Metric label="Recent Rows" value={data.contacts.length} hint="latest loaded" />
            <Metric label="Database" value={data.connected ? "Connected" : "Offline"} />
          </div>
          <section className="card">{data.contacts.length ? <table><thead><tr><th>User</th><th>Email</th><th>Country</th><th>Status</th><th>Added</th></tr></thead><tbody>{data.contacts.map((row) => <tr key={row.id}><td>{row.username || "—"}</td><td>{row.email}</td><td>{row.country_code || "—"}</td><td><span className="badge">{row.status}</span></td><td>{new Date(row.created_at).toLocaleString()}</td></tr>)}</tbody></table> : <Empty>No contacts yet. After Supabase is connected, import your cleaned contact CSV.</Empty>}</section>
        </>}

        {view === "campaigns" && <>
          <Header title="Campaigns" subtitle="Saved and scheduled campaigns from your database." actions={<button className="button buttonPrimary" onClick={() => setView("composer")}>Create Campaign</button>} />
          <section className="card">{data.campaigns.length ? <table><thead><tr><th>Name</th><th>Status</th><th>Created</th><th>Scheduled</th></tr></thead><tbody>{data.campaigns.map((row) => <tr key={row.id}><td>{row.name}</td><td><span className="badge">{row.status}</span></td><td>{new Date(row.created_at).toLocaleString()}</td><td>{row.scheduled_at ? new Date(row.scheduled_at).toLocaleString() : "—"}</td></tr>)}</tbody></table> : <Empty>No campaigns have been created.</Empty>}</section>
        </>}

        {view === "composer" && <>
          <Header title="Create Campaign" subtitle="Create a real database draft now; sending activates when your email API adapter is connected." actions={<button className="button buttonPrimary" onClick={saveCampaign}>Save Campaign</button>} />
          {message ? <section className="card" style={{ marginBottom: 12 }}><div className="eventTitle">{message}</div></section> : null}
          <div className="composer">
            <section className="card">
              <label className="label">Campaign name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. August Update" />
              <div className="formGrid"><div><label className="label">From name</label><input className="input" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your brand/team name" /></div><div><label className="label">Reply-to</label><input className="input" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="reply@example.com" /></div></div>
              <label className="label">Subject</label><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" />
              <label className="label">Email body</label><textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} placeholder={'Use {{first_name}} and {{tracked_link}} where needed.'} />
              <div className="formGrid"><div><label className="label">Tracking mode</label><select className="select" value={trackingMode} onChange={(e) => setTrackingMode(e.target.value)}><option value="clicks_and_site">Clicks + site events</option><option value="clicks_only">Clicks only</option><option value="delivery_only">Delivery only</option></select></div><div><label className="label">Schedule (optional)</label><input className="input" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div></div>
              <p className="note">The email API key will remain server-side. Recipient tracking links will be generated when the sending adapter is connected.</p>
            </section>
            <section className="card"><h3 className="sectionTitle">Preview</h3><div className="preview"><h2>{previewSubject}</h2>{previewBody.split("\n").map((line, index) => <p key={index}>{line || <>&nbsp;</>}</p>)}</div></section>
          </div>
        </>}

        {view === "tracking" && <>
          <Header title="Tracking" subtitle={`Email click attribution, scanner filtering and site sessions · ${updatedText}`} actions={<button className="button" onClick={() => refresh(false)}>Refresh</button>} />
          <div className="grid4">
            <Metric label="Unique Clickers" value={data.metrics.uniqueClickers} hint="unique known contacts" />
            <Metric label="Human Clicks" value={data.metrics.humanClicks} hint="scanner-filtered" />
            <Metric label="Scanner/Bot Clicks" value={data.metrics.botClicks} hint="kept separate" />
            <Metric label="Attributed Sessions" value={data.metrics.attributedSessions} hint="email-linked visits" />
          </div>
          <div className="grid4" style={{ marginTop: 12 }}>
            <Metric label="Anonymous Sessions" value={data.metrics.anonymousSessions} hint="non-email/direct visits" />
            <Metric label="Total Events" value={data.metrics.totalEvents} />
            <Metric label="Recent Click Rows" value={clickEvents.length} />
            <Metric label="Database" value={data.connected ? "Connected" : "Offline"} />
          </div>
          <section className="card" style={{ marginTop: 12 }}>
            <h3 className="sectionTitle">Recent email link clicks</h3>
            {clickEvents.length ? <table><thead><tr><th>Recipient</th><th>Campaign</th><th>Link</th><th>Device</th><th>Approx. region</th><th>Type</th><th>Time</th></tr></thead><tbody>{clickEvents.map((event) => {
              const contact = one(event.contact);
              const campaign = one(event.campaign);
              const link = one(event.link);
              return <tr key={event.id}><td>{contact?.email || event.contact_id || "Unknown"}</td><td>{campaign?.name || event.campaign_id || "—"}</td><td>{link?.label || link?.destination_url || event.page_url || "—"}</td><td>{event.device_type || "—"}</td><td>{[event.region, event.country_code].filter(Boolean).join(", ") || "—"}</td><td><span className={`badge ${event.is_bot ? "warn" : "good"}`}>{event.is_bot ? "Scanner/Bot" : "Human"}</span></td><td>{new Date(event.occurred_at).toLocaleString()}</td></tr>;
            })}</tbody></table> : <Empty>No email clicks yet.</Empty>}
          </section>
        </>}

        {view === "events" && <>
          <Header title="Live Events" subtitle={`Auto-refreshes every 10 seconds · ${updatedText}`} actions={<button className="button" onClick={() => refresh(false)}>Refresh now</button>} />
          <section className="card">{data.events.length ? data.events.map((event) => {
            const contact = one(event.contact);
            const campaign = one(event.campaign);
            return <div className="event" key={event.id}><span className="eventDot" /><div><div className="eventTitle">{event.event_type}{event.is_bot ? " · scanner/bot" : ""}{contact?.email ? ` · ${contact.email}` : ""}</div><div className="eventMeta">{campaign?.name ? `${campaign.name} · ` : ""}{event.page_url || "No page URL"} · {[event.region, event.country_code].filter(Boolean).join(", ") || "Location unavailable"} · {new Date(event.occurred_at).toLocaleString()}</div></div></div>;
          }) : <Empty>No events recorded yet.</Empty>}</section>
        </>}

        {view === "settings" && <>
          <Header title="Connection Status" subtitle="A connection turns green only when the required server configuration is detected." actions={<button className="button" onClick={() => refresh(false)}>Re-check</button>} />
          <div className="twoCol">
            <section className="card"><h3 className="sectionTitle">Required connections</h3>
              <StatusRow icon={<LockKeyhole className={data.authConfigured ? "good" : "warn"} size={18} />} title="Admin protection" ready={Boolean(data.authConfigured)} readyText="Configured" waitingText="Add ADMIN_PASSWORD and ADMIN_SESSION_SECRET in Vercel" />
              <StatusRow icon={<ShieldCheck className={data.connected ? "good" : "warn"} size={18} />} title="Supabase database" ready={data.connected} readyText="Connected and readable" waitingText="Add Supabase environment variables, then run the schema" />
              <StatusRow icon={<MousePointerClick className={data.trackingConfigured ? "good" : "warn"} size={18} />} title="Website tracker" ready={Boolean(data.trackingConfigured)} readyText="Base URL and allowed origin configured" waitingText="Add TRACKING_BASE_URL and TRACKING_ALLOWED_ORIGINS" />
              <StatusRow icon={<Cable className={data.providerConfigured ? "good" : "warn"} size={18} />} title="Email API" ready={Boolean(data.providerConfigured)} readyText="Base provider configuration detected" waitingText="Connect your email/reseller API when ready" />
            </section>
            <section className="card"><h3 className="sectionTitle">What is already built</h3><p className="note">Admin login, database-backed campaigns, contact views, unique recipient click redirects, human-vs-scanner click classification, attributed email sessions, anonymous website sessions, page/action events, approximate country/region metadata, CORS allow-listing and live dashboard polling are already in the codebase.</p><p className="note">Precise GPS is not collected automatically. Exact location requires explicit browser permission. Do not send passwords, payment details or private form contents as tracking metadata.</p></section>
          </div>
        </>}
      </main>
    </div>
  );
}
