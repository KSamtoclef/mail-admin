"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import DynamicTagPicker from "@/components/DynamicTagPicker";
import { renderTemplate } from "@/lib/template-tags";

const previewValues = {
  full_name: "Ada Lovelace",
  first_name: "Ada",
  last_name: "Lovelace",
  email: "ada@example.com",
  country: "NG",
  user_id: "user_12345",
  session_id: "session_67890",
  campaign_name: "Campaign preview",
  tracked_link: "https://mail-admin.example/c/example/link",
  unsubscribe_url: "https://mail-admin.example/u/example"
};

const recipientSubjectTags = /{{\s*(full_name|first_name|last_name|email|country|user_id|session_id|tracked_link|unsubscribe_url)\s*}}/i;

export default function CampaignComposer({ onSaved }: { onSaved?: () => void | Promise<void> }) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [fromName, setFromName] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [body, setBody] = useState("");
  const [primaryLinkUrl, setPrimaryLinkUrl] = useState("");
  const [trackingMode, setTrackingMode] = useState("clicks_and_site");
  const [scheduledAt, setScheduledAt] = useState("");
  const [activeTarget, setActiveTarget] = useState<"subject" | "body">("body");
  const [message, setMessage] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const previewSubject = useMemo(() => renderTemplate(subject || "Subject preview", previewValues), [subject]);
  const previewBody = useMemo(() => renderTemplate(body || "Your message will appear here.", previewValues), [body]);
  const usesTrackedLink = body.includes("{{tracked_link}}");
  const subjectHasRecipientTag = recipientSubjectTags.test(subject);

  function insertAtCursor(value: string, token: string, start: number | null, end: number | null) {
    const from = start ?? value.length;
    const to = end ?? from;
    return `${value.slice(0, from)}${token}${value.slice(to)}`;
  }

  function insertTag(token: string) {
    if (activeTarget === "subject") {
      if (token !== "{{campaign_name}}") {
        setMessage("Recipient-specific tags belong in the message body when using Resend Broadcasts. The subject can use {{campaign_name}}.");
        bodyRef.current?.focus();
        setActiveTarget("body");
        return;
      }
      const element = subjectRef.current;
      const next = insertAtCursor(subject, token, element?.selectionStart ?? null, element?.selectionEnd ?? null);
      setSubject(next);
      requestAnimationFrame(() => {
        element?.focus();
        const caret = (element?.selectionStart ?? subject.length) + token.length;
        element?.setSelectionRange(caret, caret);
      });
      return;
    }

    const element = bodyRef.current;
    const next = insertAtCursor(body, token, element?.selectionStart ?? null, element?.selectionEnd ?? null);
    setBody(next);
    requestAnimationFrame(() => {
      element?.focus();
      const caret = (element?.selectionStart ?? body.length) + token.length;
      element?.setSelectionRange(caret, caret);
    });
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setSavedId(null);
    if (!name.trim() || !subject.trim() || !body.trim()) {
      setMessage("Campaign name, subject and message are required.");
      return;
    }
    if (subjectHasRecipientTag) {
      setMessage("Move recipient-specific subject tags into the message body. Resend Broadcast subjects are kept static in Mail Admin.");
      return;
    }
    if (usesTrackedLink && !primaryLinkUrl.trim()) {
      setMessage("Add the destination URL used by {{tracked_link}}.");
      return;
    }

    setSaving(true);
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
          primary_link_url: primaryLinkUrl || null,
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
      setSavedId(typeof result.campaign?.id === "string" ? result.campaign.id : null);
      await onSaved?.();
    } catch {
      setMessage("The campaign request did not complete.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="campaignComposer">
      <DynamicTagPicker activeTarget={activeTarget} onInsert={insertTag} />

      <div className="editorGrid">
        <form className="panel editorPanel" onSubmit={save}>
          <div className="formRow"><div><label>Campaign name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="August update" /></div></div>
          <div className="formRow formRowTwo">
            <div><label>From name</label><input className="input" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Earn Chat" /></div>
            <div><label>Reply-to</label><input className="input" type="email" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="support@earn-chat.com" /></div>
          </div>
          <div className="formRow"><div><label>Subject</label><input ref={subjectRef} className="input" value={subject} onFocus={() => setActiveTarget("subject")} onChange={(e) => setSubject(e.target.value)} placeholder="Your August update" /><p className="formHelp">Broadcast subjects stay static. <code>{"{{campaign_name}}"}</code> is supported; recipient tags are inserted into the message body.</p></div></div>
          <div className="formRow"><div><label>Message</label><textarea ref={bodyRef} className="textarea" value={body} onFocus={() => setActiveTarget("body")} onChange={(e) => setBody(e.target.value)} placeholder={'Hi {{first_name}},\n\nVisit your dashboard: {{tracked_link}}\n\nUnsubscribe: {{unsubscribe_url}}'} /></div></div>
          <div className="formRow"><div><label>Tracked destination URL</label><input className="input" type="url" value={primaryLinkUrl} onChange={(e) => setPrimaryLinkUrl(e.target.value)} placeholder="https://www.earn-chat.com/" /><p className="formHelp">Required when the message uses <code>{"{{tracked_link}}"}</code>. Each contact gets a unique tracked redirect to this URL.</p></div></div>
          <div className="formRow formRowTwo">
            <div><label>Tracking</label><select className="select" value={trackingMode} onChange={(e) => setTrackingMode(e.target.value)}><option value="clicks_and_site">Clicks + site events</option><option value="clicks_only">Clicks only</option><option value="delivery_only">Delivery only</option></select></div>
            <div><label>Schedule</label><input className="input" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div>
          </div>
          <div className="composerActions"><button className="button buttonPrimary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save campaign"}</button>{message ? <span className="composerMessage">{message}</span> : null}{savedId ? <a className="button" href={`/campaigns/${savedId}`}>Open campaign</a> : null}</div>
          <p className="formHelp">Message tags are converted to Resend Contact Properties at send time. <code>{"{{unsubscribe_url}}"}</code> uses Resend's managed Broadcast unsubscribe flow.</p>
        </form>

        <section className="panel previewPanel">
          <div className="panelHeader"><h2>Preview</h2><span>Sample recipient</span></div>
          <div className="emailPreview"><h3>{previewSubject}</h3>{previewBody.split("\n").map((line, index) => <p key={index}>{line || <>&nbsp;</>}</p>)}</div>
        </section>
      </div>
    </div>
  );
}
