/**
 * mockData.ts — Seed data for the 10-second demo.
 *
 * Four anchors: three healthy, one degrades live.
 * The dashboard polls this + contract state; in demo mode it uses only this.
 */

import { AnchorHealth } from './contract';

export interface AnchorMeta extends AnchorHealth {
  name: string;
  assetCode: string;
  ratioHistory: number[]; // last 12 readings (every 5 min)
  pegHistory: number[];
}

export const DEMO_ANCHORS: AnchorMeta[] = [
  {
    issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    name: 'Circle USD',
    assetCode: 'USDC',
    ratioBps: 10_250,
    status: 'Healthy',
    statusCode: 0,
    lastAttestation: Math.floor(Date.now() / 1000) - 3600,
    pegDevBps: 12,
    redemptionRate: 4,
    ratioHistory: [10_200, 10_220, 10_230, 10_240, 10_250, 10_250, 10_255, 10_250, 10_248, 10_251, 10_250, 10_250],
    pegHistory:    [8, 10, 11, 12, 12, 13, 12, 11, 12, 12, 12, 12],
  },
  {
    issuer: 'GBVNNPOFVV2LABX5COQFBE6RVNPV7VD3GBYOVBBGCBPGBWWQXVGN4YMN',
    name: 'AnchorUSD',
    assetCode: 'aUSD',
    ratioBps: 9_850,
    status: 'Watch',
    statusCode: 1,
    lastAttestation: Math.floor(Date.now() / 1000) - 7200,
    pegDevBps: 180,
    redemptionRate: 22,
    ratioHistory: [10_100, 10_050, 10_000, 9_980, 9_950, 9_920, 9_900, 9_880, 9_870, 9_860, 9_855, 9_850],
    pegHistory:    [20, 40, 60, 80, 100, 120, 140, 155, 165, 175, 178, 180],
  },
  {
    issuer: 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGZS9R8E1NF4OXNCRD4STNV',
    name: 'BridgeEUR',
    assetCode: 'BEUR',
    ratioBps: 10_100,
    status: 'Healthy',
    statusCode: 0,
    lastAttestation: Math.floor(Date.now() / 1000) - 1800,
    pegDevBps: -15,
    redemptionRate: 2,
    ratioHistory: [10_090, 10_095, 10_100, 10_100, 10_102, 10_100, 10_099, 10_100, 10_101, 10_100, 10_100, 10_100],
    pegHistory:    [-10, -12, -14, -15, -15, -14, -15, -15, -15, -15, -15, -15],
  },
  {
    issuer: 'GDVKY2OJLKD3ZQRQ3PKNXW4MHLDZ3EPBTXPQE7HS3IXMLNRTV6GNZPQF',
    name: 'TrustBRL',
    assetCode: 'BRL',
    ratioBps: 10_000, // starts healthy — will degrade in demo
    status: 'Healthy',
    statusCode: 0,
    lastAttestation: Math.floor(Date.now() / 1000) - 900,
    pegDevBps: 5,
    redemptionRate: 1,
    ratioHistory: [10_000, 10_000, 10_000, 9_980, 9_950, 9_800, 9_600, 9_300, 9_000, 8_700, 8_400, 8_000],
    pegHistory:    [5, 5, 8, 30, 80, 150, 220, 290, 310, 340, 360, 380],
  },
];
