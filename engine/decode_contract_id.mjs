import { xdr, StrKey } from '@stellar/stellar-sdk';

const RESULT_XDR = 'AAAAAAQuJ5EAAAAAAAAAAQAAAAAAAAAYAAAAADS/BjklKgsyjIuwHrWJN/T3kuxwlmaeaYRVL1+pcIceAAAAAA==';

const buf = Buffer.from(RESULT_XDR, 'base64');
const result = xdr.TransactionResult.fromXDR(buf);

const opResults = result.result().results();
const invokeResult = opResults[0].value().invokeHostFunctionResult();

// success() returns the raw 32-byte contract ID buffer
const contractIdBytes = invokeResult.success();
const contractId = StrKey.encodeContract(contractIdBytes);

console.log('CONTRACT_ID:', contractId);
