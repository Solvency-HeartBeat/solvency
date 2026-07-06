/**
 * setup.mjs — Initialize contract, add relayer, register demo anchor.
 *
 * Usage: node setup.mjs <CONTRACT_ID>
 *
 * Deploy the contract first with stellar CLI, then run this script.
 */
import {
  Keypair, Networks, TransactionBuilder, BASE_FEE,
  Contract, nativeToScVal, Address, rpc as SorobanRpc,
} from '@stellar/stellar-sdk';

const RELAYER_SECRET = 'SDPRBLDRFZHHWEL7XRJ4VTZ4LUYOALDGM7O23N3TYSGYMKLWY3OSAZRM';
const RPC_URL        = 'https://soroban-testnet.stellar.org';
const DEMO_ISSUER    = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

const CONTRACT_ID = process.argv[2];
if (!CONTRACT_ID) {
  console.error('Usage: node setup.mjs <CONTRACT_ID>');
  process.exit(1);
}

const kp     = Keypair.fromSecret(RELAYER_SECRET);
const server = new SorobanRpc.Server(RPC_URL, { allowHttp: false });
const NET    = Networks.TESTNET;

async function submit(tx) {
  const sim = await server.simulateTransaction(tx);
  if (SorobanRpc.Api.isSimulationError(sim)) throw new Error('Sim failed: ' + sim.error);
  const prep = SorobanRpc.assembleTransaction(tx, sim).build();
  prep.sign(kp);
  const send = await server.sendTransaction(prep);
  if (send.status === 'ERROR') throw new Error('Send failed: ' + JSON.stringify(send.errorResult));
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const r = await server.getTransaction(send.hash);
    if (r.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) return r;
    if (r.status === SorobanRpc.Api.GetTransactionStatus.FAILED)
      throw new Error('TX failed: ' + send.hash);
  }
  throw new Error('Timeout: ' + send.hash);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function buildTx(ops) {
  const acc = await server.getAccount(kp.publicKey());
  let b = new TransactionBuilder(acc, { fee: BASE_FEE, networkPassphrase: NET }).setTimeout(60);
  for (const op of ops) b = b.addOperation(op);
  return b.build();
}

async function main() {
  const contract = new Contract(CONTRACT_ID);
  const adminAddr = Address.fromString(kp.publicKey());
  console.log('Admin/Relayer:', kp.publicKey());
  console.log('Contract ID: ', CONTRACT_ID);

  // 1. Initialize
  console.log('\n[1/3] Initializing (set admin)...');
  try {
    const initTx = await buildTx([contract.call('initialize', adminAddr.toScVal())]);
    await submit(initTx);
    console.log('✓ Initialized.');
  } catch (e) {
    if (e.message.includes('AlreadyInitialized')) {
      console.log('Already initialized — skipping.');
    } else { throw e; }
  }

  // 2. Add relayer to allowlist
  console.log('\n[2/3] Adding relayer to allowlist...');
  const addRelayerTx = await buildTx([contract.call('add_relayer', adminAddr.toScVal())]);
  await submit(addRelayerTx);
  console.log('✓ Relayer added.');

  // 3. Register demo anchor (USDC issuer)
  console.log('\n[3/3] Registering demo anchor (USDC)...');
  const issuerAddr = Address.fromString(DEMO_ISSUER);
  const metaHash   = Buffer.alloc(32);
  const registerTx = await buildTx([
    contract.call(
      'register_anchor',
      issuerAddr.toScVal(),
      nativeToScVal('USDC', { type: 'string' }),
      nativeToScVal(metaHash, { type: 'bytes' }),
      nativeToScVal(86400n, { type: 'u64' }),
    )
  ]);
  await submit(registerTx);
  console.log('✓ Anchor registered.');

  console.log('\n✅ Setup complete! Engine is ready to run.');
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
