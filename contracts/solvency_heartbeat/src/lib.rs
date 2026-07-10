#![no_std]
use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror,
    Address, BytesN, Env, String, Vec,
    symbol_short, log,
};

// ── Storage keys ────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    RelayerAllowlist,
    Thresholds,
    Anchor(Address),
    Health(Address),
}

// ── Domain types ─────────────────────────────────────────────────────────────

/// Solvency status codes (stored as u32 for cheap comparison on-chain).
/// 0 = Healthy  1 = Watch  2 = Danger  3 = Stale  4 = Unknown
#[contracttype]
#[derive(Clone, PartialEq, Debug)]
pub struct HealthRecord {
    pub ratio_bps: u32,        // reserves ÷ issued in basis points (10 000 = 100 %)
    pub status: u32,           // 0 Healthy | 1 Watch | 2 Danger | 3 Stale | 4 Unknown
    pub last_attestation: u64, // Unix timestamp of latest accepted attestation
    pub peg_dev_bps: i32,      // signed peg deviation in bps (negative = discount)
    pub redemption_rate: u32,  // redemptions per hour (rolling, set by relayer)
}

#[contracttype]
#[derive(Clone)]
pub struct AnchorRecord {
    pub asset_code: String,
    pub meta_hash: BytesN<32>,
    pub attestor_keys: Vec<Address>,
    pub freshness_window: u64, // seconds before attestation is considered stale
    pub issued_amount: u128,   // latest pulled supply (set by relayer)
    pub reserve_amount: u128,  // latest accepted reserve attestation
    pub reserve_currency: String,
}

#[contracttype]
#[derive(Clone)]
pub struct Thresholds {
    pub healthy_bps: u32,  // default 10_000 (100 %)
    pub watch_bps: u32,    // default  9_000  (90 %)
    pub danger_bps: u32,   // default  8_000  (80 %)
    pub stale_secs: u64,   // default 86_400  (24 h)
    pub peg_warn_bps: i32, // default    300  ( 3 %)
}

impl Thresholds {
    pub fn default_values() -> Self {
        Self {
            healthy_bps: 10_000,
            watch_bps: 9_000,
            danger_bps: 8_000,
            stale_secs: 86_400,
            peg_warn_bps: 300,
        }
    }
}

// ── Errors ───────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Error {
    NotInitialized    = 1,
    AlreadyInitialized = 2,
    Unauthorized      = 3,
    AnchorNotFound    = 4,
    AnchorExists      = 5,
    InvalidAttestor   = 6,
    InvalidTimestamp  = 7,
    InvalidAmount     = 8,
}

// ── Helper: derive status from signals ───────────────────────────────────────

fn compute_status(
    ratio_bps: u32,
    peg_dev_bps: i32,
    last_attestation: u64,
    now: u64,
    t: &Thresholds,
) -> u32 {
    // Stale check takes priority — no fresh proof → can't be Healthy
    if now.saturating_sub(last_attestation) > t.stale_secs {
        return 3; // Stale
    }
    // Peg deviation (absolute value)
    let abs_peg = if peg_dev_bps < 0 { -peg_dev_bps } else { peg_dev_bps } as u32;
    let peg_warn = t.peg_warn_bps.unsigned_abs();
    if ratio_bps < t.danger_bps || abs_peg > peg_warn * 2 {
        return 2; // Danger
    }
    if ratio_bps < t.watch_bps || abs_peg > peg_warn {
        return 1; // Watch
    }
    if ratio_bps >= t.healthy_bps {
        return 0; // Healthy
    }
    1 // Watch catch-all
}

// ── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct SolvencyHeartbeat;

#[contractimpl]
impl SolvencyHeartbeat {

