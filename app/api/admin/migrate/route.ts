import { NextRequest, NextResponse } from "next/server";
import { cronAuthorized, unauthorized } from "../../../../lib/auth";
import { sql } from "../../../../lib/db";
import { SCHEMA_SQL, splitStatements } from "../../../../lib/schema";

export const dynamic = "force-dynamic";

/** One-time: GET /api/admin/migrate?key=CRON_SECRET creates all tables (safe to re-run). */
export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) return unauthorized();
  const stmts = splitStatements(SCHEMA_SQL);
  const done: string[] = [];
  try {
    for (const s of stmts) {
      await sql().query(s);
      done.push(s.split("\n")[0].slice(0, 70));
    }
    const tables = await sql()`select table_name from information_schema.tables where table_schema = 'public' order by 1`;
    return NextResponse.json({ ok: true, statements: done.length, tables: tables.map((t) => (t as { table_name: string }).table_name) });
  } catch (e) {
    return NextResponse.json({ ok: false, done, error: (e as Error).message }, { status: 500 });
  }
}
