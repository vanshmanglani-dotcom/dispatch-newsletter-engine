import { q, one, type Article, type Issue, type Story } from "./db";
import { sendMessage, editMessage, type Keyboard } from "./telegram";
import { appUrl } from "./env";
import { esc, similarity, NEAR_DUP } from "./text";
import type { Candidate } from "./gemini";

export type StoryRow = Story & { articles: Article };

export async function getStyleGuide(): Promise<string> {
  const row = await one<{ content: string }>`select content from style_guide where id = 1`;
  return row?.content ?? "Write 2–3 sharp lines: the so-what first, no hype, end with an implication.";
}

export const getIssue = (weekKey: string) => one<Issue>`select * from issues where week_key = ${weekKey}`;
export const getIssueById = (id: number) => one<Issue>`select * from issues where id = ${id}`;

export async function getStories(issueId: number, statuses?: Story["status"][]): Promise<StoryRow[]> {
  const all = statuses ?? ["PROPOSED", "APPROVED", "REMOVED", "SWAPPED", "ALTERNATE"];
  return q<StoryRow>`
    select s.*, row_to_json(a.*) as articles
    from issue_stories s join articles a on a.id = s.article_id
    where s.issue_id = ${issueId} and s.status = any(${all})
    order by s.position, s.id`;
}

export async function getStory(storyId: number) {
  return one<StoryRow & { issue_status: Issue["status"]; week_key: string }>`
    select s.*, row_to_json(a.*) as articles, i.status as issue_status, i.week_key
    from issue_stories s join articles a on a.id = s.article_id join issues i on i.id = s.issue_id
    where s.id = ${storyId}`;
}

/** Articles that went out in the last 4 sent/confirmed issues (excluding the current week). */
export async function recentlyCovered(currentWeek: string) {
  const rows = await q<{ url_hash: string; title: string; title_norm: string }>`
    select a.url_hash, a.title, a.title_norm
    from issue_stories s
    join articles a on a.id = s.article_id
    where s.status in ('APPROVED','PROPOSED')
      and s.issue_id in (
        select id from issues where week_key <> ${currentWeek} and status in ('SENT','CONFIRMED','SENDING')
        order by week_key desc limit 4)`;
  return { hashes: new Set(rows.map((r) => r.url_hash)), titles: rows.map((r) => r.title), norms: rows.map((r) => r.title_norm) };
}

/** This week's articles minus anything covered in the last 4 issues (exact URL or near-identical headline). */
export async function candidatesForWeek(weekKey: string, limit = 120) {
  const arts = await q<Article>`select * from articles where week_key = ${weekKey} order by published_at desc nulls last limit 400`;
  const recent = await recentlyCovered(weekKey);
  const fresh = arts.filter((a) => !recent.hashes.has(a.url_hash) && !recent.norms.some((n) => similarity(n, a.title_norm) >= NEAR_DUP));
  const candidates: Candidate[] = fresh.slice(0, limit).map((a) => ({ id: a.id, title: a.title, source: a.source, snippet: a.snippet, published_at: a.published_at }));
  return { candidates, recentTitles: recent.titles, excluded: arts.length - fresh.length };
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

export const liveStories = (issueId: number) => getStories(issueId, ["PROPOSED", "APPROVED"]);

export async function controlText(issue: Issue) {
  const live = await liveStories(issue.id);
  const approved = live.filter((s) => s.status === "APPROVED").length;
  const topics = new Set(live.map((s) => (s.topic ?? "").toLowerCase())).size;
  const head = issue.status === "PENDING"
    ? "🗞 <b>Draft controls</b>"
    : issue.status === "CONFIRMED" ? "✅ <b>Confirmed</b>: will send Thursday 8:00 AM IST" : `<b>Status: ${issue.status}</b>`;
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
    `📰 <b>The Dispatch: draft for ${issue.week_key}</b>\n\n<i>${esc(issue.intro ?? "")}</i>\n\n${stories.length} stories proposed by Gemini. Review each one below.`
  );
  for (const [i, s] of stories.entries()) {
    const msg = await sendMessage(storyText(s, i + 1), storyKeyboard(s, false));
    await q`update issue_stories set telegram_message_id = ${msg.message_id} where id = ${s.id}`;
  }
  const ctl = await sendMessage(await controlText(issue), controlKeyboard(issue));
  return { stories: stories.length, control_message_id: ctl.message_id };
}

export async function refreshStoryMessage(storyId: number) {
  const s = await getStory(storyId);
  if (!s?.telegram_message_id) return;
  await editMessage(s.telegram_message_id, storyText(s, s.position + 1), storyKeyboard(s, s.issue_status !== "PENDING"));
}

type Pick = { article_id: number; topic: string; reason: string; commentary: string };

/** Swap a story for the best unused alternate (or ask Gemini for a fresh one). */
export async function swapStory(storyId: number, pickFresh: () => Promise<Pick | null>) {
  const s = await one<Story>`select * from issue_stories where id = ${storyId}`;
  if (!s) return null;
  const alts = await getStories(s.issue_id, ["ALTERNATE"]);
  let replacementId: number | null = alts[0]?.id ?? null;
  if (!replacementId) {
    const p = await pickFresh();
    if (!p) return null;
    const row = await one<{ id: number }>`
      insert into issue_stories (issue_id, article_id, topic, reason, commentary, status, position)
      values (${s.issue_id}, ${p.article_id}, ${p.topic}, ${p.reason}, ${p.commentary}, 'ALTERNATE', 999)
      on conflict (issue_id, article_id) do update set status = 'ALTERNATE'
      returning id`;
    replacementId = row!.id;
  }
  await q`update issue_stories set status = 'SWAPPED', telegram_message_id = null where id = ${s.id}`;
  await q`update issue_stories set status = 'PROPOSED', position = ${s.position}, telegram_message_id = ${s.telegram_message_id} where id = ${replacementId}`;
  return replacementId;
}
