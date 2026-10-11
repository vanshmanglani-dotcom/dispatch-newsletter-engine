-- The Dispatch · Newsletter Intelligence Engine
-- Run this once in Supabase → SQL Editor → New query → Run.

create extension if not exists pgcrypto;

-- 1. Every article ingested Mon–Wed. url_hash is unique, so the same link is never stored twice.
create table if not exists articles (
  id            bigserial primary key,
  url           text not null,
  url_hash      text not null unique,
  title         text not null,
  title_norm    text not null,
  source        text,
  snippet       text,
  published_at  timestamptz,
  fetched_at    timestamptz not null default now(),
  week_key      text not null              -- e.g. 2026-W42 (IST)
);
create index if not exists articles_week_idx on articles (week_key);

-- 2. One row per weekly issue. Status flow: PENDING → CONFIRMED → SENDING → SENT  (or SKIPPED)
create table if not exists issues (
  id                bigserial primary key,
  week_key          text not null unique,
  status            text not null default 'PENDING'
                    check (status in ('PENDING','CONFIRMED','SENDING','SENT','SKIPPED')),
  intro             text,
  created_at        timestamptz not null default now(),
  confirmed_at      timestamptz,
  reminder_sent_at  timestamptz,
  sent_at           timestamptz
);

-- 3. Stories inside an issue. ALTERNATE rows are Gemini's ranked back-ups used by "Swap".
create table if not exists issue_stories (
  id                   bigserial primary key,
  issue_id             bigint not null references issues(id) on delete cascade,
  article_id           bigint not null references articles(id),
  position             int not null default 0,
  topic                text,
  reason               text,
  commentary           text,
  status               text not null default 'PROPOSED'
                       check (status in ('PROPOSED','APPROVED','REMOVED','SWAPPED','ALTERNATE')),
  telegram_message_id  bigint,
  unique (issue_id, article_id)
);

-- 4. Subscriber list. Bounced / unsubscribed people are never emailed again.
create table if not exists subscribers (
  id           bigserial primary key,
  email        text not null unique,
  name         text,
  status       text not null default 'active' check (status in ('active','unsubscribed','bounced')),
  unsub_token  uuid not null default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 5. One delivery row per (issue, subscriber) so a send can resume without double-sending.
create table if not exists deliveries (
  issue_id       bigint not null references issues(id) on delete cascade,
  subscriber_id  bigint not null references subscribers(id) on delete cascade,
  status         text not null default 'sent' check (status in ('sent','failed')),
  error          text,
  sent_at        timestamptz not null default now(),
  primary key (issue_id, subscriber_id)
);

-- 6. Shreya's editorial voice, used in every Gemini prompt.
create table if not exists style_guide (
  id          int primary key default 1 check (id = 1),
  content     text not null,
  updated_at  timestamptz not null default now()
);

insert into style_guide (id, content) values (1, $$
THE DISPATCH — EDITORIAL STYLE GUIDE (Shreya)

What I pick:
- Counterintuitive stories: the data says the opposite of the popular narrative.
- Under-reported stories: important but buried, ignored by the big outlets.
- Connective stories: two trends nobody else has linked (e.g. quick-commerce dark stores + tier-2 real-estate prices).
- Skip: routine funding announcements with no angle, PR puff pieces, listicles, celebrity founder gossip.

How I write commentary (2–3 lines per story):
- Open with the "so what", never a summary of the headline.
- Plain, confident, slightly wry. No hype words ("game-changer", "revolutionary", "disrupt").
- Use one concrete number or comparison when available.
- End with a question, an implication, or what to watch next.
- Indian English spelling; rupee figures in ₹ crore.
- Never invent facts that are not in the article.
$$) on conflict (id) do nothing;

-- Demo subscriber (replace with your own email to receive test issues)
-- insert into subscribers (email, name) values ('you@example.com', 'Test Reader');

-- Server-side only: the app uses the service-role key, so lock tables from the public anon key.
alter table articles      enable row level security;
alter table issues        enable row level security;
alter table issue_stories enable row level security;
alter table subscribers   enable row level security;
alter table deliveries    enable row level security;
alter table style_guide   enable row level security;
