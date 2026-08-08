"use client";

import {
  Activity,
  Database,
  LayoutDashboard,
  LogOut,
  MailPlus,
  MousePointerClick,
  RefreshCw,
  Send,
  Settings,
  Upload,
  UsersRound
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type View = "overview" | "contacts" | "campaigns" | "tracking" | "events";

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
  browser: string | null;
  contact_id: string | null;
  campaign_id: string | null;
  link_id: string | null;
  contact?: EventContact | EventContact[] | null;
  campaign?: EventCampaign | EventCampaign[] | null;
  link?: EventLink | EventLink[] | null;
};

type ContactRow = {
  id: string;
  external_user_id: string | null;
  external_session_id: string | null;
  username: string | null;
  email: string;
  country_code: string | null;
  status: string;
  created_at: string;
};

type ImportAudit = {
  id: string;
  filename: string;
  added_rows: number;
  updated_rows: number;
  duplicate_rows: number;
  invalid_rows: number;
  created_at: string;
};

type ImportSummary = {
  filename: string;
  totalRows: number;
  uniqueRows: number;
  addedRows: number;
  updatedRows: number;
  duplicateRows: number;
  invalidRows: number;
};

type DashboardData = {
  connected: boolean;
  authConfigured?: boolean;
  providerConfigured?: boolean;
  trackingConfigured?: boolean;
  error?: string;
  warnings?: string[];
  metrics: {
    contacts: number;
    activeContacts: number;
    missingUsernames: number;
    delivered: number;
    uniqueClickers: number;
    humanClicks: number;
    botClicks: number;
    attributedSessions: number;
    anonymousSessions: number;
    totalEvents: number;
  };
  campaigns: Array<{ id: string; name: string; status: string; created_at: string; scheduled_at?: string | null }>;
  contacts: ContactRow[];
  imports: ImportAudit[];
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
    missingUsernames: 0,
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
  imports: [],
  events: []
};

