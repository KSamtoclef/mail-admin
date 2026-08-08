import type { NextRequest } from "next/server";

export function getAllowedTrackingOrigins() {
  return (process.env.TRACKING_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function trackingIsConfigured() {
  return Boolean(process.env.TRACKING_BASE_URL && getAllowedTrackingOrigins().length);
}

export function requestOrigin(request: NextRequest) {
  return request.headers.get("origin")?.replace(/\/$/, "") ?? null;
}

export function isAllowedTrackingOrigin(request: NextRequest) {
  const origin = requestOrigin(request);
  if (!origin) return false;
  return getAllowedTrackingOrigins().includes(origin);
}

export function corsHeaders(request: NextRequest) {
  const origin = requestOrigin(request);
  const allowed = Boolean(origin && getAllowedTrackingOrigins().includes(origin));

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
