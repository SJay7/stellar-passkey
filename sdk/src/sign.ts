/**
 * @stellar-passkey/sdk — Transaction Signing
 *
 * Requests a WebAuthn assertion (biometric/PIN prompt) from the user
 * and returns the raw authenticatorData, clientDataJSON, and 64-byte
 * r||s secp256r1 signature suitable for the Soroban contract.
 */

import { startAuthentication } from '@simplewebauthn/browser';
import type { SignResult } from './types';

/**
 * Converts a base64url-encoded string to Uint8Array.
 */
function fromBase64Url(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/**
 * Converts a Uint8Array to base64url string.
 */
function toBase64Url(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Converts a DER-encoded ECDSA signature to raw 64-byte r||s format.
 *
 * DER format: 0x30 [total-len] 0x02 [r-len] [r-bytes] 0x02 [s-len] [s-bytes]
 * Raw format: r (32 bytes, zero-padded) || s (32 bytes, zero-padded)
 *
 * @param derSig - DER-encoded signature bytes from WebAuthn
 * @returns 64-byte Uint8Array containing r||s
 */
export function derToRaw(derSig: Uint8Array): Uint8Array {
  // Validate DER structure
  if (derSig[0] !== 0x30) {
    throw new Error('Invalid DER signature: missing SEQUENCE tag');
  }

  let offset = 2; // Skip 0x30 and total length byte

  // Parse r
  if (derSig[offset] !== 0x02) {
    throw new Error('Invalid DER signature: missing INTEGER tag for r');
  }
  offset++;
  const rLen = derSig[offset];
  offset++;
  let rBytes = derSig.slice(offset, offset + rLen);
  offset += rLen;

  // Parse s
  if (derSig[offset] !== 0x02) {
    throw new Error('Invalid DER signature: missing INTEGER tag for s');
  }
  offset++;
  const sLen = derSig[offset];
  offset++;
  let sBytes = derSig.slice(offset, offset + sLen);

  // Remove leading zero padding (DER adds 0x00 if high bit is set)
  if (rBytes.length > 32 && rBytes[0] === 0x00) {
    rBytes = rBytes.slice(rBytes.length - 32);
  }
  if (sBytes.length > 32 && sBytes[0] === 0x00) {
    sBytes = sBytes.slice(sBytes.length - 32);
  }

  // Pad to exactly 32 bytes each
  const raw = new Uint8Array(64);
  raw.set(rBytes, 32 - rBytes.length); // right-align r
  raw.set(sBytes, 64 - sBytes.length); // right-align s

  return raw;
}

/**
 * Requests a WebAuthn assertion (biometric/PIN prompt) from the user.
 * Returns the raw authenticatorData, clientDataJSON, and 64-byte r||s signature.
 *
 * @param config       - SDK configuration (contract ID, RPC URL, etc.)
 * @param credentialId - Base64url-encoded WebAuthn credential ID from createWallet()
 * @param challenge    - 32-byte challenge (typically SHA-256 of the tx payload)
 * @returns SignResult with authenticatorData, clientDataJSON, and raw r||s signature
 */
export async function signTransaction(
  credentialId: string,
  challenge: Uint8Array
): Promise<SignResult> {
  // 1. Request WebAuthn authentication
  const authResponse = await startAuthentication({
    challenge: toBase64Url(challenge),
    allowCredentials: [{ id: credentialId, type: 'public-key' }],
    userVerification: 'preferred',
    timeout: 60000,
  });

  // 2. Decode authenticatorData from base64url
  const authenticatorData = fromBase64Url(authResponse.response.authenticatorData);

  // 3. Decode clientDataJSON from base64url
  const clientDataJSON = fromBase64Url(authResponse.response.clientDataJSON);

  // 4. Decode and convert DER signature to raw 64-byte r||s
  const derSignature = fromBase64Url(authResponse.response.signature);
  const signature = derToRaw(derSignature);

  return {
    authenticatorData,
    clientDataJSON,
    signature,
  };
}
