#!/bin/bash
# ═══════════════════════════════════════════════════
# Deploy the StellarPassKey wallet contract to Testnet
# ═══════════════════════════════════════════════════
#
# Usage:
#   ./scripts/deploy-testnet.sh
#
# Prerequisites:
#   - Rust toolchain with wasm32-unknown-unknown target
#   - Soroban CLI installed (stellar/soroban-cli)
#   - SOROBAN_ACCOUNT env var set (or use default identity)
#
# ═══════════════════════════════════════════════════

set -e

echo "🔨 Building wallet contract..."
cargo build \
  --target wasm32-unknown-unknown \
  --release \
  --manifest-path contracts/wallet/Cargo.toml

echo ""
echo "🚀 Deploying to Stellar Testnet..."
CONTRACT_ID=$(soroban contract deploy \
  --wasm target/wasm32-unknown-unknown/release/stellar_passkey_wallet.wasm \
  --network testnet \
  --source "${SOROBAN_ACCOUNT:-default}")

echo ""
echo "✅ Contract deployed successfully!"
echo "   Contract ID: $CONTRACT_ID"
echo ""

# Write to app/.env.local for the reference app
echo "VITE_CONTRACT_ID=$CONTRACT_ID" >> app/.env.local
echo "📝 Written VITE_CONTRACT_ID to app/.env.local"
