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
    <>
      <p className="sub">Subject: <b>{subject}</b> · status <span className={`pill ${issue.status}`}>{issue.status}</span></p>
      <iframe srcDoc={html} title="Newsletter preview" style={{ width: "100%", height: "80vh", border: "1px solid #ddd", borderRadius: 8, background: "#fff" }} />
    </>
  );
}
