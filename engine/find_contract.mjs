/**
 * find_contract.mjs — Finds the most recently deployed contract from our deployer account.
 */
import { Keypair, StrKey, xdr, hash } from '@stellar/stellar-sdk';

const DEPLOYER_PUBLIC = 'GDDFWW7H7YNZDTY3BZP6CJNAZPITHF5RJUZGS64TOCXRMHN53XXMVBW3';
const HORIZON = 'https://horizon-testnet.stellar.org';

// Fetch recent transactions from the deployer
const url = `${HORIZON}/accounts/${DEPLOYER_PUBLIC}/transactions?order=desc&limit=10`;
const res = await fetch(url);
const data = await res.json();

for (const tx of data._embedded.records) {
  console.log('TX hash:', tx.hash, '| created:', tx.created_at);
  // Fetch operations for this tx
  const opsRes = await fetch(`${HORIZON}/transactions/${tx.hash}/operations`);
  const ops = await opsRes.json();
  for (const op of ops._embedded.records) {
    console.log('  op type:', op.type, JSON.stringify(op).slice(0, 200));
  }
}
