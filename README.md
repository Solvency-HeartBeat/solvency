# Solvency Heartbeat

**Real-time proof-of-reserves for the fiat anchors Stellar depends on.**

> A live heartbeat comparing an anchor's issued tokens against provable reserves — green while the ratio holds, red the instant it breaks or redemptions stress it.

Part of the **Stellar Trust-Oracle Suite**

---

## What it does

Solvency Heartbeat is a proof-of-reserves oracle for Stellar anchors. Anchors and independent auditors push signed reserve attestations; the Soroban contract compares them to on-chain issued supply and exposes `get_anchor_health()` with a live status.

| Signal | Weight | What it measures |
|---|---|---|
| Reserve ratio (reserves ÷ issued) | 35 | Core solvency metric in basis points |
| Attestation freshness | 20 | Stale attestations auto-downgrade |
| Peg deviation on SDEX/AMM | 20 | Asset trading away from par |
| Redemption velocity | 15 | Bank-run signal (burn spikes) |
| Issuer control events | 10 | Freeze/clawback / signer changes |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1 — Soroban Contract (Rust)                      │
│  contracts/solvency_heartbeat/src/lib.rs                │
│  get_anchor_health() · submit_reserve() · set_market()  │
└───────────────────────┬─────────────────────────────────┘
                        │ on-chain reads / writes
┌───────────────────────▼─────────────────────────────────┐
│  Layer 2 — Off-chain Engine (Node.js + TypeScript)      │
│  engine/src/  ingest · scoring · relayer                │
│  Pulls Horizon data, scores signals, relays verdicts    │
└───────────────────────┬─────────────────────────────────┘
                        │ Soroban RPC
┌───────────────────────▼─────────────────────────────────┐
│  Layer 3 — Dashboard (Next.js 14 + Tailwind)            │
│  web/  — live heartbeat board, sparklines, alert feed   │
└─────────────────────────────────────────────────────────┘
```

---

## Quick start

### Prerequisites

```bash
# Rust + WASM target
rustup target add wasm32-unknown-unknown

# Stellar CLI
cargo install --locked stellar-cli

# Node.js 20+ and pnpm
npm i -g pnpm

# Funded Testnet identity
stellar keys generate me --network testnet
stellar keys fund me --network testnet
```

### 1 — Deploy the contract

```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh
# → prints CONTRACT_ID
```

### 2 — Run the engine

```bash
cd engine
cp .env.example .env
# Fill in CONTRACT_ID and RELAYER_SECRET in .env
pnpm install
pnpm dev
```

### 3 — Run the dashboard

```bash
cd web
cp .env.example .env.local
# Fill in NEXT_PUBLIC_CONTRACT_ID
pnpm install
pnpm dev
# → open http://localhost:3000
```

---

## Integration

```typescript
// TypeScript — one-line collateral gate
import { SolvencyHeartbeat } from '@heartbeat/sdk';

const hb = new SolvencyHeartbeat({ network: 'testnet' });
const h  = await hb.getAnchorHealth(issuer);
if (h.status !== 'Healthy') rejectCollateral(h);
```

```rust
// Soroban cross-contract call
let h = heartbeat::Client::new(&env, &REG).get_anchor_health(&issuer);
assert!(h.ratio_bps >= 10_000, "anchor under-reserved");
```

---

## Contract API

| Function | Access | Purpose |
|---|---|---|
| `initialize(admin)` | admin | Set authority |
| `get_anchor_health(issuer)` | public read | Returns `HealthRecord` |
| `register_anchor(issuer, asset_code, meta_hash, freshness_window)` | admin | Onboard an anchor |
| `add_attestor(issuer, attestor)` | admin | Authorise an attestor key |
| `submit_reserve(issuer, attestor, amount, currency, timestamp)` | attestor (signed) | Push a reserve attestation |
| `set_market(relayer, issuer, issued_amount, peg_dev_bps, redemption_rate)` | relayer | Update market signals |
| `add_relayer(relayer)` | admin | Whitelist a relayer |
| `set_thresholds(thresholds)` | admin | Update status thresholds |

---

## Running tests

```bash
# Contract unit tests
cargo test --features testutils

# (From repo root)
cargo test -p solvency_heartbeat --features testutils
```

---

## Milestones

- **M1** — Contract core: `register_anchor`, `submit_reserve`, `get_anchor_health`, tests, Testnet deploy ✅
- **M2** — Supply + freshness: Horizon pull, freshness-window downgrade ✅
- **M3** — Market monitors: peg-deviation + redemption-velocity engines ✅
- **M4** — Dashboard: live heartbeat board, sparklines, alert feed ✅
- **M5** — SDK: one-line `getAnchorHealth()` + Soroban cross-contract example ✅

---

## License

- Code: **Apache-2.0**
- Data (`/data`): **CC-BY-4.0**
