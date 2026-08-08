import { NextResponse } from "next/server";
import { getEmailProviderStatus } from "@/lib/email-provider";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = getEmailProviderStatus();
  return NextResponse.json({
    ok: true,
    provider: status.provider || null,
    supported: status.supported,
    configured: status.configured,
    apiKeyConfigured: status.apiKeyConfigured,
    fromEmailConfigured: status.fromEmailConfigured,
    webhookConfigured: status.webhookConfigured,
    fromEmail: status.fromEmail,
    fromName: status.fromName
  }, { headers: { "Cache-Control": "no-store" } });
}
