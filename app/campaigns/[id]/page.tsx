import Link from "next/link";
import { notFound } from "next/navigation";
import CampaignDispatchControls from "@/components/CampaignDispatchControls";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin() as any;

  const campaignResult = await supabase
    .from("campaigns")
    .select("id,name,subject,status,scheduled_at,primary_link_url,audience_offset,audience_total,dispatch_started_at,completed_at,failed_reason,created_at")
    .eq("id", id)
    .maybeSingle();

  if (campaignResult.error || !campaignResult.data) notFound();
  const campaign = campaignResult.data;

  const statuses = ["reserved", "queued", "sent", "delivered", "bounced", "complained", "failed", "suppressed", "unsubscribed"];
  const counts = await Promise.all(statuses.map(async (status) => {
    const result = await supabase
      .from("campaign_recipients")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("delivery_status", status);
    return [status, result.error ? 0 : (result.count ?? 0)] as const;
  }));
  const recipientCounts = Object.fromEntries(counts) as Record<string, number>;
  const processed = Object.values(recipientCounts).reduce((sum, value) => sum + value, 0);

  return (
    <main className="standalonePage">
      <div className="standaloneHeader">
        <div>
          <div className="breadcrumb"><Link href="/">Mail Admin</Link><b>/</b><strong>Campaign</strong></div>
          <h1>{campaign.name}</h1>
          <p>{campaign.subject}</p>
        </div>
        <div className="pageActions"><Link className="button" href="/campaigns/new">New campaign</Link><Link className="button" href="/">Dashboard</Link></div>
      </div>

      <section className="statsBar">
        <div className="stat"><span className="statLabel">Status</span><strong className="statValue" style={{ textTransform: "capitalize" }}>{campaign.status}</strong></div>
        <div className="stat"><span className="statLabel">Recipients created</span><strong className="statValue">{processed.toLocaleString()}</strong></div>
        <div className="stat"><span className="statLabel">Delivered</span><strong className="statValue">{recipientCounts.delivered.toLocaleString()}</strong></div>
        <div className="stat"><span className="statLabel">Bounced / suppressed</span><strong className="statValue">{(recipientCounts.bounced + recipientCounts.suppressed).toLocaleString()}</strong></div>
      </section>

      <div className="contentGrid">
        <section className="panel" style={{ padding: 20 }}>
          <div className="panelHeader"><h2>Campaign details</h2><span>{new Date(campaign.created_at).toLocaleString()}</span></div>
          <div className="integrityList">
            <div><span>Audience progress</span><strong>{Number(campaign.audience_offset ?? 0).toLocaleString()} / {campaign.audience_total == null ? "—" : Number(campaign.audience_total).toLocaleString()}</strong></div>
            <div><span>Queued</span><strong>{recipientCounts.queued.toLocaleString()}</strong></div>
            <div><span>Sent</span><strong>{recipientCounts.sent.toLocaleString()}</strong></div>
            <div><span>Failed</span><strong>{recipientCounts.failed.toLocaleString()}</strong></div>
            <div><span>Unsubscribed</span><strong>{recipientCounts.unsubscribed.toLocaleString()}</strong></div>
            <div><span>Destination</span><strong>{campaign.primary_link_url || "No tracked link"}</strong></div>
          </div>
          {campaign.failed_reason ? <div className="notice noticeError" style={{ marginTop: 16 }}><div><strong>Last dispatch error</strong><span>{campaign.failed_reason}</span></div></div> : null}
        </section>

        <CampaignDispatchControls campaignId={campaign.id} status={campaign.status} />
      </div>
    </main>
  );
}