    // ── Admin: initialize ───────────────────────────────────────────────────

    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);

        let relayers: Vec<Address> = Vec::new(&env);
        env.storage().instance().set(&DataKey::RelayerAllowlist, &relayers);

        let t = Thresholds::default_values();
        env.storage().instance().set(&DataKey::Thresholds, &t);

        log!(&env, "SolvencyHeartbeat initialized, admin={}", admin);
        Ok(())
    }

    // ── Admin: register anchor ──────────────────────────────────────────────

    pub fn register_anchor(
        env: Env,
        issuer: Address,
        asset_code: String,
        meta_hash: BytesN<32>,
        freshness_window: u64,
    ) -> Result<(), Error> {
        let admin: Address = env
            .storage().instance().get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        if env.storage().persistent().has(&DataKey::Anchor(issuer.clone())) {
            return Err(Error::AnchorExists);
        }

        let anchor = AnchorRecord {
            asset_code,
            meta_hash,
            attestor_keys: Vec::new(&env),
            freshness_window,
            issued_amount: 0,
            reserve_amount: 0,
            reserve_currency: String::from_str(&env, "USD"),
        };
        env.storage().persistent().set(&DataKey::Anchor(issuer.clone()), &anchor);

        // Initialise health as Unknown (status=4)
        let health = HealthRecord {
            ratio_bps: 0,
            status: 4,
            last_attestation: 0,
            peg_dev_bps: 0,
            redemption_rate: 0,
        };
        env.storage().persistent().set(&DataKey::Health(issuer.clone()), &health);

        log!(&env, "Anchor registered: {}", issuer);
        Ok(())
    }

    // ── Admin: add / remove attestor key ───────────────────────────────────

    pub fn add_attestor(env: Env, issuer: Address, attestor: Address) -> Result<(), Error> {
        let admin: Address = env.storage().instance().get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let mut anchor: AnchorRecord = env.storage().persistent()
            .get(&DataKey::Anchor(issuer.clone()))
            .ok_or(Error::AnchorNotFound)?;

        anchor.attestor_keys.push_back(attestor);
        env.storage().persistent().set(&DataKey::Anchor(issuer), &anchor);
        Ok(())
    }

    pub fn remove_attestor(env: Env, issuer: Address, attestor: Address) -> Result<(), Error> {
        let admin: Address = env.storage().instance().get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let mut anchor: AnchorRecord = env.storage().persistent()
            .get(&DataKey::Anchor(issuer.clone()))
            .ok_or(Error::AnchorNotFound)?;

        // rebuild vec without the removed key
        let mut new_keys: Vec<Address> = Vec::new(&env);
        for k in anchor.attestor_keys.iter() {
            if k != attestor {
                new_keys.push_back(k);
            }
        }
        anchor.attestor_keys = new_keys;
        env.storage().persistent().set(&DataKey::Anchor(issuer), &anchor);
        Ok(())
    }

    // ── Admin: add / remove relayer ─────────────────────────────────────────

    pub fn add_relayer(env: Env, relayer: Address) -> Result<(), Error> {
        let admin: Address = env.storage().instance().get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();

        let mut relayers: Vec<Address> = env.storage().instance()
            .get(&DataKey::RelayerAllowlist)
            .unwrap_or_else(|| Vec::new(&env));
        relayers.push_back(relayer);
        env.storage().instance().set(&DataKey::RelayerAllowlist, &relayers);
        Ok(())
    }

    // ── Anchor/Auditor: submit reserve attestation ──────────────────────────
    //
    // The Soroban auth model means we call `attestor.require_auth()`.
    // Callers must be in the anchor's attestor_keys list.

    pub fn submit_reserve(
        env: Env,
        issuer: Address,
        attestor: Address,
        amount: u128,
        currency: String,
        timestamp: u64,
    ) -> Result<(), Error> {
        // Validate caller is a registered attestor for this anchor
        attestor.require_auth();

        let mut anchor: AnchorRecord = env.storage().persistent()
            .get(&DataKey::Anchor(issuer.clone()))
            .ok_or(Error::AnchorNotFound)?;

        // Check attestor is authorised
        let mut found = false;
        for k in anchor.attestor_keys.iter() {
            if k == attestor {
                found = true;
                break;
            }
        }
        if !found {
            return Err(Error::InvalidAttestor);
        }

        // Reject zero or clearly invalid amounts
        if amount == 0 {
            return Err(Error::InvalidAmount);
        }

        // Reject future timestamps (with 5-minute grace for clock skew)
        let now = env.ledger().timestamp();
        if timestamp > now + 300 {
            return Err(Error::InvalidTimestamp);
        }

        // Accept the attestation
        anchor.reserve_amount = amount;
        anchor.reserve_currency = currency;
        env.storage().persistent().set(&DataKey::Anchor(issuer.clone()), &anchor);

        // Recompute health
        Self::_recompute_health(&env, &issuer, &anchor, timestamp)?;

        log!(&env, "Reserve attestation accepted: issuer={} amount={} ts={}", issuer, amount, timestamp);
        Ok(())
    }

    // ── Relayer: push issued supply + market data ───────────────────────────

    pub fn set_market(
        env: Env,
        relayer: Address,
        issuer: Address,
        issued_amount: u128,
        peg_dev_bps: i32,
        redemption_rate: u32,
    ) -> Result<(), Error> {
        relayer.require_auth();

        // Check relayer is on the allowlist
        let relayers: Vec<Address> = env.storage().instance()
            .get(&DataKey::RelayerAllowlist)
            .unwrap_or_else(|| Vec::new(&env));
        let mut allowed = false;
        for r in relayers.iter() {
            if r == relayer {
                allowed = true;
                break;
            }
        }
        if !allowed {
            return Err(Error::Unauthorized);
        }

        let mut anchor: AnchorRecord = env.storage().persistent()
            .get(&DataKey::Anchor(issuer.clone()))
            .ok_or(Error::AnchorNotFound)?;

        anchor.issued_amount = issued_amount;
        env.storage().persistent().set(&DataKey::Anchor(issuer.clone()), &anchor);

        // Update health record with new market data
        let mut health: HealthRecord = env.storage().persistent()
            .get(&DataKey::Health(issuer.clone()))
            .unwrap_or(HealthRecord {
                ratio_bps: 0, status: 4, last_attestation: 0,
                peg_dev_bps: 0, redemption_rate: 0,
            });

        health.peg_dev_bps = peg_dev_bps;
        health.redemption_rate = redemption_rate;

        // Recompute ratio if we have reserves
        if anchor.issued_amount > 0 {
            health.ratio_bps = ((anchor.reserve_amount as u64 * 10_000)
                / anchor.issued_amount as u64) as u32;
        }

        let t: Thresholds = env.storage().instance()
            .get(&DataKey::Thresholds)
            .unwrap_or_else(|| Thresholds::default_values());
        let now = env.ledger().timestamp();
        health.status = compute_status(
            health.ratio_bps, health.peg_dev_bps,
            health.last_attestation, now, &t,
        );

        env.storage().persistent().set(&DataKey::Health(issuer.clone()), &health);

        // Emit event
        env.events().publish(
            (symbol_short!("health"), issuer.clone()),
            (health.status, health.ratio_bps),
        );
        Ok(())
    }

    // ── Read: get_anchor_health (pure, cheap) ───────────────────────────────

    pub fn get_anchor_health(env: Env, issuer: Address) -> Result<HealthRecord, Error> {
        env.storage().persistent()
            .get(&DataKey::Health(issuer))
            .ok_or(Error::AnchorNotFound)
    }

    // ── Read: get_anchor (meta) ─────────────────────────────────────────────

    pub fn get_anchor(env: Env, issuer: Address) -> Result<AnchorRecord, Error> {
        env.storage().persistent()
            .get(&DataKey::Anchor(issuer))
            .ok_or(Error::AnchorNotFound)
    }

    // ── Admin: update thresholds ────────────────────────────────────────────

    pub fn set_thresholds(env: Env, thresholds: Thresholds) -> Result<(), Error> {
        let admin: Address = env.storage().instance().get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)?;
        admin.require_auth();
        env.storage().instance().set(&DataKey::Thresholds, &thresholds);
        Ok(())
    }

    // ── Internal helpers ────────────────────────────────────────────────────

    fn _recompute_health(
        env: &Env,
        issuer: &Address,
        anchor: &AnchorRecord,
        attestation_ts: u64,
    ) -> Result<(), Error> {
        let mut health: HealthRecord = env.storage().persistent()
            .get(&DataKey::Health(issuer.clone()))
            .unwrap_or(HealthRecord {
                ratio_bps: 0, status: 4, last_attestation: 0,
                peg_dev_bps: 0, redemption_rate: 0,
            });

        health.last_attestation = attestation_ts;

        if anchor.issued_amount > 0 {
            health.ratio_bps = ((anchor.reserve_amount as u64 * 10_000)
                / anchor.issued_amount as u64) as u32;
        } else {
            // No issued supply yet — treat as fully backed (attestation only)
            health.ratio_bps = 10_000;
        }

        let t: Thresholds = env.storage().instance()
            .get(&DataKey::Thresholds)
            .unwrap_or_else(|| Thresholds::default_values());
        let now = env.ledger().timestamp();
        health.status = compute_status(
            health.ratio_bps, health.peg_dev_bps,
            health.last_attestation, now, &t,
        );

        env.storage().persistent().set(&DataKey::Health(issuer.clone()), &health);

        // Emit health event
        env.events().publish(
            (symbol_short!("health"), issuer.clone()),
            (health.status, health.ratio_bps),
        );
        Ok(())
    }
}

#[cfg(test)]
mod test;
