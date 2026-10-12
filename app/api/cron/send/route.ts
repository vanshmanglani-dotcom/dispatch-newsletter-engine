import { NextRequest, after } from "next/server";
import { cronAuthorized, unauthorized, runJob } from "../../../../lib/auth";
import { q } from "../../../../lib/db";
import { getIssue, getStories } from "../../../../lib/issue";
import { renderNewsletter, sendEmail, type StoryWithArticle } from "../../../../lib/mail";
import { weekKey } from "../../../../lib/time";
import { sendMessage } from "../../../../lib/telegram";
import { appUrl, env } from "../../../../lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Sub = { id: number; email: string; unsub_token: string };

/**
 * Thursday 8 AM IST. HARD RULE: only an issue Shreya CONFIRMED can be sent.
 * Sends in batches (resumable via the deliveries table, so nobody gets it twice).
 * ?test=1 sends a single preview to GMAIL_USER instead.
 */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return unauthorized();
  const test = req.nextUrl.searchParams.get("test") === "1";
  const wk = req.nextUrl.searchParams.get("week") || weekKey();
  return runJob("send", async () => {
    const issue = await getIssue(wk);
    if (!issue) return { sent: 0, reason: "No issue this week" };
    const stories = (await getStories(issue.id, ["APPROVED", "PROPOSED"])) as StoryWithArticle[];

    if (test) {
      const unsub = `${appUrl()}/api/unsubscribe?token=test`;
      const { subject, html, text } = renderNewsletter(issue, stories, unsub);
      await sendEmail(env("GMAIL_USER"), `[TEST] ${subject}`, html, text, unsub);
      return { test: true, to: env("GMAIL_USER") };
    }

    if (issue.status === "PENDING") {
      await q`update issues set status = 'SKIPPED' where id = ${issue.id}`;
      await sendMessage(`🛑 The Dispatch for ${wk} was <b>not sent</b> — no confirmation received. Nothing went to subscribers.`).catch(() => undefined);
      return { sent: 0, reason: "Not confirmed by Shreya → skipped (never auto-sent)" };
    }
    if (!["CONFIRMED", "SENDING"].includes(issue.status)) return { sent: 0, reason: `Issue is ${issue.status}` };
    if (issue.status === "CONFIRMED") await q`update issues set status = 'SENDING' where id = ${issue.id}`;

    const batchSize = Number(process.env.SEND_BATCH_SIZE || 40);
    const subs = await q<Sub>`
      select id, email, unsub_token from subscribers
      where status = 'active' and id not in (select subscriber_id from deliveries where issue_id = ${issue.id})
      order by id`;
    const batch = subs.slice(0, batchSize);

    let ok = 0, failed = 0;
    for (const s of batch) {
      const unsub = `${appUrl()}/api/unsubscribe?token=${s.unsub_token}`;
      const { subject, html, text } = renderNewsletter(issue, stories, unsub);
      try {
        await sendEmail(s.email, subject, html, text, unsub);
        ok++;
        await q`insert into deliveries (issue_id, subscriber_id, status) values (${issue.id}, ${s.id}, 'sent') on conflict do nothing`;
      } catch (e) {
        failed++;
        await q`insert into deliveries (issue_id, subscriber_id, status, error) values (${issue.id}, ${s.id}, 'failed', ${(e as Error).message.slice(0, 300)}) on conflict do nothing`;
      }
    }

    const remaining = subs.length - batch.length;
    if (remaining > 0) {
      // Chain the next batch after this response is returned.
      const next = `${appUrl()}/api/cron/send?key=${encodeURIComponent(process.env.CRON_SECRET!)}&week=${wk}`;
      after(() => fetch(next).then(() => undefined).catch(() => undefined));
    } else {
      const total = await q<{ status: string }>`select status from deliveries where issue_id = ${issue.id}`;
      await q`update issues set status = 'SENT', sent_at = now() where id = ${issue.id}`;
      await sendMessage(
        `📬 The Dispatch ${wk} is out: ${total.filter((t) => t.status === "sent").length} delivered, ${total.filter((t) => t.status === "failed").length} failed.`
      ).catch(() => undefined);
    }
    return { sent: ok, failed, remaining } satisfies Record<string, number>;
  });
}

