import { q, one, type Article, type Issue } from "../lib/db";
import { getStories } from "../lib/issue";
import { weekKey, fmtIST } from "../lib/time";
import { RSS_SOURCES } from "../lib/sources";

export const dynamic = "force-dynamic";

async function load() {
  const wk = weekKey();
  const [counts, issue, subs, recent, past] = await Promise.all([
    one<{ total: number; week: number }>`select count(*)::int as total, count(*) filter (where week_key = ${wk})::int as week from articles`,
    one<Issue>`select * from issues where week_key = ${wk}`,
    q<{ status: string; n: number }>`select status, count(*)::int as n from subscribers group by status`,
    q<Article>`select * from articles order by fetched_at desc limit 15`,
    q<Issue>`select * from issues order by week_key desc limit 6`,
  ]);
  const stories = issue ? await getStories(issue.id, ["PROPOSED", "APPROVED", "REMOVED"]) : [];
  const active = subs.find((s) => s.status === "active")?.n ?? 0;
  const inactive = subs.filter((s) => s.status !== "active").reduce((a, s) => a + s.n, 0);
  return { wk, total: counts?.total ?? 0, week: counts?.week ?? 0, issue, stories, active, inactive, recent, past };
}

const STAGES = [
  { t: "INGEST", when: "MON–WED · 09:00 IST", d: "Cron wakes up and pulls every live source: Indian startup outlets plus Google News topic queries. One broken feed never breaks the run." },
  { t: "DEDUPE", when: "ON EVERY RUN", d: "Each link is hashed and stored once, ever. Near-identical headlines from two outlets collapse into one. Anything in the last four issues is set aside." },
  { t: "SELECT", when: "WED · 15:00 IST", d: "Gemini Flash reads the week's pool and proposes 8–10 high-signal stories across at least three topics, with commentary in Shreya's voice." },
  { t: "VERIFY", when: "INSTANTLY", d: "The rules are checked in code, not trusted to the model: count, topic spread, no repeats, real IDs. If anything fails, Gemini tries again." },
  { t: "REVIEW", when: "WED · EVENING", d: "Every story lands in Telegram with Approve, Swap and Remove. Reply to a story to rewrite its commentary. The judgment stays hers." },
  { t: "REMIND", when: "WED · 22:00 IST", d: "Still unconfirmed? A single nudge. Never a send. Silence means the issue simply does not go out." },
  { t: "SEND", when: "THU · 08:00 IST", d: "Only a CONFIRMED issue is emailed, in batches, with one-click unsubscribe. Bounces are read back from Gmail and never mailed again." },
];

