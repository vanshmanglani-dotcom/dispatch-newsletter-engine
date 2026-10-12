import { NextRequest, NextResponse } from "next/server";
import { q } from "../../../lib/db";

export const dynamic = "force-dynamic";

async function unsubscribe(token: string | null) {
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return false;
  const rows = await q`update subscribers set status = 'unsubscribed', updated_at = now() where unsub_token = ${token}::uuid returning id`;
  return rows.length > 0;
}

const page = (msg: string) =>
  new NextResponse(`<!doctype html><meta name=viewport content="width=device-width"><body style="font:18px Georgia,serif;max-width:520px;margin:15vh auto;padding:0 16px;color:#222"><h2>The Dispatch</h2><p>${msg}</p></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } });

export async function GET(req: NextRequest) {
  const done = await unsubscribe(req.nextUrl.searchParams.get("token"));
  return page(done ? "You've been unsubscribed. You won't receive any more issues. Sorry to see you go." : "This unsubscribe link is invalid or already used.");
}

/** Gmail one-click unsubscribe (RFC 8058) POSTs here. */
export async function POST(req: NextRequest) {
  await unsubscribe(req.nextUrl.searchParams.get("token"));
  return NextResponse.json({ ok: true });
}
