import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Dispatch · Intelligence Engine",
  description: "Newsletter intelligence pipeline: live ingest, Gemini Flash editorial pass, human approval on Telegram, Gmail delivery.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <a href="/" className="brand">The Dispatch <span>Intelligence Engine</span></a>
          <nav><a href="/">Dashboard</a><a href="/admin">Admin</a></nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
