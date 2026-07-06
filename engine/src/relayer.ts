/**
 * relayer.ts — Submit scored verdicts on-chain via Soroban RPC.
 *
 * Uses @stellar/stellar-sdk to build and submit transactions that call
 * set_market() on the SolvencyHeartbeat contract.
 */

import {
  Keypair,
  Networks,
  TransactionBuilder,
  BASE_FEE,
  Contract,
  nativeToScVal,
  Address,
  rpc as SorobanRpc,
} from '@stellar/stellar-sdk';
import { ScoringResult } from './types';
import { logger } from './logger';

export interface RelayerConfig {
  contractId: string;
  relayerSecretKey: string;
  network: 'testnet' | 'mainnet';
  rpcUrl: string;
}

export class Relayer {
  private keypair: Keypair;
  private server: SorobanRpc.Server;
  private contract: Contract;
  private networkPassphrase: string;
  private config: RelayerConfig;

  constructor(config: RelayerConfig) {
    this.config = config;
    this.keypair = Keypair.fromSecret(config.relayerSecretKey);
    this.server = new SorobanRpc.Server(config.rpcUrl, { allowHttp: false });
    this.contract = new Contract(config.contractId);
    this.networkPassphrase =
      config.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
  }

  /**
   * Submit set_market() for a single anchor verdict.
   */
  async submitVerdict(result: ScoringResult): Promise<string> {
    const account = await this.server.getAccount(this.keypair.publicKey());

    const relayerAddress = Address.fromString(this.keypair.publicKey());
    const issuerAddress  = Address.fromString(result.issuer);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        this.contract.call(
          'set_market',
          relayerAddress.toScVal(),
          issuerAddress.toScVal(),
          nativeToScVal(result.ratioBps > 0 ? BigInt(result.ratioBps) : 0n, { type: 'u128' }),
          nativeToScVal(result.pegDevBps, { type: 'i32' }),
          nativeToScVal(result.redemptionRate, { type: 'u32' }),
        ),
      )
      .setTimeout(30)
      .build();

    // Simulate first to get resource footprint
    const simResponse = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(simResponse)) {
      throw new Error(`Simulation failed: ${simResponse.error}`);
    }

    const preparedTx = SorobanRpc.assembleTransaction(tx, simResponse).build();
    preparedTx.sign(this.keypair);

    const sendResponse = await this.server.sendTransaction(preparedTx);
    if (sendResponse.status === 'ERROR') {
      throw new Error(`Send failed: ${JSON.stringify(sendResponse.errorResult)}`);
    }

    // Poll for confirmation
    const hash = sendResponse.hash;
    let attempts = 0;
    while (attempts < 20) {
      await sleep(1500);
      const txResult = await this.server.getTransaction(hash);
      if (txResult.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        logger.info(`set_market confirmed for ${result.issuer} | hash=${hash}`);
        return hash;
      }
      if (txResult.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
        throw new Error(`Transaction failed: ${hash}`);
      }
      attempts++;
    }
    throw new Error(`Transaction not confirmed after polling: ${hash}`);
  }

  /**
   * Batch submit multiple verdicts sequentially (avoids sequence-number races).
   */
  async submitBatch(results: ScoringResult[]): Promise<void> {
    for (const result of results) {
      try {
        await this.submitVerdict(result);
      } catch (err) {
        logger.error(`Failed to submit verdict for ${result.issuer}: ${err}`);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
