# Contributing to Solvency Heartbeat

Thanks for your interest in contributing. This document explains how to get started.

---

## Ways to contribute

- Report bugs via [GitHub Issues](https://github.com/Solvency-HeartBeat/solvency/issues)
- Suggest features or improvements
- Submit pull requests for fixes or new functionality
- Improve documentation

---

## Development setup

```bash
git clone https://github.com/Solvency-HeartBeat/solvency.git
cd solvency

# Install all JS dependencies
npm install

# Install Rust WASM target
rustup target add wasm32-unknown-unknown
```

---

## Project layout

| Folder | Stack | Purpose |
|---|---|---|
| `contracts/` | Rust / Soroban | Smart contract |
| `engine/` | Node.js / TypeScript | Off-chain scoring engine |
| `web/` | Next.js 14 | Dashboard |
| `sdk/` | TypeScript | Integration client |

---

## Running things locally

```bash
# Dashboard (demo mode — no contract needed)
npm run dev:web

# Engine (requires engine/.env with CONTRACT_ID and RELAYER_SECRET)
npm run dev:engine

# Contract tests
npm run test:contract

# TypeScript type-check (engine)
cd engine && npx tsc --noEmit
```

---

## Pull request guidelines

1. **Fork** the repo and create a branch from `main`.
2. **One concern per PR** — keep changes focused.
3. **Tests** — add or update tests for any contract changes.
4. **Commit messages** — use the conventional format:
   - `feat: add reserve attestation expiry`
   - `fix: correct peg deviation calculation`
   - `docs: update contract API table`
   - `chore: bump stellar-sdk version`
5. **No secrets** — never commit `.env` files or private keys.
6. Open the PR against `main` and fill in the PR template.

---

## Contract changes

Any change to `contracts/solvency_heartbeat/src/lib.rs` must:

- Pass all existing tests: `cargo test -p solvency_heartbeat --features testutils`
- Include new tests for new functionality
- Not break the existing `HealthRecord` / `AnchorRecord` ABI without a version bump

---

## Code style

- **Rust** — `cargo fmt` and `cargo clippy --all-targets`
- **TypeScript** — project uses ESLint; run `npm run lint:engine`
- **React** — follow the existing component patterns in `web/src/components/`

---

## Questions?

Open a [GitHub Discussion](https://github.com/Solvency-HeartBeat/solvency/discussions) or file an issue with the `question` label.
