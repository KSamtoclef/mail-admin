import { getSupabaseAdmin } from "@/lib/supabase-admin";

const PROCESSING_WINDOW_MS = 3000;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_RESPONSE_PREVIEW = 1000;

export type CookiesPilotCheckPurpose = "test" | "pre_send";

export type CookiesPilotCheckResult = {
  ok: boolean;
  skipped: boolean;
  httpStatus: number | null;
  durationMs: number;
  responsePreview: string | null;
  error: string | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function envFlag(value: string | undefined) {
  return /^(1|true|yes|on)$/i.test(value?.trim() ?? "");
}

function endpointFromEnv() {
  const raw = process.env.COOKIE_PILOT_ENDPOINT?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("COOKIE_PILOT_ENDPOINT is not a valid URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("Cookies Pilot endpoint must use HTTPS");
  }

  const host = url.hostname.toLowerCase();
  if (host !== "cloud365.com.au" && !host.endsWith(".cloud365.com.au")) {
    throw new Error("Cookies Pilot endpoint must use the Cloud365 domain supplied by the provider");
  }

  if (!url.pathname.startsWith("/generate/")) {
    throw new Error("Cookies Pilot endpoint must use the /generate/ connection path");
  }

  return url.toString();
}

function endpointLabel(endpoint: string | null) {
  if (!endpoint) return null;
  try {
    const url = new URL(endpoint);
    const id = url.pathname.split("/").filter(Boolean).pop() ?? "";
    const masked = id.length > 4 ? `${"•".repeat(Math.min(8, id.length - 4))}${id.slice(-4)}` : id;
    return `${url.origin}/generate/${masked}`;
  } catch {
    return null;
  }
}

export function getCookiesPilotStatus() {
  let endpoint: string | null = null;
  let endpointError: string | null = null;

  try {
    endpoint = endpointFromEnv();
  } catch (error) {
    endpointError = error instanceof Error ? error.message : "Invalid Cookies Pilot endpoint";
  }

  const enabled = envFlag(process.env.COOKIE_PILOT_ENABLED);
  const connectIdConfigured = Boolean(process.env.COOKIE_PILOT_CONNECT_ID?.trim());
  const apiKeyConfigured = Boolean(process.env.COOKIE_PILOT_API_KEY?.trim());
  const emailConfigured = Boolean(process.env.COOKIE_PILOT_EMAIL?.trim());
  const endpointConfigured = Boolean(endpoint);

  return {
    enabled,
    endpointConfigured,
    connectIdConfigured,
    apiKeyConfigured,
    emailConfigured,
    endpointLabel: endpointLabel(endpoint),
    endpointError,
    configured: enabled && endpointConfigured
  };
}

async function callCookiesPilotEndpoint(): Promise<CookiesPilotCheckResult> {
  const status = getCookiesPilotStatus();
  if (!status.enabled) {
    return {
      ok: true,
      skipped: true,
      httpStatus: null,
      durationMs: 0,
      responsePreview: null,
      error: null
    };
  }

  const endpoint = endpointFromEnv();
  if (!endpoint) {
    return {
      ok: false,
      skipped: false,
      httpStatus: null,
      durationMs: 0,
      responsePreview: null,
      error: "Cookies Pilot is enabled but COOKIE_PILOT_ENDPOINT is missing"
    };
  }

  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "mail-admin/1.0"
      },
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal
    });

    const raw = await response.text().catch(() => "");
    const elapsed = Date.now() - started;
    if (elapsed < PROCESSING_WINDOW_MS) {
      await sleep(PROCESSING_WINDOW_MS - elapsed);
    }

    const finalDuration = Date.now() - started;
    const responsePreview = raw ? raw.slice(0, MAX_RESPONSE_PREVIEW) : null;

    if (!response.ok) {
      return {
        ok: false,
        skipped: false,
        httpStatus: response.status,
        durationMs: finalDuration,
        responsePreview,
        error: `Cookies Pilot CURL returned HTTP ${response.status}`
      };
    }

    return {
      ok: true,
      skipped: false,
      httpStatus: response.status,
      durationMs: finalDuration,
      responsePreview,
      error: null
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      skipped: false,
      httpStatus: null,
      durationMs: Date.now() - started,
      responsePreview: null,
      error: aborted
        ? "Cookies Pilot CURL timed out"
        : error instanceof Error
          ? error.message
          : "Cookies Pilot CURL request failed"
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function recordCheck(input: {
  purpose: CookiesPilotCheckPurpose;
  result: CookiesPilotCheckResult;
  campaignId?: string | null;
  waveId?: string | null;
}) {
  try {
    const supabase = getSupabaseAdmin() as any;
    await supabase.from("cookie_pilot_checks").insert({
      purpose: input.purpose,
      campaign_id: input.campaignId ?? null,
      broadcast_wave_id: input.waveId ?? null,
      ok: input.result.ok,
      skipped: input.result.skipped,
      http_status: input.result.httpStatus,
      duration_ms: input.result.durationMs,
      response_preview: input.result.responsePreview,
      error: input.result.error
    });
  } catch {
    // The CURL result is authoritative; logging must never change that result.
  }
}

export async function runCookiesPilotCheck(input: {
  purpose: CookiesPilotCheckPurpose;
  campaignId?: string | null;
  waveId?: string | null;
}) {
  const result = await callCookiesPilotEndpoint();
  await recordCheck({ ...input, result });
  return result;
}

export async function ensureCookiesPilotBeforeSend(campaignId: string, waveId: string) {
  const status = getCookiesPilotStatus();
  if (!status.enabled) return { ok: true, skipped: true };

  const supabase = getSupabaseAdmin() as any;
  const previous = await supabase
    .from("cookie_pilot_checks")
    .select("id,ok,skipped,http_status,duration_ms,response_preview,error,created_at")
    .eq("purpose", "pre_send")
    .eq("campaign_id", campaignId)
    .eq("broadcast_wave_id", waveId)
    .eq("ok", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!previous.error && previous.data?.ok) {
    return { ok: true, skipped: Boolean(previous.data.skipped), reused: true };
  }

  const result = await runCookiesPilotCheck({
    purpose: "pre_send",
    campaignId,
    waveId
  });

  if (!result.ok) {
    throw new Error(result.error ?? "Cookies Pilot CURL pre-send check failed");
  }

  return result;
}
