#!/usr/bin/env bash
# deploy.sh — Build, optimise, and deploy the SolvencyHeartbeat contract to Testnet.
#
# Usage:
#   chmod +x scripts/deploy.sh
#   ./scripts/deploy.sh
#
# Requirements:
#   - Rust + wasm32-unknown-unknown target
#   - Stellar CLI >= 27  (stellar --version)
#   - A funded identity named "me" on Testnet
#     (stellar keys generate me --network testnet)

set -euo pipefail

NETWORK=testnet
SOURCE_IDENTITY=me
WASM=target/wasm32-unknown-unknown/release/solvency_heartbeat.wasm
OPT_WASM=target/wasm32-unknown-unknown/release/solvency_heartbeat.optimized.wasm

echo "==> Building contract (release WASM)..."
cargo build --target wasm32-unknown-unknown --release -p solvency_heartbeat

echo "==> Optimising WASM..."
stellar contract optimize --wasm "$WASM"

echo "==> Deploying to $NETWORK..."
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$OPT_WASM" \
  --source "$SOURCE_IDENTITY" \
  --network "$NETWORK")

echo ""
echo "✅ Contract deployed!"
echo "   CONTRACT_ID = $CONTRACT_ID"
echo ""

echo "==> Initialising contract..."
ADMIN=$(stellar keys address "$SOURCE_IDENTITY")
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$SOURCE_IDENTITY" \
  --network "$NETWORK" \
  -- initialize --admin "$ADMIN"

echo "==> Adding deployer as relayer..."
stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$SOURCE_IDENTITY" \
  --network "$NETWORK" \
  -- add_relayer --relayer "$ADMIN"

echo ""
echo "==> Next steps:"
echo "    1. Copy CONTRACT_ID into engine/.env  →  CONTRACT_ID=$CONTRACT_ID"
echo "    2. Copy CONTRACT_ID into web/.env.local → NEXT_PUBLIC_CONTRACT_ID=$CONTRACT_ID"
echo "    3. Register anchors via:  stellar contract invoke --id $CONTRACT_ID ... -- register_anchor ..."
echo ""
echo "Done."