const navItems: Array<{ id: View; label: string; icon: React.ElementType }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "contacts", label: "Contacts", icon: UsersRound },
  { id: "campaigns", label: "Campaigns", icon: Send },
  { id: "tracking", label: "Tracking", icon: MousePointerClick },
  { id: "events", label: "Live events", icon: Activity }
];

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function PageHeader({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) {
  return (
    <header className="pageHeader">
      <div><h1>{title}</h1><p>{description}</p></div>
      {actions ? <div className="pageActions">{actions}</div> : null}
    </header>
  );
}

function Stat({ label, value, detail }: { label: string; value: number | string; detail?: string }) {
  return (
    <div className="stat">
      <span className="statLabel">{label}</span>
      <strong className="statValue">{typeof value === "number" ? value.toLocaleString() : value}</strong>
      {detail ? <span className="statDetail">{detail}</span> : null}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="emptyState">{children}</div>;
}

function Panel({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panelHeader"><h2>{title}</h2>{meta ? <span>{meta}</span> : null}</div>
      {children}
    </section>
  );
}

function StatusLine({ label, ready, text }: { label: string; ready: boolean; text: string }) {
  return (
    <div className="statusItem">
      <span className={`statusDot ${ready ? "statusDotReady" : "statusDotPending"}`} />
      <div><div className="statusName">{label}</div><div className="statusText">{text}</div></div>
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        imports: payload.imports ?? [],
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
    const timer = window.setInterval(() => refresh(false), 15000);
    return () => window.clearInterval(timer);
  }, []);

  const clickEvents = useMemo(() => data.events.filter((event) => event.event_type === "email_link_click"), [data.events]);
  const currentLabel = navItems.find((item) => item.id === view)?.label ?? "Overview";
  const syncText = lastUpdated ? `Last sync ${lastUpdated.toLocaleTimeString()}` : loading ? "Loading" : "Not synced";

  async function importContacts() {
    if (!importFile || importing) return;
    setImporting(true);
    setImportMessage("");
    setImportResult(null);
    try {
      const form = new FormData();
      form.append("file", importFile);
      const response = await fetch("/api/contacts/import", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) {
        setImportMessage(result.error ?? "Unable to import contacts.");
        return;
      }
      setImportResult(result.summary as ImportSummary);
      setImportMessage("Import complete");
      setImportFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refresh(false);
    } catch {
      setImportMessage("The import request did not complete.");
    } finally {
      setImporting(false);
    }
  }

  async function logout() {
    try { await fetch("/api/auth/logout", { method: "POST" }); }
    finally { window.location.href = "/login"; }
  }

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brandBlock">
          <div className="brandMark">M</div>
          <div><div className="brandName">Mail Admin</div><div className="brandMeta">Campaign operations</div></div>
        </div>

        <div className="navGroup">
          <div className="navLabel">Workspace</div>
          {navItems.slice(0, 3).map(({ id, label, icon: Icon }) => (
            <button key={id} className={`navItem ${view === id ? "navItemActive" : ""}`} onClick={() => setView(id)}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
            </button>
          ))}
          <a className="navItem" href="/campaigns/new"><MailPlus size={17} strokeWidth={1.8} /><span>New campaign</span></a>
        </div>

        <div className="navGroup">
          <div className="navLabel">System</div>
          {navItems.slice(3).map(({ id, label, icon: Icon }) => (
            <button key={id} className={`navItem ${view === id ? "navItemActive" : ""}`} onClick={() => setView(id)}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>
            </button>
          ))}
          <a className="navItem" href="/connections"><Settings size={17} strokeWidth={1.8} /><span>Connections</span></a>
        </div>

        <div className="sidebarFooter">
          <div className="serviceLine"><span className={`statusDot ${data.connected ? "statusDotReady" : "statusDotPending"}`} /><span>{data.connected ? "Database online" : "Database unavailable"}</span></div>
          <button className="logoutButton" onClick={logout}><LogOut size={16} /> Sign out</button>
        </div>
      </aside>

      <main className="workspace">
        <div className="workspaceBar">
          <div className="breadcrumb"><span>Mail Admin</span><b>/</b><strong>{currentLabel}</strong></div>
          <div className="syncState"><span className={loading ? "syncPulse" : ""} />{syncText}</div>
        </div>

        {!loading && !data.connected ? <div className="notice noticeWarning"><Database size={17} /><div><strong>Database unavailable</strong><span>{data.error || "Check the Supabase connection."}</span></div></div> : null}
        {data.connected && data.warnings?.length ? <div className="notice noticeWarning"><Database size={17} /><div><strong>Partial data warning</strong><span>{data.warnings[0]}</span></div></div> : null}

        {view === "overview" ? <>
          <PageHeader title="Overview" description="Delivery, clicks and website activity." actions={<><a className="button buttonPrimary" href="/campaigns/new"><MailPlus size={15} /> New campaign</a><button className="button" onClick={() => refresh(true)}><RefreshCw size={15} /> Refresh</button></>} />
          <section className="statsBar">
            <Stat label="Contacts" value={data.metrics.contacts} detail={`${data.metrics.activeContacts.toLocaleString()} active`} />
            <Stat label="Delivered" value={data.metrics.delivered} detail="Provider confirmed" />
            <Stat label="Unique clickers" value={data.metrics.uniqueClickers} detail="Human clicks" />
            <Stat label="Attributed sessions" value={data.metrics.attributedSessions} detail="Email to site" />
          </section>
          <div className="contentGrid contentGridWide">
            <Panel title="Recent campaigns" meta={`${data.campaigns.length} shown`}>
              {data.campaigns.length ? <div className="tableWrap"><table><thead><tr><th>Campaign</th><th>Status</th><th>Created</th><th>Scheduled</th></tr></thead><tbody>{data.campaigns.map((row) => <tr key={row.id}><td className="primaryCell">{row.name}</td><td><span className={`stateTag state-${row.status}`}>{row.status}</span></td><td>{formatDate(row.created_at)}</td><td>{formatDate(row.scheduled_at)}</td></tr>)}</tbody></table></div> : <EmptyState>No campaigns yet.</EmptyState>}
            </Panel>
            <Panel title="System status">
              <div className="statusList">
                <StatusLine label="Admin access" ready={Boolean(data.authConfigured)} text={data.authConfigured ? "Protected" : "Not configured"} />
                <StatusLine label="Supabase" ready={data.connected} text={data.connected ? "Connected" : "Connection required"} />
                <StatusLine label="Website tracker" ready={Boolean(data.trackingConfigured)} text={data.trackingConfigured ? "Active site configured" : "Open Connections to add a site"} />
                <StatusLine label="Email provider" ready={Boolean(data.providerConfigured)} text={data.providerConfigured ? "Provider ready" : "Open Connections to configure Resend"} />
              </div>
            </Panel>
          </div>
        </> : null}

        {view === "contacts" ? <>
          <PageHeader title="Contacts" description="Recipient records and import audit." actions={<><input ref={fileInputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { setImportFile(e.target.files?.[0] ?? null); setImportMessage(""); setImportResult(null); }} /><button className="button" onClick={() => fileInputRef.current?.click()}><Upload size={15} /> {importFile ? "Change file" : "Choose CSV"}</button><button className="button buttonPrimary" disabled={!importFile || importing || !data.connected} onClick={importContacts}>{importing ? "Importing…" : "Import"}</button></>} />
          <section className="statsBar">
            <Stat label="All contacts" value={data.metrics.contacts} />
            <Stat label="Active" value={data.metrics.activeContacts} />
            <Stat label="Missing usernames" value={data.metrics.missingUsernames} />
            <Stat label="Email uniqueness" value="Enforced" />
          </section>
          <Panel title="CSV import" meta={importFile ? importFile.name : "No file selected"}>
            <div className="importLayout"><div><p className="bodyText">Accepted columns: <code>user_id</code>, <code>session_id</code>, <code>username</code>, <code>email</code>. Existing contacts are matched case-insensitively by email.</p>{importMessage ? <div className={`inlineMessage ${importResult ? "inlineMessageSuccess" : "inlineMessageError"}`}>{importMessage}</div> : null}</div>{importResult ? <div className="importSummary"><div><span>Rows</span><strong>{importResult.totalRows.toLocaleString()}</strong></div><div><span>Unique</span><strong>{importResult.uniqueRows.toLocaleString()}</strong></div><div><span>Added</span><strong>{importResult.addedRows.toLocaleString()}</strong></div><div><span>Existing</span><strong>{importResult.updatedRows.toLocaleString()}</strong></div><div><span>CSV duplicates</span><strong>{importResult.duplicateRows.toLocaleString()}</strong></div><div><span>Rejected</span><strong>{importResult.invalidRows.toLocaleString()}</strong></div></div> : <div className="importSummary importSummaryEmpty"><span>Import results appear here.</span></div>}</div>
          </Panel>
          <Panel title="Recent contacts" meta={`${data.contacts.length} shown`}>
            {data.contacts.length ? <div className="tableWrap"><table><thead><tr><th>User ID</th><th>Session ID</th><th>Username</th><th>Email</th><th>Status</th></tr></thead><tbody>{data.contacts.map((row) => <tr key={row.id}><td className="monoCell">{row.external_user_id || "—"}</td><td className="monoCell">{row.external_session_id || "—"}</td><td>{row.username || "—"}</td><td className="primaryCell">{row.email}</td><td><span className={`stateTag state-${row.status}`}>{row.status}</span></td></tr>)}</tbody></table></div> : <EmptyState>No contacts in the database.</EmptyState>}
          </Panel>
          <Panel title="Import history" meta={`${data.imports.length} recent imports`}>
            {data.imports.length ? <div className="tableWrap"><table><thead><tr><th>File</th><th>Added</th><th>Existing</th><th>Duplicates</th><th>Rejected</th><th>Imported</th></tr></thead><tbody>{data.imports.map((row) => <tr key={row.id}><td className="primaryCell">{row.filename}</td><td>{row.added_rows.toLocaleString()}</td><td>{row.updated_rows.toLocaleString()}</td><td>{row.duplicate_rows.toLocaleString()}</td><td>{row.invalid_rows.toLocaleString()}</td><td>{formatDate(row.created_at)}</td></tr>)}</tbody></table></div> : <EmptyState>No imports recorded.</EmptyState>}
          </Panel>
        </> : null}

        {view === "campaigns" ? <>
          <PageHeader title="Campaigns" description="Drafts, schedules and sending status." actions={<a className="button buttonPrimary" href="/campaigns/new"><MailPlus size={15} /> New campaign</a>} />
          <Panel title="Campaign list" meta={`${data.campaigns.length} shown`}>
            {data.campaigns.length ? <div className="tableWrap"><table><thead><tr><th>Campaign</th><th>Status</th><th>Created</th><th>Scheduled</th></tr></thead><tbody>{data.campaigns.map((row) => <tr key={row.id}><td className="primaryCell">{row.name}</td><td><span className={`stateTag state-${row.status}`}>{row.status}</span></td><td>{formatDate(row.created_at)}</td><td>{formatDate(row.scheduled_at)}</td></tr>)}</tbody></table></div> : <EmptyState>No campaigns saved.</EmptyState>}
          </Panel>
        </> : null}

        {view === "tracking" ? <>
          <PageHeader title="Tracking" description="Email attribution and website sessions." actions={<><a className="button" href="/connections"><Settings size={15} /> Tracking sites</a><button className="button" onClick={() => refresh(false)}><RefreshCw size={15} /> Refresh</button></>} />
          <section className="statsBar">
            <Stat label="Unique clickers" value={data.metrics.uniqueClickers} />
            <Stat label="Human clicks" value={data.metrics.humanClicks} />
            <Stat label="Scanner clicks" value={data.metrics.botClicks} />
            <Stat label="Attributed sessions" value={data.metrics.attributedSessions} />
          </section>
          <section className="statsBar statsBarSecondary">
            <Stat label="Anonymous sessions" value={data.metrics.anonymousSessions} />
            <Stat label="Total events" value={data.metrics.totalEvents} />
            <Stat label="Recent click rows" value={clickEvents.length} />
            <Stat label="Tracker" value={data.trackingConfigured ? "Ready" : "Pending"} />
          </section>
          <Panel title="Recent email clicks" meta={`${clickEvents.length} shown`}>
            {clickEvents.length ? <div className="tableWrap"><table><thead><tr><th>Recipient</th><th>Campaign</th><th>Link</th><th>Client</th><th>Region</th><th>Type</th><th>Time</th></tr></thead><tbody>{clickEvents.map((event) => { const contact = one(event.contact); const campaign = one(event.campaign); const link = one(event.link); return <tr key={event.id}><td className="primaryCell">{contact?.email || event.contact_id || "Unknown"}</td><td>{campaign?.name || "—"}</td><td>{link?.label || link?.destination_url || event.page_url || "—"}</td><td>{[event.device_type, event.browser].filter(Boolean).join(" / ") || "—"}</td><td>{[event.region, event.country_code].filter(Boolean).join(", ") || "—"}</td><td><span className={`stateTag ${event.is_bot ? "state-scanner" : "state-human"}`}>{event.is_bot ? "Scanner" : "Human"}</span></td><td>{formatDate(event.occurred_at)}</td></tr>; })}</tbody></table></div> : <EmptyState>No tracked email clicks yet.</EmptyState>}
          </Panel>
        </> : null}

        {view === "events" ? <>
          <PageHeader title="Live events" description="Newest events recorded by the website tracker." actions={<button className="button" onClick={() => refresh(false)}><RefreshCw size={15} /> Refresh</button>} />
          <Panel title="Event stream" meta="Refreshes every 15 seconds">
            {data.events.length ? <div className="eventList">{data.events.map((event) => { const contact = one(event.contact); const campaign = one(event.campaign); return <div className="eventRow" key={event.id}><span className={`eventMarker ${event.is_bot ? "eventMarkerBot" : ""}`} /><div className="eventMain"><div className="eventName">{event.event_type.replaceAll("_", " ")}</div><div className="eventContext">{contact?.email || "Anonymous visitor"}{campaign?.name ? ` · ${campaign.name}` : ""}{event.page_url ? ` · ${event.page_url}` : ""}</div></div><div className="eventSide"><span>{[event.region, event.country_code].filter(Boolean).join(", ") || "—"}</span><time>{formatDate(event.occurred_at)}</time></div></div>; })}</div> : <EmptyState>No tracking events yet.</EmptyState>}
          </Panel>
        </> : null}
      </main>
    </div>
  );
}
