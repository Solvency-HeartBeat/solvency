<p align="center">
  <img src="assets/logo.svg" alt="Solvency Heartbeat Logo" width="120"/>
</p>

<h1 align="center">Solvency Heartbeat</h1>

<p align="center"><b>Real-time proof-of-reserves oracle for Stellar stablecoin anchors — on-chain, verifiable, composable.</b></p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License"/></a>
  <a href="https://stellar.org"><img src="https://img.shields.io/badge/network-Stellar%20Testnet-7B2FBE" alt="Stellar Testnet"/></a>
  <a href="https://soroban.stellar.org"><img src="https://img.shields.io/badge/built%20with-Soroban-FF6B35" alt="Soroban"/></a>
  <a href="https://github.com/Solvency-HeartBeat/solvency/actions"><img src="https://img.shields.io/github/actions/workflow/status/Solvency-HeartBeat/solvency/ci.yml?label=CI" alt="CI"/></a>
  <a href="https://solvency-web.vercel.app"><img src="https://img.shields.io/badge/demo-live-22c55e?logo=vercel" alt="Live Demo"/></a>
</p>

---

## What is Solvency Heartbeat?

Stablecoin issuers on Stellar ("anchors") promise every token is backed 1:1 by real reserves. Today there is no trustless way to verify that claim on-chain.

**Solvency Heartbeat fixes that.**

An off-chain engine pulls live data from Stellar Horizon every 5 minutes — issued supply, SDEX peg prices, redemption velocity — scores each anchor against a weighted rubric, and writes a signed verdict to a Soroban smart contract. Any DeFi protocol can call `get_anchor_health()` and gate collateral acceptance in a single line.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Soroban Contract  (Rust)                                │
│  contracts/solvency_heartbeat/                           │
│                                                          │
│  register_anchor · submit_reserve · set_market           │
│  get_anchor_health · add_relayer · set_thresholds        │
└────────────────────────┬─────────────────────────────────┘
                         │  Soroban RPC  (read / write)
┌────────────────────────▼─────────────────────────────────┐
│  Off-chain Engine  (Node.js / TypeScript)                │
│  engine/src/                                             │
│                                                          │
│  ingest.ts   — Horizon: supply · SDEX book · ops         │
│  scoring.ts  — weighted 0-100 signal score               │
│  relayer.ts  — build & submit set_market() tx            │
│  index.ts    — cron scheduler (default: every 5 min)     │
└────────────────────────┬─────────────────────────────────┘
                         │  contract read  (simulate tx)
