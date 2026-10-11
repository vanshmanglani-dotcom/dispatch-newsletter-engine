import { db, must, type Article, type Issue, type Story } from "./db";
import { sendMessage, editMessage, type Keyboard } from "./telegram";
import { appUrl } from "./env";
import { esc, similarity, NEAR_DUP } from "./text";
import type { Candidate } from "./gemini";

export type StoryRow = Story & { articles: Article };

export async function getStyleGuide(): Promise<string> {
  const row = must(await db().from("style_guide").select("content").eq("id", 1).maybeSingle()) as { content: string } | null;
  return row?.content ?? "Write 2–3 sharp lines: the so-what first, no hype, end with an implication.";
}

export async function getIssue(weekKey: string): Promise<Issue | null> {
  return must(await db().from("issues").select("*").eq("week_key", weekKey).maybeSingle()) as Issue | null;
}

export async function getStories(issueId: number, statuses?: Story["status"][]): Promise<StoryRow[]> {
  let q = db().from("issue_stories").select("*, articles(*)").eq("issue_id", issueId).order("position");
  if (statuses) q = q.in("status", statuses);
  return must(await q) as StoryRow[];
}

/** Articles that went out in the last 4 sent/confirmed issues (excluding the current week). */
export async function recentlyCovered(currentWeek: string) {
  const issues = must(
    await db().from("issues").select("id, week_key").neq("week_key", currentWeek)
      .in("status", ["SENT", "CONFIRMED", "SENDING"]).order("week_key", { ascending: false }).limit(4)
  ) as { id: number }[];
  if (!issues.length) return { hashes: new Set<string>(), titles: [] as string[], norms: [] as string[] };
  const rows = must(
    await db().from("issue_stories").select("articles(url_hash, title, title_norm)")
      .in("issue_id", issues.map((i) => i.id)).in("status", ["APPROVED", "PROPOSED"])
  ) as unknown as { articles: Pick<Article, "url_hash" | "title" | "title_norm"> }[];
  return {
    hashes: new Set(rows.map((r) => r.articles.url_hash)),
    titles: rows.map((r) => r.articles.title),
    norms: rows.map((r) => r.articles.title_norm),
  };
}

/** This week's articles minus anything covered in the last 4 issues (exact URL or near-identical headline). */
export async function candidatesForWeek(weekKey: string, limit = 120): Promise<{ candidates: Candidate[]; recentTitles: string[]; excluded: number }> {
  const arts = must(
    await db().from("articles").select("*").eq("week_key", weekKey).order("published_at", { ascending: false }).limit(400)
  ) as Article[];
  const recent = await recentlyCovered(weekKey);
  const norms = recent.norms;
  const fresh = arts.filter((a) => !recent.hashes.has(a.url_hash) && !norms.some((n) => similarity(n, a.title_norm) >= NEAR_DUP));
  return {
    candidates: fresh.slice(0, limit).map((a) => ({ id: a.id, title: a.title, source: a.source, snippet: a.snippet, published_at: a.published_at })),
    recentTitles: recent.titles,
    excluded: arts.length - fresh.length,
  };
}

// ---------- Telegram rendering ----------

const STATUS_BADGE: Record<string, string> = { PROPOSED: "🟡 Proposed", APPROVED: "✅ Approved", REMOVED: "🗑 Removed", SWAPPED: "🔁 Swapped out" };

export function storyText(s: StoryRow, n: number) {
  return [
    `<b>${n}. ${esc(s.articles.title)}</b>`,
    `<i>${esc(s.topic ?? "")} · ${esc(s.articles.source ?? "")}</i>`,
    "",
    esc(s.commentary ?? ""),
    "",
    `💡 <i>Why: ${esc(s.reason ?? "")}</i>`,
    `<a href="${esc(s.articles.url)}">Open article</a> · ${STATUS_BADGE[s.status] ?? s.status}`,
  ].join("\n");
}

