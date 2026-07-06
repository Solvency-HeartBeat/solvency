#!/usr/bin/env bash
# deploy.sh — Build, optimise, deploy, and initialise SolvencyHeartbeat on Stellar Testnet.
#
# Prerequisites:
#   rustup target add wasm32-unknown-unknown
#   cargo install --locked stellar-cli
#   stellar keys generate me --network testnet
#   stellar keys fund me --network testnet
#
# Usage:
#   chmod +x scripts/deploy.sh
#   ./scripts/deploy.sh

set -euo pipefail

NETWORK="testnet"
IDENTITY="me"
CONTRACT_NAME="solvency_heartbeat"
WASM_PATH="target/wasm32-unknown-unknown/release/${CONTRACT_NAME}.wasm"
OPT_WASM_PATH="target/wasm32-unknown-unknown/release/${CONTRACT_NAME}.optimized.wasm"

echo "==> [1/5] Building contract (release + wasm32)…"
stellar contract build

echo "==> [2/5] Optimising WASM…"
stellar contract optimize --wasm "${WASM_PATH}"

echo "==> [3/5] Deploying to ${NETWORK}…"
CONTRACT_ID=$(stellar contract deploy \
  --wasm "${OPT_WASM_PATH}" \
  --source "${IDENTITY}" \
  --network "${NETWORK}" \
  --fee 1000000)

echo "    CONTRACT_ID=${CONTRACT_ID}"

echo "==> [4/5] Initialising (set admin = deployer)…"
ADMIN=$(stellar keys address "${IDENTITY}")
stellar contract invoke \
  --id "${CONTRACT_ID}" \
  --source "${IDENTITY}" \
  --network "${NETWORK}" \
  -- initialize \
  --admin "${ADMIN}"

echo "==> [5/5] Smoke-test get_anchor_health (expect AnchorNotFound for unknown issuer)…"
stellar contract invoke \
  --id "${CONTRACT_ID}" \
  --network "${NETWORK}" \
  -- get_anchor_health \
  --issuer "${ADMIN}" || true

echo ""
echo "✅  Deploy complete."
echo "    CONTRACT_ID=${CONTRACT_ID}"
echo ""
echo "Next steps:"
echo "  1. Copy CONTRACT_ID into engine/.env as CONTRACT_ID=${CONTRACT_ID}"
echo "  2. Copy CONTRACT_ID into web/.env.local as NEXT_PUBLIC_CONTRACT_ID=${CONTRACT_ID}"
echo "  3. Register an anchor:"
echo "     stellar contract invoke --id ${CONTRACT_ID} --source me --network testnet \\"
echo "       -- register_anchor --issuer <ANCHOR_ADDRESS> --asset-code USDC \\"
echo "       --meta-hash 0000000000000000000000000000000000000000000000000000000000000000 \\"
echo "       --freshness-window 86400"
