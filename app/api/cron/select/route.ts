import { NextRequest } from "next/server";
import { cronAuthorized, unauthorized, runJob } from "../../../../lib/auth";
import { db, must, type Issue } from "../../../../lib/db";
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
  return runJob("select", async () => {
    const wk = weekKey();
    const existing = await getIssue(wk);
    if (existing && !force) return { week: wk, skipped: `Issue already exists (${existing.status}). Use &force=1 to rebuild a PENDING draft.` };
    if (existing && existing.status !== "PENDING") return { week: wk, skipped: `Issue is ${existing.status}; cannot rebuild.` };
    if (existing) must(await db().from("issues").delete().eq("id", existing.id));

    const { candidates, recentTitles, excluded } = await candidatesForWeek(wk);
    if (candidates.length < 12) {
      await sendMessage(`⚠️ Only ${candidates.length} fresh articles this week — not enough for a draft. Run ingest again or add sources.`).catch(() => undefined);
      return { week: wk, skipped: `Only ${candidates.length} candidates` };
    }

    const sel = await selectStories(candidates, await getStyleGuide(), recentTitles);

    const issue = must(await db().from("issues").insert({ week_key: wk, intro: sel.intro, status: "PENDING" }).select("*").single()) as Issue;
    const rows = [
      ...sel.stories.map((s, i) => ({ ...s, issue_id: issue.id, position: i, status: "PROPOSED" })),
      ...sel.alternates.map((s, i) => ({ ...s, issue_id: issue.id, position: 100 + i, status: "ALTERNATE" })),
    ];
    must(await db().from("issue_stories").insert(rows));

    const tg = await sendDraftToTelegram(issue);
    return {
      week: wk, candidates: candidates.length, excluded_as_recently_covered: excluded,
      picked: sel.stories.length, topics: [...new Set(sel.stories.map((s) => s.topic))], alternates: sel.alternates.length, telegram: tg,
    };
  });
}
