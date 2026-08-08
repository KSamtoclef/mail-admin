import { NextResponse } from "next/server";

export async function GET() {
  const supabase = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const provider = Boolean(process.env.EMAIL_PROVIDER && process.env.DEFAULT_FROM_EMAIL);
  const tracking = Boolean(process.env.TRACKING_BASE_URL && process.env.TRACKING_ALLOWED_ORIGINS);

  return NextResponse.json({
    ok: true,
    service: "mail-admin",
    configured: { supabase, provider, tracking },
    timestamp: new Date().toISOString()
  });
}
