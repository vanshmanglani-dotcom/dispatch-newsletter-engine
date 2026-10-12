import { notFound } from "next/navigation";
import { getIssue, getStories } from "../../../lib/issue";
import { renderNewsletter, type StoryWithArticle } from "../../../lib/mail";

export const dynamic = "force-dynamic";

/** Web view of an issue, rendered with the exact same HTML as the email. */
export default async function IssuePage({ params }: { params: Promise<{ week: string }> }) {
  const { week } = await params;
  const issue = await getIssue(week);
  if (!issue) notFound();
  const stories = (await getStories(issue.id, ["APPROVED", "PROPOSED"])) as StoryWithArticle[];
  const { subject, html } = renderNewsletter(issue, stories, "#");
  return (
    <section className="preview-wrap">
      <a href="/#draft" className="mono tag back-top" data-scramble><span data-scramble-text>← BACK TO DRAFT</span></a>
      <h1 className="console-title" data-split style={{ fontSize: "clamp(40px,7vw,110px)" }}>Issue {issue.week_key.slice(5)}.</h1>
      <p className="mono" data-reveal style={{ fontSize: 12, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <span className="muted">SUBJECT :</span> <b>{subject}</b> <span className={`pill ${issue.status}`}>{issue.status}</span>
      </p>
      <div className="preview-frame" data-reveal="scale">
        <iframe srcDoc={html} title="Newsletter preview" />
      </div>
    </section>
  );
}
