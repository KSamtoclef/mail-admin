import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { unsubscribeByTrackingToken } from "@/lib/unsubscribe";

const tokenSchema = z.string().uuid();

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let rawToken = "";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      rawToken = typeof body?.token === "string" ? body.token : "";
    } else {
      const form = await request.formData();
      rawToken = String(form.get("token") ?? "");
    }

    const token = tokenSchema.parse(rawToken);
    await unsubscribeByTrackingToken(token);

    const url = new URL(`/u/${token}`, request.url);
    url.searchParams.set("done", "1");
    return NextResponse.redirect(url, 303);
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to process unsubscribe request" }, { status: 400 });
  }
}
