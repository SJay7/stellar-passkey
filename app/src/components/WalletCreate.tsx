/**
 * WalletCreate — Passkey wallet creation component
 *
 * Shows a "Create Wallet" button that triggers WebAuthn registration
 * and registers the passkey on the Soroban contract.
 */

import styles from './WalletCreate.module.css';

interface WalletCreateProps {
  onCreateWallet: () => Promise<void>;
  isLoading: boolean;
  contractId: string | null;
}

export function WalletCreate({ onCreateWallet, isLoading, contractId }: WalletCreateProps) {
  return (
    <div className={styles.container}>
      <div className={styles.iconWrapper}>
        <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M12 12h.01" />
          <path d="M17 12h.01" />
          <path d="M7 12h.01" />
        </svg>
      </div>

      <h2 className={styles.title}>Create Your Wallet</h2>
      <p className={styles.description}>
        No seed phrases. No passwords. Just your biometrics.
      </p>

      {contractId ? (
        <div className={styles.success}>
          <div className={styles.checkmark}>✓</div>
          <p className={styles.successText}>Wallet Created!</p>
          <code className={styles.contractId}>{contractId}</code>
        </div>
      ) : (
        <button
          id="create-wallet-btn"
          className={styles.button}
          onClick={onCreateWallet}
          disabled={isLoading}
        >
          {isLoading ? (
            <span className={styles.spinner} />
          ) : (
            <>
              <span className={styles.fingerprint}>🔐</span>
              Create Wallet with Passkey
            </>
          )}
        </button>
      )}
    </div>
  );
}
