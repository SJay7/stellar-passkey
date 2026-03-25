/**
 * @stellar-passkey/sdk — Type definitions
 *
 * All shared interfaces for the seedless smart wallet SDK.
 */

/** Configuration for connecting to a deployed PasskeyWallet contract. */
export interface PasskeyWalletConfig {
  /** Stellar RPC endpoint URL. Use https://soroban-testnet.stellar.org for Testnet */
  rpcUrl: string;
  /** Deployed wallet contract address (C...) */
  contractId: string;
  /** e.g. Networks.TESTNET = "Test SDF Network ; September 2015" */
  networkPassphrase: string;
  /** Optional fee-bump sponsor API URL (POST /api/sponsor) */
  sponsorUrl?: string;
}

/** Result returned after creating a new seedless wallet. */
export interface CreateWalletResult {
  /** The Soroban contract address where the wallet is deployed */
  contractId: string;
  /** Base64url-encoded WebAuthn credential ID */
  credentialId: string;
  /** 65-byte uncompressed P-256 public key (0x04 prefix) */
  publicKey: Uint8Array;
}

/** Result of a WebAuthn assertion (biometric signature). */
export interface SignResult {
  /** Raw authenticatorData bytes from the WebAuthn assertion */
  authenticatorData: Uint8Array;
  /** Raw clientDataJSON bytes from the WebAuthn assertion */
  clientDataJSON: Uint8Array;
  /** Raw 64-byte r||s secp256r1 signature */
  signature: Uint8Array;
}

/** Result of submitting a transfer transaction. */
export interface SendResult {
  /** Stellar transaction hash */
  txHash: string;
  /** Ledger number where the transaction was included */
  ledger: number;
}

/** Result of adding a recovery/backup passkey. */
export interface RecoveryKeyResult {
  /** Base64url credentialId of the newly registered backup passkey */
  newCredentialId: string;
  /** 65-byte uncompressed P-256 public key */
  newPublicKey: Uint8Array;
}
