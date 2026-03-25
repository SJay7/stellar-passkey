#!/bin/bash
# ═══════════════════════════════════════════════════
# Generate and fund a fee-bump sponsor account
# ═══════════════════════════════════════════════════
#
# Usage:
#   ./scripts/fund-sponsor.sh
#
# Prerequisites:
#   - Soroban CLI installed
#   - Internet access (calls Testnet friendbot)
#
# ═══════════════════════════════════════════════════

set -e

echo "🔑 Generating sponsor keypair..."
soroban keys generate sponsor --network testnet

echo ""
echo "💰 Funding sponsor via Testnet Friendbot..."
soroban keys fund sponsor --network testnet

SECRET=$(soroban keys show sponsor)
PUBLIC=$(soroban keys address sponsor)

echo ""
echo "✅ Sponsor account funded!"
echo "   Public Key:  $PUBLIC"
echo "   Secret Key:  $SECRET"
echo ""

# Write to sponsor/.env.local
echo "SPONSOR_SECRET_KEY=$SECRET" >> sponsor/.env.local
echo "📝 Written SPONSOR_SECRET_KEY to sponsor/.env.local"
echo ""
echo "⚠️  Add SPONSOR_SECRET_KEY to your Vercel environment variables for production."
