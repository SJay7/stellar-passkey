/**
 * @stellar-passkey/sdk — Wallet Creation
 *
 * Creates a new seedless wallet by registering a WebAuthn passkey
 * and calling the Soroban contract's register_passkey() function.
 *
 * NOTE FOR PHASE 1: The wallet contract must already be deployed on Testnet.
 * This function calls register_passkey(pub_key, xlm_token_address) on the contract.
 */

import { startRegistration } from '@simplewebauthn/browser';
import type { PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/types';
import {
  Contract,
  Keypair,
  rpc,
  TransactionBuilder,
  nativeToScVal,
  Address,
  Account,
} from '@stellar/stellar-sdk';
import { decode as cborDecode } from 'cbor-x';
import type { PasskeyWalletConfig, CreateWalletResult } from './types';

/**
 * Converts a Uint8Array to base64url string.
 */
function toBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Extracts the uncompressed P-256 public key from a COSE-encoded key.
 *
 * COSE key map:
 *   1 → kty (2 = EC2)
 *   3 → alg (-7 = ES256)
 *  -1 → crv (1 = P-256)
 *  -2 → x (32 bytes)
 *  -3 → y (32 bytes)
 *
 * Returns 65-byte uncompressed key: [0x04, ...x, ...y]
 */
export function extractPublicKeyFromCose(coseBytes: Uint8Array): Uint8Array {
  const decoded = cborDecode(Buffer.from(coseBytes));

  // COSE uses negative integer keys; cbor-x may decode these as Map or object
  const x: Uint8Array = decoded.get ? decoded.get(-2) : decoded['-2'] ?? decoded[-2];
  const y: Uint8Array = decoded.get ? decoded.get(-3) : decoded['-3'] ?? decoded[-3];

  if (!x || !y || x.length !== 32 || y.length !== 32) {
    throw new Error('Invalid COSE key: missing or wrong-length x/y coordinates');
  }

  // Build 65-byte uncompressed key: 0x04 || x || y
  const uncompressed = new Uint8Array(65);
  uncompressed[0] = 0x04;
  uncompressed.set(x, 1);
  uncompressed.set(y, 33);
  return uncompressed;
}

/**
 * Creates a new seedless wallet.
 *
 * 1. Calls WebAuthn navigator.credentials.create() via @simplewebauthn/browser
 * 2. Extracts the P-256 public key from the attestation response
 * 3. Calls register_passkey(pub_key, xlm_token_address) on the pre-deployed contract
 * 4. Returns the contractId, credentialId, and publicKey
 *
 * @param config          - SDK configuration with RPC URL, contract ID, etc.
 * @param rpId            - WebAuthn Relying Party ID (e.g. "yourdomain.com")
 * @param rpName          - Human-readable Relying Party name
 * @param xlmTokenAddress - Native XLM SAC address on the target network
 * @returns Wallet creation result with credential and public key
 */
export async function createWallet(
  config: PasskeyWalletConfig,
  rpId: string,
  rpName: string,
  xlmTokenAddress: string
): Promise<CreateWalletResult> {
  // 1. Generate a random challenge
  const challenge = new Uint8Array(32);
  crypto.getRandomValues(challenge);

  // 2. Generate a random user ID
  const userId = new Uint8Array(16);
  crypto.getRandomValues(userId);

  // 3. Call WebAuthn registration
  const regOptions: PublicKeyCredentialCreationOptionsJSON = {
    rp: { id: rpId, name: rpName },
    user: {
      id: toBase64Url(userId),
      name: `wallet-${Date.now()}`,
      displayName: 'StellarPassKey Wallet',
    },
    challenge: toBase64Url(challenge),
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }], // ES256 = secp256r1
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    timeout: 60000,
    attestation: 'none',
  };

  const regResponse = await startRegistration(regOptions);

  // 4. Extract the P-256 public key from the attestation COSE key
  // The public key is available in regResponse.response.publicKey (base64url)
  const publicKeyB64 = regResponse.response.publicKey;
  if (!publicKeyB64) {
    throw new Error('Registration response missing publicKey field');
  }

  // Decode base64url → bytes
  const publicKeyBytes = Uint8Array.from(
    atob(publicKeyB64.replace(/-/g, '+').replace(/_/g, '/')),
    (c) => c.charCodeAt(0)
  );

  // Parse COSE → uncompressed 65-byte key
  const publicKey = extractPublicKeyFromCose(publicKeyBytes);

  // 5. Call register_passkey on the Soroban contract
  const server = new rpc.Server(config.rpcUrl);
  const contract = new Contract(config.contractId);

  // Build the transaction
  // Use a throwaway keypair as the submitter (fee-bump sponsor pays fees)
  const submitterKeypair = Keypair.random();
  const submitterAccount = await server.getAccount(submitterKeypair.publicKey()).catch(() => {
    // If the throwaway account doesn't exist, create a mock account object
    return new Account(submitterKeypair.publicKey(), '0');
  });

  const tx = new TransactionBuilder(submitterAccount, {
    fee: '100',
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(
      contract.call(
        'register_passkey',
        nativeToScVal(Buffer.from(publicKey), { type: 'bytes' }),
        new Address(xlmTokenAddress).toScVal()
      )
    )
    .setTimeout(30)
    .build();

  // Simulate the transaction
  const simulated = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error(`Simulation failed: ${simulated.error}`);
  }

  // Assemble and submit
  const assembled = rpc.assembleTransaction(tx, simulated).build();
  assembled.sign(submitterKeypair);

  let txXdr = assembled.toXDR();

  // If sponsor URL is configured, use fee-bump
  if (config.sponsorUrl) {
    const sponsorResponse = await fetch(config.sponsorUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ innerTxXdr: txXdr }),
    });
    const sponsorData = await sponsorResponse.json();
    txXdr = sponsorData.signedFeeBumpXdr;
  }

  // Submit to the network
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
    throw new Error(`Transaction failed on-chain`);
  }

  return {
    contractId: config.contractId,
    credentialId: regResponse.id,
    publicKey,
  };
}
