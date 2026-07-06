'use client';

export interface Alert {
  id: string;
  issuer: string;
  assetCode: string;
  message: string;
  severity: 'warn' | 'danger' | 'info';
  ts: number;
}

interface Props {
  alerts: Alert[];
}

const SEVERITY_STYLES: Record<Alert['severity'], string> = {
  danger: 'border-red-500/40 bg-red-500/5 text-red-400',
  warn:   'border-amber-400/40 bg-amber-400/5 text-amber-400',
  info:   'border-blue-500/40 bg-blue-500/5 text-blue-400',
};

export function AlertFeed({ alerts }: Props) {
  if (alerts.length === 0) {
    return (
      <p className="text-xs text-slate-500 py-4 text-center">No alerts — all anchors nominal.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((a) => (
        <li
          key={a.id}
          className={`rounded-lg border px-3 py-2 text-xs flex items-start gap-2 ${SEVERITY_STYLES[a.severity]}`}
        >
          <span className="mt-0.5 shrink-0">
            {a.severity === 'danger' ? '🔴' : a.severity === 'warn' ? '🟡' : 'ℹ️'}
          </span>
          <div className="flex-1 min-w-0">
            <span className="font-semibold">{a.assetCode}</span>
            {' — '}
            {a.message}
          </div>
          <span className="shrink-0 text-slate-500 tabular-nums">
            {new Date(a.ts).toLocaleTimeString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
