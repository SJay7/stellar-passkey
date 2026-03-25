/**
 * App — StellarPassKey Demo
 *
 * Root component composing WalletCreate, SendXLM, and RecoveryKey.
 * Uses the usePasskeyWallet hook for all state and SDK interactions.
 */

import styles from './App.module.css';
import { usePasskeyWallet } from './hooks/usePasskeyWallet';
import { WalletCreate } from './components/WalletCreate';
import { SendXLM } from './components/SendXLM';
import { RecoveryKey } from './components/RecoveryKey';

function App() {
  const {
    contractId,
    isLoading,
    error,
    lastTxHash,
    lastRecoveryId,
    handleCreate,
    handleSend,
    handleAddRecovery,
    clearError,
  } = usePasskeyWallet();

  return (
    <div className={styles.app}>
      {/* Background gradient orbs */}
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />

      <main className={styles.main}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.logo}>
            <span className={styles.logoIcon}>🔮</span>
            <h1 className={styles.logoText}>StellarPassKey</h1>
          </div>
          <p className={styles.tagline}>
            Seedless Smart Wallet for Stellar
          </p>

          {/* Network badge */}
          <div className={styles.networkBadge}>
            <span className={styles.networkDot} />
            Soroban Testnet
          </div>
        </header>

        {/* Error banner */}
        {error && (
          <div className={styles.error}>
            <span>{error}</span>
            <button className={styles.errorClose} onClick={clearError}>✕</button>
          </div>
        )}

        {/* Card */}
        <div className={styles.card}>
          <WalletCreate
            onCreateWallet={handleCreate}
            isLoading={isLoading}
            contractId={contractId}
          />

          {contractId && (
            <>
              <SendXLM
                onSend={handleSend}
                isLoading={isLoading}
                lastTxHash={lastTxHash}
              />

              <RecoveryKey
                onAddRecovery={handleAddRecovery}
                isLoading={isLoading}
                lastRecoveryId={lastRecoveryId}
              />
            </>
          )}
        </div>

        {/* Footer */}
        <footer className={styles.footer}>
          <p>Built with Soroban Protocol 21 • WebAuthn • secp256r1</p>
          <p>
            <a
              href="https://github.com/stellar-passkey"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            {' • '}
            <a
              href="https://stellar.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              Stellar.org
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}

export default App;
