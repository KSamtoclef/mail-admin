import { NextRequest, NextResponse } from "next/server";

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isPublicPath(pathname: string) {
  return pathname === "/login" ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/events") ||
    pathname.startsWith("/api/sessions") ||
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/c/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/mail-tracker.js";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!password || !secret) {
    return NextResponse.next();
  }

  const expected = await sha256(`${password}:${secret}`);
  const session = request.cookies.get("mail_admin_session")?.value;

  if (session === expected) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"]
};
