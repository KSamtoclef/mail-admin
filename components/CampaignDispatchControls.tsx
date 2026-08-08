"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CampaignDispatchControls({ campaignId, status }: { campaignId: string; status: string }) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function dispatch(action: "start" | "run") {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/dispatch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, confirm_permission: action === "start" ? confirmed : false })
      });
      const result = await response.json();
      if (!response.ok) {
        setMessage(result.error ?? "Campaign action failed");
        return;
      }

      const state = result.result?.state ?? "updated";
      const sent = Number(result.result?.sent ?? 0);
      setMessage(sent > 0 ? `${sent.toLocaleString()} emails submitted · ${state}` : String(state).replaceAll("_", " "));
      router.refresh();
    } catch {
      setMessage("The campaign action did not complete.");
    } finally {
      setBusy(false);
    }
  }

  const canStart = ["draft", "scheduled", "failed"].includes(status);
  const canRun = status === "sending";

  return (
    <section className="panel" style={{ padding: 20 }}>
      <div className="panelHeader"><h2>Sending</h2><span>{status}</span></div>

      {canStart ? (
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16 }}>
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} style={{ marginTop: 3 }} />
          <span className="bodyText">I confirm these recipients are permitted to receive this campaign and suppression/unsubscribe rules should be enforced.</span>
        </label>
      ) : null}

      <div className="pageActions">
        {canStart ? <button className="button buttonPrimary" disabled={busy || !confirmed} onClick={() => dispatch("start")}>{busy ? "Working…" : status === "failed" ? "Resume campaign" : "Start campaign"}</button> : null}
        {canRun ? <button className="button buttonPrimary" disabled={busy} onClick={() => dispatch("run")}>{busy ? "Working…" : "Run next batch"}</button> : null}
        <button className="button" type="button" onClick={() => router.refresh()} disabled={busy}>Refresh</button>
      </div>

      {message ? <div className="inlineMessage pageMessage">{message}</div> : null}
      <p className="formHelp">Each batch is capped by the current Connections settings. The backend reserves daily quota before calling the provider, and already-sent campaign recipients are not selected again.</p>
    </section>
  );
}