export function storyKeyboard(s: StoryRow, locked: boolean): Keyboard {
  if (locked || s.status === "REMOVED" || s.status === "SWAPPED") return [];
  return [[
    { text: s.status === "APPROVED" ? "✅ Approved" : "✅ Approve", callback_data: `a:${s.id}` },
    { text: "🔁 Swap", callback_data: `s:${s.id}` },
    { text: "🗑 Remove", callback_data: `r:${s.id}` },
  ]];
}

export function controlKeyboard(issue: Issue): Keyboard {
  if (issue.status !== "PENDING") return [[{ text: "🌐 Preview", url: `${appUrl()}/issue/${issue.week_key}` }]];
  return [
    [{ text: "📤 Confirm final draft", callback_data: `c:${issue.id}` }],
    [{ text: "🌐 Preview email", url: `${appUrl()}/issue/${issue.week_key}` }],
  ];
}

export async function liveStories(issueId: number) {
  return getStories(issueId, ["PROPOSED", "APPROVED"]);
}

export async function controlText(issue: Issue) {
  const live = await liveStories(issue.id);
  const approved = live.filter((s) => s.status === "APPROVED").length;
  const topics = new Set(live.map((s) => (s.topic ?? "").toLowerCase())).size;
  const head = issue.status === "PENDING"
    ? "🗞 <b>Draft controls</b>"
    : issue.status === "CONFIRMED" ? "✅ <b>Confirmed</b> — will send Thursday 8:00 AM IST" : `<b>Status: ${issue.status}</b>`;
  return [
    head,
    `${live.length} stories · ${approved} approved · ${topics} topics`,
    "",
    "• Tap ✅ / 🔁 / 🗑 on each story.",
    "• To edit commentary: <b>reply</b> to a story message with your new text.",
    "• Nothing is ever sent until you tap <b>Confirm</b>.",
  ].join("\n");
}

/** Sends the full draft to Shreya: intro, one message per story, and a control message. */
export async function sendDraftToTelegram(issue: Issue) {
  const stories = await liveStories(issue.id);
  await sendMessage(
    `📰 <b>The Dispatch — draft for ${issue.week_key}</b>\n\n<i>${esc(issue.intro ?? "")}</i>\n\n${stories.length} stories proposed by Gemini. Review each one below.`
  );
  for (const [i, s] of stories.entries()) {
    const msg = await sendMessage(storyText(s, i + 1), storyKeyboard(s, false));
    must(await db().from("issue_stories").update({ telegram_message_id: msg.message_id }).eq("id", s.id));
  }
  const ctl = await sendMessage(await controlText(issue), controlKeyboard(issue));
  return { stories: stories.length, control_message_id: ctl.message_id };
}

export async function refreshStoryMessage(storyId: number) {
  const s = (must(await db().from("issue_stories").select("*, articles(*), issues(status)").eq("id", storyId).single()) as StoryRow & { issues: { status: string } });
  if (!s.telegram_message_id) return;
  const n = s.position + 1;
  await editMessage(s.telegram_message_id, storyText(s, n), storyKeyboard(s, s.issues.status !== "PENDING"));
}

/** Swap a story for the best unused alternate (or ask Gemini for a fresh one). */
export async function swapStory(storyId: number, pickFresh: () => Promise<{ article_id: number; topic: string; reason: string; commentary: string } | null>) {
  const s = must(await db().from("issue_stories").select("*").eq("id", storyId).single()) as Story;
  const alts = await getStories(s.issue_id, ["ALTERNATE"]);
  let replacement: StoryRow | null = alts[0] ?? null;
  if (!replacement) {
    const p = await pickFresh();
    if (!p) return null;
    replacement = must(await db().from("issue_stories").insert({
      issue_id: s.issue_id, article_id: p.article_id, topic: p.topic, reason: p.reason, commentary: p.commentary, status: "ALTERNATE", position: 999,
    }).select("*, articles(*)").single()) as StoryRow;
  }
  must(await db().from("issue_stories").update({ status: "SWAPPED", telegram_message_id: null }).eq("id", s.id));
  must(await db().from("issue_stories").update({ status: "PROPOSED", position: s.position, telegram_message_id: s.telegram_message_id }).eq("id", replacement.id));
  return replacement.id;
}
