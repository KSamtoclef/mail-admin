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

  async function testCurl() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/cookies-pilot/test", { method: "POST" });
      const result = await response.json();
      if (response.ok) {
        setMessage(result.skipped
          ? "Cookies Pilot is disabled, so the CURL was skipped."
          : `CURL responded${result.httpStatus ? ` HTTP ${result.httpStatus}` : ""} in ${result.durationMs ?? 0} ms.`);
      } else {
        setMessage(result.error ?? "Cookies Pilot CURL test failed.");
      }
      await load();
    } catch {
      setMessage("Cookies Pilot CURL test did not complete.");
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
          <button className="button buttonPrimary" type="button" disabled={busy || !status?.enabled || !status?.endpointConfigured} onClick={testCurl}><TestTube2 size={14} /> {busy ? "Testing…" : "Test CURL"}</button>
        </div>
      </div>

      <div className="statusList">
        <StatusLine label="Integration" ready={Boolean(status?.enabled)} text={status?.enabled ? "Enabled · campaign runs pass through Cookies Pilot before Resend" : "Set COOKIE_PILOT_ENABLED=true to use the CURL gate"} />
        <StatusLine label="Cloud365 CURL" ready={Boolean(status?.endpointConfigured)} text={status?.endpointError ?? status?.endpointLabel ?? "COOKIE_PILOT_ENDPOINT required"} />
        <StatusLine label="Connect ID" ready={Boolean(status?.connectIdConfigured)} text={status?.connectIdConfigured ? "Stored server-side" : "COOKIE_PILOT_CONNECT_ID not configured"} />
        <StatusLine label="API key" ready={Boolean(status?.apiKeyConfigured)} text={status?.apiKeyConfigured ? "Stored server-side · not exposed to browser" : "COOKIE_PILOT_API_KEY not configured"} />
        <StatusLine label="Configured email" ready={Boolean(status?.emailConfigured)} text={status?.emailConfigured ? "Stored server-side" : "COOKIE_PILOT_EMAIL not configured"} />
        <StatusLine label="Audit log" ready={Boolean(status?.auditReady)} text={status?.auditReady ? "Connection checks are being recorded" : "Run the Cookies Pilot database migration"} />
      </div>

      <div style={{ padding: "0 15px 15px" }}>
        <p className="formHelp">The supplied Cookies Pilot package only demonstrates calling the generated Cloud365 endpoint. Mail Admin therefore uses the documented CURL as a server-side GET and waits for the provider's approximately 3-second processing window. It does not invent undocumented authentication headers.</p>
        {latest ? (
          <div className="fileLine">
            <div>
              <strong>{latest.ok ? "Last CURL check succeeded" : "Last CURL check failed"}</strong>
              <span>{latest.purpose === "pre_send" ? "Campaign pre-send" : "Manual test"} · {latest.http_status ? `HTTP ${latest.http_status} · ` : ""}{latest.duration_ms} ms · {new Date(latest.created_at).toLocaleString()}</span>
              {latest.error ? <span>{latest.error}</span> : null}
            </div>
          </div>
        ) : <div className="emptyState">No Cookies Pilot CURL check has been recorded yet.</div>}
        {message ? <div className="inlineMessage pageMessage">{message}</div> : null}
      </div>
    </section>
  );
}
