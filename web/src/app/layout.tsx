import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Solvency Heartbeat',
  description: 'Real-time proof-of-reserves for Stellar anchors',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0a0f1e] text-slate-200">
        <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Heartbeat pulse icon */}
            <span className="inline-block w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <span className="text-lg font-semibold tracking-tight">Solvency Heartbeat</span>
            <span className="text-xs text-slate-500 ml-2">Stellar Trust-Oracle</span>
          </div>
          <a
            href="https://github.com/Solvency-HeartBeat/solvency"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            GitHub ↗
          </a>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
