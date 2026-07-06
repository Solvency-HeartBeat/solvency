# Changelog

All notable changes to Solvency Heartbeat are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
This project uses [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Planned
- Mainnet deployment guide
- Multi-anchor batch registration script
- GitHub Actions CI (contract tests + TypeScript checks)
- Formal contract audit

---

## [0.1.0] — 2026-07-06

### Added
- **Soroban contract** (`contracts/solvency_heartbeat/`)
  - `initialize`, `register_anchor`, `add_attestor`, `remove_attestor`
  - `submit_reserve` — signed reserve attestation with timestamp validation
  - `set_market` — relayer-pushed issued supply, peg deviation, redemption rate
  - `get_anchor_health`, `get_anchor` — public read functions
  - `add_relayer`, `set_thresholds` — admin configuration
  - On-chain health status: Healthy / Watch / Danger / Stale / Unknown
  - Soroban events on every health state change

- **Off-chain engine** (`engine/`)
  - Horizon ingest: issued supply, SDEX orderbook, redemption operations
  - Weighted scorer (0–100): reserve ratio 35%, freshness 20%, peg 20%, redemption 15%, control 10%
  - Soroban relayer: simulate → assemble → sign → submit → poll
  - Cron scheduler (default 5-minute cycle)
  - Winston structured logging

- **Dashboard** (`web/`)
  - Next.js 14 app with Tailwind CSS
  - AnchorCard with reserve ratio, peg deviation, redemption rate
  - RatioSparkline (last 12 readings via Recharts)
  - StatusBadge with animated pulse on Danger
  - AlertFeed with severity levels (info / warn / danger)
  - Live demo simulation: TrustBRL degrades Healthy → Watch → Danger over 48 s

- **SDK** (`sdk/`)
  - `SolvencyHeartbeat.getAnchorHealth(issuer)` — full health record
  - `SolvencyHeartbeat.isHealthy(issuer)` — boolean collateral gate
  - Soroban cross-contract example (Rust)

- **Repo hygiene**
  - Root npm workspaces (`engine`, `sdk`, `web`)
  - `.gitignore` excluding `node_modules/`, `target/`, `.env*`, `.next/`
  - `scripts/deploy.sh` — full deploy + init + relayer setup
  - `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`
  - GitHub issue templates and PR template

[Unreleased]: https://github.com/Solvency-HeartBeat/solvency/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Solvency-HeartBeat/solvency/releases/tag/v0.1.0
