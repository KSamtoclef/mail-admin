import { NextResponse } from "next/server";

export async function GET() {
  const adminPassword = Boolean(process.env.ADMIN_PASSWORD);
  const adminSessionSecret = Boolean(process.env.ADMIN_SESSION_SECRET);
  const supabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const provider = Boolean(process.env.EMAIL_PROVIDER && process.env.DEFAULT_FROM_EMAIL);
  const tracking = Boolean(process.env.TRACKING_BASE_URL && process.env.TRACKING_ALLOWED_ORIGINS);

  return NextResponse.json({
    ok: true,
    service: "mail-admin",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    configured: {
      adminProtection: adminPassword && adminSessionSecret,
      adminPassword,
      adminSessionSecret,
      supabase,
      provider,
      tracking
    },
    timestamp: new Date().toISOString()
  });
}
