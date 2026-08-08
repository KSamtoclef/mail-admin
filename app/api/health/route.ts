import { NextResponse } from "next/server";
import { trackingIsConfigured } from "@/lib/tracking-security";

export async function GET() {
  const adminProtection = Boolean(process.env.ADMIN_PASSWORD && process.env.ADMIN_SESSION_SECRET);
  const supabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)
  );
  const provider = Boolean(process.env.EMAIL_PROVIDER && process.env.DEFAULT_FROM_EMAIL);

  return NextResponse.json({
    ok: true,
    service: "mail-admin",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    configured: {
      adminProtection,
      supabase,
      provider,
      tracking: trackingIsConfigured()
    },
    timestamp: new Date().toISOString()
  }, { headers: { "Cache-Control": "no-store" } });
}
