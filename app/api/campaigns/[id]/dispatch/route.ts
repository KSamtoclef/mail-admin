import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { processCampaignBatch, startCampaignDispatch } from "@/lib/campaign-dispatch";

const idSchema = z.string().uuid();
const bodySchema = z.object({
  action: z.enum(["start", "run"]).default("run"),
  confirm_permission: z.boolean().optional().default(false)
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await context.params;
    const id = idSchema.parse(rawId);
    const body = bodySchema.parse(await request.json().catch(() => ({})));

    if (body.action === "start") {
      await startCampaignDispatch(id, body.confirm_permission);
    }

    const result = await processCampaignBatch(id);
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid dispatch request", issues: error.issues }, { status: 400 });
    }
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unable to dispatch campaign"
    }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
