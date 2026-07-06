import { HealthStatus, getStatusBg, getStatusColor, getStatusDot } from '@/lib/contract';

interface Props {
  status: HealthStatus;
  pulse?: boolean;
}

export function StatusBadge({ status, pulse = false }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${getStatusBg(status)} ${getStatusColor(status)}`}
    >
      <span
        className={`w-2 h-2 rounded-full ${getStatusDot(status)} ${
          pulse && (status === 'Danger' || status === 'Watch') ? 'animate-pulse' : ''
        }`}
      />
      {status}
    </span>
  );
}
