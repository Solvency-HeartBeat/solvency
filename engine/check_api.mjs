import * as sdk from '@stellar/stellar-sdk';
console.log('Operation keys:', Object.keys(sdk.Operation).filter(k => k.toLowerCase().includes('wasm') || k.toLowerCase().includes('contract')));
console.log('Top-level:', Object.keys(sdk).filter(k => k.toLowerCase().includes('wasm') || k.toLowerCase().includes('contract')));
