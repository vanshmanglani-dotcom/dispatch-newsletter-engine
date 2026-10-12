"use client";
import { useEffect, useRef, useState } from "react";

const LOG = [
  "001 WAKE CRON SCHEDULER",
  "002 FETCH 23 LIVE SOURCES",
  "003 HASH + DEDUPE ARTICLES",
  "004 LOAD STYLE_GUIDE.MD",
  "005 CHECK LAST 4 ISSUES",
  "006 WARM GEMINI FLASH",
  "007 OPEN TELEGRAM CHANNEL",
  "008 LOCK SEND BUTTON",
  "009 HAND CONTROL TO EDITOR",
];

/** One-time-per-session intro: a front page drawn in line art, a red scan line, a boot log. */
export default function Loader() {
  const [state, setState] = useState<"hidden" | "run" | "out">("hidden");
  const [pct, setPct] = useState(0);
  const skipRef = useRef<() => void>(() => {});

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem("dispatch-intro") === "1"; } catch {}
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (seen || reduce) return;
    setState("run");
    document.documentElement.classList.add("is-loading");
    const start = performance.now();
    const dur = 2400;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setPct(Math.round(eased * 100));
      if (p < 1) raf = requestAnimationFrame(tick);
      else skip();
    };
    const finish = () => {
      try { sessionStorage.setItem("dispatch-intro", "1"); } catch {}
      setState("out");
      document.documentElement.classList.remove("is-loading");
      document.documentElement.classList.add("intro-done");
      setTimeout(() => setState("hidden"), 1100);
    };
    raf = requestAnimationFrame(tick);
    let done = false;
    const skip = () => { if (done) return; done = true; cancelAnimationFrame(raf); setPct(100); finish(); };
    skipRef.current = skip;
    window.addEventListener("keydown", skip, { once: true });
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", skip); };
  }, []);

  if (state === "hidden") return null;
  const lines = Math.floor((pct / 100) * LOG.length);

  return (
    <div className={`loader ${state === "out" ? "loader-out" : ""}`} onClick={() => skipRef.current()} role="presentation">
      <svg className="loader-art" viewBox="0 0 600 360" aria-hidden>
        {/* broadsheet front page in elevation */}
        <g className="draw">
          <rect x="120" y="30" width="360" height="300" />
          <line x1="140" y1="70" x2="460" y2="70" />
          <line x1="140" y1="76" x2="460" y2="76" />
          <rect x="200" y="40" width="200" height="22" />
          <line x1="140" y1="92" x2="320" y2="92" />
          <line x1="140" y1="102" x2="300" y2="102" />
          <rect x="140" y="116" width="180" height="110" />
          <line x1="140" y1="116" x2="320" y2="226" />
          <line x1="320" y1="116" x2="140" y2="226" />
          {[...Array(9)].map((_, i) => <line key={`a${i}`} x1="140" y1={240 + i * 9} x2={i % 3 === 2 ? 260 : 320} y2={240 + i * 9} />)}
          {[...Array(24)].map((_, i) => <line key={`b${i}`} x1="340" y1={92 + i * 9.6} x2={i % 5 === 4 ? 420 : 460} y2={92 + i * 9.6} />)}
          <line x1="330" y1="86" x2="330" y2="320" />
          <line x1="40" y1="330" x2="560" y2="330" />
          <line x1="70" y1="330" x2="70" y2="300" />
          <line x1="530" y1="330" x2="530" y2="300" />
        </g>
        <rect x="402" y="200" width="10" height="10" className="loader-dot" />
      </svg>

      <div className="loader-scan" style={{ top: `${100 - pct}%` }}>
        <span className="mono">{String(pct).padStart(3, "0")}%</span>
      </div>

      <div className="loader-foot">
        <h2 className="loader-title">THE MACHINE READS.<br />THE EDITOR DECIDES.</h2>
        <dl className="loader-spec mono">
          <div><dt>SYSTEM</dt><dd>: DISPATCH INTELLIGENCE ENGINE</dd></div>
          <div><dt>ROLE</dt><dd>: NEWSLETTER CURATION PIPELINE</dd></div>
          <div><dt>MODEL</dt><dd>: GEMINI FLASH</dd></div>
          <div><dt>OWNER</dt><dd>: SHREYA (HUMAN IN THE LOOP)</dd></div>
        </dl>
        <ol className="loader-log mono">
          {LOG.map((l, i) => <li key={l} className={i < lines ? "on" : ""}>{l}</li>)}
        </ol>
      </div>
      <span className="loader-skip mono">CLICK OR PRESS ANY KEY TO SKIP</span>
    </div>
  );
}
