import { createHash } from "crypto";

const STOP = new Set("a an the of to in on for and or with by at from as is are was were be its it this that after over into amid how why what new india indian startup startups".split(" "));

export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref|source|mc_)/i.test(k)) u.searchParams.delete(k);
    }
    u.hostname = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    return u.toString().replace(/\/$/, "");
  } catch {
    return raw.trim();
  }
}

export const sha1 = (s: string) => createHash("sha1").update(s).digest("hex");

export function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/\s[-|–—]\s[^-|–—]{2,40}$/, "") // strip " - Source Name" suffixes (Google News)
    .replace(/[^a-z0-9₹ ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w))
    .join(" ");
}

/** Word-set Jaccard similarity: catches the same story reported by two outlets. */
export function similarity(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}
export const NEAR_DUP = 0.6;

export function stripHtml(s: string | undefined | null, max = 400): string {
  if (!s) return "";
  const t = s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&#8217;|&rsquo;/g, "'").replace(/&#8216;|&lsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/g, '"').replace(/&#8230;/g, "…")
    .replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

export const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
