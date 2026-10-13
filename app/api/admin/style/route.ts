import { NextRequest, NextResponse } from "next/server";
import { q } from "../../../../lib/db";
import { DEMO_KEY } from "../../../../lib/auth";

export const dynamic = "force-dynamic";

/** GET ?key=CRON_SECRET returns the current style guide so the admin box can show it. */
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  const ok = (process.env.CRON_SECRET && key === process.env.CRON_SECRET) || key === DEMO_KEY;
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await q<{ content: string; updated_at: string }>`select content, updated_at from style_guide where id = 1`;
  return NextResponse.json({ content: rows[0]?.content ?? "", updated_at: rows[0]?.updated_at ?? null });
}

export async function POST(req: NextRequest) {
  const { key, content } = (await req.json()) as { key?: string; content?: string };
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!content || content.length < 50) return NextResponse.json({ error: "Style guide too short" }, { status: 400 });
  await q`insert into style_guide (id, content) values (1, ${content})
          on conflict (id) do update set content = excluded.content, updated_at = now()`;
  return NextResponse.json({ ok: true });
}
