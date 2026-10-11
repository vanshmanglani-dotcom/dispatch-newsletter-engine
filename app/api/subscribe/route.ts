import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const parsed = z.object({ email: z.string().email().max(200), name: z.string().max(100).optional() })
    .safeParse({ email: String(form.get("email") || "").trim().toLowerCase(), name: String(form.get("name") || "") || undefined });
  if (!parsed.success) return NextResponse.redirect(new URL("/?sub=invalid", req.url), 303);
  const { error } = await db().from("subscribers")
    .upsert({ ...parsed.data, status: "active", updated_at: new Date().toISOString() }, { onConflict: "email" });
  return NextResponse.redirect(new URL(error ? "/?sub=error" : "/?sub=ok", req.url), 303);
}
