#![cfg(test)]
use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger, LedgerInfo},
    Address, BytesN, Env, String,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

fn setup() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    // Protocol 22 required by soroban-sdk v22
    env.ledger().set(LedgerInfo {
        timestamp: 1_000_000,
        protocol_version: 22,
        sequence_number: 1,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 1_000,
        min_persistent_entry_ttl: 1_000,
        max_entry_ttl: 10_000,
    });

    let contract_id = env.register(SolvencyHeartbeat, ());
    let admin   = Address::generate(&env);
    let relayer = Address::generate(&env);

    (env, contract_id, admin, relayer)
}

fn make_hash(env: &Env) -> BytesN<32> {
    BytesN::from_array(env, &[0u8; 32])
}

// ── initialize ────────────────────────────────────────────────────────────────

#[test]
fn test_initialize() {
    let (env, contract_id, admin, _) = setup();
    let client = SolvencyHeartbeatClient::new(&env, &contract_id);

    client.initialize(&admin);
    // Double-init must fail
    let res = client.try_initialize(&admin);
    assert!(res.is_err());
}

// ── register_anchor ───────────────────────────────────────────────────────────

#[test]
fn test_register_anchor() {
    let (env, contract_id, admin, _) = setup();
    let client = SolvencyHeartbeatClient::new(&env, &contract_id);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    client.register_anchor(
        &issuer,
        &String::from_str(&env, "USDC"),
        &make_hash(&env),
        &86_400u64,
    );

    let health = client.get_anchor_health(&issuer);
    assert_eq!(health.status, 4); // Unknown — no attestation yet
}

#[test]
fn test_register_anchor_duplicate_fails() {
    let (env, contract_id, admin, _) = setup();
    let client = SolvencyHeartbeatClient::new(&env, &contract_id);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    client.register_anchor(
        &issuer,
        &String::from_str(&env, "USDC"),
        &make_hash(&env),
        &86_400u64,
    );
    let res = client.try_register_anchor(
        &issuer,
        &String::from_str(&env, "USDC"),
        &make_hash(&env),
        &86_400u64,
    );
    assert!(res.is_err());
}

// ── submit_reserve ────────────────────────────────────────────────────────────

#[test]
fn test_submit_reserve_healthy() {
    let (env, contract_id, admin, relayer) = setup();
    let client = SolvencyHeartbeatClient::new(&env, &contract_id);
    client.initialize(&admin);
    client.add_relayer(&relayer);

    let issuer   = Address::generate(&env);
    let attestor = Address::generate(&env);

    client.register_anchor(
        &issuer,
        &String::from_str(&env, "USDC"),
        &make_hash(&env),
        &86_400u64,
    );
    client.add_attestor(&issuer, &attestor);

    // Push issued supply
    client.set_market(&relayer, &issuer, &1_000_000u128, &0i32, &0u32);

    // Reserves = issued → ratio = 10 000 bps (100 %)
    client.submit_reserve(
        &issuer,
        &attestor,
        &1_000_000u128,
        &String::from_str(&env, "USD"),
        &1_000_000u64,
    );

    let health = client.get_anchor_health(&issuer);
    assert_eq!(health.ratio_bps, 10_000);
    assert_eq!(health.status, 0); // Healthy
}

#[test]
fn test_submit_reserve_under_collateralised() {
    let (env, contract_id, admin, relayer) = setup();
    let client = SolvencyHeartbeatClient::new(&env, &contract_id);
    client.initialize(&admin);
    client.add_relayer(&relayer);

    let issuer   = Address::generate(&env);
    let attestor = Address::generate(&env);

    client.register_anchor(
        &issuer,
        &String::from_str(&env, "USDC"),
        &make_hash(&env),
        &86_400u64,
    );
    client.add_attestor(&issuer, &attestor);
    client.set_market(&relayer, &issuer, &1_000_000u128, &0i32, &0u32);

    // Reserves = 750 000, issued = 1 000 000 → ratio = 7 500 bps (75 %) → Danger
    client.submit_reserve(
        &issuer,
        &attestor,
        &750_000u128,
        &String::from_str(&env, "USD"),
        &1_000_000u64,
    );

    let health = client.get_anchor_health(&issuer);
    assert_eq!(health.ratio_bps, 7_500);
    assert_eq!(health.status, 2); // Danger
}

