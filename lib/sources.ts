import Parser from "rss-parser";
import { optEnv } from "./env";
import { stripHtml } from "./text";

export type RawArticle = {
  url: string;
  title: string;
  source: string;
  snippet: string;
  published_at: string | null;
};

const gnews = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}+when:7d&hl=en-IN&gl=IN&ceid=IN:en`;

/** 20+ live sources: Indian startup/tech outlets + Google News topic queries. */
export const RSS_SOURCES: { name: string; url: string }[] = [
  { name: "Inc42", url: "https://inc42.com/feed/" },
  { name: "Entrackr (via Google News)", url: gnews("site:entrackr.com") },
  { name: "YourStory", url: "https://yourstory.com/feed" },
  { name: "ET Tech – Startups", url: "https://economictimes.indiatimes.com/tech/startups/rssfeeds/78570540.cms" },
  { name: "ET Tech – Funding", url: "https://economictimes.indiatimes.com/tech/funding/rssfeeds/78570550.cms" },
  { name: "Medianama", url: "https://www.medianama.com/feed/" },
  { name: "TechCrunch India", url: "https://techcrunch.com/tag/india/feed/" },
  { name: "Livemint Companies", url: "https://www.livemint.com/rss/companies" },
  { name: "Moneycontrol Startups (via Google News)", url: gnews("site:moneycontrol.com startup") },
  { name: "Business Standard Startups (via Google News)", url: gnews("site:business-standard.com startup") },
  { name: "The Hindu BusinessLine", url: "https://www.thehindubusinessline.com/news/feeder/default.rss" },
  { name: "Rest of World", url: "https://restofworld.org/feed/latest/" },
  { name: "Google News: Indian startup funding", url: gnews("Indian startup funding") },
  { name: "Google News: India startup layoffs", url: gnews("India startup layoffs") },
  { name: "Google News: India IPO tech", url: gnews("India tech IPO") },
  { name: "Google News: quick commerce India", url: gnews("quick commerce India") },
  { name: "Google News: India fintech RBI", url: gnews("India fintech RBI") },
  { name: "Google News: India D2C brands", url: gnews("India D2C brand") },
  { name: "Google News: India SaaS", url: gnews("Indian SaaS company") },
  { name: "Google News: India AI startup", url: gnews("India AI startup") },
  { name: "Google News: India EV startup", url: gnews("India EV startup") },
  { name: "Google News: India venture capital", url: gnews("India venture capital fund") },
  { name: "Google News: ONDC UPI", url: gnews("ONDC OR UPI startup") },
];

const GNEWS_QUERIES = ["Indian startup", "India venture capital", "India unicorn"];

const parser = new Parser({
  timeout: 10000,
  headers: { "User-Agent": "Mozilla/5.0 (compatible; DispatchBot/1.0; +newsletter curation)" },
});

async function fetchRss(src: { name: string; url: string }): Promise<RawArticle[]> {
  const feed = await parser.parseURL(src.url);
  const isGoogle = src.url.includes("news.google.com");
  return (feed.items || []).slice(0, 25).map((it) => {
    // Google News titles look like "Headline - Publisher"; keep the publisher as the source.
    let title = (it.title || "").trim();
    let source = src.name;
    if (isGoogle) {
      const m = title.match(/^(.*)\s-\s([^-]{2,60})$/);
      if (m) { title = m[1].trim(); source = m[2].trim(); }
    }
    return {
      url: it.link || "",
      title,
      source,
      snippet: stripHtml(it.contentSnippet || it.content || it.summary || "", 400),
      published_at: it.isoDate || (it.pubDate ? new Date(it.pubDate).toISOString() : null),
    };
  });
}

async function fetchGNewsApi(q: string, key: string): Promise<RawArticle[]> {
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}&lang=en&country=in&max=10&apikey=${key}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`GNews ${res.status}`);
  const json = (await res.json()) as { articles?: { url: string; title: string; description?: string; publishedAt?: string; source?: { name?: string } }[] };
  return (json.articles || []).map((a) => ({
    url: a.url, title: a.title, source: a.source?.name || "GNews",
    snippet: stripHtml(a.description, 400), published_at: a.publishedAt || null,
  }));
}

/** Fetch every source in parallel; one broken feed never breaks the run. */
export async function fetchAllSources() {
  const jobs: { name: string; run: () => Promise<RawArticle[]> }[] = RSS_SOURCES.map((s) => ({ name: s.name, run: () => fetchRss(s) }));
  const key = optEnv("GNEWS_API_KEY");
  if (key) for (const q of GNEWS_QUERIES) jobs.push({ name: `GNews API: ${q}`, run: () => fetchGNewsApi(q, key) });

  const settled = await Promise.allSettled(jobs.map((j) => j.run()));
  const articles: RawArticle[] = [];
  const report: { source: string; ok: boolean; count: number; error?: string }[] = [];
  const weekAgo = Date.now() - 8 * 86400000;
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      const fresh = r.value.filter((a) => a.url && a.title && (!a.published_at || Date.parse(a.published_at) > weekAgo));
      articles.push(...fresh);
      report.push({ source: jobs[i].name, ok: true, count: fresh.length });
    } else {
      report.push({ source: jobs[i].name, ok: false, count: 0, error: String(r.reason?.message || r.reason).slice(0, 120) });
    }
  });
  return { articles, report };
}
