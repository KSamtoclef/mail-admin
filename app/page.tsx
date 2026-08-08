"use client";

import {
  Activity,
  Cable,
  ContactRound,
  LayoutDashboard,
  MailPlus,
  MousePointerClick,
  Send,
  Settings,
  ShieldCheck
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type View = "overview" | "contacts" | "campaigns" | "composer" | "tracking" | "events" | "settings";

type DashboardData = {
  connected: boolean;
  providerConfigured?: boolean;
  trackingConfigured?: boolean;
  error?: string;
  metrics: { contacts: number; delivered: number; uniqueClickers: number; attributedSessions: number };
  campaigns: Array<{ id: string; name: string; status: string; created_at: string }>;
  contacts: Array<{ id: string; username: string | null; email: string; country_code: string | null; status: string; created_at: string }>;
  events: Array<{ id: number; event_type: string; occurred_at: string; is_bot: boolean; country_code: string | null; region: string | null; page_url: string | null }>;
};

const emptyData: DashboardData = {
  connected: false,
  providerConfigured: false,
  trackingConfigured: false,
  metrics: { contacts: 0, delivered: 0, uniqueClickers: 0, attributedSessions: 0 },
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

function Header({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }) {
  return <div className="topbar"><div><h1>{title}</h1><p className="subtitle">{subtitle}</p></div>{actions ? <div className="actions">{actions}</div> : null}</div>;
}

function Metric({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return <div className="card"><div className="metricLabel">{label}</div><div className="metricValue">{typeof value === "number" ? value.toLocaleString() : value}</div>{hint ? <div className="metricHint">{hint}</div> : null}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="note" style={{ padding: "22px 0" }}>{children}</div>;
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [body, setBody] = useState("");
  const [trackingMode, setTrackingMode] = useState("clicks_and_site");
  const [scheduledAt, setScheduledAt] = useState("");

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      const payload = await response.json();
      setData({ ...emptyData, ...payload, metrics: payload.metrics ?? emptyData.metrics, campaigns: payload.campaigns ?? [], contacts: payload.contacts ?? [], events: payload.events ?? [] });
    } catch {
      setData({ ...emptyData, error: "Dashboard API is not reachable." });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const previewSubject = useMemo(() => (subject || "Your subject will appear here").replaceAll("{{first_name}}", "Recipient"), [subject]);
  const previewBody = useMemo(() => (body || "Your message preview will appear here.").replaceAll("{{first_name}}", "Recipient").replaceAll("{{tracked_link}}", "[Tracked link]"), [body]);

  async function saveCampaign() {
    setMessage("");
    const payload = {
      name,
      subject,
      from_name: fromName || null,
      reply_to: replyTo || null,
      text_body: body,
      tracking_mode: trackingMode,
      scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null
    };

    const response = await fetch("/api/campaigns", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error ?? "Unable to save campaign.");
      return;
    }

    setMessage(result.campaign?.status === "scheduled" ? "Campaign scheduled." : "Draft saved.");
    await refresh();
  }

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
            <div className="event"><Cable className="warn" size={18} /><div><div className="eventTitle">Live database not connected yet</div><div className="eventMeta">The dashboard is running with zero fake data. Add the Supabase environment variables and run the included schema; live contacts, campaigns and events will then appear automatically.</div></div></div>
          </section>
        )}

        {view === "overview" && <>
          <Header title="Overview" subtitle="Live campaign, recipient and website activity." actions={<button className="button" onClick={refresh}>Refresh</button>} />
          <div className="grid4">
            <Metric label="Total Contacts" value={data.metrics.contacts} hint="from contacts table" />
            <Metric label="Delivered" value={data.metrics.delivered} hint="provider-confirmed" />
            <Metric label="Unique Clickers" value={data.metrics.uniqueClickers} hint="human clicks only" />
            <Metric label="Attributed Sessions" value={data.metrics.attributedSessions} hint="email → website" />
          </div>
          <div className="twoCol">
            <section className="card"><h3 className="sectionTitle">Recent campaigns</h3>{data.campaigns.length ? <table><thead><tr><th>Name</th><th>Status</th><th>Created</th></tr></thead><tbody>{data.campaigns.map((row) => <tr key={row.id}><td>{row.name}</td><td><span className="badge">{row.status}</span></td><td>{new Date(row.created_at).toLocaleString()}</td></tr>)}</tbody></table> : <Empty>No campaigns yet.</Empty>}</section>
            <section className="card"><h3 className="sectionTitle">System readiness</h3>
              <div className="event"><ShieldCheck className={data.connected ? "good" : "warn"} size={18} /><div><div className="eventTitle">Supabase</div><div className="eventMeta">{data.connected ? "Connected" : "Waiting for credentials + schema"}</div></div></div>
              <div className="event"><Cable className={data.providerConfigured ? "good" : "warn"} size={18} /><div><div className="eventTitle">Email provider</div><div className="eventMeta">{data.providerConfigured ? "Base provider settings detected" : "Not connected yet"}</div></div></div>
              <div className="event"><MousePointerClick className={data.trackingConfigured ? "good" : "warn"} size={18} /><div><div className="eventTitle">Website tracking</div><div className="eventMeta">{data.trackingConfigured ? "Tracking domain/origins configured" : "Waiting for deployed URL + website origin"}</div></div></div>
            </section>
          </div>
        </>}

        {view === "contacts" && <>
          <Header title="Contacts" subtitle="Only real contacts from your connected database are displayed." />
          <section className="card">{data.contacts.length ? <table><thead><tr><th>User</th><th>Email</th><th>Country</th><th>Status</th><th>Added</th></tr></thead><tbody>{data.contacts.map((row) => <tr key={row.id}><td>{row.username || "—"}</td><td>{row.email}</td><td>{row.country_code || "—"}</td><td><span className="badge">{row.status}</span></td><td>{new Date(row.created_at).toLocaleString()}</td></tr>)}</tbody></table> : <Empty>No contacts yet. Connect Supabase, then import your cleaned contact list.</Empty>}</section>
        </>}

        {view === "campaigns" && <>
          <Header title="Campaigns" subtitle="Saved and scheduled campaigns from your database." actions={<button className="button buttonPrimary" onClick={() => setView("composer")}>Create Campaign</button>} />
          <section className="card">{data.campaigns.length ? <table><thead><tr><th>Name</th><th>Status</th><th>Created</th></tr></thead><tbody>{data.campaigns.map((row) => <tr key={row.id}><td>{row.name}</td><td><span className="badge">{row.status}</span></td><td>{new Date(row.created_at).toLocaleString()}</td></tr>)}</tbody></table> : <Empty>No campaigns have been created.</Empty>}</section>
        </>}

        {view === "composer" && <>
          <Header title="Create Campaign" subtitle="Create a real draft or schedule it once Supabase is connected." actions={<button className="button buttonPrimary" onClick={saveCampaign}>Save Campaign</button>} />
          {message ? <section className="card" style={{ marginBottom: 12 }}><div className="eventTitle">{message}</div></section> : null}
          <div className="composer">
            <section className="card">
              <label className="label">Campaign name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. August Update" />
              <div className="formGrid"><div><label className="label">From name</label><input className="input" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Your brand/team name" /></div><div><label className="label">Reply-to</label><input className="input" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="reply@example.com" /></div></div>
              <label className="label">Subject</label><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" />
              <label className="label">Email body</label><textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} placeholder={'Use {{first_name}} and {{tracked_link}} where needed.'} />
              <div className="formGrid"><div><label className="label">Tracking mode</label><select className="select" value={trackingMode} onChange={(e) => setTrackingMode(e.target.value)}><option value="clicks_and_site">Clicks + site events</option><option value="clicks_only">Clicks only</option><option value="delivery_only">Delivery only</option></select></div><div><label className="label">Schedule (optional)</label><input className="input" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div></div>
              <p className="note">Sending remains disabled until your provider adapter and recipient-selection flow are connected. Saving drafts is already wired to Supabase.</p>
            </section>
            <section className="card"><h3 className="sectionTitle">Preview</h3><div className="preview"><h2>{previewSubject}</h2>{previewBody.split("\n").map((line, index) => <p key={index}>{line || <>&nbsp;</>}</p>)}</div></section>
          </div>
        </>}

        {view === "tracking" && <>
          <Header title="Tracking" subtitle="Live recipient-attributed tracking. No sample rows are displayed." />
          <div className="grid4"><Metric label="Unique Clickers" value={data.metrics.uniqueClickers} /><Metric label="Attributed Sessions" value={data.metrics.attributedSessions} /><Metric label="Recent Events" value={data.events.length} /><Metric label="Database" value={data.connected ? "Connected" : "Offline"} /></div>
          <section className="card" style={{ marginTop: 12 }}><Empty>Click details will populate after tracked campaign links are sent and recipients visit them.</Empty></section>
        </>}

        {view === "events" && <>
          <Header title="Live Events" subtitle="Most recent real tracking events stored in Supabase." actions={<button className="button" onClick={refresh}>Refresh</button>} />
          <section className="card">{data.events.length ? data.events.map((event) => <div className="event" key={event.id}><span className="eventDot" /><div><div className="eventTitle">{event.event_type}{event.is_bot ? " · scanner/bot" : ""}</div><div className="eventMeta">{event.page_url || "No page URL"} · {[event.region, event.country_code].filter(Boolean).join(", ") || "Location unavailable"} · {new Date(event.occurred_at).toLocaleString()}</div></div></div>) : <Empty>No events recorded yet.</Empty>}</section>
        </>}

        {view === "settings" && <>
          <Header title="Connection Status" subtitle="Secrets are configured securely in your deployment environment, not typed into this public dashboard." />
          <div className="twoCol">
            <section className="card"><h3 className="sectionTitle">Required connections</h3>
              <div className="event"><ShieldCheck className={data.connected ? "good" : "warn"} size={18} /><div><div className="eventTitle">Supabase database</div><div className="eventMeta">{data.connected ? "Ready" : "Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"}</div></div></div>
              <div className="event"><Cable className={data.providerConfigured ? "good" : "warn"} size={18} /><div><div className="eventTitle">Email API</div><div className="eventMeta">{data.providerConfigured ? "Base settings detected" : "Add your provider adapter credentials later"}</div></div></div>
              <div className="event"><MousePointerClick className={data.trackingConfigured ? "good" : "warn"} size={18} /><div><div className="eventTitle">Tracking</div><div className="eventMeta">{data.trackingConfigured ? "Configured" : "Add TRACKING_BASE_URL and TRACKING_ALLOWED_ORIGINS after deployment"}</div></div></div>
            </section>
            <section className="card"><h3 className="sectionTitle">Security rule</h3><p className="note">Do not put service-role keys, provider API keys or webhook secrets into source code, GitHub commits or browser-side settings. Configure them only as encrypted environment variables on your hosting platform.</p></section>
          </div>
        </>}
      </main>
    </div>
  );
}
