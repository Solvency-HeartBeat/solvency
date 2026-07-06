/**
 * index.ts — Engine scheduler / entrypoint.
 *
 * Runs on a cron schedule:
 *   - Every 5 minutes: ingest Horizon data + score all anchors + relay verdicts.
 *
 * Config via environment variables (see .env.example).
 */

import 'dotenv/config';
import cron from 'node-cron';
import { fetchIssuedSupply, fetchPegDeviation, fetchRedemptionRate } from './ingest';
import { computeScore } from './scoring';
import { Relayer } from './relayer';
import { AnchorConfig, ScoringInput } from './types';
import { logger } from './logger';

// ── Load config ───────────────────────────────────────────────────────────────

const CONTRACT_ID    = process.env.CONTRACT_ID    ?? '';
const RELAYER_SECRET = process.env.RELAYER_SECRET ?? '';
const RPC_URL        = process.env.RPC_URL        ?? 'https://soroban-testnet.stellar.org';
const NETWORK        = (process.env.NETWORK ?? 'testnet') as 'testnet' | 'mainnet';
const CRON_SCHEDULE  = process.env.CRON_SCHEDULE  ?? '*/5 * * * *'; // every 5 min

if (!CONTRACT_ID || !RELAYER_SECRET) {
  logger.error('CONTRACT_ID and RELAYER_SECRET must be set in environment.');
  process.exit(1);
}

// ── Anchor registry (seed from environment or a JSON config file) ─────────────

function loadAnchors(): AnchorConfig[] {
  const raw = process.env.ANCHORS_JSON;
  if (raw) {
    try {
      return JSON.parse(raw) as AnchorConfig[];
    } catch {
      logger.error('Failed to parse ANCHORS_JSON');
    }
  }
  // Default demo anchors for testnet (replace with real issuers)
  return [
    {
      issuer: process.env.DEMO_ISSUER_1 ?? 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      assetCode: 'USDC',
      pegCurrency: 'USD',
    },
  ];
}

// ── Main cycle ────────────────────────────────────────────────────────────────

async function runCycle(): Promise<void> {
  const anchors = loadAnchors();
  const relayer = new Relayer({
    contractId: CONTRACT_ID,
    relayerSecretKey: RELAYER_SECRET,
    network: NETWORK,
    rpcUrl: RPC_URL,
  });

  logger.info(`Starting scoring cycle for ${anchors.length} anchor(s)…`);

  const results = await Promise.allSettled(
    anchors.map(async (anchor) => {
      const [supply, peg, redemption] = await Promise.all([
        fetchIssuedSupply(anchor, NETWORK),
        fetchPegDeviation(anchor, NETWORK),
        fetchRedemptionRate(anchor, NETWORK),
      ]);

      const input: ScoringInput = {
        issuer: anchor.issuer,
        issuedAmount: supply.amount,
        reserveAmount: 0n, // set by attestations; engine only reads it from contract state
        lastAttestationTs: 0, // fetched from contract state (placeholder)
        pegDevBps: peg.pegDevBps,
        redemptionRate: redemption.redemptionRate,
        nowTs: Math.floor(Date.now() / 1000),
        freshnessWindowSecs: 86_400,
      };

      const score = computeScore(input);
      logger.info(
        `${anchor.assetCode}/${anchor.issuer.slice(0, 8)}… ` +
        `status=${score.status} ratio=${score.ratioBps}bps ` +
        `peg=${score.pegDevBps}bps score=${score.signals.total}/100`,
      );
      return score;
    }),
  );

  const succeeded = results
    .filter((r): r is PromiseFulfilledResult<ReturnType<typeof computeScore>> =>
      r.status === 'fulfilled',
    )
    .map((r) => r.value);

  if (succeeded.length > 0) {
    await relayer.submitBatch(succeeded);
  }

  logger.info('Cycle complete.');
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

logger.info(`Solvency Heartbeat engine starting — schedule: "${CRON_SCHEDULE}"`);

// Run once immediately on startup
runCycle().catch((err) => logger.error(`Initial cycle error: ${err}`));

// Then on schedule
cron.schedule(CRON_SCHEDULE, () => {
  runCycle().catch((err) => logger.error(`Cycle error: ${err}`));
});
