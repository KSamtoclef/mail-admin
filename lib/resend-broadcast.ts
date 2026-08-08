const RESEND_API = "https://api.resend.com";

function apiKey() {
  const value = process.env.RESEND_API_KEY;
  if (!value) throw new Error("RESEND_API_KEY is not configured");
  return value;
}

function headers() {
  return {
    Authorization: `Bearer ${apiKey()}`,
    "Content-Type": "application/json",
    "User-Agent": "mail-admin/1.0"
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.message === "string"
      ? body.message
      : typeof body?.error?.message === "string"
        ? body.error.message
        : `Resend request failed (${response.status})`;
    const error = new Error(message) as Error & { status?: number; body?: unknown; retryAfter?: number };
    error.status = response.status;
    error.body = body;
    const retryAfter = Number(response.headers.get("retry-after") ?? "0");
    if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfter = retryAfter;
    throw error;
  }
  return body;
}

async function request(path: string, init: RequestInit = {}, attempt = 0): Promise<any> {
  const response = await fetch(`${RESEND_API}${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
    cache: "no-store"
  });

  if (response.status === 429 && attempt < 3) {
    const retryAfter = Number(response.headers.get("retry-after") ?? "1");
    await sleep(Math.max(250, Math.min(retryAfter * 1000, 5000)));
    return request(path, init, attempt + 1);
  }

  return parseResponse(response);
}

export function buildBroadcastFrom(overrideName?: string | null) {
  const email = process.env.DEFAULT_FROM_EMAIL;
  if (!email) throw new Error("DEFAULT_FROM_EMAIL is not configured");
  const name = overrideName?.trim() || process.env.DEFAULT_FROM_NAME?.trim();
  return name ? `${name} <${email}>` : email;
}

const REQUIRED_PROPERTIES = [
  { key: "mail_full_name", fallback_value: "" },
  { key: "mail_first_name", fallback_value: "" },
  { key: "mail_last_name", fallback_value: "" },
  { key: "mail_tracking_token", fallback_value: "" },
  { key: "mail_country", fallback_value: "" },
  { key: "mail_user_id", fallback_value: "" },
  { key: "mail_session_id", fallback_value: "" }
] as const;

export async function ensureBroadcastContactProperties() {
  const listed = await request("/contact-properties?limit=100", { method: "GET" }) as {
    data?: Array<{ key?: string }>;
  };
  const existing = new Set((listed.data ?? []).map((item) => item.key).filter(Boolean));

  for (const property of REQUIRED_PROPERTIES) {
    if (existing.has(property.key)) continue;
    await request("/contact-properties", {
      method: "POST",
      body: JSON.stringify({
        key: property.key,
        type: "string",
        fallback_value: property.fallback_value
      })
    });
    await sleep(220);
  }
}

export async function createBroadcastSegment(name: string) {
  const result = await request("/segments", {
    method: "POST",
    body: JSON.stringify({ name: name.slice(0, 120) })
  }) as { id?: string };
  if (!result.id) throw new Error("Resend did not return a Segment ID");
  return result.id;
}

type SyncContactInput = {
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  trackingToken: string;
  country: string;
  userId: string;
  sessionId: string;
  segmentId: string;
};

function properties(input: SyncContactInput) {
  return {
    mail_full_name: input.fullName,
    mail_first_name: input.firstName,
    mail_last_name: input.lastName,
    mail_tracking_token: input.trackingToken,
    mail_country: input.country,
    mail_user_id: input.userId,
    mail_session_id: input.sessionId
  };
}

function looksLikeExistingContact(error: unknown) {
  const candidate = error as { status?: number; message?: string };
  return candidate?.status === 409 || /already exists|duplicate/i.test(candidate?.message ?? "");
}

export async function syncContactToSegment(input: SyncContactInput) {
  try {
    await request("/contacts", {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        first_name: input.firstName,
        last_name: input.lastName,
        unsubscribed: false,
        properties: properties(input),
        segments: [{ id: input.segmentId }]
      })
    });
    return { included: true, created: true, unsubscribed: false };
  } catch (error) {
    if (!looksLikeExistingContact(error)) throw error;
  }

  const encodedEmail = encodeURIComponent(input.email);
  const existing = await request(`/contacts/${encodedEmail}`, { method: "GET" }) as {
    unsubscribed?: boolean;
  };

  if (existing.unsubscribed) {
    return { included: false, created: false, unsubscribed: true };
  }

  await request(`/contacts/${encodedEmail}`, {
    method: "PATCH",
    body: JSON.stringify({ properties: properties(input) })
  });

  await request(`/contacts/${encodedEmail}/segments/${encodeURIComponent(input.segmentId)}`, {
    method: "POST",
    body: JSON.stringify({})
  });

  return { included: true, created: false, unsubscribed: false };
}

type BroadcastContentInput = {
  segmentId: string;
  name: string;
  fromName?: string | null;
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
};

export async function createBroadcastDraft(input: BroadcastContentInput) {
  const payload: Record<string, unknown> = {
    segment_id: input.segmentId,
    from: buildBroadcastFrom(input.fromName),
    name: input.name.slice(0, 160),
    subject: input.subject,
    html: input.html,
    text: input.text
  };
  if (input.replyTo) payload.reply_to = input.replyTo;

  const result = await request("/broadcasts", {
    method: "POST",
    body: JSON.stringify(payload)
  }) as { id?: string };

  if (!result.id) throw new Error("Resend did not return a Broadcast ID");
  return result.id;
}

export async function sendBroadcastDraft(broadcastId: string) {
  const result = await request(`/broadcasts/${encodeURIComponent(broadcastId)}/send`, {
    method: "POST",
    body: JSON.stringify({})
  }) as { id?: string };
  return result.id ?? broadcastId;
}
