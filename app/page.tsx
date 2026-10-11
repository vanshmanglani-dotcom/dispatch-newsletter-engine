import { db, type Article, type Issue } from "../lib/db";
import { getStories } from "../lib/issue";
import { weekKey, fmtIST } from "../lib/time";

export const dynamic = "force-dynamic";

async function load() {
  const wk = weekKey();
  const d = db();
  const [arts, weekArts, issueRes, subs, recentArts, pastIssues] = await Promise.all([
    d.from("articles").select("id", { count: "exact", head: true }),
    d.from("articles").select("id", { count: "exact", head: true }).eq("week_key", wk),
    d.from("issues").select("*").eq("week_key", wk).maybeSingle(),
    d.from("subscribers").select("status"),
    d.from("articles").select("*").order("fetched_at", { ascending: false }).limit(15),
    d.from("issues").select("*").order("week_key", { ascending: false }).limit(6),
  ]);
  const issue = issueRes.data as Issue | null;
  const stories = issue ? await getStories(issue.id, ["PROPOSED", "APPROVED", "REMOVED"]) : [];
  const subRows = (subs.data ?? []) as { status: string }[];
  return {
    wk, total: arts.count ?? 0, week: weekArts.count ?? 0, issue, stories,
    active: subRows.filter((s) => s.status === "active").length,
    inactive: subRows.filter((s) => s.status !== "active").length,
    recent: (recentArts.data ?? []) as Article[], past: (pastIssues.data ?? []) as Issue[],
  };
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ sub?: string }> }) {
  const sp = await searchParams;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return <div className="notice">Setup needed: add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables, then redeploy.</div>;
  }
  let data;
  try { data = await load(); } catch (e) {
    return <div className="notice">Database error: {(e as Error).message}. Did you run supabase/schema.sql?</div>;
  }
  const { wk, total, week, issue, stories, active, inactive, recent, past } = data;
  const live = stories.filter((s) => s.status !== "REMOVED");
  const topics = new Set(live.map((s) => s.topic)).size;

  return (
    <>
      <h1>This week · {wk}</h1>
      <p className="sub">Ingest Mon–Wed → Gemini Flash editorial pass Wed 3 PM → Shreya approves on Telegram → email Thu 8 AM (only if confirmed).</p>

      <div className="grid">
        <div className="card stat"><div className="n">{week}</div><div className="l">articles ingested this week</div></div>
        <div className="card stat"><div className="n">{total}</div><div className="l">articles stored (all weeks, deduped)</div></div>
        <div className="card stat"><div className="n">{issue ? <span className={`pill ${issue.status}`}>{issue.status}</span> : "—"}</div><div className="l">this week&apos;s issue</div></div>
        <div className="card stat"><div className="n">{active}</div><div className="l">active subscribers · {inactive} bounced/unsubscribed</div></div>
      </div>

      <div className="card">
        <h2>Pipeline</h2>
        <div className="flow">
          <span><b>1</b> Cron ingest (Mon–Wed 9 AM)</span>
          <span><b>2</b> Dedup: URL + headline, this week &amp; last 4 issues</span>
          <span><b>3</b> Gemini picks 8–10 · ≥3 topics (Wed 3 PM)</span>
          <span><b>4</b> Rule check in code</span>
          <span><b>5</b> Telegram: approve / edit / swap</span>
          <span><b>6</b> Reminder Wed 10 PM if unconfirmed</span>
          <span><b>7</b> Email Thu 8 AM — only if CONFIRMED</span>
        </div>
      </div>

      <div className="two">
        <div className="card">
          <h2>Draft {issue ? `· ${live.length} stories · ${topics} topics` : ""}</h2>
          {!issue && <p className="muted">No draft yet. Gemini builds it Wednesday 3 PM IST (or trigger “Select” in Admin).</p>}
          {issue?.intro && <p style={{ fontFamily: "Georgia, serif", fontStyle: "italic" }}>{issue.intro}</p>}
          {stories.map((s, i) => (
            <div className="story" key={s.id} style={s.status === "REMOVED" ? { opacity: 0.45 } : undefined}>
              <div className="meta">{i + 1} · {s.topic} · <span className={`pill ${s.status}`}>{s.status}</span></div>
              <a className="t" href={s.articles.url} target="_blank" rel="noreferrer">{s.articles.title}</a>
              <div className="c">{s.commentary}</div>
              <div className="why">Why Gemini picked it: {s.reason} · {s.articles.source}</div>
            </div>
          ))}
          {issue && <p><a href={`/issue/${issue.week_key}`}>View email preview →</a></p>}
        </div>

        <div>
          <div className="card">
            <h2>Subscribe</h2>
            {sp.sub === "ok" && <div className="notice">You&apos;re subscribed.</div>}
            {sp.sub === "invalid" && <div className="notice">Please enter a valid email.</div>}
            <form className="inline" action="/api/subscribe" method="post">
              <input name="email" type="email" placeholder="you@email.com" required style={{ flex: 1 }} />
              <button>Subscribe</button>
            </form>
          </div>
          <div className="card">
            <h2>Past issues</h2>
            <table><tbody>
              {past.map((p) => (
                <tr key={p.id}><td><a href={`/issue/${p.week_key}`}>{p.week_key}</a></td><td><span className={`pill ${p.status}`}>{p.status}</span></td><td className="muted">{fmtIST(p.sent_at || p.created_at)}</td></tr>
              ))}
              {!past.length && <tr><td className="muted">None yet</td></tr>}
            </tbody></table>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Latest ingested articles (live)</h2>
        <table>
          <thead><tr><th>Title</th><th>Source</th><th>Fetched</th></tr></thead>
          <tbody>
            {recent.map((a) => (
              <tr key={a.id}><td><a href={a.url} target="_blank" rel="noreferrer">{a.title}</a></td><td className="muted">{a.source}</td><td className="muted">{fmtIST(a.fetched_at)}</td></tr>
            ))}
            {!recent.length && <tr><td className="muted" colSpan={3}>Nothing yet — run Ingest from Admin.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
