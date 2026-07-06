// Shared types for the engine layer

export type HealthStatus = 'Healthy' | 'Watch' | 'Danger' | 'Stale' | 'Unknown';

export const STATUS_CODE: Record<number, HealthStatus> = {
  0: 'Healthy',
  1: 'Watch',
  2: 'Danger',
  3: 'Stale',
  4: 'Unknown',
};

export interface AnchorConfig {
  /** Stellar issuer address */
  issuer: string;
  /** Asset code e.g. "USDC" */
  assetCode: string;
  /** Expected peg currency, e.g. "USD" */
  pegCurrency: string;
}

export interface IssuedSupply {
  issuer: string;
  assetCode: string;
  amount: bigint; // in stroops (7 decimal places for Stellar assets)
}

export interface PegData {
  issuer: string;
  /** Deviation from par in basis points (signed: negative = discount) */
  pegDevBps: number;
}

export interface RedemptionData {
  issuer: string;
  /** Burns/redemptions per hour (rolling window) */
  redemptionRate: number;
}

export interface ScoringInput {
  issuer: string;
  issuedAmount: bigint;
  reserveAmount: bigint;
  lastAttestationTs: number;
  pegDevBps: number;
  redemptionRate: number;
  nowTs: number;
  freshnessWindowSecs: number;
}

export interface ScoringResult {
  issuer: string;
  ratioBps: number;
  status: HealthStatus;
  statusCode: number;
  pegDevBps: number;
  redemptionRate: number;
  signals: SignalBreakdown;
}

export interface SignalBreakdown {
  reserveRatioScore: number;   // 0–35
  freshnessScore: number;      // 0–20
  pegDeviationScore: number;   // 0–20
  redemptionScore: number;     // 0–15
  issuerControlScore: number;  // 0–10
  total: number;               // 0–100
}
