import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { q } from "../../../lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const parsed = z.object({ email: z.string().email().max(200), name: z.string().max(100).optional() })
    .safeParse({ email: String(form.get("email") || "").trim().toLowerCase(), name: String(form.get("name") || "") || undefined });
  if (!parsed.success) return NextResponse.redirect(new URL("/?sub=invalid", req.url), 303);
  try {
    await q`insert into subscribers (email, name) values (${parsed.data.email}, ${parsed.data.name ?? null})
            on conflict (email) do update set status = 'active', updated_at = now()`;
    return NextResponse.redirect(new URL("/?sub=ok", req.url), 303);
  } catch {
    return NextResponse.redirect(new URL("/?sub=error", req.url), 303);
  }
}
