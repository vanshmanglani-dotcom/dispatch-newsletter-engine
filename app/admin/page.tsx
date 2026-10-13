"use client";
import { useEffect, useRef, useState } from "react";

const DEMO_KEY = "dispatch-demo";

const JOBS: { path: string; label: string; hint: string; extra?: string; hot?: boolean; demo?: boolean }[] = [
  { path: "/api/admin/migrate", label: "Create database tables", hint: "One-time setup (safe to re-run)" },
  { path: "/api/cron/ingest", label: "Ingest now", hint: "Pull live articles from all sources", demo: true },
  { path: "/api/cron/select", extra: "&dry=1", label: "Preview Gemini picks", hint: "Dry run: nothing saved or sent", demo: true },
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
  const [loadedFor, setLoadedFor] = useState("");

  // Once a valid key is entered, load the current style guide into the box.
  useEffect(() => {
    if (!key || key === loadedFor) return;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/style?key=${encodeURIComponent(key)}`);
        if (res.ok) { const j = await res.json(); setStyle(j.content || ""); setLoadedFor(key); }
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [key, loadedFor]);

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

  const isDemo = key === DEMO_KEY;
  const [autoMsg, setAutoMsg] = useState("");
  const autoKey = () => { saveKey(DEMO_KEY); setLoadedFor(""); setAutoMsg("✓ DEMO KEY ADDED · INGEST + PREVIEW UNLOCKED"); };

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

      <div className="autokey" data-reveal>
        <button type="button" className="btn ghost" onClick={autoKey} data-magnetic data-cursor="FILL">
          <span>AUTO-ADD DEMO KEY</span><i>↓</i>
        </button>
        <span className="mono autokey-msg">{autoMsg || "Unlocks safe actions only. Sending, rebuilding and editing need the real admin key."}</span>
      </div>

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
            disabled={!!busy || !key || (isDemo && !j.demo)}
            onClick={() => run(j.path, j.label, j.extra)}
            data-cursor={key ? "RUN" : undefined}
          >
            <span className="mono job-n">{String(i).padStart(2, "0")}</span>
            <span className="job-l">{j.label}</span>
            <span className="mono job-h">{isDemo && !j.demo ? "NEEDS REAL ADMIN KEY" : j.hint}</span>
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
        <p className="muted">
          The rules Gemini follows when it picks stories and writes commentary in Shreya&apos;s voice. Enter the admin key above to load the
          current guide, edit it, then save. The next Gemini run uses the new version.
        </p>
        <textarea className="style-ta" value={style} onChange={(e) => setStyle(e.target.value)} placeholder={key ? "Loading current style guide…" : "Enter the admin key above to load the current style guide."} />
        <p style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <button className="btn" disabled={!!busy || !key || isDemo || style.length < 50} onClick={saveStyle} data-magnetic><span>SAVE STYLE GUIDE</span><i>→</i></button>
          <span className="mono muted" style={{ fontSize: 11 }}>
            {!key ? "LOCKED: ENTER ADMIN KEY ABOVE" : isDemo ? "READ-ONLY WITH DEMO KEY" : style.length < 50 ? `TOO SHORT: ${style.length}/50 CHARACTERS` : `${style.length} CHARACTERS · READY TO SAVE`}
          </span>
        </p>
      </div>
    </section>
  );
}
