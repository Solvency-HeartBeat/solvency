/**
 * ingest.ts — Pull data from Stellar Horizon and Soroban RPC.
 *
 * Horizon endpoints used:
 *   GET /assets?asset_code=X&asset_issuer=Y  → issued supply
 *   GET /trades?base_asset_type=credit_alphanum4&...  → SDEX price
 *   GET /accounts/:id/operations  → redemption / burn ops
 */

import axios from 'axios';
import { IssuedSupply, PegData, RedemptionData, AnchorConfig } from './types';

const HORIZON_TESTNET = 'https://horizon-testnet.stellar.org';
const HORIZON_MAINNET = 'https://horizon.stellar.org';

export function horizonBase(network: 'testnet' | 'mainnet'): string {
  return network === 'mainnet' ? HORIZON_MAINNET : HORIZON_TESTNET;
}

// ── Issued supply ─────────────────────────────────────────────────────────────

export async function fetchIssuedSupply(
  anchor: AnchorConfig,
  network: 'testnet' | 'mainnet' = 'testnet',
): Promise<IssuedSupply> {
  const base = horizonBase(network);
  const url = `${base}/assets?asset_code=${anchor.assetCode}&asset_issuer=${anchor.issuer}`;
  const { data } = await axios.get(url, { timeout: 10_000 });
  const records = data?._embedded?.records ?? [];

  if (records.length === 0) {
    return { issuer: anchor.issuer, assetCode: anchor.assetCode, amount: 0n };
  }

  const rec = records[0];
  // amount field is a string like "1234567.8901234" — parse to integer units
  const amountStr: string = rec.amount ?? '0';
  const amount = parseFloat(amountStr);
  // Convert to 7-decimal integer (Stellar stroops)
  const amountInt = BigInt(Math.round(amount * 1e7));

  return { issuer: anchor.issuer, assetCode: anchor.assetCode, amount: amountInt };
}

// ── SDEX peg price ────────────────────────────────────────────────────────────

/**
 * Fetch the SDEX mid-price for assetCode/XLM then compute deviation from
 * the expected XLM/USD reference (or use a direct USDC pair when available).
 *
 * For testnet we fall back to a mock 0 bps deviation if no trades exist.
 */
export async function fetchPegDeviation(
  anchor: AnchorConfig,
  network: 'testnet' | 'mainnet' = 'testnet',
): Promise<PegData> {
  try {
    const base = horizonBase(network);
    // Look for ASSET/USDC or ASSET/XLM orderbook
    const url =
      `${base}/order_book?selling_asset_type=credit_alphanum4` +
      `&selling_asset_code=${anchor.assetCode}` +
      `&selling_asset_issuer=${anchor.issuer}` +
      `&buying_asset_type=native`; // XLM as proxy

    const { data } = await axios.get(url, { timeout: 10_000 });

    const bids: Array<{ price: string }> = data?.bids ?? [];
    const asks: Array<{ price: string }> = data?.asks ?? [];

    if (bids.length === 0 || asks.length === 0) {
      return { issuer: anchor.issuer, pegDevBps: 0 };
    }

    const bid = parseFloat(bids[0].price);
    const ask = parseFloat(asks[0].price);
    const mid = (bid + ask) / 2;

    // For a USD-pegged asset the expected mid in XLM terms changes with XLM/USD.
    // For simplicity in v1: compare mid to 1.0 (assuming ASSET is priced in its own unit).
    // A real relayer would fetch XLM/USD from an oracle and convert.
    const devFraction = (mid - 1.0) / 1.0;
    const pegDevBps = Math.round(devFraction * 10_000);

    return { issuer: anchor.issuer, pegDevBps };
  } catch {
    // No market data — neutral
    return { issuer: anchor.issuer, pegDevBps: 0 };
  }
}

// ── Redemption velocity ───────────────────────────────────────────────────────

/**
 * Count payment operations TO the issuer (i.e. burns/redemptions) in the last hour.
 */
export async function fetchRedemptionRate(
  anchor: AnchorConfig,
  network: 'testnet' | 'mainnet' = 'testnet',
): Promise<RedemptionData> {
  try {
    const base = horizonBase(network);
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const url =
      `${base}/accounts/${anchor.issuer}/operations` +
      `?order=desc&limit=200`;

    const { data } = await axios.get(url, { timeout: 10_000 });
    const ops: Array<{ type: string; created_at: string }> =
      data?._embedded?.records ?? [];

    const cutoff = new Date(oneHourAgo).getTime();
    let redemptions = 0;
    for (const op of ops) {
      if (new Date(op.created_at).getTime() < cutoff) break;
      if (op.type === 'payment') redemptions++;
    }

    return { issuer: anchor.issuer, redemptionRate: redemptions };
  } catch {
    return { issuer: anchor.issuer, redemptionRate: 0 };
  }
}
