/**
 * @stellar-passkey/sdk — Recovery Key
 *
 * Registers a second passkey as a backup/recovery signer.
 * Requires the user to first authenticate with their existing passkey,
 * then register a new one (e.g. on a different device or hardware key).
 */

import { startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/types';
import {
  Contract,
  Keypair,
  rpc,
  TransactionBuilder,
  nativeToScVal,
  Account,
} from '@stellar/stellar-sdk';

import { signTransaction } from './sign';
import { extractPublicKeyFromCose } from './create';
import type { PasskeyWalletConfig, RecoveryKeyResult } from './types';

/**
 * Converts a Uint8Array to base64url string.
 */
function toBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Computes SHA-256 hash of the given data.
 */
async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer);
  return new Uint8Array(hashBuffer);
}

/**
 * Registers a second passkey as a backup/recovery signer.
 *
 * Flow:
 * 1. Register a NEW passkey via WebAuthn (new device, hardware key, etc.)
 * 2. Extract the new P-256 public key from the attestation
 * 3. Compute challenge = SHA-256(newPublicKey) for the existing signer to approve
 * 4. Get a WebAuthn assertion from the EXISTING passkey to prove authorization
 * 5. Call contract add_signer(new_pub_key, auth_data, client_data_json, signature)
 *
 * @param config              - SDK configuration
 * @param existingCredentialId - Credential ID of the currently registered passkey
 * @param rpId                - WebAuthn Relying Party ID
 * @param rpName              - Human-readable Relying Party name
 * @returns The new credential ID and public key
 */
export async function addRecoveryKey(
  config: PasskeyWalletConfig,
  existingCredentialId: string,
  rpId: string,
  rpName: string
): Promise<RecoveryKeyResult> {
  // Step 1: Register a NEW passkey (different authenticator / device)
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  const userId = new Uint8Array(16);
  crypto.getRandomValues(userId);

  const regOptions: PublicKeyCredentialCreationOptionsJSON = {
    rp: { id: rpId, name: rpName },
    user: {
      id: toBase64Url(userId),
      name: `recovery-${Date.now()}`,
      displayName: 'StellarPassKey Recovery Key',
    },
    challenge: toBase64Url(challenge),
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }], // ES256
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    timeout: 60000,
    attestation: 'none',
  };

  const regResponse = await startRegistration(regOptions);

  // Step 2: Extract the new P-256 public key
  const publicKeyB64 = regResponse.response.publicKey;
  if (!publicKeyB64) {
    throw new Error('Registration response missing publicKey field');
  }

  const publicKeyBytes = Uint8Array.from(
    atob(publicKeyB64.replace(/-/g, '+').replace(/_/g, '/')),
    (c) => c.charCodeAt(0)
  );
  const newPublicKey = extractPublicKeyFromCose(publicKeyBytes);

  // Step 3: Compute challenge = SHA-256(newPublicKey) for existing signer to approve
  const approvalChallenge = await sha256(newPublicKey);

  // Step 4: Get assertion from the EXISTING passkey
  const signResult = await signTransaction(existingCredentialId, approvalChallenge);

  // Step 5: Call contract add_signer()
  const server = new rpc.Server(config.rpcUrl);
  const contract = new Contract(config.contractId);

  const submitterKeypair = Keypair.random();
  let submitterAccount: Account;
  try {
    const acct = await server.getAccount(submitterKeypair.publicKey());
    submitterAccount = acct;
  } catch {
    submitterAccount = new Account(submitterKeypair.publicKey(), '0');
  }

  const tx = new TransactionBuilder(submitterAccount, {
    fee: '100',
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(
      contract.call(
        'add_signer',
        nativeToScVal(Buffer.from(newPublicKey), { type: 'bytes' }),
        nativeToScVal(Buffer.from(signResult.authenticatorData), { type: 'bytes' }),
        nativeToScVal(Buffer.from(signResult.clientDataJSON), { type: 'bytes' }),
        nativeToScVal(Buffer.from(signResult.signature), { type: 'bytes' })
      )
    )
    .setTimeout(30)
    .build();

  // Simulate
  const simulated = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error(`Simulation failed: ${simulated.error}`);
  }

  // Assemble and submit
  const assembled = rpc.assembleTransaction(tx, simulated).build();
  assembled.sign(submitterKeypair);

  if (config.sponsorUrl) {
    const sponsorResponse = await fetch(config.sponsorUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ innerTxXdr: assembled.toXDR() }),
    });
    const sponsorData = await sponsorResponse.json();
    // Submit fee-bumped transaction
    const feeBumpTx = TransactionBuilder.fromXDR(
      sponsorData.signedFeeBumpXdr,
      config.networkPassphrase
    );
    await server.sendTransaction(feeBumpTx);
  } else {
    const sendResponse = await server.sendTransaction(assembled);
    if (sendResponse.status === 'ERROR') {
      throw new Error(`Transaction submission failed: ${sendResponse.errorResult}`);
    }

    // Poll for completion
    let getResponse = await server.getTransaction(sendResponse.hash);
    while (getResponse.status === 'NOT_FOUND') {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      getResponse = await server.getTransaction(sendResponse.hash);
    }

    if (getResponse.status === 'FAILED') {
      throw new Error('Transaction failed on-chain');
    }
  }

  return {
    newCredentialId: regResponse.id,
    newPublicKey,
  };
}
