type SendEmailInput = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string | null;
  headers?: Record<string, string>;
  tags?: Record<string, string>;
  idempotencyKey?: string;
};

export function getEmailProviderStatus() {
  const provider = (process.env.EMAIL_PROVIDER || "").toLowerCase();
  const apiKeyConfigured = Boolean(process.env.RESEND_API_KEY);
  const fromEmailConfigured = Boolean(process.env.DEFAULT_FROM_EMAIL);
  const webhookConfigured = Boolean(process.env.RESEND_WEBHOOK_SECRET);

  return {
    provider,
    supported: provider === "resend",
    apiKeyConfigured,
    fromEmailConfigured,
    webhookConfigured,
    configured: provider === "resend" && apiKeyConfigured && fromEmailConfigured,
    fromEmail: process.env.DEFAULT_FROM_EMAIL || null,
    fromName: process.env.DEFAULT_FROM_NAME || null
  };
}

function buildFrom() {
  const email = process.env.DEFAULT_FROM_EMAIL;
  if (!email) throw new Error("DEFAULT_FROM_EMAIL is not configured");
  const name = process.env.DEFAULT_FROM_NAME?.trim();
  return name ? `${name} <${email}>` : email;
}

function buildPayload(input: SendEmailInput) {
  const payload: Record<string, unknown> = {
    from: buildFrom(),
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject
  };

  if (input.html) payload.html = input.html;
  if (input.text) payload.text = input.text;
  if (input.replyTo) payload.reply_to = input.replyTo;
  if (input.headers && Object.keys(input.headers).length) payload.headers = input.headers;
  if (input.tags && Object.keys(input.tags).length) {
    payload.tags = Object.entries(input.tags).map(([name, value]) => ({ name, value }));
  }

  return payload;
}

async function parseProviderResponse(response: Response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof result?.message === "string"
      ? result.message
      : typeof result?.error?.message === "string"
        ? result.error.message
        : `Resend request failed (${response.status})`;
    throw new Error(message);
  }
  return result;
}

export async function sendProviderEmail(input: SendEmailInput) {
  const status = getEmailProviderStatus();
  if (!status.configured) throw new Error("Resend is not fully configured");

  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.RESEND_API_KEY as string}`,
    "Content-Type": "application/json"
  };
  if (input.idempotencyKey) headers["Idempotency-Key"] = input.idempotencyKey;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers,
    body: JSON.stringify(buildPayload(input)),
    cache: "no-store"
  });

  return await parseProviderResponse(response) as { id?: string };
}

export async function sendProviderBatch(inputs: SendEmailInput[], idempotencyKey: string) {
  const status = getEmailProviderStatus();
  if (!status.configured) throw new Error("Resend is not fully configured");
  if (!inputs.length) return { data: [] as Array<{ id?: string }> };
  if (inputs.length > 100) throw new Error("Resend batches cannot exceed 100 emails");

  const response = await fetch("https://api.resend.com/emails/batch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY as string}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey.slice(0, 256)
    },
    body: JSON.stringify(inputs.map(buildPayload)),
    cache: "no-store"
  });

  const result = await parseProviderResponse(response) as { data?: Array<{ id?: string }> };
  return { data: result.data ?? [] };
}
