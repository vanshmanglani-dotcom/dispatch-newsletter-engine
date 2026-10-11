import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized, unauthorized } from "../../../../lib/auth";
import { setWebhook, getWebhookInfo } from "../../../../lib/telegram";
import { appUrl, env } from "../../../../lib/env";

export const dynamic = "force-dynamic";

/** One-time: GET /api/telegram/setup?key=CRON_SECRET registers the webhook with Telegram. */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return unauthorized();
  try {
    await setWebhook(`${appUrl()}/api/telegram/webhook`, env("TELEGRAM_WEBHOOK_SECRET"));
    return NextResponse.json({ ok: true, info: await getWebhookInfo() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
