import { NextRequest } from "next/server";
import { cronAuthorized, unauthorized, runJob } from "../../../../lib/auth";
import { q, one, type Issue } from "../../../../lib/db";
import { selectStories } from "../../../../lib/gemini";
import { candidatesForWeek, getIssue, getStyleGuide, sendDraftToTelegram } from "../../../../lib/issue";
import { weekKey } from "../../../../lib/time";
import { sendMessage } from "../../../../lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Wednesday 3 PM IST: Gemini editorial pass → draft saved as PENDING → sent to Shreya on Telegram. */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return unauthorized();
  const force = req.nextUrl.searchParams.get("force") === "1";
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  return runJob("select", async () => {
    const wk = weekKey();
    if (dry) {
      // Preview Gemini's picks without saving or messaging anyone.
      const { candidates, recentTitles } = await candidatesForWeek(wk);
      const sel = await selectStories(candidates, await getStyleGuide(), recentTitles);
      const byId = new Map(candidates.map((c) => [c.id, c]));
      return { dry: true, candidates: candidates.length, intro: sel.intro,
        stories: sel.stories.map((s) => ({ title: byId.get(s.article_id)?.title, source: byId.get(s.article_id)?.source, topic: s.topic, reason: s.reason, commentary: s.commentary })) };
    }
    const existing = await getIssue(wk);
    if (existing && !force) return { week: wk, skipped: `Issue already exists (${existing.status}). Use &force=1 to rebuild a PENDING draft.` };
    if (existing && existing.status !== "PENDING") return { week: wk, skipped: `Issue is ${existing.status}; cannot rebuild.` };
    if (existing) await q`delete from issues where id = ${existing.id}`;

    const { candidates, recentTitles, excluded } = await candidatesForWeek(wk);
    if (candidates.length < 12) {
      await sendMessage(`⚠️ Only ${candidates.length} fresh articles this week — not enough for a draft. Run ingest again or add sources.`).catch(() => undefined);
      return { week: wk, skipped: `Only ${candidates.length} candidates` };
    }

    const sel = await selectStories(candidates, await getStyleGuide(), recentTitles);

    const issue = (await one<Issue>`insert into issues (week_key, intro, status) values (${wk}, ${sel.intro}, 'PENDING') returning *`)!;
    const rows = [
      ...sel.stories.map((s, i) => ({ ...s, position: i, status: "PROPOSED" })),
      ...sel.alternates.map((s, i) => ({ ...s, position: 100 + i, status: "ALTERNATE" })),
    ];
    await q`
      insert into issue_stories (issue_id, article_id, topic, reason, commentary, position, status)
      select ${issue.id}::int, * from unnest(
        ${rows.map((r) => r.article_id)}::int[], ${rows.map((r) => r.topic)}::text[], ${rows.map((r) => r.reason)}::text[],
        ${rows.map((r) => r.commentary)}::text[], ${rows.map((r) => r.position)}::int[], ${rows.map((r) => r.status)}::text[])
      on conflict (issue_id, article_id) do nothing`;

    const tg = await sendDraftToTelegram(issue);
    return {
      week: wk, candidates: candidates.length, excluded_as_recently_covered: excluded,
      picked: sel.stories.length, topics: [...new Set(sel.stories.map((s) => s.topic))], alternates: sel.alternates.length, telegram: tg,
    };
  });
}