#[test]
fn test_submit_reserve_invalid_attestor_fails() {
    let (env, contract_id, admin, relayer) = setup();
    let client = SolvencyHeartbeatClient::new(&env, &contract_id);
    client.initialize(&admin);
    client.add_relayer(&relayer);

    let issuer    = Address::generate(&env);
    let bad_actor = Address::generate(&env);

    client.register_anchor(
        &issuer,
        &String::from_str(&env, "USDC"),
        &make_hash(&env),
        &86_400u64,
    );

    let res = client.try_submit_reserve(
        &issuer,
        &bad_actor,
        &1_000_000u128,
        &String::from_str(&env, "USD"),
        &1_000_000u64,
    );
    assert!(res.is_err());
}

// ── stale attestation → Stale status ─────────────────────────────────────────

#[test]
fn test_stale_attestation_downgrades() {
    let (env, contract_id, admin, relayer) = setup();
    let client = SolvencyHeartbeatClient::new(&env, &contract_id);
    client.initialize(&admin);
    client.add_relayer(&relayer);

    let issuer   = Address::generate(&env);
    let attestor = Address::generate(&env);

    client.register_anchor(
        &issuer,
        &String::from_str(&env, "USDC"),
        &make_hash(&env),
        &86_400u64, // 24 h window
    );
    client.add_attestor(&issuer, &attestor);
    client.set_market(&relayer, &issuer, &1_000_000u128, &0i32, &0u32);

    // Attest at t = 1_000_000
    client.submit_reserve(
        &issuer,
        &attestor,
        &1_000_000u128,
        &String::from_str(&env, "USD"),
        &1_000_000u64,
    );

    // Advance ledger 25 h — attestation becomes stale
    env.ledger().set(LedgerInfo {
        timestamp: 1_000_000 + 90_001, // > 86 400
        protocol_version: 22,
        sequence_number: 2,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 1_000,
        min_persistent_entry_ttl: 1_000,
        max_entry_ttl: 10_000,
    });

    // set_market re-evaluates status
    client.set_market(&relayer, &issuer, &1_000_000u128, &0i32, &0u32);
    let health = client.get_anchor_health(&issuer);
    assert_eq!(health.status, 3); // Stale
}

// ── peg deviation → Watch ─────────────────────────────────────────────────────

#[test]
fn test_peg_deviation_watch() {
    let (env, contract_id, admin, relayer) = setup();
    let client = SolvencyHeartbeatClient::new(&env, &contract_id);
    client.initialize(&admin);
    client.add_relayer(&relayer);

    let issuer   = Address::generate(&env);
    let attestor = Address::generate(&env);

    client.register_anchor(
        &issuer,
        &String::from_str(&env, "USDC"),
        &make_hash(&env),
        &86_400u64,
    );
    client.add_attestor(&issuer, &attestor);
    client.set_market(&relayer, &issuer, &1_000_000u128, &0i32, &0u32);
    client.submit_reserve(
        &issuer,
        &attestor,
        &1_000_000u128,
        &String::from_str(&env, "USD"),
        &1_000_000u64,
    );

    // 350 bps peg deviation > 300 bps threshold → Watch
    client.set_market(&relayer, &issuer, &1_000_000u128, &350i32, &0u32);
    let health = client.get_anchor_health(&issuer);
    assert_eq!(health.status, 1); // Watch
}

// ── set_market: unauthorized relayer fails ────────────────────────────────────

#[test]
fn test_set_market_unauthorized_fails() {
    let (env, contract_id, admin, _) = setup();
    let client = SolvencyHeartbeatClient::new(&env, &contract_id);
    client.initialize(&admin);

    let issuer = Address::generate(&env);
    client.register_anchor(
        &issuer,
        &String::from_str(&env, "USDC"),
        &make_hash(&env),
        &86_400u64,
    );

    let bad_relayer = Address::generate(&env);
    let res = client.try_set_market(&bad_relayer, &issuer, &1_000_000u128, &0i32, &0u32);
    assert!(res.is_err());
}
