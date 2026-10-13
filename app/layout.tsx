import "./globals.css";
import type { Metadata } from "next";
import Motion from "./components/Motion";
import Loader from "./components/Loader";
import Tour from "./components/Tour";


export const metadata: Metadata = {
  title: "The Dispatch · Intelligence Engine",
  description: "Newsletter intelligence pipeline: live ingest, Gemini Flash editorial pass, human approval on Telegram, Gmail delivery.",
};

const NAV = [
  { href: "/#pipeline", label: "Pipeline", n: "01" },
  { href: "/#draft", label: "Draft", n: "02" },
  { href: "/#archive", label: "Archive", n: "03" },
  { href: "/#wire", label: "Wire", n: "04" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Loader />
        <div className="grain" aria-hidden />
        <div className="progress" aria-hidden><span data-progress /></div>
        <div className="frame-edge" aria-hidden>
          <i className="tl">+</i><i className="tr">+</i><i className="bl">+</i><i className="br">+</i>
          <span className="pct mono" data-progress-pct>000%</span>
        </div>

        <header className="nav">
          <a href="/" className="nav-logo" data-magnetic aria-label="The Dispatch home">
            <svg viewBox="0 0 40 40" width="30" height="30" aria-hidden className="logo-mark">
              <rect x="5" y="7" width="30" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" />
              <line x1="5" y1="14" x2="35" y2="14" stroke="currentColor" strokeWidth="1.6" />
              <line x1="10" y1="19" x2="22" y2="19" stroke="currentColor" strokeWidth="1.2" />
              <line x1="10" y1="23" x2="22" y2="23" stroke="currentColor" strokeWidth="1.2" />
              <line x1="10" y1="27" x2="18" y2="27" stroke="currentColor" strokeWidth="1.2" />
              <rect x="25" y="18" width="6" height="10" className="logo-dot" />
            </svg>
            <span className="nav-word">THE DISPATCH</span>
          </a>
          <nav className="nav-cells">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="nav-cell" data-scramble>
                <span className="mono nav-n">{n.n}</span>
                <span className="mono nav-l">{n.label.toUpperCase()}</span>
                <span className="nav-corner" aria-hidden>⌟</span>
              </a>
            ))}
            <a href="/admin" className="nav-cell nav-cta" data-scramble data-tour="admin">
              <span className="mono nav-n">05</span>
              <span className="mono nav-l">ADMIN</span>
              <span className="nav-arrow" aria-hidden>→</span>
            </a>
          </nav>
        </header>

        <main>{children}</main>
        <Motion />
        <Tour />
      </body>
    </html>
  );
}
