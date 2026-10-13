"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Step = { target: string; title: string; body: string; block?: ScrollLogicalPosition };

const STEPS: Step[] = [
  { target: "hero", title: "Meet The Dispatch engine", body: "An AI that reads the Indian startup web all week and drafts Shreya's newsletter. She still makes every call.", block: "start" },
  { target: "spec", title: "Live status at a glance", body: "This week's issue, its status, the 23 live sources, the model, and the human gate before anything sends." },
  { target: "stats", title: "Real numbers, right now", body: "Articles pulled this week, everything stored without duplicates, stories in the draft, and active readers." },
  { target: "marquee", title: "The live wire", body: "Today's freshly pulled headlines, scrolling past. Hover to pause." },
  { target: "pipeline", title: "Seven stages, one rule", body: "Ingest → dedupe → Gemini picks → rule check → Telegram review → reminder → send. Scroll here to walk each stage.", block: "start" },
  { target: "card", title: "Gemini's picks, with reasons", body: "Each story has 2–3 lines in Shreya's voice plus a private 'why' note. In Telegram she approves, swaps or removes it." },
  { target: "preview", title: "See the actual email", body: "Opens the newsletter exactly as subscribers will receive it." },
  { target: "subscribe", title: "Join the list", body: "Readers sign up here. Bounces and unsubscribes are handled automatically and never emailed again." },
  { target: "wire", title: "Everything ingested", body: "The raw feed Gemini chooses from, with the source and time each article was pulled.", block: "start" },
  { target: "admin", title: "Run it yourself", body: "Open Admin and tap 'Auto-add demo key' to pull live news or preview Gemini's picks, safely." },
];

const DURATION = 4000;
const KEY = "dispatch-tour-seen";

