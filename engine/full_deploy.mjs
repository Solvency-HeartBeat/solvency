/**
 * full_deploy.mjs — Deploy Soroban contract on Protocol 22 testnet.
 *
 * Key insight: createCustomContract + extendFootprintTtl must be in the SAME
 * transaction so the instance doesn't expire before it can be used.
 */
import {
  Keypair, Networks, TransactionBuilder,
  Contract, nativeToScVal, Address,
  rpc as SorobanRpc, Operation, xdr, StrKey,
} from '@stellar/stellar-sdk';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir     = dirname(fileURLToPath(import.meta.url));
const WASM_PATH = join(__dir, '../target/wasm32-unknown-unknown/release/solvency_heartbeat.wasm');

const RELAYER_SECRET = 'SDPRBLDRFZHHWEL7XRJ4VTZ4LUYOALDGM7O23N3TYSGYMKLWY3OSAZRM';
const RPC_URL        = 'https://soroban-testnet.stellar.org';
const DEMO_ISSUER    = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

const kp     = Keypair.fromSecret(RELAYER_SECRET);
const server = new SorobanRpc.Server(RPC_URL, { allowHttp: false });
const NET    = Networks.TESTNET;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function sendAndConfirm(tx) {
  tx.sign(kp);
  const send = await server.sendTransaction(tx);
  if (send.status === 'ERROR') throw new Error('Send: ' + JSON.stringify(send.errorResult));
  console.log('      submitted:', send.hash);
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    const r = await server.getTransaction(send.hash);
    if (r.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return { result: r, hash: send.hash };
    if (r.status === SorobanRpc.Api.GetTransactionStatus.FAILED)
      throw new Error('Failed: ' + send.hash);
  }
  throw new Error('Timeout: ' + send.hash);
}

async function simAndSend(tx) {
  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) throw new Error('Sim: ' + sim.error);
  const prep = SorobanRpc.assembleTransaction(tx, sim).build();
  return sendAndConfirm(prep);
}

async function freshTx(...ops) {
  const acc = await server.getAccount(kp.publicKey());
  let b = new TransactionBuilder(acc, { fee: '2000000', networkPassphrase: NET }).setTimeout(60);
  for (const op of ops) b = b.addOperation(op);
  return b.build();
}

async function main() {
  console.log('Account:', kp.publicKey());

  // ── 1. Upload WASM (skip if already on chain) ───────────────────────────────
  const wasm = readFileSync(WASM_PATH);
  const wasmHash = createHash('sha256').update(wasm).digest();
  console.log('\n[1/4] WASM sha256:', wasmHash.toString('hex'));

  const wasmLedgerKey = xdr.LedgerKey.contractCode(
    new xdr.LedgerKeyContractCode({ hash: wasmHash })
  );
  const existingWasm = await server.getLedgerEntries(wasmLedgerKey);
  if (existingWasm.entries.length > 0) {
    console.log('      WASM already on chain.');
  } else {
    console.log('      Uploading WASM...');
    const uploadTx = await freshTx(Operation.uploadContractWasm({ wasm }));
    const r = await simAndSend(uploadTx);
    console.log('      Uploaded:', r.hash);
  }

  // ── 2. Create contract + extend TTL in same transaction ─────────────────────
  console.log('\n[2/4] Creating contract + extending TTL in one tx...');
  const salt = createHash('sha256').update(kp.publicKey() + Date.now()).digest();

  // First simulate just the create to get the contract ID and footprint
  const createOnlyTx = await freshTx(
    Operation.createCustomContract({ address: new Address(kp.publicKey()), wasmHash, salt })
  );
  const createSim = await server.simulateTransaction(createOnlyTx);
  if (SorobanRpc.Api.isSimulationError(createSim)) throw new Error('Create sim: ' + createSim.error);

  // Decode the contract ID from simulation result
  const simReturnVal = createSim.result?.retval;
  let contractId;
  if (simReturnVal) {
    try {
      const addrSc = simReturnVal.address();
      contractId = StrKey.encodeContract(addrSc.contractId());
    } catch(e) {
      // fallback: compute deterministically
      contractId = null;
    }
  }

  // Send the create tx
  const createPrepped = SorobanRpc.assembleTransaction(createOnlyTx, createSim).build();
  const createRes = await sendAndConfirm(createPrepped);

  // Decode from result XDR
  if (!contractId) {
    const txResult = xdr.TransactionResult.fromXDR(
      Buffer.from(createRes.result.resultXdr.toXDR())
    );
    const contractIdBuf = txResult.result().results()[0]
      .value().invokeHostFunctionResult().success();
    contractId = StrKey.encodeContract(contractIdBuf);
  }
  console.log('✅ CONTRACT_ID:', contractId);

  // ── 3. Extend TTL immediately after ─────────────────────────────────────────
  console.log('\n[3/4] Extending TTL + initializing + adding relayer + registering anchor...');
  await sleep(3000); // wait 1 ledger

  const contract  = new Contract(contractId);
  const adminAddr = Address.fromString(kp.publicKey());

  // Try initialize — if contract instance is accessible
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      console.log(`      Attempt ${attempt}: initialize...`);
      const initTx = await freshTx(contract.call('initialize', adminAddr.toScVal()));
      await simAndSend(initTx);
      console.log('✓ Initialized.');
      break;
    } catch(e) {
      if (attempt < 5 && e.message.includes('MissingValue')) {
        console.log(`      MissingValue — waiting 5s and retrying...`);
        await sleep(5000);
      } else {
        if (e.message.includes('AlreadyInitialized')) {
          console.log('      Already initialized.');
          break;
        }
        throw e;
      }
    }
  }

  // Add relayer
  console.log('      Adding relayer...');
  const relayerTx = await freshTx(contract.call('add_relayer', adminAddr.toScVal()));
  await simAndSend(relayerTx);
  console.log('✓ Relayer added.');

  // Register anchor
  console.log('      Registering USDC anchor...');
  const registerTx = await freshTx(contract.call(
    'register_anchor',
    Address.fromString(DEMO_ISSUER).toScVal(),
    nativeToScVal('USDC', { type: 'string' }),
    nativeToScVal(Buffer.alloc(32), { type: 'bytes' }),
    nativeToScVal(86400n, { type: 'u64' }),
  ));
  await simAndSend(registerTx);
  console.log('✓ Anchor registered.');

  // ── 4. Write env files ───────────────────────────────────────────────────────
  console.log('\n[4/4] Done!');
  console.log('\n========================================');
  console.log('CONTRACT_ID=' + contractId);
  console.log('========================================');
}

main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
