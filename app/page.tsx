"use client";

import {
  Activity,
  BarChart3,
  Cable,
  ContactRound,
  LayoutDashboard,
  MailPlus,
  MousePointerClick,
  Send,
  Settings,
  ShieldCheck,
  UsersRound
} from "lucide-react";
import { useMemo, useState } from "react";

type View = "overview" | "contacts" | "campaigns" | "composer" | "tracking" | "events" | "settings";

const navItems: { id: View; label: string; icon: React.ElementType }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "contacts", label: "Contacts", icon: ContactRound },
  { id: "campaigns", label: "Campaigns", icon: Send },
  { id: "composer", label: "Create Campaign", icon: MailPlus },
  { id: "tracking", label: "Tracking", icon: MousePointerClick },
  { id: "events", label: "Live Events", icon: Activity },
  { id: "settings", label: "API & Settings", icon: Settings }
];

const campaignRows = [
  { name: "Welcome Back", audience: "All active users", sent: "9,733", delivered: "9,420", clicks: "1,933", bounced: "118", status: "Sent" },
  { name: "Reward Update", audience: "Nigeria", sent: "7,003", delivered: "6,815", clicks: "1,304", bounced: "97", status: "Sent" },
  { name: "August Reactivation", audience: "Inactive 14d", sent: "5,742", delivered: "5,607", clicks: "946", bounced: "84", status: "Running" }
];

const contactRows = [
  { name: "Emmanuella Francis", email: "emmanuellafrancis215@gmail.com", country: "NG", activity: "Today", status: "Active" },
  { name: "Awajiya Hudson", email: "awajisoronubong@gmail.com", country: "NG", activity: "Yesterday", status: "Active" },
  { name: "Precious Chidobe", email: "chidobeprecious8@gmail.com", country: "NG", activity: "3 days ago", status: "Active" }
];

