import { db, must } from "./db";
import { scanGmailBounces } from "./mail";

/** Marks Gmail bounces and mailto-unsubscribes as inactive. Skips quietly if Gmail isn't configured. */
export async function handleBounces() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return { skipped: "Gmail not configured" };
  const { bounced, unsubscribed } = await scanGmailBounces();
  const now = new Date().toISOString();
  if (bounced.length)
    must(await db().from("subscribers").update({ status: "bounced", updated_at: now }).in("email", bounced).eq("status", "active").select("id"));
  if (unsubscribed.length)
    must(await db().from("subscribers").update({ status: "unsubscribed", updated_at: now }).in("email", unsubscribed).eq("status", "active").select("id"));
  return { bounced: bounced.length, unsubscribed: unsubscribed.length };
}
