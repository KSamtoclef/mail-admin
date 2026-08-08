import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const checks = [
  { name: "contacts", table: "contacts", columns: "id,external_user_id,external_session_id,username,email,country_code,status,created_at" },
  { name: "contact_imports", table: "contact_imports", columns: "id,filename,total_rows,valid_rows,unique_rows,added_rows,updated_rows,duplicate_rows,invalid_rows,created_at" },
  { name: "campaigns", table: "campaigns", columns: "id,name,subject,from_name,reply_to,text_body,tracking_mode,status,scheduled_at,created_at" },
  { name: "campaign_recipients", table: "campaign_recipients", columns: "id,campaign_id,contact_id,tracking_token,delivery_status,delivered_at" },
  { name: "tracked_links", table: "tracked_links", columns: "id,campaign_id,label,destination_url" },
  { name: "sessions", table: "sessions", columns: "id,contact_id,campaign_id,recipient_id,anonymous_id,last_seen_at,country_code,region,device_type,browser,os" },
  { name: "events", table: "events", columns: "id,event_type,occurred_at,is_bot,bot_reason,country_code,region,device_type,browser,contact_id,campaign_id,recipient_id,session_id,link_id" },
  { name: "suppression_list", table: "suppression_list", columns: "id,email_normalized,reason,created_at" },
  { name: "provider_webhook_events", table: "provider_webhook_events", columns: "id,provider,provider_event_id,event_type,provider_message_id,received_at" }
] as const;

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const results = await Promise.all(checks.map(async (check) => {
      const result = await supabase.from(check.table).select(check.columns).limit(1);
      return {
        name: check.name,
        ok: !result.error,
        error: result.error?.message ?? null,
        code: result.error?.code ?? null
      };
    }));

    return NextResponse.json({
      ok: results.every((result) => result.ok),
      databaseReachable: results.some((result) => result.ok),
      checks: results,
      checkedAt: new Date().toISOString()
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      databaseReachable: false,
      error: error instanceof Error ? error.message : "Database check failed"
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
