"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, Clipboard, Plus, RefreshCw, Send, Trash2 } from "lucide-react";

type TrackingSite = {
  id: string;
  name: string;
  site_url: string;
  origin: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type ProviderStatus = {
  provider: string | null;
  supported: boolean;
  configured: boolean;
  apiKeyConfigured: boolean;
  fromEmailConfigured: boolean;
  webhookConfigured: boolean;
  fromEmail: string | null;
  fromName: string | null;
};

function StatusLine({ label, ready, text }: { label: string; ready: boolean; text: string }) {
  return (
    <div className="statusItem">
      <span className={`statusDot ${ready ? "statusDotReady" : "statusDotPending"}`} />
      <div><div className="statusName">{label}</div><div className="statusText">{text}</div></div>
    </div>
  );
}

export default function ConnectionsManager() {
  const [sites, setSites] = useState<TrackingSite[]>([]);
  const [provider, setProvider] = useState<ProviderStatus | null>(null);
  const [siteName, setSiteName] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [siteMessage, setSiteMessage] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [providerMessage, setProviderMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");

  const baseUrl = useMemo(() => typeof window === "undefined" ? "" : window.location.origin, []);
  const webhookUrl = baseUrl ? `${baseUrl}/api/webhooks/resend` : "/api/webhooks/resend";

  async function load() {
    const [sitesResponse, providerResponse] = await Promise.all([
      fetch("/api/tracking-sites", { cache: "no-store" }),
      fetch("/api/provider/status", { cache: "no-store" })
    ]);

    if (sitesResponse.ok) {
      const result = await sitesResponse.json();
      setSites(result.sites ?? []);
    }
    if (providerResponse.ok) {
      const result = await providerResponse.json();
      setProvider(result);
    }
  }

  useEffect(() => { load(); }, []);

  async function addSite(event: FormEvent) {
    event.preventDefault();
    setSiteMessage("");
    setBusy(true);
    try {
      const response = await fetch("/api/tracking-sites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: siteName, site_url: siteUrl })
      });
      const result = await response.json();
      if (!response.ok) {
        setSiteMessage(result.error ?? "Unable to save tracking site");
        return;
      }
      setSiteName("");
      setSiteUrl("");
      setSiteMessage("Tracking site saved");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function toggleSite(site: TrackingSite) {
    await fetch("/api/tracking-sites", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: site.id, active: !site.active })
    });
    await load();
  }

  async function removeSite(site: TrackingSite) {
    if (!window.confirm(`Remove ${site.name} from tracking sites?`)) return;
    await fetch("/api/tracking-sites", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: site.id })
    });
    await load();
  }

  function snippetFor(site: TrackingSite) {
    return `<script\n  src="${baseUrl}/mail-tracker.js"\n  data-endpoint="${baseUrl}/api/events"\n  defer\n></script>`;
  }

  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1600);
  }

  async function sendTest(event: FormEvent) {
    event.preventDefault();
    setProviderMessage("");
    setBusy(true);
    try {
      const response = await fetch("/api/provider/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: testEmail })
      });
      const result = await response.json();
      setProviderMessage(response.ok ? `Test email sent${result.providerMessageId ? ` · ${result.providerMessageId}` : ""}` : (result.error ?? "Test failed"));
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="connectionManager">
      <div className="contentGrid">
        <section className="panel">
          <div className="panelHeader"><h2>Tracking sites</h2><span>{sites.filter((site) => site.active).length} active</span></div>
          <form onSubmit={addSite} className="formRow">
            <div><label>Site name</label><input className="input" value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="Earn Chat" required /></div>
            <div><label>Website URL</label><input className="input" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://www.earn-chat.com/" required /></div>
            <button className="button buttonPrimary" type="submit" disabled={busy}><Plus size={15} /> Add site</button>
          </form>
          {siteMessage ? <div className="inlineMessage pageMessage">{siteMessage}</div> : null}

          {sites.length ? <div className="tableWrap"><table><thead><tr><th>Site</th><th>Origin</th><th>Status</th><th>Tracker</th><th /></tr></thead><tbody>{sites.map((site) => <tr key={site.id}>
            <td className="primaryCell"><strong>{site.name}</strong><br /><span className="mutedText">{site.site_url}</span></td>
            <td className="monoCell">{site.origin}</td>
            <td><button className={`stateTag ${site.active ? "state-active" : "state-paused"}`} onClick={() => toggleSite(site)}>{site.active ? "Active" : "Disabled"}</button></td>
            <td><button className="button" onClick={() => copy(snippetFor(site), `site-${site.id}`)}>{copied === `site-${site.id}` ? <Check size={14} /> : <Clipboard size={14} />} {copied === `site-${site.id}` ? "Copied" : "Copy script"}</button></td>
            <td><button className="button" onClick={() => removeSite(site)} title="Remove site"><Trash2 size={14} /></button></td>
          </tr>)}</tbody></table></div> : <div className="emptyState">No tracking sites saved yet.</div>}
        </section>

        <section className="panel">
          <div className="panelHeader"><h2>Resend</h2><button className="button" onClick={load}><RefreshCw size={14} /> Refresh</button></div>
          <div className="statusList">
            <StatusLine label="Provider" ready={provider?.provider === "resend"} text={provider?.provider === "resend" ? "Resend selected" : "Set EMAIL_PROVIDER=resend"} />
            <StatusLine label="API key" ready={Boolean(provider?.apiKeyConfigured)} text={provider?.apiKeyConfigured ? "Server key detected" : "RESEND_API_KEY required"} />
            <StatusLine label="Sender" ready={Boolean(provider?.fromEmailConfigured)} text={provider?.fromEmailConfigured ? (provider?.fromEmail ?? "Configured") : "DEFAULT_FROM_EMAIL required"} />
            <StatusLine label="Signed webhook" ready={Boolean(provider?.webhookConfigured)} text={provider?.webhookConfigured ? "Verification secret detected" : "RESEND_WEBHOOK_SECRET required"} />
          </div>

          <form onSubmit={sendTest} className="formRow">
            <div><label>Test recipient</label><input className="input" type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="you@example.com" required /></div>
            <button className="button buttonPrimary" type="submit" disabled={busy || !provider?.configured}><Send size={15} /> Send test</button>
          </form>
          {providerMessage ? <div className="inlineMessage pageMessage">{providerMessage}</div> : null}
        </section>
      </div>

      <section className="panel">
        <div className="panelHeader"><h2>Resend webhook</h2><span>Signed endpoint</span></div>
        <p className="bodyText">Register this endpoint in Resend for email delivery events. Keep the signing secret in Vercel as <code>RESEND_WEBHOOK_SECRET</code>.</p>
        <div className="fileLine"><div><strong>{webhookUrl}</strong><span>Recommended events: sent, delivered, bounced, complained, failed, suppressed and clicked.</span></div><button className="button" onClick={() => copy(webhookUrl, "webhook")}>{copied === "webhook" ? <Check size={14} /> : <Clipboard size={14} />} {copied === "webhook" ? "Copied" : "Copy"}</button></div>
      </section>
    </div>
  );
}
