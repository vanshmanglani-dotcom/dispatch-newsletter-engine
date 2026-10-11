import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { env } from "./env";

export type Candidate = { id: number; title: string; source: string | null; snippet: string | null; published_at: string | null };

const Pick = z.object({
  article_id: z.number().int(),
  topic: z.string().min(2).max(40),
  reason: z.string().min(5).max(300),
  commentary: z.string().min(20).max(700),
});
const Selection = z.object({
  intro: z.string().min(10).max(600),
  stories: z.array(Pick),
  alternates: z.array(Pick).default([]),
});
export type SelectionT = z.infer<typeof Selection>;
export type PickT = z.infer<typeof Pick>;

let ai: GoogleGenAI | null = null;
const client = () => (ai ??= new GoogleGenAI({ apiKey: env("GEMINI_API_KEY") }));
const model = () => process.env.GEMINI_MODEL || "gemini-flash-latest";

async function askJSON(prompt: string): Promise<unknown> {
  const res = await client().models.generateContent({
    model: model(),
    contents: prompt,
    config: { responseMimeType: "application/json", temperature: 0.6 },
  });
  const text = res.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Gemini did not return JSON");
    return JSON.parse(m[0]);
  }
}

const list = (c: Candidate[]) =>
  c.map((a) => `[${a.id}] ${a.title} — ${a.source ?? "?"}${a.snippet ? `\n     ${a.snippet.slice(0, 280)}` : ""}`).join("\n");

/** Hard rules are checked in code, not trusted to the model. Returns a list of problems (empty = valid). */
export function validateSelection(sel: SelectionT, candidateIds: Set<number>): string[] {
  const problems: string[] = [];
  const ids = sel.stories.map((s) => s.article_id);
  if (ids.length < 8 || ids.length > 10) problems.push(`Must pick 8–10 stories, got ${ids.length}.`);
  if (new Set(ids).size !== ids.length) problems.push("Duplicate article_id in stories.");
  const bad = [...ids, ...sel.alternates.map((a) => a.article_id)].filter((id) => !candidateIds.has(id));
  if (bad.length) problems.push(`These ids are not in the candidate list: ${bad.join(", ")}.`);
  const topics = new Set(sel.stories.map((s) => s.topic.trim().toLowerCase()));
  if (topics.size < 3) problems.push(`Stories must span at least 3 distinct topics, got ${topics.size}.`);
  return problems;
}

export async function selectStories(candidates: Candidate[], styleGuide: string, recentTitles: string[]): Promise<SelectionT> {
  const ids = new Set(candidates.map((c) => c.id));
  let feedback = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const prompt = `You are the editorial assistant for "The Dispatch", a weekly newsletter on the Indian startup ecosystem written by Shreya.
Your job is to PROPOSE a draft. Shreya makes every final decision.

## Shreya's style guide
${styleGuide}

## Headlines already covered in the last 4 issues (do NOT pick these or the same underlying story)
${recentTitles.length ? recentTitles.map((t) => `- ${t}`).join("\n") : "- (none yet)"}

## This week's candidate articles (id, title, source, snippet)
${list(candidates)}

## Task
1. Pick 8 to 10 stories with the highest signal-to-noise relative to THIS week's batch: counterintuitive, under-reported, or connecting two trends. Avoid routine funding announcements unless there is a real angle.
2. Together they must span AT LEAST 3 different topic areas (e.g. Fintech, Quick commerce, Policy, Funding & VC, SaaS, AI, Mobility, Layoffs & talent, D2C, Public markets).
3. Never pick two articles about the same event.
4. For each pick write 2–3 lines of commentary in Shreya's voice (follow the style guide exactly; use only facts present in the title/snippet — do not invent numbers).
5. Give a one-line "reason" explaining why this story deserves a slot (Shreya sees this, readers don't).
6. Also give 5 ranked "alternates" (same fields) she can swap in.
7. Write a 1–2 sentence "intro" for the issue in her voice.

Return ONLY JSON:
{"intro": string, "stories": [{"article_id": number, "topic": string, "reason": string, "commentary": string}], "alternates": [same shape]}
${feedback}`;
    const parsed = Selection.safeParse(await askJSON(prompt));
    if (!parsed.success) {
      feedback = `\nYour previous answer had an invalid shape: ${parsed.error.issues.slice(0, 3).map((i) => i.message).join("; ")}. Fix it.`;
      continue;
    }
    const sel = parsed.data;
    sel.alternates = sel.alternates.filter((a) => ids.has(a.article_id) && !sel.stories.some((s) => s.article_id === a.article_id));
    const problems = validateSelection(sel, ids);
    if (!problems.length) return sel;
    feedback = `\nYour previous answer broke these rules — fix them:\n- ${problems.join("\n- ")}`;
  }
  throw new Error("Gemini could not produce a valid selection after 3 attempts");
}

/** Used by "Swap" when no pre-computed alternate is left. */
export async function pickReplacement(candidates: Candidate[], styleGuide: string, currentTopics: string[], removedTitle: string): Promise<PickT> {
  const prompt = `You are the editorial assistant for "The Dispatch" (Indian startup newsletter by Shreya).
Shreya rejected this story: "${removedTitle}". Suggest ONE replacement from the candidates below, preferably adding topic diversity (current topics: ${currentTopics.join(", ")}).

## Style guide
${styleGuide}

## Candidates
${list(candidates)}

Return ONLY JSON: {"article_id": number, "topic": string, "reason": string, "commentary": string} (commentary: 2–3 lines in Shreya's voice, no invented facts).`;
  const p = Pick.parse(await askJSON(prompt));
  if (!candidates.some((c) => c.id === p.article_id)) throw new Error("Gemini picked an unknown article");
  return p;
}
