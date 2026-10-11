/** All scheduling logic is in IST (Asia/Kolkata, UTC+5:30, no DST). */
const IST_OFFSET_MS = 330 * 60 * 1000;

export function nowIST(d = new Date()): Date {
  return new Date(d.getTime() + IST_OFFSET_MS); // read with getUTC* methods
}

/** ISO week key in IST, e.g. "2026-W42". Mon–Sun belong to the same key. */
export function weekKey(d = new Date()): string {
  const t = nowIST(d);
  const date = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function fmtIST(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
}
