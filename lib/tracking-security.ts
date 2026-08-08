import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function normalizeOrigin(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getTrackingBaseUrl() {
  return normalizeOrigin(
    process.env.TRACKING_BASE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL
  );
}

export function getAllowedTrackingOrigins() {
  return (process.env.TRACKING_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => normalizeOrigin(value))
    .filter((value): value is string => Boolean(value));
}

async function databaseOriginAllowed(origin: string) {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("tracking_sites")
      .select("id")
      .eq("origin", origin)
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    return !error && Boolean(data?.id);
  } catch {
    return false;
  }
}

async function databaseHasActiveSite() {
  try {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase
      .from("tracking_sites")
      .select("id", { count: "exact", head: true })
      .eq("active", true);
    return !error && (count ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function trackingIsConfigured() {
  if (!getTrackingBaseUrl()) return false;
  if (getAllowedTrackingOrigins().length > 0) return true;
  return databaseHasActiveSite();
}

export function requestOrigin(request: NextRequest) {
  return normalizeOrigin(request.headers.get("origin"));
}

export async function isAllowedTrackingOrigin(request: NextRequest) {
  const origin = requestOrigin(request);
  if (!origin) return false;
  if (getAllowedTrackingOrigins().includes(origin)) return true;
  return databaseOriginAllowed(origin);
}

export async function corsHeaders(request: NextRequest) {
  const origin = requestOrigin(request);
  const allowed = origin ? await isAllowedTrackingOrigin(request) : false;

  return {
    "Access-Control-Allow-Origin": allowed && origin ? origin : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Vary": "Origin"
  };
}

export function pageUrlMatchesOrigin(pageUrl: string | null | undefined, origin: string | null) {
  if (!pageUrl || !origin) return true;
  try {
    return new URL(pageUrl).origin === origin;
  } catch {
    return false;
  }
}

export function classifyClient(userAgent: string, request?: NextRequest) {
  const ua = userAgent.toLowerCase();
  const purpose = request?.headers.get("purpose")?.toLowerCase() ?? "";
  const secPurpose = request?.headers.get("sec-purpose")?.toLowerCase() ?? "";
  const xPurpose = request?.headers.get("x-purpose")?.toLowerCase() ?? "";

  const scannerPatterns = [
    "proofpoint",
    "mimecast",
    "barracuda",
    "safelinks",
    "urlscan",
    "security scanner",
    "email protection",
    "link checker",
    "crawler",
    "spider",
    "headless",
    "bot"
  ];

  const matched = scannerPatterns.find((pattern) => ua.includes(pattern));
  const prefetch = [purpose, secPurpose, xPurpose].some((value) => value.includes("prefetch") || value.includes("preview"));

  const deviceType = /iphone|ipad|android|mobile/.test(ua)
    ? "mobile"
    : /windows|macintosh|linux|cros/.test(ua)
      ? "desktop"
      : "unknown";

  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("chrome/") && !ua.includes("chromium")
      ? "Chrome"
      : ua.includes("firefox/")
        ? "Firefox"
        : ua.includes("safari/") && !ua.includes("chrome/")
          ? "Safari"
          : "Unknown";

  const os = /iphone|ipad/.test(ua)
    ? "iOS"
    : ua.includes("android")
      ? "Android"
      : ua.includes("windows")
        ? "Windows"
        : /macintosh|mac os x/.test(ua)
          ? "macOS"
          : ua.includes("linux")
            ? "Linux"
            : "Unknown";

  return {
    isBot: Boolean(matched || prefetch),
    botReason: matched ? `user-agent:${matched}` : prefetch ? "request:prefetch" : null,
    deviceType,
    browser,
    os
  };
}

export function validHttpDestination(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
