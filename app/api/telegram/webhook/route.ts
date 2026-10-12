import { NextRequest, NextResponse } from "next/server";
import { q, one } from "../../../../lib/db";
import { answerCallback, sendMessage, editMessage } from "../../../../lib/telegram";
import {
  getIssue, getIssueById, getStory, getStories, liveStories, refreshStoryMessage, swapStory, candidatesForWeek,
  getStyleGuide, controlText, controlKeyboard, sendDraftToTelegram,
} from "../../../../lib/issue";
import { pickReplacement } from "../../../../lib/gemini";
import { weekKey } from "../../../../lib/time";
import { esc } from "../../../../lib/text";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Update = {
  message?: { message_id: number; chat: { id: number }; text?: string; reply_to_message?: { message_id: number } };
  callback_query?: { id: string; data?: string; message?: { message_id: number; chat: { id: number } } };
};

const ok = () => NextResponse.json({ ok: true });

export async function POST(req: NextRequest) {
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "bad secret" }, { status: 401 });
  }
  const update = (await req.json()) as Update;
  const owner = String(process.env.TELEGRAM_CHAT_ID || "");

  try {
    // ---------- Text messages ----------
    if (update.message) {
      const m = update.message;
      const fromChat = String(m.chat.id);
      if (m.text?.startsWith("/start") || m.text?.startsWith("/id")) {
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: m.chat.id, text: `👋 Dispatch bot is live.\nYour chat id: ${m.chat.id}\n(Set this as TELEGRAM_CHAT_ID.)\n\nCommands: /status, /draft` }),
        });
        return ok();
      }
      if (fromChat !== owner) return ok(); // only Shreya can control the newsletter

      const issue = await getIssue(weekKey());
      if (m.text === "/status") {
        await sendMessage(issue ? await controlText(issue) : "No draft yet this week. It is generated Wednesday 3 PM IST.", issue ? controlKeyboard(issue) : undefined);
        return ok();
      }
      if (m.text === "/draft") {
        if (issue) await sendDraftToTelegram(issue); else await sendMessage("No draft yet this week.");
        return ok();
      }
      // Reply to a story message = replace its commentary.
      if (m.reply_to_message && m.text) {
        const story = await one<{ id: number; issue_status: string }>`
          select s.id, i.status as issue_status from issue_stories s join issues i on i.id = s.issue_id
          where s.telegram_message_id = ${m.reply_to_message.message_id} order by s.id desc limit 1`;
        if (!story) { await sendMessage("Reply to a story message to edit its commentary."); return ok(); }
        if (story.issue_status !== "PENDING") { await sendMessage("This issue is already confirmed — edits are locked."); return ok(); }
        await q`update issue_stories set commentary = ${m.text.trim()}, status = 'APPROVED' where id = ${story.id}`;
        await refreshStoryMessage(story.id);
        await sendMessage("✏️ Commentary updated and story approved.", undefined, m.message_id);
      }
      return ok();
    }

    // ---------- Button taps ----------
    const cq = update.callback_query;
    if (!cq?.data || String(cq.message?.chat.id) !== owner) return ok();
    const [action, rawId] = cq.data.split(":");
    const id = Number(rawId);

    if (["a", "r", "s"].includes(action)) {
      const s = await getStory(id);
      if (!s) { await answerCallback(cq.id, "Story not found"); return ok(); }
      if (s.issue_status !== "PENDING") { await answerCallback(cq.id, "Issue is locked"); return ok(); }
      if (action === "a") {
        await q`update issue_stories set status = 'APPROVED' where id = ${id}`;
        await refreshStoryMessage(id);
        await answerCallback(cq.id, "Approved ✅");
      } else if (action === "r") {
        await q`update issue_stories set status = 'REMOVED' where id = ${id}`;
        await refreshStoryMessage(id);
        await answerCallback(cq.id, "Removed");
      } else {
        await answerCallback(cq.id, "Finding a replacement…");
        const newId = await swapStory(id, async () => {
          const { candidates } = await candidatesForWeek(s.week_key);
          const used = new Set((await getStories(s.issue_id)).map((x) => x.article_id));
          const pool = candidates.filter((c) => !used.has(c.id));
          if (!pool.length) return null;
          const topics = (await liveStories(s.issue_id)).map((x) => x.topic ?? "");
          return pickReplacement(pool.slice(0, 80), await getStyleGuide(), topics, s.articles.title);
        });
        if (newId) await refreshStoryMessage(newId);
        else await sendMessage("No more fresh candidates to swap in this week.");
      }
      return ok();
    }

    if (action === "c") {
      const issue = await getIssueById(id);
      if (!issue || issue.status !== "PENDING") { await answerCallback(cq.id, `Already ${issue?.status}`); return ok(); }
      const live = await liveStories(id);
      const topics = new Set(live.map((x) => (x.topic ?? "").toLowerCase())).size;
      const count = (await one<{ n: number }>`select count(*)::int as n from subscribers where status = 'active'`)?.n ?? 0;
      const warn = [
        live.length < 8 || live.length > 10 ? `⚠️ ${live.length} stories (target is 8–10).` : "",
        topics < 3 ? `⚠️ Only ${topics} topic areas (target ≥3).` : "",
      ].filter(Boolean).join("\n");
      await sendMessage(
        `Send <b>${live.length} stories</b> to <b>${count ?? 0} active subscribers</b> on Thursday 8:00 AM IST?\n${warn}\nUnreviewed stories will be included as they are.`,
        [[{ text: "✅ Yes, confirm", callback_data: `y:${id}` }, { text: "✖ Not yet", callback_data: `n:${id}` }]]
      );
      await answerCallback(cq.id);
      return ok();
    }

    if (action === "y") {
      const issue = await getIssueById(id);
      if (!issue || issue.status !== "PENDING") { await answerCallback(cq.id, `Already ${issue?.status}`); return ok(); }
      await q`update issue_stories set status = 'APPROVED' where issue_id = ${id} and status = 'PROPOSED'`;
      const live = await liveStories(id);
      // Renumber final order and lock every story message.
      for (const [i, s] of live.entries()) await q`update issue_stories set position = ${i} where id = ${s.id}`;
      await q`update issues set status = 'CONFIRMED', confirmed_at = now() where id = ${id} and status = 'PENDING'`;
      for (const s of live) await refreshStoryMessage(s.id).catch(() => undefined);
      if (cq.message) await editMessage(cq.message.message_id, `✅ <b>Confirmed.</b> ${live.length} stories will go out Thursday 8:00 AM IST.`);
      await answerCallback(cq.id, "Confirmed");
      return ok();
    }

    if (action === "n") {
      if (cq.message) await editMessage(cq.message.message_id, "OK — still a draft. Nothing will be sent until you confirm.");
      await answerCallback(cq.id);
      return ok();
    }
    await answerCallback(cq.id);
  } catch (e) {
    console.error("[telegram]", e);
    await sendMessage(`⚠️ Error: ${esc((e as Error).message).slice(0, 300)}`).catch(() => undefined);
  }
  return ok(); // always 200 so Telegram doesn't retry forever
}
