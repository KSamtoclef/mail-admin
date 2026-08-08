import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type CheckSpec = {
  name: string;
  table: string;
  columns: string;
};

type CheckResult = {
  name: string;
  ok: boolean;
  error: string | null;
  code: string | null;
};

const checks: CheckSpec[] = [
  { name: "contacts", table: "contacts", columns: "id,external_user_id,external_session_id,username,email,country_code,status,created_at" },
  { name: "contact_imports", table: "contact_imports", columns: "id,filename,total_rows,valid_rows,unique_rows,added_rows,updated_rows,duplicate_rows,invalid_rows,created_at" },
  { name: "campaigns", table: "campaigns", columns: "id,name,subject,from_name,reply_to,text_body,tracking_mode,status,scheduled_at,created_at" },
  { name: "campaign_recipients", table: "campaign_recipients", columns: "id,campaign_id,contact_id,tracking_token,delivery_status,delivered_at" },
  { name: "tracked_links", table: "tracked_links", columns: "id,campaign_id,label,destination_url" },
  { name: "tracking_sites", table: "tracking_sites", columns: "id,name,site_url,origin,active,created_at,updated_at" },
  { name: "send_settings", table: "send_settings", columns: "id,daily_send_limit,max_batch_size,timezone,sending_paused,updated_at" },
  { name: "sessions", table: "sessions", columns: "id,contact_id,campaign_id,recipient_id,anonymous_id,last_seen_at,country_code,region,device_type,browser,os" },
  { name: "events", table: "events", columns: "id,event_type,occurred_at,is_bot,bot_reason,country_code,region,device_type,browser,contact_id,campaign_id,recipient_id,session_id,link_id" },
  { name: "suppression_list", table: "suppression_list", columns: "id,email_normalized,reason,created_at" },
  { name: "provider_webhook_events", table: "provider_webhook_events", columns: "id,provider,provider_event_id,event_type,provider_message_id,received_at" }
];

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const tableResults: CheckResult[] = await Promise.all(checks.map(async (check) => {
      const result = await supabase.from(check.table).select(check.columns).limit(1);
      return {
        name: check.name,
        ok: !result.error,
        error: result.error?.message ?? null,
        code: result.error?.code ?? null
      };
    }));

    const usageResult = await supabase.rpc("mail_daily_send_usage");
    const results: CheckResult[] = [
      ...tableResults,
      {
        name: "mail_daily_send_usage",
        ok: !usageResult.error,
        error: usageResult.error?.message ?? null,
        code: usageResult.error?.code ?? null
      }
    ];

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
