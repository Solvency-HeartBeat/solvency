/**
 * contract.ts — Status types and UI helpers for the dashboard.
 *
 * The live Soroban read path lives in the SDK package (@heartbeat/sdk).
 * The dashboard uses mock data in demo mode — no stellar-sdk import here.
 */

export type HealthStatus = 'Healthy' | 'Watch' | 'Danger' | 'Stale' | 'Unknown';

export interface AnchorHealth {
  issuer: string;
  ratioBps: number;
  status: HealthStatus;
  statusCode: number;
  lastAttestation: number;
  pegDevBps: number;
  redemptionRate: number;
}

export function getStatusColor(status: HealthStatus): string {
  switch (status) {
    case 'Healthy': return 'text-green-500';
    case 'Watch':   return 'text-amber-400';
    case 'Danger':  return 'text-red-500';
    case 'Stale':   return 'text-gray-400';
    default:        return 'text-blue-400';
  }
}

export function getStatusBg(status: HealthStatus): string {
  switch (status) {
    case 'Healthy': return 'bg-green-500/10 border-green-500/30';
    case 'Watch':   return 'bg-amber-400/10 border-amber-400/30';
    case 'Danger':  return 'bg-red-500/10 border-red-500/30';
    case 'Stale':   return 'bg-gray-500/10 border-gray-500/30';
    default:        return 'bg-blue-500/10 border-blue-500/30';
  }
}

export function getStatusDot(status: HealthStatus): string {
  switch (status) {
    case 'Healthy': return 'bg-green-500';
    case 'Watch':   return 'bg-amber-400';
    case 'Danger':  return 'bg-red-500';
    case 'Stale':   return 'bg-gray-400';
    default:        return 'bg-blue-400';
  }
}
