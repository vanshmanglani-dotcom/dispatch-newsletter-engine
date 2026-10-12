import { q } from "./db";
import { scanGmailBounces } from "./mail";

/** Marks Gmail bounces and mailto-unsubscribes as inactive. Skips quietly if Gmail isn't configured. */
export async function handleBounces() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return { skipped: "Gmail not configured" };
  const { bounced, unsubscribed } = await scanGmailBounces();
  const b = bounced.length
    ? await q`update subscribers set status = 'bounced', updated_at = now() where email = any(${bounced}) and status = 'active' returning id` : [];
  const u = unsubscribed.length
    ? await q`update subscribers set status = 'unsubscribed', updated_at = now() where email = any(${unsubscribed}) and status = 'active' returning id` : [];
  return { bounced_found: bounced.length, newly_bounced: b.length, newly_unsubscribed: u.length };
}
