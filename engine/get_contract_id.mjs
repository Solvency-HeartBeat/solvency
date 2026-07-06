/**
 * get_contract_id.mjs — Derive contract ID from deploy transaction result.
 */

// The deploy tx hash
const TX_HASH = '9b827177e535b32511726564a11099661a8ae2bfdd1cf58e6445fbbbced9b1c1';
const HORIZON = 'https://horizon-testnet.stellar.org';

// Get the transaction result XDR which contains the contract ID in the result
const res = await fetch(`${HORIZON}/transactions/${TX_HASH}`);
const tx = await res.json();

console.log('result_xdr:', tx.result_xdr);
console.log('envelope_xdr (first 200):', tx.envelope_xdr?.slice(0, 200));

// Also check the effects
const efxRes = await fetch(`${HORIZON}/transactions/${TX_HASH}/effects`);
const efx = await efxRes.json();
for (const e of efx._embedded.records) {
  console.log('effect:', JSON.stringify(e));
}
