"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * One client component wires every motion effect on the page via data attributes,
 * so all pages stay server-rendered and functionality is untouched.
 *   data-reveal        fade/slide in when visible (data-reveal="up|left|clip|scale")
 *   data-split         word-by-word masked headline reveal
 *   data-count="123"   number counts up when visible
 *   data-scramble      text scrambles on hover
 *   data-magnetic      element leans toward the pointer
 *   data-tilt          3D tilt + spotlight following the pointer
 *   data-scrub         letters ink in as you scroll past
 *   data-pin           sticky scroll section; sets --p (0..1) and active step
 *   data-speed="0.2"   parallax drift
 */
export default function Motion() {
  const pathname = usePathname();

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const cleanups: (() => void)[] = [];
    const root = document.documentElement;
    const $$ = <T extends Element = HTMLElement>(sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel)) as unknown as T[];

    // ---------- split headlines into masked words ----------
    $$("[data-split]").forEach((el) => {
      if (el.dataset.splitDone) return;
      el.dataset.splitDone = "1";
      let i = 0;
      const walk = (node: Node) => {
        Array.from(node.childNodes).forEach((child) => {
          if (child.nodeType === 3) {
            const frag = document.createDocumentFragment();
            (child.textContent || "").split(/(\s+)/).forEach((part) => {
              if (!part) return;
              if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); return; }
              const w = document.createElement("span"); w.className = "w";
              const inner = document.createElement("span"); inner.className = "wi"; inner.textContent = part;
              inner.style.setProperty("--i", String(i++));
              w.appendChild(inner); frag.appendChild(w);
            });
            child.replaceWith(frag);
          } else if (child.nodeType === 1 && (child as HTMLElement).tagName !== "BR") walk(child);
        });
      };
      walk(el);
    });

    // ---------- scrub text into letters ----------
    $$("[data-scrub]").forEach((el) => {
      if (el.dataset.scrubDone) return;
      el.dataset.scrubDone = "1";
      const text = el.textContent || "";
      el.textContent = "";
      el.setAttribute("aria-label", text);
      text.split("").forEach((ch) => {
        const s = document.createElement("span");
        s.className = ch === " " ? "sp" : "ch";
        s.textContent = ch;
        s.setAttribute("aria-hidden", "true");
        el.appendChild(s);
      });
    });

    // ---------- counters ----------
    const runCount = (el: HTMLElement) => {
      const target = Number(el.dataset.count || 0);
      if (reduce || target === 0) { el.textContent = target.toLocaleString("en-IN"); return; }
      const dur = 1600, start = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - start) / dur);
        const e = 1 - Math.pow(1 - p, 4);
        el.textContent = Math.round(target * e).toLocaleString("en-IN");
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    // ---------- reveal observer ----------
    const start = () => {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const el = e.target as HTMLElement;
          el.classList.add("in");
          if (el.dataset.count !== undefined) runCount(el);
          io.unobserve(el);
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
      $$("[data-reveal],[data-split],[data-count],[data-stagger]").forEach((el) => io.observe(el));
      cleanups.push(() => io.disconnect());
    };
    if (root.classList.contains("is-loading")) {
      const mo = new MutationObserver(() => {
        if (!root.classList.contains("is-loading")) { mo.disconnect(); setTimeout(start, 250); }
      });
      mo.observe(root, { attributes: true, attributeFilter: ["class"] });
      cleanups.push(() => mo.disconnect());
    } else start();

    // ---------- stagger children index ----------
    $$("[data-stagger]").forEach((el) => Array.from(el.children).forEach((c, i) => (c as HTMLElement).style.setProperty("--d", `${i * 70}ms`)));

    // ---------- scroll-driven: progress, scrub, pin, parallax ----------
    const bar = document.querySelector<HTMLElement>("[data-progress]");
    const pct = document.querySelector<HTMLElement>("[data-progress-pct]");
    const scrubs = $$("[data-scrub]");
    const pins = $$("[data-pin]");
    const drifts = $$("[data-speed]");
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const vh = window.innerHeight;
        const max = document.documentElement.scrollHeight - vh;
        const p = max > 0 ? window.scrollY / max : 0;
        if (bar) bar.style.transform = `scaleX(${p})`;
        if (pct) pct.textContent = `${String(Math.round(p * 100)).padStart(3, "0")}%`;

        scrubs.forEach((el) => {
          const r = el.getBoundingClientRect();
          const prog = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.6)));
          const chars = el.querySelectorAll(".ch");
          const lit = Math.round(prog * chars.length);
          chars.forEach((c, i) => c.classList.toggle("lit", i < lit));
        });

        pins.forEach((el) => {
          const r = el.getBoundingClientRect();
          const total = r.height - vh;
          const prog = total > 0 ? Math.min(1, Math.max(0, -r.top / total)) : 0;
          el.style.setProperty("--p", prog.toFixed(4));
          const steps = Number(el.dataset.pin || 1);
          const active = Math.min(steps - 1, Math.floor(prog * steps * 0.999));
          el.style.setProperty("--fill", ((prog * steps) % 1 || (prog >= 1 ? 1 : 0)).toFixed(3));
          if (el.dataset.active !== String(active)) {
            el.dataset.active = String(active);
            el.querySelectorAll<HTMLElement>("[data-step]").forEach((s) => {
              const n = Number(s.dataset.step);
              s.classList.toggle("active", n === active);
              s.classList.toggle("done", n < active);
            });
            el.querySelectorAll<HTMLElement>("[data-step-num]").forEach((s) => (s.textContent = String(active + 1).padStart(2, "0")));
          }
        });

        if (!reduce) drifts.forEach((el) => {
          const r = el.getBoundingClientRect();
          const c = r.top + r.height / 2 - vh / 2;
          el.style.transform = `translate3d(0, ${(-c * Number(el.dataset.speed)).toFixed(1)}px, 0)`;
        });
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    cleanups.push(() => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); });

    // ---------- scramble on hover ----------
    const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/*+=";
    $$("[data-scramble]").forEach((el) => {
      const target = (el.querySelector(".nav-l, [data-scramble-text]") as HTMLElement) || el;
      const original = target.textContent || "";
      let raf = 0;
      const enter = () => {
        if (reduce) return;
        cancelAnimationFrame(raf);
        let frame = 0;
        const run = () => {
          frame++;
          target.textContent = original.split("").map((ch, i) =>
            ch === " " ? " " : i < frame / 2 ? original[i] : GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join("");
          if (frame / 2 < original.length) raf = requestAnimationFrame(run);
          else target.textContent = original;
        };
        run();
      };
      el.addEventListener("mouseenter", enter);
      cleanups.push(() => { el.removeEventListener("mouseenter", enter); cancelAnimationFrame(raf); target.textContent = original; });
    });

    if (fine && !reduce) {
      // ---------- magnetic ----------
      $$("[data-magnetic]").forEach((el) => {
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
          el.style.transform = `translate(${x * 0.25}px, ${y * 0.35}px)`;
        };
        const leave = () => (el.style.transform = "");
        el.addEventListener("pointermove", move); el.addEventListener("pointerleave", leave);
        cleanups.push(() => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); });
      });

      // ---------- tilt + spotlight ----------
      $$("[data-tilt]").forEach((el) => {
        const move = (e: PointerEvent) => {
          const r = el.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
          el.style.setProperty("--mx", `${px * 100}%`); el.style.setProperty("--my", `${py * 100}%`);
          el.style.transform = `perspective(900px) rotateX(${(0.5 - py) * 5}deg) rotateY(${(px - 0.5) * 7}deg) translateZ(0)`;
        };
        const leave = () => (el.style.transform = "");
        el.addEventListener("pointermove", move); el.addEventListener("pointerleave", leave);
        cleanups.push(() => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); });
      });

      // ---------- custom cursor ----------
      const dot = document.createElement("div"); dot.className = "cur-dot";
      const ring = document.createElement("div"); ring.className = "cur-ring";
      const label = document.createElement("span"); label.className = "cur-label mono"; ring.appendChild(label);
      document.body.append(dot, ring); root.classList.add("has-cursor");
      let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my, raf = 0;
      const move = (e: PointerEvent) => {
        mx = e.clientX; my = e.clientY;
        dot.style.transform = `translate(${mx}px, ${my}px)`;
        const t = (e.target as HTMLElement)?.closest?.("a,button,input,textarea,[data-cursor]") as HTMLElement | null;
        ring.classList.toggle("hover", !!t);
        ring.classList.toggle("text", !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"));
        const l = t?.dataset.cursor || "";
        label.textContent = l; ring.classList.toggle("labelled", !!l);
      };
      const loop = () => {
        rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16;
        ring.style.transform = `translate(${rx}px, ${ry}px)`;
        raf = requestAnimationFrame(loop);
      };
      const down = () => ring.classList.add("down");
      const up = () => ring.classList.remove("down");
      window.addEventListener("pointermove", move); window.addEventListener("pointerdown", down); window.addEventListener("pointerup", up);
      loop();
      cleanups.push(() => {
        cancelAnimationFrame(raf); dot.remove(); ring.remove(); root.classList.remove("has-cursor");
        window.removeEventListener("pointermove", move); window.removeEventListener("pointerdown", down); window.removeEventListener("pointerup", up);
      });
    }

    return () => cleanups.forEach((c) => c());
  }, [pathname]);

  return null;
}
