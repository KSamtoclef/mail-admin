import Link from "next/link";
import CampaignComposer from "@/components/CampaignComposer";

export default function NewCampaignPage() {
  return (
    <main className="standalonePage">
      <div className="standaloneHeader">
        <div>
          <div className="breadcrumb"><Link href="/">Mail Admin</Link><b>/</b><strong>New campaign</strong></div>
          <h1>New campaign</h1>
          <p>Personalize the subject and message with visible dynamic tags.</p>
        </div>
        <Link className="button" href="/">Back to dashboard</Link>
      </div>
      <CampaignComposer />
    </main>
  );
}
