import { NextRequest, NextResponse } from "next/server";
import { q } from "../../../../lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { key, content } = (await req.json()) as { key?: string; content?: string };
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!content || content.length < 50) return NextResponse.json({ error: "Style guide too short" }, { status: 400 });
  await q`insert into style_guide (id, content) values (1, ${content})
          on conflict (id) do update set content = excluded.content, updated_at = now()`;
  return NextResponse.json({ ok: true });
}
