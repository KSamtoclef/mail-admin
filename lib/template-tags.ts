export const TEMPLATE_TAGS = [
  { key: "full_name", token: "{{full_name}}", label: "Full name", description: "Contact username / full name" },
  { key: "first_name", token: "{{first_name}}", label: "First name", description: "First word of the contact name" },
  { key: "last_name", token: "{{last_name}}", label: "Last name", description: "Remaining part of the contact name" },
  { key: "email", token: "{{email}}", label: "Email", description: "Recipient email address" },
  { key: "country", token: "{{country}}", label: "Country", description: "Stored country code or name" },
  { key: "user_id", token: "{{user_id}}", label: "User ID", description: "Imported user identifier" },
  { key: "session_id", token: "{{session_id}}", label: "Session ID", description: "Imported session identifier" },
  { key: "campaign_name", token: "{{campaign_name}}", label: "Campaign name", description: "Current campaign name" },
  { key: "tracked_link", token: "{{tracked_link}}", label: "Tracked link", description: "Per-recipient click tracking URL" },
  { key: "unsubscribe_url", token: "{{unsubscribe_url}}", label: "Unsubscribe URL", description: "Recipient unsubscribe link" }
] as const;

export type TemplateTagKey = typeof TEMPLATE_TAGS[number]["key"];

export type TemplateValues = Partial<Record<TemplateTagKey, string | null | undefined>>;

export function splitContactName(value: string | null | undefined) {
  const clean = (value ?? "").trim().replace(/\s+/g, " ");
  if (!clean) return { fullName: "", firstName: "", lastName: "" };
  const [firstName, ...rest] = clean.split(" ");
  return { fullName: clean, firstName, lastName: rest.join(" ") };
}

export function renderTemplate(template: string, values: TemplateValues) {
  return template.replace(/{{\s*([a-z_]+)\s*}}/gi, (match, rawKey: string) => {
    const key = rawKey.toLowerCase() as TemplateTagKey;
    if (!(key in values)) return match;
    return values[key] ?? "";
  });
}
