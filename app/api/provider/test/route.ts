import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getEmailProviderStatus, sendProviderEmail } from "@/lib/email-provider";

const schema = z.object({ email: z.string().email().max(320) });

export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    const status = getEmailProviderStatus();
    if (!status.configured) {
      return NextResponse.json({ ok: false, error: "Resend is not fully configured" }, { status: 503 });
    }

    const result = await sendProviderEmail({
      to: input.email,
      subject: "Mail Admin connection test",
      text: "Your Mail Admin dashboard is connected to Resend successfully.",
      html: "<p>Your <strong>Mail Admin</strong> dashboard is connected to Resend successfully.</p>",
      tags: { source: "mail-admin", type: "connection-test" },
      idempotencyKey: `mail-admin-test-${Date.now()}`
    });

    return NextResponse.json({ ok: true, providerMessageId: result.id ?? null });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Enter a valid test email address" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Test send failed" }, { status: 500 });
  }
}
