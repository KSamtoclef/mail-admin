import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { unsubscribeByTrackingToken } from "@/lib/unsubscribe";

const tokenSchema = z.string().uuid();

export async function POST(request: NextRequest) {
  try {
    const token = tokenSchema.parse(request.nextUrl.searchParams.get("token") ?? "");
    await unsubscribeByTrackingToken(token, "list_unsubscribe_one_click");
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to unsubscribe" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
