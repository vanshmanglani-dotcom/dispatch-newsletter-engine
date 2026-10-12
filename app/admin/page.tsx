"use client";
import { useEffect, useRef, useState } from "react";

const JOBS = [
  { path: "/api/admin/migrate", label: "Create database tables", hint: "One-time setup (safe to re-run)" },
  { path: "/api/cron/ingest", label: "Ingest now", hint: "Pull live articles from all sources" },
  { path: "/api/cron/select", extra: "&dry=1", label: "Preview Gemini picks", hint: "Dry run: nothing saved or sent" },
  { path: "/api/cron/select", label: "Run Gemini selection", hint: "Build draft + send to Telegram" },
  { path: "/api/cron/select", extra: "&force=1", label: "Rebuild draft", hint: "Replace a PENDING draft" },
  { path: "/api/cron/remind", label: "Send reminder", hint: "Only if not confirmed" },
  { path: "/api/cron/send", extra: "&test=1", label: "Send test email to me", hint: "Preview to GMAIL_USER" },
  { path: "/api/cron/send", label: "Send to subscribers", hint: "Refuses unless CONFIRMED", hot: true },
  { path: "/api/telegram/setup", label: "Connect Telegram webhook", hint: "One-time setup" },
];

export default function Admin() {
  const [key, setKey] = useState("");
  const [out, setOut] = useState("Results appear here.");
  const [shown, setShown] = useState("Results appear here.");
  const [busy, setBusy] = useState<string | null>(null);
  const [style, setStyle] = useState("");
  const [last, setLast] = useState("IDLE");
  const typer = useRef(0);

  useEffect(() => { try { setKey(sessionStorage.getItem("dispatch-key") || ""); } catch {} }, []);
  const saveKey = (k: string) => { setKey(k); try { sessionStorage.setItem("dispatch-key", k); } catch {} };

  // typewriter output
  useEffect(() => {
    cancelAnimationFrame(typer.current);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || out.length > 4000) { setShown(out); return; }
    let i = 0;
    const step = () => {
      i = Math.min(out.length, i + Math.max(3, Math.ceil(out.length / 90)));
      setShown(out.slice(0, i));
      if (i < out.length) typer.current = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(typer.current);
  }, [out]);

  async function run(path: string, label: string, extra = "") {
    setBusy(label); setLast(label.toUpperCase()); setOut(`> ${path}${extra.replace("&", "?")}\n  running…`);
    try {
      const res = await fetch(`${path}?key=${encodeURIComponent(key)}${extra}`);
      setOut(`> ${path} → HTTP ${res.status}\n\n` + JSON.stringify(await res.json(), null, 2));
    } catch (e) { setOut(String(e)); }
    setBusy(null);
  }
  async function saveStyle() {
    setBusy("style");
    const res = await fetch("/api/admin/style", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, content: style }) });
    setOut(`> /api/admin/style → HTTP ${res.status}\n\n` + JSON.stringify(await res.json(), null, 2)); setBusy(null);
  }

  return (
    <section className="console">
      <span className="mono tag" data-reveal>05 · CONTROL ROOM</span>
      <h1 className="console-title" data-split>Run any stage.<br />By hand.</h1>
      <p className="muted" data-reveal style={{ maxWidth: "60ch" }}>
        The same endpoints Vercel Cron calls on schedule. Sending to subscribers still refuses unless Shreya has confirmed the issue in Telegram.
      </p>

      <label className="field console-key" data-reveal>
        <input type="password" placeholder=" " value={key} onChange={(e) => saveKey(e.target.value)} />
        <span className="mono">ADMIN KEY (CRON_SECRET)</span>
        <i className="field-line" aria-hidden />
      </label>

      <div className="jobs" data-stagger>
        {JOBS.map((j, i) => (
          <button
            key={j.label}
            className={`job ${j.hot ? "hot" : ""} ${busy === j.label ? "running" : ""}`}
            disabled={!!busy || !key}
            onClick={() => run(j.path, j.label, j.extra)}
            data-cursor={key ? "RUN" : undefined}
          >
            <span className="mono job-n">{String(i).padStart(2, "0")}</span>
            <span className="job-l">{j.label}</span>
            <span className="mono job-h">{j.hint}</span>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 28 }} data-reveal>
        <div className="term-bar mono"><span>DISPATCH://CONSOLE</span><span>LAST: <b>{last}</b></span></div>
        <pre className="term">{shown}{busy ? <span className="caret" /> : null}</pre>
      </div>

      <div style={{ marginTop: 56 }} data-reveal>
        <span className="mono tag">STYLE GUIDE</span>
        <h2 className="sec-title" style={{ margin: "12px 0 10px", fontSize: "clamp(30px,4vw,56px)" }}>Shreya&apos;s voice.</h2>
        <p className="muted">Paste her editorial voice. Leave empty to keep the current one.</p>
        <textarea className="style-ta" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="THE DISPATCH — EDITORIAL STYLE GUIDE…" />
        <p><button className="btn" disabled={!!busy || !key || style.length < 50} onClick={saveStyle} data-magnetic><span>SAVE STYLE GUIDE</span><i>→</i></button></p>
      </div>
    </section>
  );
}
