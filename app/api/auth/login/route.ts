import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!configuredPassword || !secret) {
    return NextResponse.json({ ok: false, error: "Admin login is not configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";

  if (!safeEqual(password, configuredPassword)) {
    return NextResponse.json({ ok: false, error: "Invalid password" }, { status: 401 });
  }

  const token = await sha256(`${configuredPassword}:${secret}`);
  const response = NextResponse.json({ ok: true });
  response.cookies.set("mail_admin_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12
  });
  return response;
}
