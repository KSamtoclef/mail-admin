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
  total_rows: number;
  valid_rows: number;
  unique_rows: number;
  added_rows: number;
  updated_rows: number;
  duplicate_rows: number;
  invalid_rows: number;
  created_at: string;
};

type ImportSummary = {
  filename: string;
  totalRows: number;
  validRows: number;
  uniqueRows: number;
  addedRows: number;
  updatedRows: number;
  duplicateRows: number;
  invalidRows: number;
  totalContactsAfterImport: number;
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

const navItems: Array<{ id: View; label: string; icon: React.ElementType; group: "workspace" | "system" }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, group: "workspace" },
  { id: "contacts", label: "Contacts", icon: UsersRound, group: "workspace" },
  { id: "campaigns", label: "Campaigns", icon: Send, group: "workspace" },
  { id: "composer", label: "New campaign", icon: MailPlus, group: "workspace" },
  { id: "tracking", label: "Tracking", icon: MousePointerClick, group: "system" },
  { id: "events", label: "Live events", icon: Activity, group: "system" },
  { id: "settings", label: "Connections", icon: Settings, group: "system" }
];

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function PageHeader({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) {
  return (
    <header className="pageHeader">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
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

function StatusItem({ label, ready, readyText, pendingText }: { label: string; ready: boolean; readyText: string; pendingText: string }) {
  return (
    <div className="statusItem">
      <span className={`statusDot ${ready ? "statusDotReady" : "statusDotPending"}`} />
      <div>
        <div className="statusName">{label}</div>
        <div className="statusText">{ready ? readyText : pendingText}</div>
      </div>
    </div>
  );
}

function Panel({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <div className="panelHeader">
        <h2>{title}</h2>
        {meta ? <span>{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [data, setData] = useState<DashboardData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [campaignMessage, setCampaignMessage] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);

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

  const currentLabel = navItems.find((item) => item.id === view)?.label ?? "Overview";
  const clickEvents = useMemo(() => data.events.filter((event) => event.event_type === "email_link_click"), [data.events]);
  const previewSubject = useMemo(() => (subject || "Subject preview").replaceAll("{{first_name}}", "Recipient"), [subject]);
  const previewBody = useMemo(() => (body || "Your message will appear here.").replaceAll("{{first_name}}", "Recipient").replaceAll("{{tracked_link}}", "[Tracked link]"), [body]);

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

  async function saveCampaign() {
    setCampaignMessage("");

    if (!name.trim() || !subject.trim() || !body.trim()) {
      setCampaignMessage("Campaign name, subject and message are required.");
      return;
    }

    try {
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
        setCampaignMessage(result.error ?? "Unable to save campaign.");
        return;
      }

      setCampaignMessage(result.campaign?.status === "scheduled" ? "Campaign scheduled" : "Draft saved");
      await refresh(false);
    } catch {
      setCampaignMessage("The campaign request did not complete.");
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  const updatedText = lastUpdated ? `Last sync ${lastUpdated.toLocaleTimeString()}` : loading ? "Loading" : "Not synced";

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brandBlock">
          <div className="brandMark">M</div>
          <div>
            <div className="brandName">Mail Admin</div>
            <div className="brandMeta">Campaign operations</div>
          </div>
        </div>

        <div className="navGroup">
          <div className="navLabel">Workspace</div>
          {navItems.filter((item) => item.group === "workspace").map(({ id, label, icon: Icon }) => (
            <button key={id} className={`navItem ${view === id ? "navItemActive" : ""}`} onClick={() => setView(id)}>
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="navGroup">
          <div className="navLabel">System</div>
          {navItems.filter((item) => item.group === "system").map(({ id, label, icon: Icon }) => (
            <button key={id} className={`navItem ${view === id ? "navItemActive" : ""}`} onClick={() => setView(id)}>
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="sidebarFooter">
          <div className="serviceLine">
            <span className={`statusDot ${data.connected ? "statusDotReady" : "statusDotPending"}`} />
            <span>{data.connected ? "Database online" : "Database unavailable"}</span>
          </div>
          <button className="logoutButton" onClick={logout}><LogOut size={16} /> Sign out</button>
        </div>
      </aside>

      <main className="workspace">
        <div className="workspaceBar">
          <div className="breadcrumb"><span>Mail Admin</span><b>/</b><strong>{currentLabel}</strong></div>
          <div className="syncState"><span className={loading ? "syncPulse" : ""} />{updatedText}</div>
        </div>

        {!loading && !data.connected ? (
          <div className="notice noticeWarning">
            <Database size={17} />
            <div><strong>Database check failed</strong><span>{data.error || "Check the Supabase connection and latest migration."}</span></div>
          </div>
        ) : null}

        {data.error && data.connected ? (
          <div className="notice noticeError"><strong>Dashboard error</strong><span>{data.error}</span></div>
        ) : null}

        {view === "overview" ? <>
          <PageHeader title="Overview" description="Campaign delivery and website activity." actions={<button className="button" onClick={() => refresh(true)}><RefreshCw size={15} /> Refresh</button>} />

          <section className="statsBar">
            <Stat label="Contacts" value={data.metrics.contacts} detail={`${data.metrics.activeContacts.toLocaleString()} active`} />
            <Stat label="Delivered" value={data.metrics.delivered} detail="Provider confirmed" />
            <Stat label="Unique clickers" value={data.metrics.uniqueClickers} detail="Human clicks" />
            <Stat label="Attributed sessions" value={data.metrics.attributedSessions} detail="Email to site" />
          </section>

          <div className="contentGrid contentGridWide">
            <Panel title="Recent campaigns" meta={`${data.campaigns.length} shown`}>
              {data.campaigns.length ? <div className="tableWrap"><table><thead><tr><th>Campaign</th><th>Status</th><th>Created</th></tr></thead><tbody>{data.campaigns.map((row) => <tr key={row.id}><td className="primaryCell">{row.name}</td><td><span className={`stateTag state-${row.status}`}>{row.status}</span></td><td>{formatDate(row.created_at)}</td></tr>)}</tbody></table></div> : <EmptyState>No campaigns yet.</EmptyState>}
            </Panel>

            <Panel title="Infrastructure">
              <div className="statusList">
                <StatusItem label="Admin access" ready={Boolean(data.authConfigured)} readyText="Protected" pendingText="Not configured" />
                <StatusItem label="Supabase" ready={data.connected} readyText="Connected" pendingText="Connection required" />
                <StatusItem label="Website tracker" ready={Boolean(data.trackingConfigured)} readyText="Configured" pendingText="Waiting for site origin" />
                <StatusItem label="Email provider" ready={Boolean(data.providerConfigured)} readyText="Configured" pendingText="Not connected" />
              </div>
            </Panel>
          </div>
        </> : null}

        {view === "contacts" ? <>
          <PageHeader
            title="Contacts"
            description="Upload and maintain recipient records."
            actions={<>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(event) => {
                  setImportFile(event.target.files?.[0] ?? null);
                  setImportMessage("");
                  setImportResult(null);
                }}
              />
              <button className="button" onClick={() => fileInputRef.current?.click()}><Upload size={15} /> {importFile ? "Change file" : "Choose CSV"}</button>
              <button className="button buttonPrimary" disabled={!importFile || importing || !data.connected} onClick={importContacts}>{importing ? "Importing…" : "Import"}</button>
            </>}
          />

          <section className="statsBar">
            <Stat label="All contacts" value={data.metrics.contacts} />
            <Stat label="Active" value={data.metrics.activeContacts} />
            <Stat label="Missing usernames" value={data.metrics.missingUsernames} detail="Should remain 0" />
            <Stat label="Email uniqueness" value="Enforced" detail="Database constraint" />
          </section>

          <Panel title="CSV import" meta={importFile ? importFile.name : "No file selected"}>
            <div className="importLayout">
              <div>
                <p className="bodyText">Accepted columns: <code>user_id</code>, <code>session_id</code>, <code>username</code>, <code>email</code>. Email matching is case-insensitive and existing records are merged without blank values overwriting stored IDs.</p>
                <div className="fileLine">
                  <Upload size={17} />
                  <div><strong>{importFile ? importFile.name : "Choose a CSV to begin"}</strong><span>{importFile ? `${(importFile.size / 1024 / 1024).toFixed(2)} MB` : "Maximum file size: 8 MB"}</span></div>
                </div>
                {importMessage ? <div className={`inlineMessage ${importResult ? "inlineMessageSuccess" : "inlineMessageError"}`}>{importMessage}</div> : null}
              </div>

              {importResult ? <div className="importSummary">
                <div><span>Rows</span><strong>{importResult.totalRows.toLocaleString()}</strong></div>
                <div><span>Unique valid</span><strong>{importResult.uniqueRows.toLocaleString()}</strong></div>
                <div><span>Added</span><strong>{importResult.addedRows.toLocaleString()}</strong></div>
                <div><span>Existing</span><strong>{importResult.updatedRows.toLocaleString()}</strong></div>
                <div><span>CSV duplicates</span><strong>{importResult.duplicateRows.toLocaleString()}</strong></div>
                <div><span>Rejected</span><strong>{importResult.invalidRows.toLocaleString()}</strong></div>
              </div> : <div className="importSummary importSummaryEmpty"><span>Import results will appear here.</span></div>}
            </div>
          </Panel>

          <Panel title="Recent contacts" meta={`${data.contacts.length} shown`}>
            {data.contacts.length ? <div className="tableWrap"><table><thead><tr><th>User ID</th><th>Session ID</th><th>Username</th><th>Email</th><th>Status</th></tr></thead><tbody>{data.contacts.map((row) => <tr key={row.id}><td className="monoCell" title={row.external_user_id || ""}>{row.external_user_id || "—"}</td><td className="monoCell" title={row.external_session_id || ""}>{row.external_session_id || "—"}</td><td>{row.username || "—"}</td><td className="primaryCell">{row.email}</td><td><span className={`stateTag state-${row.status}`}>{row.status}</span></td></tr>)}</tbody></table></div> : <EmptyState>No contacts in the database.</EmptyState>}
          </Panel>

          <Panel title="Import history" meta={`${data.imports.length} recent imports`}>
            {data.imports.length ? <div className="tableWrap"><table><thead><tr><th>File</th><th>Added</th><th>Existing</th><th>CSV duplicates</th><th>Rejected</th><th>Imported</th></tr></thead><tbody>{data.imports.map((row) => <tr key={row.id}><td className="primaryCell">{row.filename}</td><td>{row.added_rows.toLocaleString()}</td><td>{row.updated_rows.toLocaleString()}</td><td>{row.duplicate_rows.toLocaleString()}</td><td>{row.invalid_rows.toLocaleString()}</td><td>{formatDate(row.created_at)}</td></tr>)}</tbody></table></div> : <EmptyState>No imports recorded.</EmptyState>}
          </Panel>
        </> : null}

        {view === "campaigns" ? <>
          <PageHeader title="Campaigns" description="Drafts and scheduled sends." actions={<button className="button buttonPrimary" onClick={() => setView("composer")}><MailPlus size={15} /> New campaign</button>} />
          <Panel title="Campaign list" meta={`${data.campaigns.length} shown`}>
            {data.campaigns.length ? <div className="tableWrap"><table><thead><tr><th>Campaign</th><th>Status</th><th>Created</th><th>Scheduled</th></tr></thead><tbody>{data.campaigns.map((row) => <tr key={row.id}><td className="primaryCell">{row.name}</td><td><span className={`stateTag state-${row.status}`}>{row.status}</span></td><td>{formatDate(row.created_at)}</td><td>{formatDate(row.scheduled_at)}</td></tr>)}</tbody></table></div> : <EmptyState>No campaigns saved.</EmptyState>}
          </Panel>
        </> : null}

        {view === "composer" ? <>
          <PageHeader title="New campaign" description="Write and schedule a campaign." actions={<button className="button buttonPrimary" onClick={saveCampaign}>Save campaign</button>} />
          {campaignMessage ? <div className="inlineMessage pageMessage">{campaignMessage}</div> : null}
          <div className="editorGrid">
            <section className="panel editorPanel">
              <div className="formRow">
                <div><label>Campaign name</label><input className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="August update" /></div>
              </div>
              <div className="formRow formRowTwo">
                <div><label>From name</label><input className="input" value={fromName} onChange={(event) => setFromName(event.target.value)} placeholder="Your team" /></div>
                <div><label>Reply-to</label><input className="input" value={replyTo} onChange={(event) => setReplyTo(event.target.value)} placeholder="reply@example.com" /></div>
              </div>
              <div className="formRow"><div><label>Subject</label><input className="input" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Campaign subject" /></div></div>
              <div className="formRow"><div><label>Message</label><textarea className="textarea" value={body} onChange={(event) => setBody(event.target.value)} placeholder={'Use {{first_name}} and {{tracked_link}} where needed.'} /></div></div>
              <div className="formRow formRowTwo">
                <div><label>Tracking</label><select className="select" value={trackingMode} onChange={(event) => setTrackingMode(event.target.value)}><option value="clicks_and_site">Clicks + site events</option><option value="clicks_only">Clicks only</option><option value="delivery_only">Delivery only</option></select></div>
                <div><label>Schedule</label><input className="input" type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></div>
              </div>
              <p className="formHelp">Sending stays disabled until the email provider adapter is connected. Drafts and schedules are stored in Supabase.</p>
            </section>

            <section className="panel previewPanel">
              <div className="panelHeader"><h2>Preview</h2><span>Recipient view</span></div>
              <div className="emailPreview"><h3>{previewSubject}</h3>{previewBody.split("\n").map((line, index) => <p key={index}>{line || <>&nbsp;</>}</p>)}</div>
            </section>
          </div>
        </> : null}

        {view === "tracking" ? <>
          <PageHeader title="Tracking" description="Email click attribution and website sessions." actions={<button className="button" onClick={() => refresh(false)}><RefreshCw size={15} /> Refresh</button>} />
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
            {clickEvents.length ? <div className="tableWrap"><table><thead><tr><th>Recipient</th><th>Campaign</th><th>Link</th><th>Client</th><th>Region</th><th>Classification</th><th>Time</th></tr></thead><tbody>{clickEvents.map((event) => {
              const contact = one(event.contact);
              const campaign = one(event.campaign);
              const link = one(event.link);
              const client = [event.device_type, event.browser].filter(Boolean).join(" / ") || "—";
              return <tr key={event.id}><td className="primaryCell">{contact?.email || event.contact_id || "Unknown"}</td><td>{campaign?.name || "—"}</td><td>{link?.label || link?.destination_url || event.page_url || "—"}</td><td>{client}</td><td>{[event.region, event.country_code].filter(Boolean).join(", ") || "—"}</td><td><span className={`stateTag ${event.is_bot ? "state-scanner" : "state-human"}`}>{event.is_bot ? "Scanner" : "Human"}</span></td><td>{formatDate(event.occurred_at)}</td></tr>;
            })}</tbody></table></div> : <EmptyState>No tracked email clicks yet.</EmptyState>}
          </Panel>
        </> : null}

        {view === "events" ? <>
          <PageHeader title="Live events" description="Newest events from the website tracker." actions={<button className="button" onClick={() => refresh(false)}><RefreshCw size={15} /> Refresh</button>} />
          <Panel title="Event stream" meta="Refreshes every 15 seconds">
            {data.events.length ? <div className="eventList">{data.events.map((event) => {
              const contact = one(event.contact);
              const campaign = one(event.campaign);
              return <div className="eventRow" key={event.id}><span className={`eventMarker ${event.is_bot ? "eventMarkerBot" : ""}`} /><div className="eventMain"><div className="eventName">{event.event_type.replaceAll("_", " ")}</div><div className="eventContext">{contact?.email || "Anonymous visitor"}{campaign?.name ? ` · ${campaign.name}` : ""}{event.page_url ? ` · ${event.page_url}` : ""}</div></div><div className="eventSide"><span>{[event.region, event.country_code].filter(Boolean).join(", ") || "—"}</span><time>{formatDate(event.occurred_at)}</time></div></div>;
            })}</div> : <EmptyState>No tracking events yet.</EmptyState>}
          </Panel>
        </> : null}

        {view === "settings" ? <>
          <PageHeader title="Connections" description="Environment and service status." actions={<button className="button" onClick={() => refresh(false)}><RefreshCw size={15} /> Re-check</button>} />
          <div className="contentGrid">
            <Panel title="Services">
              <div className="statusList">
                <StatusItem label="Admin access" ready={Boolean(data.authConfigured)} readyText="Password protection active" pendingText="ADMIN_PASSWORD and ADMIN_SESSION_SECRET required" />
                <StatusItem label="Supabase" ready={data.connected} readyText="Connected and readable" pendingText="Database connection required" />
                <StatusItem label="Website tracker" ready={Boolean(data.trackingConfigured)} readyText="Base URL and origin allow-list active" pendingText="TRACKING_BASE_URL and TRACKING_ALLOWED_ORIGINS required" />
                <StatusItem label="Email provider" ready={Boolean(data.providerConfigured)} readyText="Provider configuration detected" pendingText="Provider adapter not connected" />
              </div>
            </Panel>

            <Panel title="Data integrity">
              <div className="integrityList">
                <div><span>Email uniqueness</span><strong>Enforced</strong></div>
                <div><span>Missing usernames</span><strong className={data.metrics.missingUsernames === 0 ? "textGood" : "textWarn"}>{data.metrics.missingUsernames.toLocaleString()}</strong></div>
                <div><span>Import audit</span><strong>{data.imports.length ? "Active" : "No imports yet"}</strong></div>
                <div><span>Admin session</span><strong>HTTP-only cookie</strong></div>
              </div>
            </Panel>
          </div>

          <Panel title="Tracking install" meta="Use after the destination website origin is configured">
            <pre className="codeBlock">{`<script\n  src="https://mail-admin-six.vercel.app/mail-tracker.js"\n  data-endpoint="https://mail-admin-six.vercel.app/api/events"\n  defer\n></script>`}</pre>
            <p className="formHelp">The tracker records sessions, page views and explicitly marked actions. Location remains approximate at country/region level.</p>
          </Panel>
        </> : null}
      </main>
    </div>
  );
}
