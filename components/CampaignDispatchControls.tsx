"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function CampaignDispatchControls({ campaignId, status }: { campaignId: string; status: string }) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function dispatch(action: "start" | "run") {
    setBusy(true);
    setMessage("");

    try {
      let nextAction: "start" | "run" = action;

      for (let step = 0; step < 120; step += 1) {
        const response = await fetch(`/api/campaigns/${campaignId}/dispatch`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: nextAction,
            confirm_permission: nextAction === "start" ? confirmed : false
          })
        });
        const result = await response.json();

        if (!response.ok) {
          setMessage(result.error ?? "Campaign action failed");
          router.refresh();
          return;
        }

        const state = String(result.result?.state ?? "updated");
        const sent = Number(result.result?.sent ?? 0);
        const synced = Number(result.result?.synced ?? 0);
        const total = Number(result.result?.total ?? 0);
        const waveNo = Number(result.result?.waveNo ?? 0);

        if (state === "preparing_broadcast") {
          setMessage(`Preparing Resend Broadcast${waveNo ? ` wave ${waveNo}` : ""} · ${synced.toLocaleString()} / ${total.toLocaleString()} contacts ready`);
          nextAction = "run";
          await wait(850);
          continue;
        }

        if (sent > 0 && state === "sending") {
          setMessage(`${sent.toLocaleString()} contacts submitted to Resend · checking today's remaining allowance…`);
          nextAction = "run";
          router.refresh();
          await wait(850);
          continue;
        }

        if (state === "daily_limit_reached") {
          setMessage("Today's send limit has been reached. The campaign is saved and can continue after the daily reset.");
        } else if (state === "paused_by_settings") {
          setMessage("Sending is paused in Connections.");
        } else if (state === "sent") {
          setMessage(sent > 0 ? `${sent.toLocaleString()} contacts submitted · campaign audience complete.` : "Campaign audience complete.");
        } else if (sent > 0) {
          setMessage(`${sent.toLocaleString()} contacts submitted · ${state.replaceAll("_", " ")}`);
        } else {
          setMessage(state.replaceAll("_", " "));
        }

        router.refresh();
        return;
      }

      setMessage("Preparation paused after the safety step limit. Click Continue campaign to resume from the saved position.");
      router.refresh();
    } catch {
      setMessage("The campaign action did not complete. Progress already saved can be resumed safely.");
      router.refresh();
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
        {canStart ? <button className="button buttonPrimary" disabled={busy || !confirmed} onClick={() => dispatch("start")}>{busy ? "Preparing…" : status === "failed" ? "Resume campaign" : "Start campaign"}</button> : null}
        {canRun ? <button className="button buttonPrimary" disabled={busy} onClick={() => dispatch("run")}>{busy ? "Preparing…" : "Continue campaign"}</button> : null}
        <button className="button" type="button" onClick={() => router.refresh()} disabled={busy}>Refresh</button>
      </div>

      {message ? <div className="inlineMessage pageMessage">{message}</div> : null}
      <p className="formHelp">Marketing sends use Resend Broadcasts. Mail Admin prepares the allowed contacts in resumable chunks, preserves unsubscribe/suppression status, and never exceeds the configured daily send limit.</p>
    </section>
  );
}
