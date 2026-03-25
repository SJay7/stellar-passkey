/**
 * @stellar-passkey/sdk — Send Transfer
 *
 * Signs a transfer via WebAuthn biometrics and submits it to the Stellar network.
 * Calls the wallet contract's verify_and_execute() function with the WebAuthn assertion.
 */

import {
  Contract,
  Keypair,
  rpc,
  TransactionBuilder,
  nativeToScVal,
  Address,
  Account,
} from '@stellar/stellar-sdk';
import { signTransaction } from './sign';
import type { PasskeyWalletConfig, SendResult } from './types';

/**
 * Computes SHA-256 hash of the given data.
 */
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
  return new Uint8Array(hashBuffer);
}

/**
 * Converts a human-readable XLM amount to stroops (1 XLM = 10,000,000 stroops).
 *
 * @param amountXLM - e.g. "10.5"
 * @returns stroops as bigint
 */
export function xlmToStroops(amountXLM: string): bigint {
  // Use string math to avoid floating-point precision issues
  const parts = amountXLM.split('.');
  const whole = parts[0] || '0';
  const frac = (parts[1] || '').padEnd(7, '0').slice(0, 7);
  return BigInt(whole) * 10_000_000n + BigInt(frac);
}

/**
 * Signs an XLM transfer via biometrics and submits it to the Stellar network.
 *
 * Flow:
 * 1. Build a placeholder contract call to get the transaction hash
 * 2. Use the tx hash as the WebAuthn challenge for biometric signing
 * 3. Rebuild the transaction with the real WebAuthn assertion data
 * 4. Submit (with optional fee-bump sponsorship)
 * 5. Poll for transaction result
 *
 * @param config       - SDK configuration
 * @param credentialId - WebAuthn credential ID from createWallet()
 * @param destination  - Stellar address (G...) to receive XLM
 * @param amountXLM    - Human-readable XLM amount (e.g. "10.5")
 * @returns Transaction hash and ledger number
 */
export async function sendTransfer(
  config: PasskeyWalletConfig,
  credentialId: string,
  destination: string,
  amountXLM: string
): Promise<SendResult> {
  const stroops = xlmToStroops(amountXLM);
  const server = new rpc.Server(config.rpcUrl);
  const contract = new Contract(config.contractId);

  // Use a throwaway keypair as the transaction source
  const submitterKeypair = Keypair.random();

  // Try to load the account, otherwise create a mock
  let submitterAccount: Account;
  try {
    const acct = await server.getAccount(submitterKeypair.publicKey());
    submitterAccount = acct;
  } catch {
    submitterAccount = new Account(submitterKeypair.publicKey(), '0');
  }

  // Step 1: Build placeholder transaction to get the challenge hash
  // Use zeros for auth data — we just need the tx structure for the hash
  const placeholderAuthData = new Uint8Array(37); // min authenticatorData
  const placeholderClientData = new Uint8Array(32);
  const placeholderSig = new Uint8Array(64);

  const placeholderTx = new TransactionBuilder(submitterAccount, {
    fee: '100',
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(
      contract.call(
        'verify_and_execute',
        nativeToScVal(Buffer.from(placeholderAuthData), { type: 'bytes' }),
        nativeToScVal(Buffer.from(placeholderClientData), { type: 'bytes' }),
        nativeToScVal(Buffer.from(placeholderSig), { type: 'bytes' }),
        new Address(destination).toScVal(),
        nativeToScVal(stroops, { type: 'i128' })
      )
    )
    .setTimeout(30)
    .build();

  // Step 2: Compute challenge = SHA-256(tx hash bytes)
  const txHashBytes = placeholderTx.hash();
  const challenge = await sha256(txHashBytes);

  // Step 3: Get WebAuthn assertion with the real challenge
  const signResult = await signTransaction(credentialId, challenge);

  // Step 4: Rebuild the transaction with real WebAuthn assertion data
  const realTx = new TransactionBuilder(submitterAccount, {
    fee: '100',
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(
      contract.call(
        'verify_and_execute',
        nativeToScVal(Buffer.from(signResult.authenticatorData), { type: 'bytes' }),
        nativeToScVal(Buffer.from(signResult.clientDataJSON), { type: 'bytes' }),
        nativeToScVal(Buffer.from(signResult.signature), { type: 'bytes' }),
        new Address(destination).toScVal(),
        nativeToScVal(stroops, { type: 'i128' })
      )
    )
    .setTimeout(30)
    .build();

  // Simulate the transaction
  const simulated = await server.simulateTransaction(realTx);
  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error(`Simulation failed: ${simulated.error}`);
  }

  // Assemble the transaction with simulation results
  const assembled = rpc.assembleTransaction(realTx, simulated).build();
  assembled.sign(submitterKeypair);

  // Step 5: Submit (with optional fee-bump)
  if (config.sponsorUrl) {
    const sponsorResponse = await fetch(config.sponsorUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ innerTxXdr: assembled.toXDR() }),
    });
    const sponsorData = await sponsorResponse.json();

    // Submit the fee-bumped transaction
    const feeBumpTx = TransactionBuilder.fromXDR(
      sponsorData.signedFeeBumpXdr,
      config.networkPassphrase
    );
    const sendResponse = await server.sendTransaction(feeBumpTx);
    return await pollTransaction(server, sendResponse.hash);
  }

  // Submit directly
  const sendResponse = await server.sendTransaction(assembled);
  if (sendResponse.status === 'ERROR') {
    throw new Error(`Transaction submission failed: ${sendResponse.errorResult}`);
  }

  return await pollTransaction(server, sendResponse.hash);
}

/**
 * Polls the Stellar network for a transaction result.
 *
 * @param server - rpc server instance
 * @param txHash - Transaction hash to poll
 * @param maxAttempts - Maximum polling attempts (default: 30)
 * @param delayMs - Delay between polls in milliseconds (default: 2000)
 * @returns SendResult with txHash and ledger
 */
async function pollTransaction(
  server: rpc.Server,
  txHash: string,
  maxAttempts: number = 30,
  delayMs: number = 2000
): Promise<SendResult> {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await server.getTransaction(txHash);

    if (response.status === 'SUCCESS') {
      return {
        txHash,
        ledger: response.ledger,
      };
    }

    if (response.status === 'FAILED') {
      throw new Error(`Transaction failed on-chain: ${txHash}`);
    }

    // Status is NOT_FOUND — wait and retry
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(`Transaction not found after ${maxAttempts} attempts: ${txHash}`);
}
