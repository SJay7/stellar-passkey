/**
 * SendXLM — XLM transfer component
 *
 * Shows destination address input, XLM amount input, and a "Send" button.
 * Only renders when a wallet has been created (contractId is set).
 */

import { useState } from 'react';
import styles from './SendXLM.module.css';

interface SendXLMProps {
  onSend: (destination: string, amountXLM: string) => Promise<void>;
  isLoading: boolean;
  lastTxHash: string | null;
}

export function SendXLM({ onSend, isLoading, lastTxHash }: SendXLMProps) {
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destination || !amount) return;
    await onSend(destination, amount);
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Send XLM</h2>
      <p className={styles.description}>Transfer native XLM using your passkey</p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.inputGroup}>
          <label htmlFor="destination-input" className={styles.label}>Destination Address</label>
          <input
            id="destination-input"
            type="text"
            className={styles.input}
            placeholder="G... or C..."
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className={styles.inputGroup}>
          <label htmlFor="amount-input" className={styles.label}>Amount (XLM)</label>
          <input
            id="amount-input"
            type="text"
            className={styles.input}
            placeholder="10.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <button
          id="send-xlm-btn"
          type="submit"
          className={styles.button}
          disabled={isLoading || !destination || !amount}
        >
          {isLoading ? (
            <span className={styles.spinner} />
          ) : (
            <>🚀 Send XLM</>
          )}
        </button>
      </form>

      {lastTxHash && (
        <div className={styles.success}>
          <p className={styles.successText}>Transaction Submitted!</p>
          <code className={styles.txHash}>{lastTxHash}</code>
          <a
            href={`https://stellar.expert/explorer/testnet/tx/${lastTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.explorerLink}
          >
            View on Stellar Expert ↗
          </a>
        </div>
      )}
    </div>
  );
}
