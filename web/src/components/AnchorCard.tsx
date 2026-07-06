'use client';

import { AnchorMeta } from '@/lib/mockData';
import { getStatusColor, getStatusDot } from '@/lib/contract';
import { StatusBadge } from './StatusBadge';
import { RatioSparkline } from './RatioSparkline';

interface Props {
  anchor: AnchorMeta;
}

const SPARK_COLOR: Record<string, string> = {
  Healthy: '#22c55e',
  Watch:   '#f59e0b',
  Danger:  '#ef4444',
  Stale:   '#6b7280',
  Unknown: '#3b82f6',
};

export function AnchorCard({ anchor }: Props) {
  const ratioPercent = (anchor.ratioBps / 100).toFixed(2);
  const pegSign = anchor.pegDevBps >= 0 ? '+' : '';
  const pegBps = `${pegSign}${(anchor.pegDevBps / 100).toFixed(2)}%`;
  const freshMins = Math.round((Date.now() / 1000 - anchor.lastAttestation) / 60);

  return (
    <div
      className={`rounded-xl border bg-slate-900/60 p-5 flex flex-col gap-4 transition-all duration-500 ${
        anchor.status === 'Danger'
          ? 'border-red-500/50 shadow-lg shadow-red-500/10'
          : anchor.status === 'Watch'
          ? 'border-amber-400/40'
          : 'border-slate-700/50'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-100">{anchor.name}</p>
          <p className="text-xs text-slate-500 mt-0.5 font-mono">{anchor.assetCode}</p>
        </div>
        <StatusBadge status={anchor.status} pulse />
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <Metric label="Reserve ratio" value={`${ratioPercent}%`} color={getStatusColor(anchor.status)} />
        <Metric label="Peg deviation" value={pegBps} color={Math.abs(anchor.pegDevBps) > 300 ? 'text-red-400' : 'text-slate-300'} />
        <Metric label="Redemptions/h" value={String(anchor.redemptionRate)} color={anchor.redemptionRate > 50 ? 'text-amber-400' : 'text-slate-300'} />
      </div>

      {/* Sparkline */}
      <div>
        <p className="text-xs text-slate-500 mb-1">Reserve ratio (last 12 readings)</p>
        <RatioSparkline data={anchor.ratioHistory} color={SPARK_COLOR[anchor.status] ?? '#3b82f6'} />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Last attestation: <span className="text-slate-400">{freshMins}m ago</span></span>
        <span
          className="font-mono truncate max-w-[140px]"
          title={anchor.issuer}
        >
          {anchor.issuer.slice(0, 8)}…{anchor.issuer.slice(-4)}
        </span>
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-slate-800/60 rounded-lg px-2 py-2">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-sm font-semibold ${color}`}>{value}</p>
    </div>
  );
}
