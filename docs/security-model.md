# Security Model — StellarPassKey

## Overview

StellarPassKey achieves seedless, self-custodial wallet functionality by replacing traditional
seed phrases with WebAuthn passkeys. This document explains what is trustless, what trust
assumptions exist, and what a Phase 3 security audit must cover.

## What Is Trustless

### Private Key Custody
- **The user's private key never leaves the device's secure hardware.**
  WebAuthn passkeys are backed by the device's TPM (Trusted Platform Module),
  Secure Enclave (Apple), or TEE (Android). The private key is generated inside
  the secure hardware and cannot be exported, even by the operating system.
- **No server ever sees the private key.** The SDK communicates only the public key
  and signed assertions to the contract. No custodial server is involved.

### On-Chain Signature Verification
- **The Soroban contract verifies `secp256r1` signatures using a native host function.**
  `env.crypto().secp256r1_verify()` is implemented at the protocol level (Protocol 21),
  meaning verification is performed by the Stellar validator nodes themselves —
  not by custom Rust cryptography code in the contract.
- **The signed message follows the WebAuthn spec exactly:**
  `SHA-256(authenticatorData || SHA-256(clientDataJSON))`.
  This prevents replay attacks (the authenticatorData includes a counter)
  and origin attacks (the clientDataJSON includes the origin URL).

## Trust Assumptions

| Assumption | Risk | Mitigation |
|------------|------|------------|
| **RPC Provider** | A malicious RPC could lie about transaction results | Use official Stellar RPC (SDF-operated) or self-hosted |
| **Contract Code** | A bug in `wallet.rs` could allow unauthorized transfers | Phase 3 security audit; open-source code review |
| **Browser Environment** | A compromised browser could modify challenge data | WebAuthn binds assertions to the origin; attackers cannot forge different origins |
| **Device Security** | A fully compromised device (rooted/jailbroken) could extract keys | WebAuthn authenticators have resistance to extraction; hardware keys (YubiKey) in Phase 3 |
| **Fee-Bump Sponsor** | The sponsor could refuse to relay transactions | The sponsor only wraps fees; it cannot modify the inner transaction. Users can switch sponsors. |

## secp256r1 Host Function Guarantees

The `secp256r1_verify` host function in Soroban Protocol 21:
- Validates that the public key is on the P-256 (secp256r1) curve
- Validates that the signature is a valid (r, s) pair in [1, n-1]
- Performs ECDSA verification: verifies that `s^-1 * (H * G + r * Q)` produces a point whose x-coordinate equals r
- Returns success only if the signature is mathematically valid for the given key and message
- **This is the same curve and algorithm used by Apple Face ID/Touch ID, Windows Hello, and FIDO2 authenticators**

## Recovery Model

- **Multi-signer, no single point of failure.**
  Users can register multiple passkeys (e.g., phone + laptop + YubiKey) as signers
  in the same contract. Any registered signer can authorize transactions.
- **Adding a signer requires existing signer authorization.**
  The `add_signer()` function verifies a WebAuthn assertion from an existing signer
  before adding a new one, preventing unauthorized signer additions.
- **No seed phrase backup needed.**
  Recovery is achieved by having multiple registered devices, not by memorizing words.

## What Phase 3 Audit Must Cover

1. **Smart contract logic** — verify that `verify_assertion()` correctly follows the WebAuthn spec
2. **Storage access control** — ensure only authorized callers can modify signers
3. **Reentrancy and cross-contract call safety** — ensure token transfers cannot be exploited
4. **Public key validation** — confirm invalid keys are rejected before storage
5. **Signature malleability** — verify that the host function handles non-canonical signatures
6. **Gas/resource exhaustion** — ensure the signer iteration loop is bounded
7. **Fee-bump sponsor isolation** — confirm the sponsor cannot alter inner transaction intent
