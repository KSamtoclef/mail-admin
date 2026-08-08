import { NextResponse } from "next/server";
import { runCookiesPilotCheck } from "@/lib/cookies-pilot";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await runCookiesPilotCheck({ purpose: "test" });
    return NextResponse.json({
      ok: result.ok,
      skipped: result.skipped,
      httpStatus: result.httpStatus,
      durationMs: result.durationMs,
      responsePreview: result.responsePreview,
      error: result.error
    }, {
      status: result.ok ? 200 : 502,
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Cookies Pilot test failed"
    }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