export default function Tour() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [ready, setReady] = useState(false); // target scrolled into place
  const [vw, setVw] = useState(1200);
  const elapsed = useRef(0);
  const barRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const steps = STEPS;
  const step = steps[i];

  const close = useCallback(() => {
    setOpen(false);
    try { localStorage.setItem(KEY, "1"); } catch {}
  }, []);
  const go = useCallback((n: number) => {
    if (n >= steps.length) { close(); return; }
    elapsed.current = 0;
    setI(Math.max(0, n));
  }, [steps.length, close]);
  const start = useCallback(() => { elapsed.current = 0; setI(0); setPaused(false); setOpen(true); }, []);

  // auto-start once per browser, after the intro screen has gone
  useEffect(() => {
    if (pathname !== "/") return;
    let seen = false;
    try { seen = localStorage.getItem(KEY) === "1"; } catch {}
    if (seen) return;
    const wait = () => {
      if (document.documentElement.classList.contains("is-loading")) { t = window.setTimeout(wait, 400); return; }
      t = window.setTimeout(start, 1400);
    };
    let t = window.setTimeout(wait, 600);
    return () => clearTimeout(t);
  }, [pathname, start]);

  // listen for the replay button
  useEffect(() => {
    const h = () => start();
    window.addEventListener("dispatch:tour", h);
    return () => window.removeEventListener("dispatch:tour", h);
  }, [start]);

  // move to the current target
  useEffect(() => {
    if (!open) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) { go(i + 1); return; }
    setReady(false);
    el.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: step.block || "center" });
    const t = window.setTimeout(() => setReady(true), 750);
    return () => clearTimeout(t);
  }, [open, i, step, go]);

  // keep the spotlight glued to the target + run the auto-advance clock
  useEffect(() => {
    if (!open) return;
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      const dt = now - last; last = now;
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect((p) => (p && Math.abs(p.top - r.top) < 0.5 && Math.abs(p.left - r.left) < 0.5 && Math.abs(p.height - r.height) < 0.5 && Math.abs(p.width - r.width) < 0.5 ? p : r));
      }
      setVw((w) => (w === window.innerWidth ? w : window.innerWidth));
      if (ready && !paused) {
        elapsed.current += dt;
        if (barRef.current) barRef.current.style.transform = `scaleX(${Math.min(1, elapsed.current / DURATION)})`;
        if (elapsed.current >= DURATION) { go(i + 1); return; }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [open, ready, paused, i, step, go]);

  // keyboard
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
      else if (e.key === " ") { e.preventDefault(); setPaused((p) => !p); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, i, go, close]);

  // the hint label only shows while the hero is on screen
  const [inHero, setInHero] = useState(true);
  useEffect(() => {
    const on = () => setInHero(window.scrollY < window.innerHeight * 0.55);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  if (pathname !== "/") return null;

  if (!open) {
    return (
      <>
        <div className={`tour-hint ${inHero ? "on" : ""}`} aria-hidden={!inHero}>
          <button className="tour-hint-label mono" onClick={start} tabIndex={inHero ? 0 : -1}>
            <span className="tour-hint-new">NEW HERE?</span>
            <span className="tour-hint-mark">45-second guided tour</span>
          </button>
          <svg className="tour-hint-arrow" viewBox="0 0 120 90" aria-hidden>
            <path d="M8 10 C 46 6, 92 22, 104 70" />
            <path d="M92 60 L 105 74 L 114 57" />
          </svg>
        </div>
        <button className="tour-launch mono" onClick={start} data-cursor="TOUR" aria-label="Start guided tour">
          <span className="tour-launch-dot" /> TAKE THE TOUR
        </button>
      </>
    );
  }

  // spotlight box (clamped to viewport for very tall targets)
  const pad = 10;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const box = rect && {
    top: Math.max(6, rect.top - pad),
    left: Math.max(6, rect.left - pad),
    width: Math.min(rect.width + pad * 2, vw - 12),
    height: Math.min(rect.bottom + pad, vh - 6) - Math.max(6, rect.top - pad),
  };

  // tooltip placement: below the box if there's room, else above, else pinned to the bottom
  const tipW = Math.min(380, vw - 32);
  const mobile = vw < 640;
  let tipStyle: React.CSSProperties = {};
  if (box && !mobile) {
    const tipH = tipRef.current?.offsetHeight || 210;
    const left = Math.min(Math.max(16, box.left), vw - tipW - 16);
    if (box.top + box.height + tipH + 24 < vh) tipStyle = { top: box.top + box.height + 14, left, width: tipW };
    else if (box.top - tipH - 14 > 0) tipStyle = { top: box.top - tipH - 14, left, width: tipW };
    else tipStyle = { bottom: 24, right: 24, width: tipW };
  }

  return (
    <div className="tour" role="dialog" aria-live="polite" aria-label={`Tour step ${i + 1} of ${steps.length}`}>
      {box && (
        <div
          className={`tour-spot ${ready ? "on" : ""}`}
          style={{ top: box.top, left: box.left, width: box.width, height: Math.max(40, box.height) }}
          aria-hidden
        >
          <i className="ts tl" /><i className="ts tr" /><i className="ts bl" /><i className="ts br" />
        </div>
      )}
      <div
        ref={tipRef}
        key={i}
        className={`tour-tip ${mobile ? "mobile" : ""} ${ready ? "on" : ""}`}
        style={tipStyle}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="tour-bar"><span ref={barRef} /></div>
        <div className="tour-head mono">
          <span>TOUR · {String(i + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}</span>
          <span className={paused ? "tour-state paused" : "tour-state"}>{paused ? "PAUSED" : "AUTO"}</span>
        </div>
        <h4 className="tour-title">{step.title}</h4>
        <p className="tour-body">{step.body}</p>
        <div className="tour-dots" aria-hidden>
          {steps.map((_, n) => <button key={n} className={n === i ? "on" : n < i ? "done" : ""} onClick={() => go(n)} tabIndex={-1} />)}
        </div>
        <div className="tour-ctrl mono">
          <button onClick={close} className="tour-skip">SKIP</button>
          <span className="tour-sp" />
          <button onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous">←</button>
          <button onClick={() => setPaused((p) => !p)} aria-label={paused ? "Play" : "Pause"}>{paused ? "▶" : "❚❚"}</button>
          <button onClick={() => go(i + 1)} className="tour-next">{i === steps.length - 1 ? "DONE" : "NEXT →"}</button>
        </div>
      </div>
    </div>
  );
}
