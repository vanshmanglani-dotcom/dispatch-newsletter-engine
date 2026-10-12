import { NextRequest } from "next/server";
import { cronAuthorized, unauthorized, runJob } from "../../../../lib/auth";
import { q } from "../../../../lib/db";
import { getIssue, controlKeyboard, liveStories } from "../../../../lib/issue";
import { weekKey } from "../../../../lib/time";
import { sendMessage } from "../../../../lib/telegram";

export const dynamic = "force-dynamic";

/** Wednesday 10 PM IST: if Shreya hasn't confirmed, nudge her. Never sends the newsletter. */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return unauthorized();
  return runJob("remind", async () => {
    const issue = await getIssue(weekKey());
    if (!issue) return { reminded: false, reason: "No draft this week" };
    if (issue.status !== "PENDING") return { reminded: false, reason: `Issue is ${issue.status}` };
    const live = await liveStories(issue.id);
    await sendMessage(
      `⏰ <b>Reminder:</b> this week's Dispatch is still waiting for you.\n${live.length} stories in the draft. It will <b>not</b> go out on Thursday unless you confirm.`,
      controlKeyboard(issue)
    );
    await q`update issues set reminder_sent_at = now() where id = ${issue.id}`;
    return { reminded: true };
  });
}
