import { NextRequest, NextResponse } from "next/server";
import { db } from "../../../../lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { key, content } = (await req.json()) as { key?: string; content?: string };
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!content || content.length < 50) return NextResponse.json({ error: "Style guide too short" }, { status: 400 });
  const { error } = await db().from("style_guide").upsert({ id: 1, content, updated_at: new Date().toISOString() });
  return NextResponse.json(error ? { error: error.message } : { ok: true });
}
