# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| `main` branch | ✅ |
| Tagged releases | ✅ |
| Older branches | ❌ |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub Issues.**

If you discover a vulnerability — especially one that could affect funds, access control, or the integrity of on-chain reserve data — please report it privately:

1. Go to the [GitHub Security Advisories](https://github.com/Solvency-HeartBeat/solvency/security/advisories) page.
2. Click **"Report a vulnerability"**.
3. Describe the issue, steps to reproduce, and potential impact.

We will acknowledge your report within **48 hours** and aim to release a fix within **7 days** for critical issues.

## Scope

### In scope
- Soroban contract logic (`contracts/solvency_heartbeat/`)
- Authentication and authorization bypasses
- Reserve ratio manipulation via contract calls
- Relayer allowlist circumvention
- Engine key exposure or injection vulnerabilities

### Out of scope
- Testnet-only issues with no mainnet equivalent
- Issues requiring physical access to the host machine
- Third-party dependencies (report those upstream)

## Disclosure Policy

We follow responsible disclosure. Once a fix is released we will publish a security advisory crediting the reporter (unless they prefer to remain anonymous).

## Smart Contract Audits

This project has not yet undergone a formal third-party audit. Treat all deployed contracts as unaudited until this notice is removed.
