/**
 * @stellar-passkey/sdk — Public API
 *
 * Seedless smart wallet SDK for Stellar/Soroban using WebAuthn passkeys.
 * No seed phrases. No passwords. Biometric-only authentication.
 */

export { createWallet } from './create';
export { signTransaction } from './sign';
export { sendTransfer } from './send';
export { addRecoveryKey } from './recovery';
export type {
  PasskeyWalletConfig,
  CreateWalletResult,
  SignResult,
  SendResult,
  RecoveryKeyResult,
} from './types';
