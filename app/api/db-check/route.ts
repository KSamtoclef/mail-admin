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
  { name: "contacts", table: "contacts", columns: "id,external_user_id,external_session_id,broadcast_tracking_token,username,email,country_code,status,created_at" },
  { name: "contact_imports", table: "contact_imports", columns: "id,filename,total_rows,valid_rows,unique_rows,added_rows,updated_rows,duplicate_rows,invalid_rows,created_at" },
  { name: "campaigns", table: "campaigns", columns: "id,name,subject,from_name,reply_to,text_body,tracking_mode,transport,status,scheduled_at,primary_link_url,audience_cutoff_at,audience_offset,audience_total,dispatch_started_at,completed_at,send_confirmed_at,failed_reason,created_at" },
  { name: "campaign_recipients", table: "campaign_recipients", columns: "id,campaign_id,contact_id,tracking_token,broadcast_wave_id,resend_contact_synced_at,delivery_status,provider_message_id,queued_at,attempt_count,last_error,sent_at,delivered_at,bounced_at,complained_at,unsubscribed_at" },
  { name: "campaign_broadcast_waves", table: "campaign_broadcast_waves", columns: "id,campaign_id,wave_no,day_key,resend_segment_id,resend_broadcast_id,recipient_count,synced_count,status,started_at,sent_at,last_error" },
  { name: "tracked_links", table: "tracked_links", columns: "id,campaign_id,label,destination_url" },
  { name: "tracking_sites", table: "tracking_sites", columns: "id,name,site_url,origin,active,created_at,updated_at" },
  { name: "send_settings", table: "send_settings", columns: "id,daily_send_limit,max_batch_size,timezone,sending_paused,updated_at" },
  { name: "send_daily_counters", table: "send_daily_counters", columns: "day_key,timezone,reserved_count,updated_at" },
  { name: "sessions", table: "sessions", columns: "id,contact_id,campaign_id,recipient_id,anonymous_id,last_seen_at,country_code,region,device_type,browser,os" },
  { name: "events", table: "events", columns: "id,event_type,occurred_at,is_bot,bot_reason,country_code,region,device_type,browser,contact_id,campaign_id,recipient_id,session_id,link_id" },
  { name: "suppression_list", table: "suppression_list", columns: "id,email_normalized,reason,created_at" },
  { name: "provider_webhook_events", table: "provider_webhook_events", columns: "id,provider,provider_event_id,event_type,provider_message_id,received_at" }
];

export async function GET() {
  try {
    const supabase = getSupabaseAdmin() as any;
    const tableResults: CheckResult[] = await Promise.all(checks.map(async (check) => {
      const result = await supabase.from(check.table).select(check.columns).limit(1);
      return {
        name: check.name,
        ok: !result.error,
        error: result.error?.message ?? null,
        code: result.error?.code ?? null
      };
    }));

    const [usageResult, transportResult] = await Promise.all([
      supabase.rpc("mail_daily_send_usage"),
      supabase.rpc("mail_broadcast_transport_ready")
    ]);

    const transportRow = transportResult.data?.[0];
    const transportHealthy = !transportResult.error &&
      Boolean(transportRow?.reserve_function) &&
      Boolean(transportRow?.release_function);

    const results: CheckResult[] = [
      ...tableResults,
      {
        name: "mail_daily_send_usage",
        ok: !usageResult.error,
        error: usageResult.error?.message ?? null,
        code: usageResult.error?.code ?? null
      },
      {
        name: "broadcast_quota_functions",
        ok: transportHealthy,
        error: transportResult.error?.message ?? (transportHealthy ? null : "Broadcast quota functions are missing"),
        code: transportResult.error?.code ?? null
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