function Header({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }) {
  return (
    <div className="topbar">
      <div>
        <h1>{title}</h1>
        <p className="subtitle">{subtitle}</p>
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card">
      <div className="metricLabel">{label}</div>
      <div className="metricValue">{value}</div>
      {hint ? <div className="metricHint">{hint}</div> : null}
    </div>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("overview");
  const [subject, setSubject] = useState("Hey {{first_name}}, welcome back 👋");
  const [body, setBody] = useState("Hey {{first_name}},\n\nWe have an update for you.\n\nVisit your dashboard:\n{{tracked_link}}\n\nThanks,\nChatEarn Team");

  const previewSubject = useMemo(() => subject.replaceAll("{{first_name}}", "Samuel"), [subject]);
  const previewBody = useMemo(() => body.replaceAll("{{first_name}}", "Samuel").replaceAll("{{tracked_link}}", "Visit your dashboard"), [body]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Mail <span>Admin</span></div>
        <nav className="nav">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`navButton ${view === id ? "navButtonActive" : ""}`} onClick={() => setView(id)}>
              <Icon size={17} />
              {label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        {view === "overview" && (
          <>
            <Header
              title="Overview"
              subtitle="Delivery, clicks and on-site activity in one place."
              actions={
                <>
                  <button className="button">Export</button>
                  <button className="button buttonPrimary" onClick={() => setView("composer")}>New Campaign</button>
                </>
              }
            />
            <div className="grid4">
              <Metric label="Total Contacts" value="23,207" hint="clean & unique" />
              <Metric label="Delivered" value="21,842" hint="96.8% rate" />
              <Metric label="Unique Clickers" value="4,183" hint="19.1% CTR" />
              <Metric label="Site Conversions" value="2,744" hint="65.6% of clickers" />
            </div>

            <div className="twoCol">
              <section className="card">
                <h3 className="sectionTitle">Recent Campaigns</h3>
                <table>
                  <thead><tr><th>Campaign</th><th>Audience</th><th>Delivered</th><th>Clicks</th><th>Status</th></tr></thead>
                  <tbody>
                    {campaignRows.map((row) => (
                      <tr key={row.name}>
                        <td>{row.name}</td><td>{row.audience}</td><td>{row.delivered}</td><td>{row.clicks}</td>
                        <td><span className={`badge ${row.status === "Sent" ? "good" : "warn"}`}>{row.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="card">
                <h3 className="sectionTitle">Campaign Health</h3>
                {[
                  ["Delivery rate", "96.8%", 96.8],
                  ["Unique click rate", "19.1%", 19.1],
                  ["Bounce rate", "1.7%", 1.7],
                  ["Unsubscribe rate", "0.3%", 0.3]
                ].map(([label, value, width]) => (
                  <div key={String(label)}>
                    <div className="progressRow"><span>{label}</span><strong>{value}</strong></div>
                    <div className="progress"><span style={{ width: `${width}%` }} /></div>
                  </div>
                ))}
              </section>
            </div>

            <div className="twoCol">
              <section className="card">
                <h3 className="sectionTitle">System status</h3>
                <div className="event"><ShieldCheck className="good" size={18} /><div><div className="eventTitle">Tracking architecture ready</div><div className="eventMeta">Unique recipient tokens, site sessions, bot flags and event attribution are included in the database design.</div></div></div>
                <div className="event"><Cable className="warn" size={18} /><div><div className="eventTitle">Provider connection pending</div><div className="eventMeta">Resend/SES/Postmark can be attached through a provider adapter without changing the dashboard.</div></div></div>
              </section>
              <section className="card">
                <h3 className="sectionTitle">Important measurement rule</h3>
                <p className="note">The dashboard treats delivery and click events as stronger signals than email opens. Link scanners can create automatic hits, so scanner/bot classification is built into the tracking model.</p>
              </section>
            </div>
          </>
        )}

        {view === "contacts" && (
          <>
            <Header title="Contacts" subtitle="Import, deduplicate, segment and suppress recipients." actions={<><button className="button">Import CSV</button><button className="button buttonPrimary">Add Contact</button></>} />
            <section className="card">
              <div className="toolbar">
                <input className="input" style={{ maxWidth: 330 }} placeholder="Search email or username…" />
                <select className="select" style={{ maxWidth: 190 }}><option>All contacts</option><option>Active</option><option>Suppressed</option></select>
              </div>
              <table>
                <thead><tr><th>User</th><th>Email</th><th>Country</th><th>Last activity</th><th>Status</th></tr></thead>
                <tbody>{contactRows.map((row) => <tr key={row.email}><td>{row.name}</td><td>{row.email}</td><td>{row.country}</td><td>{row.activity}</td><td><span className="badge good">{row.status}</span></td></tr>)}</tbody>
              </table>
            </section>
          </>
        )}

        {view === "campaigns" && (
          <>
            <Header title="Campaigns" subtitle="Clone, schedule, inspect and compare campaigns." actions={<button className="button buttonPrimary" onClick={() => setView("composer")}>Create Campaign</button>} />
            <section className="card">
              <table>
                <thead><tr><th>Name</th><th>Sent</th><th>Delivered</th><th>Unique clicks</th><th>Bounced</th><th>Actions</th></tr></thead>
                <tbody>{campaignRows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.sent}</td><td>{row.delivered}</td><td>{row.clicks}</td><td>{row.bounced}</td><td><button className="button">View</button> <button className="button">Clone</button></td></tr>)}</tbody>
              </table>
            </section>
          </>
        )}

        {view === "composer" && (
          <>
            <Header title="Create Campaign" subtitle="Configure content, audience and tracking without editing code." actions={<><button className="button">Save Draft</button><button className="button buttonPrimary">Send / Schedule</button></>} />
            <div className="composer">
              <section className="card">
                <div className="formGrid">
                  <div><label className="label">Campaign name</label><input className="input" defaultValue="Welcome Campaign" /></div>
                  <div><label className="label">Audience</label><select className="select"><option>All active users</option><option>Nigeria</option><option>Clicked previous campaign</option><option>Inactive 14 days</option></select></div>
                </div>
                <div className="formGrid">
                  <div><label className="label">From name</label><input className="input" defaultValue="ChatEarn Team" /></div>
                  <div><label className="label">Reply-to</label><input className="input" defaultValue="support@example.com" /></div>
                </div>
                <label className="label">Subject</label>
                <input className="input" value={subject} onChange={(event) => setSubject(event.target.value)} />
                <label className="label">Email body</label>
                <textarea className="textarea" value={body} onChange={(event) => setBody(event.target.value)} />
                <div className="formGrid">
                  <div><label className="label">Tracking</label><select className="select"><option>Clicks + site events</option><option>Clicks only</option><option>Delivery only</option></select></div>
                  <div><label className="label">Schedule</label><input className="input" type="datetime-local" /></div>
                </div>
                <p className="note">Dynamic tags are replaced per recipient. Tracked links use opaque random tokens, are logged server-side, then immediately redirect to the real destination.</p>
              </section>
              <section className="card">
                <h3 className="sectionTitle">Preview</h3>
                <div className="preview">
                  <h2>{previewSubject}</h2>
                  {previewBody.split("\n").map((line, index) => line === "Visit your dashboard" ? <p key={index}><a href="#" onClick={(e) => e.preventDefault()}>Visit your dashboard</a></p> : <p key={index}>{line || <>&nbsp;</>}</p>)}
                </div>
              </section>
            </div>
          </>
        )}

        {view === "tracking" && (
          <>
            <Header title="Tracking" subtitle="Recipient-level clicks and attributed site sessions." />
            <div className="grid4">
              <Metric label="Unique Clickers" value="4,183" />
              <Metric label="Total Clicks" value="7,962" />
              <Metric label="Scanner/Bot Hits" value="638" />
              <Metric label="Attributed Sessions" value="3,944" />
            </div>
            <section className="card" style={{ marginTop: 12 }}>
              <table>
                <thead><tr><th>Recipient</th><th>Campaign</th><th>Link</th><th>Time</th><th>Device</th><th>Approx. region</th><th>Type</th></tr></thead>
                <tbody>
                  <tr><td>samuel@example.com</td><td>Welcome Back</td><td>/dashboard</td><td>12:41:09</td><td>iPhone / Safari</td><td>Lagos, NG</td><td><span className="badge good">Human</span></td></tr>
                  <tr><td>ada@example.com</td><td>Reward Update</td><td>/offers</td><td>12:39:31</td><td>Android / Chrome</td><td>Abuja, NG</td><td><span className="badge good">Human</span></td></tr>
                  <tr><td>user@example.com</td><td>Welcome Back</td><td>/dashboard</td><td>12:37:55</td><td>Unknown</td><td>Unknown</td><td><span className="badge warn">Scanner</span></td></tr>
                </tbody>
              </table>
            </section>
          </>
        )}

        {view === "events" && (
          <>
            <Header title="Live Events" subtitle="What recipients do after arriving on the website." actions={<span className="badge good">LIVE</span>} />
            <section className="card">
              {[
                ["samuel@example.com clicked “Visit Dashboard”", "Welcome Back · iPhone · Lagos, NG · 12:41:09"],
                ["samuel@example.com viewed /dashboard", "Session 81c0… · 12:41:12"],
                ["samuel@example.com completed registration", "Conversion attributed to Welcome Back · 12:42:31"],
                ["ada@example.com viewed /offers", "Reward Update · Android · 12:39:34"]
              ].map(([title, meta]) => <div className="event" key={title}><span className="eventDot" /><div><div className="eventTitle">{title}</div><div className="eventMeta">{meta}</div></div></div>)}
            </section>
          </>
        )}

        {view === "settings" && (
          <>
            <Header title="API & Settings" subtitle="Change providers and tracking rules without rewriting the application." actions={<button className="button buttonPrimary">Save Settings</button>} />
            <div className="twoCol">
              <section className="card">
                <h3 className="sectionTitle">Email provider</h3>
                <label className="label">Provider</label><select className="select"><option>Resend</option><option>Amazon SES</option><option>Postmark</option><option>SendGrid</option></select>
                <label className="label">API key</label><input className="input" type="password" defaultValue="••••••••••••" />
                <label className="label">Sending domain</label><input className="input" defaultValue="mail.example.com" />
                <label className="label">Webhook secret</label><input className="input" type="password" defaultValue="••••••••••" />
                <label className="label">Default from address</label><input className="input" defaultValue="hello@example.com" />
              </section>
              <section className="card">
                <h3 className="sectionTitle">Tracking rules</h3>
                <label className="label">Tracking domain</label><input className="input" defaultValue="go.example.com" />
                <label className="label">Destination website</label><input className="input" defaultValue="https://example.com" />
                <label className="label">Bot filtering</label><select className="select"><option>Strict</option><option>Balanced</option><option>Off</option></select>
                <label className="label">Approximate location</label><select className="select"><option>Country + region</option><option>Country only</option><option>Disabled</option></select>
                <label className="label">Retention</label><select className="select"><option>90 days</option><option>180 days</option><option>365 days</option></select>
                <p className="note">Exact GPS is not collected automatically. Precise device location should only be collected after an explicit browser permission prompt.</p>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
