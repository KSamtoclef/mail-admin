"use client";

import { useEffect, useState } from "react";
import { RefreshCw, TestTube2 } from "lucide-react";

type LatestCheck = {
  purpose: "test" | "pre_send";
  ok: boolean;
  skipped: boolean;
  http_status: number | null;
  duration_ms: number;
  response_preview: string | null;
  error: string | null;
  created_at: string;
};

type CookiesPilotStatus = {
  enabled: boolean;
  configured: boolean;
  endpointConfigured: boolean;
  connectIdConfigured: boolean;
  apiKeyConfigured: boolean;
  emailConfigured: boolean;
  endpointLabel: string | null;
  endpointError: string | null;
  auditReady: boolean;
  latest: LatestCheck | null;
};

function StatusLine({ label, ready, text }: { label: string; ready: boolean; text: string }) {
  return (
    <div className="statusItem">
      <span className={`statusDot ${ready ? "statusDotReady" : "statusDotPending"}`} />
      <div><div className="statusName">{label}</div><div className="statusText">{text}</div></div>
    </div>
  );
}

export default function CookiesPilotPanel() {
  const [status, setStatus] = useState<CookiesPilotStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/cookies-pilot/status", { cache: "no-store" });
    if (!response.ok) return;
    const result = await response.json();
    setStatus(result);
  }

  useEffect(() => { load(); }, []);

  async function testConnection() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/cookies-pilot/test", { method: "POST" });
      const result = await response.json();
      if (response.ok) {
        setMessage(result.skipped
          ? "Connection test skipped."
          : `Connection successful${result.httpStatus ? ` · HTTP ${result.httpStatus}` : ""} · ${result.durationMs ?? 0} ms`);
      } else {
        setMessage(result.error ?? "Connection test failed.");
      }
      await load();
    } catch {
      setMessage("Connection test did not complete.");
    } finally {
      setBusy(false);
    }
  }

  const latest = status?.latest;

  return (
    <section className="panel" style={{ marginTop: 18 }}>
      <div className="panelHeader">
        <h2>Cookies Pilot</h2>
        <div className="pageActions">
          <button className="button" type="button" onClick={load}><RefreshCw size={14} /> Refresh</button>
          <button className="button buttonPrimary" type="button" disabled={busy || !status?.enabled || !status?.endpointConfigured} onClick={testConnection}><TestTube2 size={14} /> {busy ? "Testing…" : "Test connection"}</button>
        </div>
      </div>

      <div className="statusList">
        <StatusLine label="Integration" ready={Boolean(status?.enabled)} text={status?.enabled ? "Enabled" : "Disabled"} />
        <StatusLine label="Endpoint" ready={Boolean(status?.endpointConfigured)} text={status?.endpointError ?? status?.endpointLabel ?? "Not configured"} />
        <StatusLine label="Connect ID" ready={Boolean(status?.connectIdConfigured)} text={status?.connectIdConfigured ? "Configured" : "Not configured"} />
        <StatusLine label="API key" ready={Boolean(status?.apiKeyConfigured)} text={status?.apiKeyConfigured ? "Configured" : "Not configured"} />
        <StatusLine label="Account email" ready={Boolean(status?.emailConfigured)} text={status?.emailConfigured ? "Configured" : "Not configured"} />
        <StatusLine label="Audit log" ready={Boolean(status?.auditReady)} text={status?.auditReady ? "Active" : "Unavailable"} />
      </div>

      <div style={{ padding: "0 15px 15px" }}>
        {latest ? (
          <div className="fileLine">
            <div>
              <strong>{latest.ok ? "Last connection check succeeded" : "Last connection check failed"}</strong>
              <span>{latest.purpose === "pre_send" ? "Pre-send" : "Manual test"} · {latest.http_status ? `HTTP ${latest.http_status} · ` : ""}{latest.duration_ms} ms · {new Date(latest.created_at).toLocaleString()}</span>
              {latest.error ? <span>{latest.error}</span> : null}
            </div>
          </div>
        ) : <div className="emptyState">No connection checks recorded.</div>}
        {message ? <div className="inlineMessage pageMessage">{message}</div> : null}
      </div>
    </section>
  );
}
