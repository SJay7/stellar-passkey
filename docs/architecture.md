# StellarPassKey Architecture

## System Overview

StellarPassKey is a seedless smart wallet for the Stellar/Soroban ecosystem.
It replaces seed phrases with WebAuthn passkeys (biometrics) as the sole signing mechanism,
using the native `secp256r1` signature verification introduced in Soroban Protocol 21.

## Component Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    Browser / dApp Layer                   │
│                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────┐  │
│  │  Reference   │    │  WebAuthn    │    │  Fee-Bump  │  │
│  │  React App   │───▶│  Client API  │    │  Sponsor   │  │
│  └──────────────┘    │ (create/get) │    │  Service   │  │
│         │            └──────┬───────┘    └─────┬──────┘  │
│         │                   │                  │         │
│  ┌──────▼───────────────────▼──────────────────▼──────┐  │
│  │           stellar-passkey-sdk (TypeScript)          │  │
│  │                                                     │  │
│  │  create() │ sign() │ send() │ addRecoveryKey()      │  │
│  └──────────────────────────┬────────────────────────-┘  │
└─────────────────────────────│───────────────────────────-┘
                              │ Stellar RPC / Horizon
┌─────────────────────────────▼────────────────────────────┐
│                   Soroban Smart Contract                  │
│                        (wallet.rs)                        │
│                                                          │
│  register_passkey(pub_key, xlm_token_address)            │
│  verify_and_execute(auth_data, client_data, sig, ...)    │
│  add_signer(new_pub_key, auth_data, client_data, sig)    │
│  get_signers() → Vec<Bytes>                              │
└──────────────────────────────────────────────────────────┘
```

## Components

| Component | Language | Role |
|-----------|----------|------|
| `wallet.rs` | Rust (Soroban) | On-chain contract: passkey registry, secp256r1 sig verification, XLM transfers |
| `stellar-passkey-sdk` | TypeScript | Off-chain SDK: wraps WebAuthn API + Stellar RPC calls |
| `passkey-ui` | React + Vite | Reference app for demo and developer integration example |
| `fee-sponsor` | TypeScript (Vercel) | Wraps fee-bump so users don't need initial XLM |

## Data Flow

### Wallet Creation
1. User clicks "Create Wallet" in the browser
2. `navigator.credentials.create()` generates a hardware-backed P-256 keypair
3. SDK extracts the public key from the COSE-encoded attestation
4. SDK calls `register_passkey(pubkey, xlm_token_address)` on the Soroban contract
5. The public key is stored on-chain — the private key never leaves the device

### Transaction Signing
1. SDK builds a Soroban contract call and computes its hash
2. `navigator.credentials.get()` signs the hash using the device authenticator
3. The browser returns `authenticatorData`, `clientDataJSON`, and a DER-encoded signature
4. SDK converts the DER signature to raw 64-byte r‖s format
5. SDK calls `verify_and_execute(auth_data, client_data, sig, dest, amount)`
6. The contract computes `msg_digest = SHA-256(authData ‖ SHA-256(clientDataJSON))`
7. The contract calls `secp256r1_verify(pubkey, msg_digest, sig)`
8. If verification passes, the contract executes the XLM transfer via the SAC

### Recovery Key Addition
1. User registers a NEW passkey on a different device
2. SDK extracts the new public key
3. User authenticates with their EXISTING passkey to approve the addition
4. SDK calls `add_signer(new_pubkey, auth_data, client_data, sig)`
5. The contract verifies the existing signer's assertion, then stores the new key

## Security Model Summary

- **Private keys never leave the device's secure enclave** (TPM / Secure Enclave / TEE)
- **No seed phrases, no passwords** — biometrics only
- **On-chain verification** — the contract verifies P-256 signatures using Soroban's native host function
- **Multi-signer recovery** — losing one device doesn't mean losing all funds
- See [security-model.md](./security-model.md) for full trust assumptions and threat analysis
