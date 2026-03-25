# 🔮 StellarPassKey

[![CI](https://github.com/stellar-passkey/stellar-passkey/actions/workflows/ci.yml/badge.svg)](https://github.com/stellar-passkey/stellar-passkey/actions/workflows/ci.yml)

**Seedless smart wallet SDK for Stellar/Soroban using WebAuthn passkeys.**  
No seed phrases. No passwords. Just biometrics.

StellarPassKey replaces traditional seed phrase wallets with WebAuthn passkeys (Touch ID, Face ID, Windows Hello) using Soroban Protocol 21's native `secp256r1` signature verification. Users create and control their wallets entirely through biometrics — private keys never leave the device's secure hardware.

---

## ⚡ Quick Start (< 5 minutes)

### Prerequisites

- [Rust](https://rustup.rs/) with `wasm32-unknown-unknown` target
- [Soroban CLI](https://soroban.stellar.org/docs/getting-started/setup)
- Node.js 20+
- npm or pnpm

### 1. Clone & Install

```bash
git clone https://github.com/stellar-passkey/stellar-passkey.git
cd stellar-passkey

# Install SDK dependencies
cd sdk && npm install && cd ..

# Install app dependencies
cd app && npm install && cd ..
```

### 2. Deploy Contract to Testnet

```bash
chmod +x scripts/deploy-testnet.sh
./scripts/deploy-testnet.sh
```

### 3. Run the Demo App

```bash
cd app
cp ../.env.example .env.local    # Then fill in your contract ID and XLM SAC address
npm run dev
```

Minimum `.env.local` values:

```env
VITE_RPC_URL=https://soroban-testnet.stellar.org
VITE_CONTRACT_ID=C...YOUR_CONTRACT_ID...
VITE_NETWORK_PASSPHRASE=Test SDF Network ; September 2015
VITE_XLM_TOKEN_ADDRESS=CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
```

Open [http://localhost:3000](http://localhost:3000) and create your first seedless wallet!

---

## 🏗 Architecture

```
Browser  →  WebAuthn API  →  @stellar-passkey/sdk  →  Soroban RPC  →  wallet.rs
   ↑                                                                       ↓
Biometric                                                          secp256r1_verify
 Prompt                                                            + XLM Transfer
```

See the full [architecture diagram](docs/architecture.md).

---

## 🧪 Running Tests

### Smart Contract (Rust) — 12 tests

```bash
# From the repo root (runs the full Cargo workspace)
cargo test --workspace --verbose
```

Tests cover: `register_passkey`, `verify_and_execute`, `add_signer`, `get_signers`,
invalid key lengths, double-initialization, uninitialized-state panics, and signature
length validation. All tests use the Soroban testutils environment — no live network needed.

### SDK (TypeScript) — 13 tests

```bash
cd sdk
npm test
```

Tests cover: DER-to-raw signature conversion, COSE public key extraction, XLM-to-stroops
arithmetic, and the mocked WebAuthn `startAuthentication` flow. All network calls are mocked
via Vitest — no live RPC needed.

---

## 📦 Using the SDK

```bash
npm install @stellar-passkey/sdk
```

```typescript
import { createWallet, sendTransfer } from '@stellar-passkey/sdk';

// Create a wallet (user sees biometric prompt)
const wallet = await createWallet(config, 'yourdomain.com', 'Your App', xlmSacAddress);

// Send XLM (user sees biometric prompt)
const tx = await sendTransfer(config, wallet.credentialId, 'GABC...', '10.0');
```

See the full [integration guide](docs/integration-guide.md).

---

## 🚀 Deploy to Testnet

```bash
# Deploy contract
./scripts/deploy-testnet.sh

# Fund the fee-bump sponsor (optional)
./scripts/fund-sponsor.sh
```

---

## 📁 Project Structure

| Directory | Description |
|-----------|-------------|
| `contracts/wallet/` | Soroban smart contract (Rust) |
| `sdk/` | TypeScript SDK (`@stellar-passkey/sdk`) |
| `app/` | React reference application |
| `sponsor/` | Fee-bump sponsor (Vercel serverless) |
| `scripts/` | Deployment and setup scripts |
| `docs/` | Architecture, integration, and security docs |

---

## 📚 Documentation

- [Architecture](docs/architecture.md) — System design and data flow
- [Integration Guide](docs/integration-guide.md) — How to embed the SDK
- [Security Model](docs/security-model.md) — Trust assumptions and threat analysis

---

## 🔒 Security

- Private keys **never leave** the device's secure enclave
- On-chain verification via Soroban's native `secp256r1_verify` host function
- Multi-signer recovery — add backup passkeys from other devices
- See [security-model.md](docs/security-model.md) for full details

---

## 📄 License

[Apache 2.0](LICENSE)

---

Built with ❤️ for the Stellar ecosystem.
