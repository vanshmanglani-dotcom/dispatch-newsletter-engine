import { NextRequest } from "next/server";
import { cronAuthorized, unauthorized, runJob } from "../../../../lib/auth";
import { db, must } from "../../../../lib/db";
import { fetchAllSources } from "../../../../lib/sources";
import { normalizeUrl, normalizeTitle, sha1, similarity, NEAR_DUP } from "../../../../lib/text";
import { weekKey } from "../../../../lib/time";
import { handleBounces } from "../../../../lib/bounces";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Mon–Wed: pull live articles from 20+ sources, dedupe, store. */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return unauthorized();
  return runJob("ingest", async () => {
    const wk = weekKey();
    const { articles, report } = await fetchAllSources();

    // Existing titles this week, for near-duplicate detection (same story, different outlet).
    const existing = must(await db().from("articles").select("title_norm").eq("week_key", wk)) as { title_norm: string }[];
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
    let inserted = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const res = must(await db().from("articles").upsert(rows.slice(i, i + 200), { onConflict: "url_hash", ignoreDuplicates: true }).select("id")) as unknown[];
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
