"use client";
import { useEffect, useState } from "react";

const JOBS = [
  { path: "/api/admin/migrate", label: "0 · Create database tables", hint: "One-time setup (safe to re-run)" },
  { path: "/api/cron/ingest", label: "1 · Ingest now", hint: "Pull live articles from all sources" },
  { path: "/api/cron/select", label: "2 · Run Gemini selection", hint: "Build draft + send to Telegram" },
  { path: "/api/cron/select", extra: "&force=1", label: "2b · Rebuild draft", hint: "Replace a PENDING draft" },
  { path: "/api/cron/remind", label: "3 · Send reminder", hint: "Only if not confirmed" },
  { path: "/api/cron/send", extra: "&test=1", label: "4a · Send test email to me", hint: "Preview to GMAIL_USER" },
  { path: "/api/cron/send", label: "4 · Send to subscribers", hint: "Refuses unless CONFIRMED" },
  { path: "/api/telegram/setup", label: "Connect Telegram webhook", hint: "One-time setup" },
];

export default function Admin() {
  const [key, setKey] = useState("");
  const [out, setOut] = useState("Results appear here.");
  const [busy, setBusy] = useState(false);
  const [style, setStyle] = useState("");

  useEffect(() => { try { setKey(sessionStorage.getItem("dispatch-key") || ""); } catch {} }, []);
  const saveKey = (k: string) => { setKey(k); try { sessionStorage.setItem("dispatch-key", k); } catch {} };

  async function run(path: string, extra = "") {
    setBusy(true); setOut(`Running ${path}…`);
    try {
      const res = await fetch(`${path}?key=${encodeURIComponent(key)}${extra}`);
      setOut(JSON.stringify(await res.json(), null, 2));
    } catch (e) { setOut(String(e)); }
    setBusy(false);
  }
  async function saveStyle() {
    setBusy(true);
    const res = await fetch("/api/admin/style", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, content: style }) });
    setOut(JSON.stringify(await res.json(), null, 2)); setBusy(false);
  }

  return (
    <>
      <h1>Admin</h1>
      <p className="sub">Manually trigger any stage of the pipeline (the same endpoints Vercel Cron calls on schedule).</p>
      <div className="card">
        <h2>Admin key</h2>
        <input type="password" placeholder="CRON_SECRET" value={key} onChange={(e) => saveKey(e.target.value)} style={{ width: "100%" }} />
      </div>
      <div className="card">
        <h2>Run a stage</h2>
        <div className="grid">
          {JOBS.map((j) => (
            <div key={j.label}>
              <button disabled={busy || !key} onClick={() => run(j.path, j.extra)} style={{ width: "100%" }}>{j.label}</button>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{j.hint}</div>
            </div>
          ))}
        </div>
        <pre>{out}</pre>
      </div>
      <div className="card">
        <h2>Style guide</h2>
        <p className="muted">Paste Shreya&apos;s editorial voice. Leave empty to keep the current one.</p>
        <textarea value={style} onChange={(e) => setStyle(e.target.value)} placeholder="THE DISPATCH — EDITORIAL STYLE GUIDE…" />
        <p><button disabled={busy || !key || style.length < 50} onClick={saveStyle}>Save style guide</button></p>
      </div>
    </>
  );
}
