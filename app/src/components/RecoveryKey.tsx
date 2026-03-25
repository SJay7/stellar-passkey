/**
 * RecoveryKey — Backup passkey registration component
 *
 * Shows an "Add Recovery Key" button that registers a second passkey
 * as a backup signer in the wallet contract.
 */

import styles from './RecoveryKey.module.css';

interface RecoveryKeyProps {
  onAddRecovery: () => Promise<void>;
  isLoading: boolean;
  lastRecoveryId: string | null;
}

export function RecoveryKey({ onAddRecovery, isLoading, lastRecoveryId }: RecoveryKeyProps) {
  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Recovery Key</h2>
      <p className={styles.description}>
        Add a backup passkey from another device or hardware key for account recovery.
      </p>

      <button
        id="add-recovery-btn"
        className={styles.button}
        onClick={onAddRecovery}
        disabled={isLoading}
      >
        {isLoading ? (
          <span className={styles.spinner} />
        ) : (
          <>🔑 Add Recovery Key</>
        )}
      </button>

      {lastRecoveryId && (
        <div className={styles.success}>
          <p className={styles.successText}>Recovery Key Added!</p>
          <code className={styles.recoveryId}>{lastRecoveryId}</code>
        </div>
      )}
    </div>
  );
}
