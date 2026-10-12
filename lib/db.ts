import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { env } from "./env";

let client: NeonQueryFunction<false, false> | null = null;

/** Tagged-template SQL against Neon Postgres over HTTPS (works in serverless). */
export function sql() {
  return (client ??= neon(env("DATABASE_URL")));
}

/** Convenience: run a query and return rows typed as T. */
export async function q<T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> {
  return (await sql()(strings, ...values)) as T[];
}
export async function one<T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T | null> {
  const rows = await q<T>(strings, ...values);
  return rows[0] ?? null;
}

export type Article = {
  id: number; url: string; url_hash: string; title: string; title_norm: string;
  source: string | null; snippet: string | null; published_at: string | null; fetched_at: string; week_key: string;
};
export type Issue = {
  id: number; week_key: string; status: "PENDING" | "CONFIRMED" | "SENDING" | "SENT" | "SKIPPED";
  intro: string | null; created_at: string; confirmed_at: string | null; reminder_sent_at: string | null; sent_at: string | null;
};
export type Story = {
  id: number; issue_id: number; article_id: number; position: number; topic: string | null;
  reason: string | null; commentary: string | null;
  status: "PROPOSED" | "APPROVED" | "REMOVED" | "SWAPPED" | "ALTERNATE";
  telegram_message_id: number | null;
};
