import { NextRequest } from "next/server";
import { cronAuthorized, demoAuthorized, unauthorized, runJob } from "../../../../lib/auth";
import { q } from "../../../../lib/db";
import { fetchAllSources } from "../../../../lib/sources";
import { normalizeUrl, normalizeTitle, sha1, similarity, NEAR_DUP } from "../../../../lib/text";
import { weekKey } from "../../../../lib/time";
import { handleBounces } from "../../../../lib/bounces";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Mon–Wed: pull live articles from 20+ sources, dedupe, store. */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req) && !demoAuthorized(req)) return unauthorized();
  return runJob("ingest", async () => {
    const wk = weekKey();
    const { articles, report } = await fetchAllSources();

    // Existing titles this week, for near-duplicate detection (same story, different outlet).
    const existing = await q<{ title_norm: string }>`select title_norm from articles where week_key = ${wk}`;
    const seenNorms = existing.map((e) => e.title_norm);
    const seenHashes = new Set<string>();

    const rows = [];
    let nearDup = 0;
    for (const a of articles) {
      const url = normalizeUrl(a.url);
      const url_hash = sha1(url);
      const title_norm = normalizeTitle(a.title);
      if (!title_norm || seenHashes.has(url_hash)) continue;
      if (seenNorms.some((n) => similarity(n, title_norm) >= NEAR_DUP)) { nearDup++; continue; }
      seenHashes.add(url_hash);
      seenNorms.push(title_norm);
      rows.push({ url, url_hash, title: a.title.slice(0, 300), title_norm, source: a.source, snippet: a.snippet, published_at: a.published_at, week_key: wk });
    }

    // url_hash is UNIQUE: links stored in any earlier run/week are silently skipped.
    // One bulk insert (unnest arrays). url_hash is UNIQUE: links stored in any earlier run/week are skipped.
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 250) {
      const b = rows.slice(i, i + 250);
      const res = await q`
        insert into articles (url, url_hash, title, title_norm, source, snippet, published_at, week_key)
        select * from unnest(
          ${b.map((r) => r.url)}::text[], ${b.map((r) => r.url_hash)}::text[], ${b.map((r) => r.title)}::text[],
          ${b.map((r) => r.title_norm)}::text[], ${b.map((r) => r.source)}::text[], ${b.map((r) => r.snippet)}::text[],
          ${b.map((r) => r.published_at)}::timestamptz[], ${b.map((r) => r.week_key)}::text[])
        on conflict (url_hash) do nothing returning id`;
      inserted += res.length;
    }

    const bounces = await handleBounces().catch((e) => ({ skipped: (e as Error).message }));
    return {
      week: wk, fetched: articles.length, near_duplicates_skipped: nearDup, new_articles: inserted,
      already_stored: rows.length - inserted, sources_ok: report.filter((r) => r.ok).length,
      sources_failed: report.filter((r) => !r.ok), bounces,
    };
  });
}
