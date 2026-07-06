'use client';

import { useEffect, useRef, useState } from 'react';
import { AnchorCard } from '@/components/AnchorCard';
import { AlertFeed, Alert } from '@/components/AlertFeed';
import { AnchorMeta, DEMO_ANCHORS } from '@/lib/mockData';
import { HealthStatus } from '@/lib/contract';

// ── Demo simulation ────────────────────────────────────────────────────────────
//
// Every 4 seconds, TrustBRL (index 3) degrades one step along its history.
// This replicates the "10-second demo" from the spec.

const DEMO_STEPS = 12; // match ratioHistory / pegHistory length

export default function HomePage() {
  const [anchors, setAnchors] = useState<AnchorMeta[]>(
    DEMO_ANCHORS.map((a) => ({ ...a, ratioHistory: [...a.ratioHistory], pegHistory: [...a.pegHistory] })),
  );
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const stepRef = useRef(0);

  // ── Demo tick ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const step = stepRef.current;
      if (step >= DEMO_STEPS) return; // demo finished
      stepRef.current = step + 1;

      setAnchors((prev) => {
        const next = prev.map((a, i) => {
          if (i !== 3) return a; // only animate TrustBRL

          const ratioBps = DEMO_ANCHORS[3].ratioHistory[step];
          const pegDevBps = DEMO_ANCHORS[3].pegHistory[step];

          // Determine new status
          let status: HealthStatus = 'Healthy';
          let statusCode = 0;
          if (ratioBps < 8_000 || Math.abs(pegDevBps) > 600) {
            status = 'Danger'; statusCode = 2;
          } else if (ratioBps < 9_000 || Math.abs(pegDevBps) > 300) {
            status = 'Watch'; statusCode = 1;
          }

          return { ...a, ratioBps, pegDevBps, status, statusCode };
        });
        return next;
      });

      // Fire alerts at key thresholds
      const ratioBps = DEMO_ANCHORS[3].ratioHistory[step];
      const pegDevBps = DEMO_ANCHORS[3].pegHistory[step];

      if (ratioBps === 9_000 || ratioBps < 9_000 && ratioBps >= 8_900) {
        addAlert({ severity: 'warn', message: 'Reserve ratio dropped below 90% — Watch status.', assetCode: 'BRL', issuer: DEMO_ANCHORS[3].issuer });
      }
      if (ratioBps < 8_000) {
        addAlert({ severity: 'danger', message: 'Reserve ratio below 80% — DANGER. Token de-pegged.', assetCode: 'BRL', issuer: DEMO_ANCHORS[3].issuer });
      }
      if (Math.abs(pegDevBps) > 300) {
        addAlert({ severity: 'warn', message: `Peg deviation ${(pegDevBps / 100).toFixed(1)}% on SDEX.`, assetCode: 'BRL', issuer: DEMO_ANCHORS[3].issuer });
      }
    }, 4_000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addAlert(partial: Omit<Alert, 'id' | 'ts'>) {
    setAlerts((prev) => [
      { ...partial, id: `${Date.now()}`, ts: Date.now() },
      ...prev.slice(0, 19),
    ]);
  }

  const healthyCount = anchors.filter((a) => a.status === 'Healthy').length;
  const warnCount    = anchors.filter((a) => a.status === 'Watch').length;
  const dangerCount  = anchors.filter((a) => a.status === 'Danger' || a.status === 'Stale').length;

  return (
    <div className="space-y-8">
      {/* Summary bar */}
      <div className="flex flex-wrap gap-4 items-center">
        <h1 className="text-xl font-bold text-slate-100 mr-2">Anchor Solvency Board</h1>
        <SummaryPill count={healthyCount} label="Healthy" color="text-green-500 bg-green-500/10 border-green-500/30" />
        <SummaryPill count={warnCount}    label="Watch"   color="text-amber-400 bg-amber-400/10 border-amber-400/30" />
        <SummaryPill count={dangerCount}  label="Danger"  color="text-red-500 bg-red-500/10 border-red-500/30" />
        <span className="ml-auto text-xs text-slate-500">Live demo — updates every 4s</span>
      </div>

      {/* Anchor grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {anchors.map((a) => (
          <AnchorCard key={a.issuer} anchor={a} />
        ))}
      </div>

      {/* Alert feed */}
      <section>
        <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">
          Alert Feed
        </h2>
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-xl p-4">
          <AlertFeed alerts={alerts} />
        </div>
      </section>

      {/* Integration snippet */}
      <section>
        <h2 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wider">
          One-line integration
        </h2>
        <pre className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 text-xs text-slate-300 overflow-x-auto leading-relaxed">
{`import { SolvencyHeartbeat } from '@heartbeat/sdk';

const hb = new SolvencyHeartbeat({ network: 'testnet' });
const h  = await hb.getAnchorHealth('<issuer>');
if (h.status !== 'Healthy') rejectCollateral(h);`}
        </pre>
      </section>
    </div>
  );
}

function SummaryPill({
  count, label, color,
}: { count: number; label: string; color: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium ${color}`}>
      <span className="font-bold tabular-nums">{count}</span>
      {label}
    </span>
  );
}
