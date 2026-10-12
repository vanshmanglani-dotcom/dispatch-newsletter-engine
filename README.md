# The Dispatch · Newsletter Intelligence Engine

MESA Cohort C4 · AI and its Applications · Problem Statement 17

An end-to-end pipeline for Shreya's weekly newsletter on the Indian startup ecosystem. The machine reads, filters and drafts. **Shreya decides and is the only one who can send.**

## How it works

| When (IST) | Stage | What happens |
|---|---|---|
| Mon–Wed 9:00 AM | **Ingest** `/api/cron/ingest` | Pulls live articles from 23 RSS sources (Inc42, Entrackr, YourStory, ET Tech, Medianama, TechCrunch India, Mint, Moneycontrol, Business Standard, BusinessLine, Rest of World + 11 Google News topic queries) and optionally the GNews API. Dedupes by normalised URL hash (unique in DB, so a link is stored once ever) and by headline similarity (same story from two outlets). Also scans Gmail for bounces. |
| Wed 3:00 PM | **Select** `/api/cron/select` | Removes anything covered in the last 4 issues. **Gemini Flash** picks 8–10 high-signal stories across ≥3 topics, writes 2–3 lines of commentary in Shreya's style guide, gives a "why" for each, plus 5 ranked alternates. Rules (count, topics, no repeats, valid ids) are **checked in code**, and Gemini retries if they fail. The draft is saved as `PENDING` and sent to Telegram. |
| Wed evening | **Review** `/api/telegram/webhook` | Each story arrives as its own Telegram message with ✅ Approve · 🔁 Swap · 🗑 Remove. Reply to a story to rewrite its commentary. **Confirm** asks a second "are you sure?" before locking. |
| Wed 10:00 PM | **Remind** `/api/cron/remind` | If still `PENDING`, Shreya gets a reminder. It never sends anything. |
| Thu 8:00 AM | **Send** `/api/cron/send` | Sends **only if the issue is `CONFIRMED`**; otherwise it marks the issue `SKIPPED` and tells Shreya. Delivery goes in batches through Gmail with a `List-Unsubscribe` header and a per-reader unsubscribe link. A `deliveries` table makes it resumable, so nobody gets the email twice. |

Bounces: Gmail `mailer-daemon` messages and "unsubscribe" replies are read over IMAP and the matching subscribers are set to `bounced` or `unsubscribed`. They are never emailed again.

## Stack

Next.js 15 (App Router, TypeScript) on Vercel · Vercel Cron · Neon Postgres (`@neondatabase/serverless`) · Gemini Flash (`@google/genai`) · Telegram Bot API · Gmail SMTP and IMAP (nodemailer, imapflow) · Zod

## Setup

1. **Neon:** create a database (easiest: Vercel → Storage → Neon, which sets `DATABASE_URL` for you). Tables are created by **Admin → Create database tables** (or paste `db/schema.sql` into the Neon SQL Editor).
2. **Gemini:** get an API key from https://aistudio.google.com/apikey.
3. **Telegram:** in @BotFather send `/newbot` and copy the token.
4. **Gmail:** turn on 2-Step Verification, then create an App Password at https://myaccount.google.com/apppasswords.
5. **Vercel:** import this repo and add the variables from `.env.example`. Deploy.
6. Open `https://<app>/admin`, enter `CRON_SECRET`, and click **Connect Telegram webhook**.
7. Send `/start` to your bot. It replies with your chat id. Put that in `TELEGRAM_CHAT_ID` and redeploy.
8. On the admin page, click **Ingest now**, then **Run Gemini selection**. The draft arrives in Telegram.

Cron times in `vercel.json` are in UTC (IST − 5:30).

## Safety rules (by design)

- The send endpoint refuses any issue that is not `CONFIRMED`. Confirmation can only come from the owner's Telegram chat, through a two-step confirm.
- The Telegram webhook checks Telegram's secret header and ignores every chat except `TELEGRAM_CHAT_ID`.
- After confirmation, edits are locked.
- Gemini is told never to invent facts. Every pick shows Shreya its reasoning.
