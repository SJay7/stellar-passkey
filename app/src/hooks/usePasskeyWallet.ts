/**
 * usePasskeyWallet — React hook wrapping the @stellar-passkey/sdk
 *
 * Manages wallet state (contractId, credentialId) and exposes
 * handleCreate, handleSend, and handleAddRecovery methods.
 */

import { useState, useCallback } from 'react';
import {
  createWallet,
  sendTransfer,
  addRecoveryKey,
  type PasskeyWalletConfig,
  type CreateWalletResult,
  type SendResult,
  type RecoveryKeyResult,
} from '../../../sdk/src/index';

/** Wallet state exposed by the hook. */
export interface PasskeyWalletState {
  /** Deployed contract address, set after wallet creation */
  contractId: string | null;
  /** WebAuthn credential ID, set after wallet creation */
  credentialId: string | null;
  /** Whether an async operation is in progress */
  isLoading: boolean;
  /** Last error message, or null */
  error: string | null;
  /** Last transaction hash after a successful send */
  lastTxHash: string | null;
  /** Last recovery key credential ID */
  lastRecoveryId: string | null;
}

/** Methods exposed by the hook. */
export interface PasskeyWalletActions {
  handleCreate: () => Promise<void>;
  handleSend: (destination: string, amountXLM: string) => Promise<void>;
  handleAddRecovery: () => Promise<void>;
  clearError: () => void;
}

/**
 * React hook for the StellarPassKey wallet.
 *
 * Reads configuration from Vite environment variables:
 * - VITE_RPC_URL
 * - VITE_CONTRACT_ID
 * - VITE_NETWORK_PASSPHRASE
 * - VITE_SPONSOR_URL (optional)
 * - VITE_XLM_TOKEN_ADDRESS
 */
export function usePasskeyWallet(): PasskeyWalletState & PasskeyWalletActions {
  const [contractId, setContractId] = useState<string | null>(null);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [lastRecoveryId, setLastRecoveryId] = useState<string | null>(null);

  // Build config from environment variables
  const getConfig = useCallback((): PasskeyWalletConfig => ({
    rpcUrl: import.meta.env.VITE_RPC_URL || 'https://soroban-testnet.stellar.org',
    contractId: import.meta.env.VITE_CONTRACT_ID || '',
    networkPassphrase: import.meta.env.VITE_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
    sponsorUrl: import.meta.env.VITE_SPONSOR_URL || undefined,
  }), []);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Create a new wallet via passkey registration.
   */
  const handleCreate = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const config = getConfig();
      const xlmTokenAddress = import.meta.env.VITE_XLM_TOKEN_ADDRESS || '';
      const rpId = window.location.hostname;
      const rpName = 'StellarPassKey';

      const result: CreateWalletResult = await createWallet(
        config,
        rpId,
        rpName,
        xlmTokenAddress
      );

      setContractId(result.contractId);
      setCredentialId(result.credentialId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Wallet creation failed');
    } finally {
      setIsLoading(false);
    }
  }, [getConfig]);

  /**
   * Send XLM to a destination address.
   */
  const handleSend = useCallback(
    async (destination: string, amountXLM: string) => {
      if (!credentialId) {
        setError('No wallet created yet');
        return;
      }
      setIsLoading(true);
      setError(null);
      setLastTxHash(null);
      try {
        const config = getConfig();
        const result: SendResult = await sendTransfer(
          config,
          credentialId,
          destination,
          amountXLM
        );
        setLastTxHash(result.txHash);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Send failed');
      } finally {
        setIsLoading(false);
      }
    },
    [credentialId, getConfig]
  );

  /**
   * Add a recovery/backup passkey.
   */
  const handleAddRecovery = useCallback(async () => {
    if (!credentialId) {
      setError('No wallet created yet');
      return;
    }
    setIsLoading(true);
    setError(null);
    setLastRecoveryId(null);
    try {
      const config = getConfig();
      const rpId = window.location.hostname;
      const rpName = 'StellarPassKey';

      const result: RecoveryKeyResult = await addRecoveryKey(
        config,
        credentialId,
        rpId,
        rpName
      );
      setLastRecoveryId(result.newCredentialId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Recovery key addition failed');
    } finally {
      setIsLoading(false);
    }
  }, [credentialId, getConfig]);

  return {
    contractId,
    credentialId,
    isLoading,
    error,
    lastTxHash,
    lastRecoveryId,
    handleCreate,
    handleSend,
    handleAddRecovery,
    clearError,
  };
}
