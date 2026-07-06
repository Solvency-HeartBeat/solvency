/**
 * scoring.ts — Weighted signal computation.
 *
 * Rubric (weights sum to 100):
 *   35  Reserve ratio   (reserves ÷ issued in bps)
 *   20  Attestation freshness
 *   20  Peg deviation on SDEX/AMM
 *   15  Redemption velocity
 *   10  Issuer control events (placeholder — set to max unless flagged externally)
 */

import {
  ScoringInput, ScoringResult, SignalBreakdown, HealthStatus,
} from './types';

// Thresholds (mirror the on-chain contract defaults)
const HEALTHY_BPS  = 10_000; // 100 %
const WATCH_BPS    =  9_000; //  90 %
const DANGER_BPS   =  8_000; //  80 %
const STALE_SECS   = 86_400; //  24 h
const PEG_WARN_BPS =    300; //   3 %

// ── Individual signal scores (each returns 0 = worst, max = best) ────────────

function scoreReserveRatio(ratioBps: number): number {
  if (ratioBps >= HEALTHY_BPS) return 35;
  if (ratioBps >= WATCH_BPS)   return 25;
  if (ratioBps >= DANGER_BPS)  return 10;
  return 0;
}

function scoreFreshness(lastAttestationTs: number, nowTs: number): number {
  const ageSecs = nowTs - lastAttestationTs;
  if (ageSecs <= 3_600)   return 20; // < 1 h  → full score
  if (ageSecs <= 21_600)  return 15; // < 6 h
  if (ageSecs <= STALE_SECS) return 8; // < 24 h
  return 0; // stale
}

function scorePegDeviation(pegDevBps: number): number {
  const abs = Math.abs(pegDevBps);
  if (abs === 0)               return 20;
  if (abs <= 50)               return 18; // < 0.5 %
  if (abs <= PEG_WARN_BPS)     return 12; // < 3 %
  if (abs <= PEG_WARN_BPS * 2) return 5;  // < 6 %
  return 0;
}

function scoreRedemptionVelocity(redemptionRate: number): number {
  if (redemptionRate === 0)   return 15;
  if (redemptionRate <= 10)   return 12;
  if (redemptionRate <= 50)   return 8;
  if (redemptionRate <= 200)  return 3;
  return 0;
}

/**
 * issuerControlScore — caller passes 0–10; defaults to 10 (no flags).
 * External callers can lower this when freeze/clawback activity is detected.
 */
function scoreIssuerControl(penaltyPoints: number): number {
  return Math.max(0, 10 - penaltyPoints);
}

// ── Composite status from total score ────────────────────────────────────────

function totalToStatus(total: number, staleSecs: number, lastTs: number, nowTs: number): HealthStatus {
  // Stale takes precedence
  if (nowTs - lastTs > staleSecs) return 'Stale';
  if (total >= 80) return 'Healthy';
  if (total >= 55) return 'Watch';
  return 'Danger';
}

function statusToCode(s: HealthStatus): number {
  switch (s) {
    case 'Healthy': return 0;
    case 'Watch':   return 1;
    case 'Danger':  return 2;
    case 'Stale':   return 3;
    default:        return 4;
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export function computeScore(
  input: ScoringInput,
  issuerControlPenalty = 0,
): ScoringResult {
  const ratioBps =
    input.issuedAmount === 0n
      ? 10_000
      : Number((input.reserveAmount * 10_000n) / input.issuedAmount);

  const reserveRatioScore   = scoreReserveRatio(ratioBps);
  const freshnessScore      = scoreFreshness(input.lastAttestationTs, input.nowTs);
  const pegDeviationScore   = scorePegDeviation(input.pegDevBps);
  const redemptionScore     = scoreRedemptionVelocity(input.redemptionRate);
  const issuerControlScore  = scoreIssuerControl(issuerControlPenalty);

  const total =
    reserveRatioScore +
    freshnessScore +
    pegDeviationScore +
    redemptionScore +
    issuerControlScore;

  const status = totalToStatus(
    total,
    input.freshnessWindowSecs,
    input.lastAttestationTs,
    input.nowTs,
  );

  const signals: SignalBreakdown = {
    reserveRatioScore,
    freshnessScore,
    pegDeviationScore,
    redemptionScore,
    issuerControlScore,
    total,
  };

  return {
    issuer: input.issuer,
    ratioBps,
    status,
    statusCode: statusToCode(status),
    pegDevBps: input.pegDevBps,
    redemptionRate: input.redemptionRate,
    signals,
  };
}