const pad = (n: number, l = 2) => String(n).padStart(l, "0");

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ sub?: string }> }) {
  const sp = await searchParams;
  if (!process.env.DATABASE_URL) {
    return <div className="notice">Setup needed: add the DATABASE_URL (Neon) environment variable, then redeploy.</div>;
  }
  let data;
  try { data = await load(); } catch (e) {
    return <div className="notice">Database error: {(e as Error).message}. Did you run db/schema.sql in Neon?</div>;
  }
  const { wk, total, week, issue, stories, active, inactive, recent, past } = data;
  const live = stories.filter((s) => s.status !== "REMOVED");
  const topics = new Set(live.map((s) => s.topic)).size;
  const approved = live.filter((s) => s.status === "APPROVED").length;
  const statusIdx = !issue ? 1 : issue.status === "PENDING" ? 4 : issue.status === "CONFIRMED" ? 6 : issue.status === "SENT" ? 7 : 6;

  return (
    <>
      {/* ================= HERO ================= */}
      <section className="hero sec">
        <div className="hero-top">
          <span className="mono tag" data-reveal>VOL. {wk.slice(0, 4)} / ISSUE {wk.slice(5)}</span>
          <span className="mono tag live-tag" data-reveal><i className="pulse" /> LIVE PIPELINE</span>
        </div>

        <h1 className="hero-title" data-split>
          The machine reads.<br /><span className="accent-word">Shreya</span> decides.
        </h1>

        <div className="hero-grid">
          <p className="hero-lede" data-reveal>
            An editorial intelligence engine for <b>The Dispatch</b>. It reads the Indian startup web all week, drafts the issue with Gemini Flash,
            and then waits. Nothing reaches a single inbox until a human says so.
          </p>

          <dl className="spec mono" data-reveal="left">
            <div><dt>WEEK</dt><dd>: {wk}</dd></div>
            <div><dt>STATUS</dt><dd>: {issue ? <span className={`pill ${issue.status}`}>{issue.status}</span> : "AWAITING DRAFT"}</dd></div>
            <div><dt>SOURCES</dt><dd>: {RSS_SOURCES.length} LIVE FEEDS</dd></div>
            <div><dt>MODEL</dt><dd>: GEMINI FLASH</dd></div>
            <div><dt>GATE</dt><dd>: TELEGRAM · HUMAN CONFIRM</dd></div>
          </dl>

          <ol className="boot mono" data-stagger>
            {STAGES.map((s, i) => (
              <li key={s.t} className={i < statusIdx ? "ok" : i === statusIdx ? "now" : ""}>
                <span>{pad(i + 1, 3)}</span> {s.t}
                <em>{i < statusIdx ? "DONE" : i === statusIdx ? "NOW" : "—"}</em>
              </li>
            ))}
          </ol>
        </div>

        <div className="stats">
          {[
            { n: week, l: "ARTICLES THIS WEEK" },
            { n: total, l: "STORED · DEDUPED" },
            { n: live.length, l: `STORIES IN DRAFT · ${topics} TOPICS` },
            { n: active, l: `ACTIVE READERS · ${inactive} OFF` },
          ].map((s, i) => (
            <div className="stat" key={s.l} data-reveal style={{ ["--d" as string]: `${i * 90}ms` }}>
              <span className="mono stat-i">{pad(i + 1)}</span>
              <span className="stat-n" data-count={s.n}>0</span>
              <span className="mono stat-l">{s.l}</span>
            </div>
          ))}
        </div>

        {recent.length > 0 && (
          <div className="marquee" aria-label="Latest ingested headlines">
            <div className="marquee-track">
              {[0, 1].map((k) => (
                <div className="marquee-set" key={k} aria-hidden={k === 1}>
                  {recent.map((a) => (
                    <span key={`${k}-${a.id}`}><b className="mono">{(a.source ?? "").toUpperCase()}</b> {a.title}<i>✦</i></span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ================= PIPELINE (pinned) ================= */}
      <section id="pipeline" className="pin" data-pin={STAGES.length}>
        <div className="pin-stage">
          <div className="pin-head">
            <span className="mono tag">THE PIPELINE</span>
            <span className="mono tag">STAGE <b data-step-num>01</b> / {pad(STAGES.length)}</span>
          </div>
          <div className="pin-body">
            <div className="pin-big" aria-hidden>
              {STAGES.map((s, i) => <span key={s.t} data-step={i} className={i === 0 ? "active" : ""}>{pad(i + 1)}</span>)}
            </div>
            <div className="pin-copy">
              {STAGES.map((s, i) => (
                <article key={s.t} data-step={i} className={`pin-card ${i === 0 ? "active" : ""}`}>
                  <span className="mono when">{s.when}</span>
                  <h3>{s.t}</h3>
                  <p>{s.d}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="rail" aria-hidden>
            <div className="rail-line"><span /></div>
            {STAGES.map((s, i) => (
              <div key={s.t} className="rail-node" data-step={i} style={{ left: `${(i / (STAGES.length - 1)) * 100}%` }}>
                <i /><span className="mono">{s.t}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================= STATEMENT ================= */}
      <section className="statement sec">
        <span className="mono tag" data-reveal>THE ONE RULE</span>
        <p className="scrub" data-scrub>NOTHING SENDS UNTIL SHE SAYS SO. THE AI PROPOSES. THE EDITOR DISPOSES.</p>
      </section>

      {/* ================= DRAFT ================= */}
      <section id="draft" className="sec draft">
        <div className="sec-head">
          <span className="mono tag" data-reveal>02 · THIS WEEK&apos;S DRAFT</span>
          <h2 className="sec-title" data-split>{issue ? `${live.length} stories. ${topics} topics.` : "Waiting for Wednesday."}</h2>
          {issue && (
            <div className="draft-meter mono" data-reveal>
              <span>APPROVED {approved}/{live.length}</span>
              <div className="meter"><span style={{ width: `${live.length ? (approved / live.length) * 100 : 0}%` }} /></div>
              <span className={`pill ${issue.status}`}>{issue.status}</span>
            </div>
          )}
        </div>

        {!issue && (
          <p className="empty" data-reveal>No draft yet. Gemini builds it Wednesday 3 PM IST, or trigger <a href="/admin">Select</a> in Admin.</p>
        )}

        {issue?.intro && (
          <blockquote className="intro" data-reveal="clip">
            <span className="q" aria-hidden>“</span>{issue.intro}
          </blockquote>
        )}

        <div className="cards">
          {stories.map((s, i) => (
            <article
              key={s.id}
              className={`card ${s.status === "REMOVED" ? "removed" : ""}`}
              data-tilt data-reveal style={{ ["--d" as string]: `${(i % 2) * 120}ms` }}
            >
              <div className="card-glow" aria-hidden />
              <header className="card-top">
                <span className="card-n" aria-hidden>{pad(i + 1)}</span>
                <span className="mono card-topic">{s.topic}</span>
                <span className={`pill ${s.status}`}>{s.status}</span>
              </header>
              <a className="card-title" href={s.articles.url} target="_blank" rel="noreferrer" data-cursor="READ">{s.articles.title}</a>
              <p className="card-c">{s.commentary}</p>
              <p className="card-why"><span className="mono">WHY →</span> {s.reason}</p>
              <footer className="card-foot mono">
                <span>{s.articles.source}</span>
                <a href={s.articles.url} target="_blank" rel="noreferrer" className="arrow-link">READ <i>→</i></a>
              </footer>
              <span className="corner c1" aria-hidden /><span className="corner c2" aria-hidden />
            </article>
          ))}
        </div>

        {issue && (
          <a className="big-link" href={`/issue/${issue.week_key}`} data-magnetic data-cursor="PREVIEW">
            <span className="mono">VIEW EMAIL PREVIEW</span><i>→</i>
          </a>
        )}
      </section>

      {/* ================= SUBSCRIBE + ARCHIVE ================= */}
      <section id="archive" className="sec split">
        <div className="sub-box" data-reveal>
          <span className="mono tag">03 · SUBSCRIBE</span>
          <h2 className="sec-title" data-split>Get the Dispatch.</h2>
          <p className="muted">Eight to ten stories, every Thursday. Picked by a machine, approved by a human.</p>
          {sp.sub === "ok" && <div className="notice ok">✓ You&apos;re subscribed. See you Thursday.</div>}
          {sp.sub === "invalid" && <div className="notice">Please enter a valid email.</div>}
          {sp.sub === "error" && <div className="notice">Something went wrong. Try again.</div>}
          <form className="sub-form" action="/api/subscribe" method="post">
            <label className="field">
              <input name="email" type="email" placeholder=" " required />
              <span className="mono">YOUR EMAIL</span>
              <i className="field-line" aria-hidden />
            </label>
            <button className="btn" data-magnetic><span>SUBSCRIBE</span><i>→</i></button>
          </form>
        </div>

        <div className="archive" data-reveal>
          <span className="mono tag">ARCHIVE</span>
          <ul className="rows" data-stagger>
            {past.map((p) => (
              <li key={p.id}>
                <a href={`/issue/${p.week_key}`} className="row" data-cursor="OPEN">
                  <span className="mono row-k">{p.week_key}</span>
                  <span className={`pill ${p.status}`}>{p.status}</span>
                  <span className="mono muted row-t">{fmtIST(p.sent_at || p.created_at)}</span>
                  <i className="row-arrow">→</i>
                </a>
              </li>
            ))}
            {!past.length && <li className="muted">No issues yet</li>}
          </ul>
        </div>
      </section>

      {/* ================= WIRE ================= */}
      <section id="wire" className="sec wire">
        <div className="sec-head">
          <span className="mono tag" data-reveal>04 · THE WIRE</span>
          <h2 className="sec-title" data-split>Freshly ingested. Live.</h2>
        </div>
        <ol className="wire-list" data-stagger>
          {recent.map((a, i) => (
            <li key={a.id}>
              <a href={a.url} target="_blank" rel="noreferrer" className="wire-row" data-cursor="OPEN">
                <span className="mono wire-i">{pad(i + 1, 3)}</span>
                <span className="wire-t">{a.title}</span>
                <span className="mono wire-s" data-scramble><span data-scramble-text>{(a.source ?? "").toUpperCase()}</span></span>
                <span className="mono muted wire-d">{fmtIST(a.fetched_at)}</span>
              </a>
            </li>
          ))}
          {!recent.length && <li className="muted">Nothing yet. Run Ingest from Admin.</li>}
        </ol>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="foot">
        <div className="foot-mark" aria-hidden data-reveal="up">
          {"THE DISPATCH".split("").map((c, i) => <span key={i} style={{ ["--i" as string]: i }}>{c === " " ? " " : c}</span>)}
        </div>
        <div className="foot-row mono">
          <span>GEMINI FLASH · NEON · TELEGRAM · GMAIL · VERCEL</span>
          <span>MESA C4 · PROBLEM 17</span>
          <a href="#" data-scramble className="back-top"><span data-scramble-text>BACK TO TOP</span> ↑</a>
        </div>
      </footer>
    </>
  );
}
