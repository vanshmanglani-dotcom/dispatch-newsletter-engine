import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { env, appUrl } from "./env";
import { esc } from "./text";
import type { Article, Issue, Story } from "./db";

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
function smtp() {
  return (transport ??= nodemailer.createTransport({
    service: "gmail",
    pool: true,
    maxConnections: 3,
    auth: { user: env("GMAIL_USER").trim(), pass: env("GMAIL_APP_PASSWORD").replace(/\s+/g, "") },
  }));
}

export type StoryWithArticle = Story & { articles: Article };

export function renderNewsletter(issue: Issue, stories: StoryWithArticle[], unsubUrl: string) {
  const subject = `The Dispatch · ${issue.week_key} · ${stories[0]?.articles.title.slice(0, 60) ?? "This week"}`;
  const items = stories
    .map(
      (s, i) => `
      <tr><td style="padding:18px 0;border-bottom:1px solid #eee">
        <div style="font:600 11px/1.4 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#b4532a">${i + 1} · ${esc(s.topic ?? "")}</div>
        <a href="${esc(s.articles.url)}" style="display:block;margin:6px 0 8px;font:700 19px/1.35 Georgia,serif;color:#111;text-decoration:none">${esc(s.articles.title)}</a>
        <div style="font:15px/1.6 Georgia,serif;color:#333">${esc(s.commentary ?? "")}</div>
        <div style="margin-top:6px;font:12px Arial,sans-serif;color:#888">${esc(s.articles.source ?? "")} · <a href="${esc(s.articles.url)}" style="color:#888">Read →</a></div>
      </td></tr>`
    )
    .join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f6f4ef">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;padding:28px 32px;border-radius:6px">
    <tr><td style="border-bottom:3px solid #111;padding-bottom:12px">
      <div style="font:700 30px Georgia,serif;color:#111">The Dispatch</div>
      <div style="font:13px Arial,sans-serif;color:#666">Indian startups, read closely · ${esc(issue.week_key)}</div>
    </td></tr>
    <tr><td style="padding:18px 0 4px;font:italic 16px/1.6 Georgia,serif;color:#333">${esc(issue.intro ?? "")}</td></tr>
    ${items}
    <tr><td style="padding-top:20px;font:12px/1.6 Arial,sans-serif;color:#999">
      You're receiving this because you subscribed to The Dispatch.<br>
      <a href="${unsubUrl}" style="color:#999">Unsubscribe</a> · <a href="${appUrl()}/issue/${issue.week_key}" style="color:#999">View in browser</a>
    </td></tr>
  </table></td></tr></table></body></html>`;
  const text = [
    `THE DISPATCH · ${issue.week_key}`, "", issue.intro ?? "", "",
    ...stories.map((s, i) => `${i + 1}. ${s.articles.title}\n${s.commentary}\n${s.articles.url}\n`),
    `Unsubscribe: ${unsubUrl}`,
  ].join("\n");
  return { subject, html, text };
}

export async function sendEmail(to: string, subject: string, html: string, text: string, unsubUrl: string) {
  const fromName = process.env.NEWSLETTER_FROM_NAME || "The Dispatch";
  await smtp().sendMail({
    from: `"${fromName}" <${env("GMAIL_USER")}>`,
    to,
    subject,
    html,
    text,
    headers: {
      "List-Unsubscribe": `<${unsubUrl}>, <mailto:${env("GMAIL_USER")}?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  });
}

/**
 * Gmail bounce handling: scan the sender inbox for Mail Delivery Subsystem / mailer-daemon
 * messages in the last N days and return the failed recipient addresses.
 * Also returns addresses that replied with "unsubscribe" in the subject (mailto unsubscribe).
 */
export async function scanGmailBounces(days = 8): Promise<{ bounced: string[]; unsubscribed: string[] }> {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: env("GMAIL_USER").trim(), pass: env("GMAIL_APP_PASSWORD").replace(/\s+/g, "") },
    logger: false,
  });
  const bounced = new Set<string>();
  const unsubscribed = new Set<string>();
  const since = new Date(Date.now() - days * 86400000);
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const bounceUids = await client.search({ since, from: "mailer-daemon" }, { uid: true });
    const unsubUids = await client.search({ since, subject: "unsubscribe" }, { uid: true });
    const take = async (uids: number[] | false | undefined, onMsg: (raw: Buffer) => Promise<void>) => {
      if (!uids || !uids.length) return;
      for await (const m of client.fetch(uids.slice(-200), { source: true }, { uid: true })) {
        if (m.source) await onMsg(m.source);
      }
    };
    await take(bounceUids, async (raw) => {
      const text = raw.toString("utf8");
      const re = /(?:Final-Recipient:\s*rfc822;\s*|Original-Recipient:\s*rfc822;\s*|wasn't delivered to\s+|delivery to the following recipient[s]? failed[^\n]*\n\s*)([^\s<>;]+@[^\s<>;]+)/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) bounced.add(m[1].toLowerCase().replace(/[.,)]$/, ""));
    });
    await take(unsubUids, async (raw) => {
      const p = await simpleParser(raw);
      const addr = p.from?.value?.[0]?.address;
      if (addr && addr.toLowerCase() !== env("GMAIL_USER").toLowerCase()) unsubscribed.add(addr.toLowerCase());
    });
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
  return { bounced: [...bounced], unsubscribed: [...unsubscribed] };
}
