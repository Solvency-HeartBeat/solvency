/**
 * setup_contract.mjs
 * WASM already confirmed on testnet.
 * Steps: create instance → initialize → add_relayer → register_anchor
 *
 * Uses confirmed WASM hash from the upload tx that just succeeded.
 */
import {
  Keypair, Networks, TransactionBuilder,
  Contract, nativeToScVal, Address, rpc as SorobanRpc,
  Operation, xdr, StrKey,
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

async function submit(tx) {
  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) throw new Error('Sim: ' + sim.error);
  const prep = SorobanRpc.assembleTransaction(tx, sim).build();
  prep.sign(kp);
  const send = await server.sendTransaction(prep);
  if (send.status === 'ERROR') throw new Error('Send: ' + JSON.stringify(send.errorResult));
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    const r = await server.getTransaction(send.hash);
    if (r.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return { result: r, hash: send.hash };
    if (r.status === SorobanRpc.Api.GetTransactionStatus.FAILED)
      throw new Error('Failed: ' + send.hash);
  }
  throw new Error('Timeout');
}

async function buildTx(op) {
  const acc = await server.getAccount(kp.publicKey());
  return new TransactionBuilder(acc, { fee: '1000000', networkPassphrase: NET })
    .addOperation(op).setTimeout(60).build();
}

async function main() {
  console.log('Deployer:', kp.publicKey());

  // Compute wasm hash from the local file (matches what was uploaded)
  const wasm = readFileSync(WASM_PATH);
  const wasmHashBuf = createHash('sha256').update(wasm).digest();
  console.log('Using WASM hash:', wasmHashBuf.toString('hex'));

  // ── 1. Create contract instance ────────────────────────────────────────────
  console.log('\n[1/4] Creating contract instance...');
  const salt = createHash('sha256').update(Date.now().toString()).digest();
  const createTx = await buildTx(
    Operation.createCustomContract({
      address: new Address(kp.publicKey()),
      wasmHash: wasmHashBuf,
      salt,
    })
  );
  const createRes = await submit(createTx);

  const txResult = xdr.TransactionResult.fromXDR(
    Buffer.from(createRes.result.resultXdr.toXDR())
  );
  const contractIdBuf = txResult.result().results()[0]
    .value().invokeHostFunctionResult().success();
  const contractId = StrKey.encodeContract(contractIdBuf);
  console.log('✅ CONTRACT_ID:', contractId);

  const contract  = new Contract(contractId);
  const adminAddr = Address.fromString(kp.publicKey());

  // Wait for ledger to fully propagate the new contract instance
  console.log('   Waiting 8s for ledger...');
  await sleep(8000);

  // Extend TTL of the contract instance so it doesn't expire
  console.log('   Extending contract instance TTL...');
  try {
    const acc2 = await server.getAccount(kp.publicKey());
    const extendTx = new TransactionBuilder(acc2, { fee: '1000000', networkPassphrase: NET })
      .addOperation(Operation.extendFootprintTtl({ extendTo: 100000 }))
      .setTimeout(60)
      .build();
    // We need to set the footprint to the contract instance
    const sim2 = await server.simulateTransaction(extendTx);
    if (!SorobanRpc.Api.isSimulationError(sim2)) {
      const prep2 = SorobanRpc.assembleTransaction(extendTx, sim2).build();
      prep2.sign(kp);
      const send2 = await server.sendTransaction(prep2);
      console.log('   TTL extend sent:', send2.hash);
      await sleep(4000);
    }
  } catch(e) { console.log('   TTL extend note:', e.message.slice(0,80)); }

  // ── 2. Initialize ──────────────────────────────────────────────────────────
  console.log('\n[2/4] Initializing...');
  const initTx = await buildTx(contract.call('initialize', adminAddr.toScVal()));
  await submit(initTx);
  console.log('✓ Initialized.');

  // ── 3. Add relayer ─────────────────────────────────────────────────────────
  console.log('\n[3/4] Adding relayer...');
  const relayerTx = await buildTx(contract.call('add_relayer', adminAddr.toScVal()));
  await submit(relayerTx);
  console.log('✓ Relayer added.');

  // ── 4. Register USDC anchor ────────────────────────────────────────────────
  console.log('\n[4/4] Registering USDC anchor...');
  const registerTx = await buildTx(contract.call(
    'register_anchor',
    Address.fromString(DEMO_ISSUER).toScVal(),
    nativeToScVal('USDC', { type: 'string' }),
    nativeToScVal(Buffer.alloc(32), { type: 'bytes' }),
    nativeToScVal(86400n, { type: 'u64' }),
  ));
  await submit(registerTx);
  console.log('✓ Anchor registered.');

  console.log('\n✅ Done! Update .env files with:');
  console.log('CONTRACT_ID=' + contractId);
}

main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
