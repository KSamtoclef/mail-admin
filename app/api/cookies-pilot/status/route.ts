import { NextResponse } from "next/server";
import { getCookiesPilotBrowserEndpoint, getCookiesPilotStatus } from "@/lib/cookies-pilot";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = getCookiesPilotStatus();
    const browserEndpoint = status.enabled && status.endpointConfigured
      ? getCookiesPilotBrowserEndpoint()
      : null;
    const supabase = getSupabaseAdmin() as any;
    const latest = await supabase
      .from("cookie_pilot_checks")
      .select("purpose,ok,skipped,http_status,duration_ms,response_preview,error,created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      ok: true,
      ...status,
      browserEndpoint,
      latest: latest.error ? null : (latest.data ?? null),
      auditReady: !latest.error,
      auditError: latest.error?.message ?? null
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to load Cookies Pilot status"
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