┌────────────────────────▼─────────────────────────────────┐
│  Dashboard  (Next.js 14 + Tailwind)                      │
│  web/src/                                                │
│                                                          │
│  AnchorCard · RatioSparkline · AlertFeed · StatusBadge   │
└──────────────────────────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│  SDK  (@heartbeat/sdk)                                   │
│  sdk/src/index.ts                                        │
│                                                          │
│  SolvencyHeartbeat.getAnchorHealth(issuer)               │
│  SolvencyHeartbeat.isHealthy(issuer)                     │
└──────────────────────────────────────────────────────────┘
```

---

## Scoring Rubric

| Signal | Weight | Threshold |
|---|:---:|---|
| Reserve ratio (reserves ÷ issued) | **35** | ≥100 % Healthy · ≥90 % Watch · <80 % Danger |
| Attestation freshness | **20** | <1 h full · <6 h partial · >24 h Stale |
| Peg deviation on SDEX | **20** | <0.5 % full · <3 % partial · >6 % zero |
| Redemption velocity | **15** | 0/h full · ≤10/h good · >200/h zero |
| Issuer control events | **10** | No flags = 10 pts; freeze/clawback deducts |

A total score ≥ 80 = **Healthy**, ≥ 55 = **Watch**, < 55 = **Danger**.  
Any anchor with no fresh attestation in 24 h is auto-downgraded to **Stale**.

---

## Project Structure

```
HEARTBEAT/
├── contracts/
│   └── solvency_heartbeat/       # Soroban smart contract (Rust)
│       ├── src/
│       │   ├── lib.rs            # Contract logic
│       │   └── test.rs           # Unit tests
│       └── Cargo.toml
│
├── engine/                       # Off-chain monitoring engine (Node.js)
│   ├── src/
│   │   ├── index.ts              # Entrypoint & cron scheduler
│   │   ├── ingest.ts             # Horizon data fetcher
│   │   ├── scoring.ts            # Weighted signal scorer
│   │   ├── relayer.ts            # Soroban transaction builder
│   │   ├── types.ts              # Shared TypeScript types
│   │   └── logger.ts             # Winston logger
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── web/                          # Next.js 14 dashboard
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx        # Root layout & header
│   │   │   ├── page.tsx          # Main dashboard page
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── AnchorCard.tsx    # Per-anchor status card
│   │   │   ├── AlertFeed.tsx     # Real-time alert list
│   │   │   ├── RatioSparkline.tsx
│   │   │   └── StatusBadge.tsx
│   │   └── lib/
│   │       ├── contract.ts       # Status types & helpers
│   │       └── mockData.ts       # Demo seed data
│   ├── .env.example
│   └── package.json
│
├── sdk/                          # @heartbeat/sdk — integration client
│   ├── src/
│   │   └── index.ts
│   └── package.json
│
├── data/
│   └── seed_anchors.json         # Testnet anchor registry seed
│
├── scripts/
│   └── deploy.sh                 # Contract build + deploy helper
│
├── Cargo.toml                    # Rust workspace
└── README.md
```

---

## Quick Start

### Prerequisites

| Tool | Version | Install |
|---|---|---|
| Rust | stable | `curl https://sh.rustup.rs -sSf \| sh` |
| wasm32 target | — | `rustup target add wasm32-unknown-unknown` |
| Stellar CLI | ≥ 27 | [stellar.org/developers](https://developers.stellar.org/docs/tools/stellar-cli) |
| Node.js | ≥ 20 | [nodejs.org](https://nodejs.org) |

### 1. Clone & install

```bash
git clone https://github.com/Solvency-HeartBeat/solvency.git
cd solvency
```

### 2. Build & deploy the contract

```bash
# Build WASM
cargo build --target wasm32-unknown-unknown --release \
  -p solvency_heartbeat

# Deploy to Testnet (requires a funded Stellar identity)
stellar keys generate me --network testnet
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/solvency_heartbeat.wasm \
  --source me \
  --network testnet
# → copy the CONTRACT_ID printed here

# Initialize
stellar contract invoke \
  --id <CONTRACT_ID> --source me --network testnet \
  -- initialize --admin $(stellar keys address me)
```

### 3. Run the engine

```bash
cd engine
cp .env.example .env
# Edit .env — fill CONTRACT_ID and RELAYER_SECRET
npm install
npm run dev
```

### 4. Run the dashboard

```bash
cd web
cp .env.example .env.local
# Edit .env.local — fill NEXT_PUBLIC_CONTRACT_ID
npm install
npm run dev
# → http://localhost:3000
```

---

## Contract API

| Function | Caller | Description |
|---|---|---|
| `initialize(admin)` | admin | Set contract authority (once) |
| `register_anchor(issuer, asset_code, meta_hash, freshness_window)` | admin | Onboard an anchor |
| `add_relayer(relayer)` | admin | Whitelist a relayer address |
| `add_attestor(issuer, attestor)` | admin | Authorize an attestor key |
| `submit_reserve(issuer, attestor, amount, currency, timestamp)` | attestor | Push a signed reserve proof |
| `set_market(relayer, issuer, issued_amount, peg_dev_bps, redemption_rate)` | relayer | Update live market signals |
| `get_anchor_health(issuer)` | anyone | Returns `HealthRecord` |
| `get_anchor(issuer)` | anyone | Returns `AnchorRecord` metadata |
| `set_thresholds(thresholds)` | admin | Override scoring thresholds |

### HealthRecord fields

```rust
pub struct HealthRecord {
    pub ratio_bps: u32,        // reserves ÷ issued × 10 000
    pub status: u32,           // 0 Healthy | 1 Watch | 2 Danger | 3 Stale | 4 Unknown
    pub last_attestation: u64, // Unix timestamp
    pub peg_dev_bps: i32,      // signed deviation from par (bps)
    pub redemption_rate: u32,  // burns / hour
}
```

---

## SDK Integration

```bash
npm install @heartbeat/sdk
```

```typescript
import { SolvencyHeartbeat } from '@heartbeat/sdk';

const hb = new SolvencyHeartbeat({
  network:    'testnet',
  contractId: 'C...',          // your deployed contract ID
});

const health = await hb.getAnchorHealth(issuerAddress);

if (health.status !== 'Healthy') {
  rejectCollateral(health);    // ratio < 90 % or peg broken
}
```

**Cross-contract call (Rust):**

```rust
let health = heartbeat::Client::new(&env, &contract_id)
    .get_anchor_health(&issuer);

assert!(health.ratio_bps >= 10_000, "anchor under-reserved");
```

---

## Environment Variables

### engine/.env

```env
CONTRACT_ID=C...                          # Deployed Soroban contract
RELAYER_SECRET=S...                       # Funded Stellar keypair secret
RPC_URL=https://soroban-testnet.stellar.org
NETWORK=testnet                           # testnet | mainnet
CRON_SCHEDULE=*/5 * * * *                # Every 5 minutes
LOG_LEVEL=info                            # error | warn | info | debug
DEMO_ISSUER_1=GBBD47...                   # Single-anchor testnet demo
```

### web/.env.local

```env
NEXT_PUBLIC_CONTRACT_ID=C...
NEXT_PUBLIC_RPC_URL=https://soroban-testnet.stellar.org
NEXT_PUBLIC_NETWORK=testnet
```

---

## Running Tests

```bash
# Contract unit tests
cargo test -p solvency_heartbeat --features testutils

# Engine type-check
cd engine && npx tsc --noEmit

# Dashboard build check
cd web && npm run build
```

---

## Milestones

- [x] **M1** — Soroban contract: `register_anchor`, `submit_reserve`, `get_anchor_health`, unit tests, Testnet deploy
- [x] **M2** — Issued-supply pull + attestation freshness window
- [x] **M3** — Peg-deviation engine + redemption-velocity signal
- [x] **M4** — Next.js dashboard: live board, sparklines, alert feed
- [x] **M5** — SDK: `getAnchorHealth()` + Soroban cross-contract example

---

## License

Code — **Apache-2.0**  
Data (`/data`) — **CC-BY-4.0**
