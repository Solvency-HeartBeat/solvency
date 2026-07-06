/**
 * @heartbeat/sdk — One-line Solvency Heartbeat integration client.
 *
 * TypeScript usage:
 *   import { SolvencyHeartbeat } from '@heartbeat/sdk';
 *   const hb = new SolvencyHeartbeat({ network: 'testnet' });
 *   const h  = await hb.getAnchorHealth(issuer);
 *   if (h.status !== 'Healthy') rejectCollateral(h);
 *
 * Soroban cross-contract (Rust):
 *   let h = heartbeat::Client::new(&env, &REG).get_anchor_health(&issuer);
 *   assert!(h.ratio_bps >= 10_000, "anchor under-reserved");
 */

import {
  Contract,
  rpc as SorobanRpc,
  Address,
  scValToNative,
  Keypair,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  Account,
  xdr,
} from '@stellar/stellar-sdk';

// ── Public types ──────────────────────────────────────────────────────────────

export type HealthStatus = 'Healthy' | 'Watch' | 'Danger' | 'Stale' | 'Unknown';

export interface AnchorHealth {
  /** Stellar issuer address */
  issuer: string;
  /** Reserves ÷ issued in basis points (10 000 = 100 %) */
  ratioBps: number;
  /** Human-readable status */
  status: HealthStatus;
  /** Numeric status code: 0 Healthy | 1 Watch | 2 Danger | 3 Stale | 4 Unknown */
  statusCode: number;
  /** Unix timestamp of the last accepted attestation */
  lastAttestation: number;
  /** Signed peg deviation in basis points */
  pegDevBps: number;
  /** Redemptions per hour (rolling window) */
  redemptionRate: number;
}

export interface SolvencyHeartbeatOptions {
  /** "testnet" (default) or "mainnet" */
  network?: 'testnet' | 'mainnet';
  /** Override the Soroban RPC endpoint */
  rpcUrl?: string;
  /** Override the contract ID (defaults to well-known testnet deployment) */
  contractId?: string;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULTS = {
  testnet: {
    rpcUrl:     'https://soroban-testnet.stellar.org',
    contractId: process.env.HEARTBEAT_CONTRACT_ID ?? '',
  },
  mainnet: {
    rpcUrl:     'https://soroban.stellar.org',
    contractId: process.env.HEARTBEAT_CONTRACT_ID_MAINNET ?? '',
  },
};

const STATUS_MAP: Record<number, HealthStatus> = {
  0: 'Healthy',
  1: 'Watch',
  2: 'Danger',
  3: 'Stale',
  4: 'Unknown',
};

// ── SDK client ────────────────────────────────────────────────────────────────

export class SolvencyHeartbeat {
  private server: SorobanRpc.Server;
  private contract: Contract;
  private networkPassphrase: string;

  constructor(options: SolvencyHeartbeatOptions = {}) {
    const network = options.network ?? 'testnet';
    const defaults = DEFAULTS[network];
    const rpcUrl     = options.rpcUrl     ?? defaults.rpcUrl;
    const contractId = options.contractId ?? defaults.contractId;

    if (!contractId) {
      throw new Error(
        'contractId is required. Pass it via options or set HEARTBEAT_CONTRACT_ID env var.',
      );
    }

    this.server = new SorobanRpc.Server(rpcUrl, { allowHttp: false });
    this.contract = new Contract(contractId);
    this.networkPassphrase = network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
  }

  /**
   * Fetch the live solvency health for an anchor.
   *
   * @param issuer  Stellar account address of the anchor issuer.
   * @returns       AnchorHealth with status, ratio, peg deviation, and freshness.
   */
  async getAnchorHealth(issuer: string): Promise<AnchorHealth> {
    const issuerScVal = Address.fromString(issuer).toScVal();
    const tx = this._buildReadTx('get_anchor_health', [issuerScVal]);

    const sim = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(sim)) {
      throw new Error(`getAnchorHealth failed: ${sim.error}`);
    }

    const retval = (sim as SorobanRpc.Api.SimulateTransactionSuccessResponse).result?.retval;
    if (!retval) throw new Error('Contract returned no value');

    const raw = scValToNative(retval) as {
      ratio_bps: number;
      status: number;
      last_attestation: bigint;
      peg_dev_bps: number;
      redemption_rate: number;
    };

    return {
      issuer,
      ratioBps:        raw.ratio_bps,
      status:          STATUS_MAP[raw.status] ?? 'Unknown',
      statusCode:      raw.status,
      lastAttestation: Number(raw.last_attestation),
      pegDevBps:       raw.peg_dev_bps,
      redemptionRate:  raw.redemption_rate,
    };
  }

  /**
   * Returns true if the anchor is currently Healthy.
   * Convenience wrapper for common collateral-gate pattern.
   */
  async isHealthy(issuer: string): Promise<boolean> {
    const h = await this.getAnchorHealth(issuer);
    return h.status === 'Healthy';
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private _buildReadTx(method: string, args: xdr.ScVal[]) {
    // Throw-away keypair — reads don't need a real signer
    const kp = Keypair.random();
    const account = new Account(kp.publicKey(), '0');
    return new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(30)
      .build();
  }
}

// Re-export types for consumers
export type { AnchorHealth as HeartbeatHealth };
