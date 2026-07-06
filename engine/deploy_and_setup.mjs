/**
 * deploy_and_setup.mjs
 * Full flow: upload WASM → create contract → initialize → add_relayer → register_anchor
 */
import {
  Keypair, Networks, TransactionBuilder, BASE_FEE,
  Contract, nativeToScVal, Address, rpc as SorobanRpc,
  Operation, hash, xdr, StrKey,
} from '@stellar/stellar-sdk';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

const RELAYER_SECRET = 'SDPRBLDRFZHHWEL7XRJ4VTZ4LUYOALDGM7O23N3TYSGYMKLWY3OSAZRM';
const RPC_URL        = 'https://soroban-testnet.stellar.org';
const DEMO_ISSUER    = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const WASM_PATH      = join(__dir, '../target/wasm32-unknown-unknown/release/solvency_heartbeat.wasm');

const kp     = Keypair.fromSecret(RELAYER_SECRET);
const server = new SorobanRpc.Server(RPC_URL, { allowHttp: false });
const NET    = Networks.TESTNET;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function submit(tx) {
  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) {
    throw new Error('Sim failed: ' + sim.error);
  }
  const prep = SorobanRpc.assembleTransaction(tx, sim).build();
  prep.sign(kp);
  const send = await server.sendTransaction(prep);
  if (send.status === 'ERROR') throw new Error('Send failed: ' + JSON.stringify(send.errorResult));
  for (let i = 0; i < 40; i++) {
    await sleep(2000);
    const r = await server.getTransaction(send.hash);
    if (r.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return { result: r, hash: send.hash };
    if (r.status === SorobanRpc.Api.GetTransactionStatus.FAILED)
      throw new Error('TX failed hash=' + send.hash);
  }
  throw new Error('Timeout hash=' + send.hash);
}

async function buildTx(op) {
  const acc = await server.getAccount(kp.publicKey());
  return new TransactionBuilder(acc, { fee: '1000000', networkPassphrase: NET })
    .addOperation(op)
    .setTimeout(60)
    .build();
}

async function main() {
  console.log('Deployer:', kp.publicKey());

  // ── Step 1: Upload WASM ────────────────────────────────────────────────────
  console.log('\n[1/5] Uploading WASM...');
  const wasm = readFileSync(WASM_PATH);
  const uploadTx = await buildTx(Operation.uploadContractWasm({ wasm }));
  const uploadRes = await submit(uploadTx);
  console.log('WASM upload confirmed, hash:', uploadRes.hash);
  
  // Compute wasm hash ourselves (sha256 of the wasm bytes)
  const { createHash } = await import('crypto');
  const wasmHashBuf = createHash('sha256').update(wasm).digest();

  // ── Step 2: Create contract instance ──────────────────────────────────────
  console.log('\n[2/5] Creating contract instance...');
  const createTx = await buildTx(
    Operation.createCustomContract({
      address: new Address(kp.publicKey()),
      wasmHash: wasmHashBuf,
    })
  );
  const createRes = await submit(createTx);
  
  const createResult = xdr.TransactionResult.fromXDR(
    Buffer.from(createRes.result.resultXdr.toXDR())
  );
  const contractIdBuf = createResult.result().results()[0]
    .value().invokeHostFunctionResult().success();
  const contractId = StrKey.encodeContract(contractIdBuf);
  console.log('✅ Contract ID:', contractId);

  const contract = new Contract(contractId);
  const adminAddr = Address.fromString(kp.publicKey());

  // ── Step 3: Initialize ────────────────────────────────────────────────────
  console.log('\n[3/5] Initializing (waiting 6s for ledger propagation)...');
  await sleep(6000);
  const initTx = await buildTx(contract.call('initialize', adminAddr.toScVal()));
  await submit(initTx);
  console.log('✓ Initialized.');

  // ── Step 4: Add relayer ────────────────────────────────────────────────────
  console.log('\n[4/5] Adding relayer...');
  const relayerTx = await buildTx(contract.call('add_relayer', adminAddr.toScVal()));
  await submit(relayerTx);
  console.log('✓ Relayer added.');

  // ── Step 5: Register demo anchor ─────────────────────────────────────────
  console.log('\n[5/5] Registering USDC anchor...');
  const registerTx = await buildTx(contract.call(
    'register_anchor',
    Address.fromString(DEMO_ISSUER).toScVal(),
    nativeToScVal('USDC', { type: 'string' }),
    nativeToScVal(Buffer.alloc(32), { type: 'bytes' }),
    nativeToScVal(86400n, { type: 'u64' }),
  ));
  await submit(registerTx);
  console.log('✓ Anchor registered.');

  console.log('\n✅ All done!');
  console.log('CONTRACT_ID =', contractId);
  console.log('\nUpdate engine/.env and web/.env.local with this CONTRACT_ID.');
}

main().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
