import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { processCampaignBroadcastWave } from "@/lib/resend-broadcast-dispatch";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin() as any;
    const campaignResult = await supabase
      .from("campaigns")
      .select("id")
      .eq("status", "sending")
      .order("dispatch_started_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (campaignResult.error) throw new Error(campaignResult.error.message);
    if (!campaignResult.data?.id) {
      return NextResponse.json({ ok: true, state: "idle" }, { headers: { "Cache-Control": "no-store" } });
    }

    const result = await processCampaignBroadcastWave(campaignResult.data.id);
    return NextResponse.json({ ok: true, campaignId: campaignResult.data.id, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Campaign worker failed"
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
