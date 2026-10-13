import { NextRequest, NextResponse } from "next/server";

/** Cron routes accept Vercel's "Authorization: Bearer CRON_SECRET" header or ?key=CRON_SECRET for manual runs. */
export function cronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  const key = req.nextUrl.searchParams.get("key");
  return header === `Bearer ${secret}` || key === secret;
}

/** Public demo key: lets visitors run only harmless actions (ingest, Gemini dry run, read style guide). Not a secret. */
export const DEMO_KEY = "dispatch-demo";
export function demoAuthorized(req: NextRequest): boolean {
  return req.nextUrl.searchParams.get("key") === DEMO_KEY;
}

export const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });

export async function runJob(name: string, fn: () => Promise<unknown>) {
  const started = Date.now();
  try {
    const result = await fn();
    return NextResponse.json({ ok: true, job: name, ms: Date.now() - started, result });
  } catch (e) {
    console.error(`[${name}]`, e);
    return NextResponse.json({ ok: false, job: name, error: (e as Error).message }, { status: 500 });
  }
}
