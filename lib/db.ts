import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let client: SupabaseClient | null = null;
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
  }
  return client;
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
  telegram_message_id: number | null; articles?: Article;
};

/** Throws on Supabase errors so routes fail loudly instead of silently. */
export function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}
