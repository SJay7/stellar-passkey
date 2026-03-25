/**
 * @stellar-passkey/sdk — Unit Tests
 *
 * Tests the SDK functions using mocked WebAuthn browser APIs and Stellar SDK.
 * No real network calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { derToRaw } from '../sign';
import { extractPublicKeyFromCose } from '../create';
import { xlmToStroops } from '../send';

// ═══════════════════════════════════════════════════════════════════
// Mock WebAuthn browser APIs
// ═══════════════════════════════════════════════════════════════════

vi.mock('@simplewebauthn/browser', () => ({
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}));

vi.mock('@stellar/stellar-sdk', () => {
  const mockServer = {
    getAccount: vi.fn().mockRejectedValue(new Error('not found')),
    simulateTransaction: vi.fn().mockResolvedValue({ result: {} }),
    sendTransaction: vi.fn().mockResolvedValue({ status: 'PENDING', hash: 'mock-hash' }),
    getTransaction: vi.fn().mockResolvedValue({ status: 'SUCCESS', ledger: 12345 }),
  };

  return {
    Contract: vi.fn().mockImplementation(() => ({
      call: vi.fn().mockReturnValue({}),
    })),
    Keypair: {
      random: vi.fn().mockReturnValue({
        publicKey: vi.fn().mockReturnValue('GABC123'),
        sign: vi.fn(),
      }),
      fromSecret: vi.fn(),
    },
    Networks: { TESTNET: 'Test SDF Network ; September 2015' },
    rpc: {
      Server: vi.fn().mockImplementation(() => mockServer),
      Api: {
        Account: vi.fn().mockImplementation((id: string, seq: string) => ({ id, seq })),
        isSimulationError: vi.fn().mockReturnValue(false),
      },
      assembleTransaction: vi.fn().mockReturnValue({
        build: vi.fn().mockReturnValue({
          sign: vi.fn(),
          toXDR: vi.fn().mockReturnValue('mock-xdr'),
          hash: vi.fn().mockReturnValue(new Uint8Array(32)),
        }),
      }),
    },
    TransactionBuilder: vi.fn().mockImplementation(() => ({
      addOperation: vi.fn().mockReturnThis(),
      setTimeout: vi.fn().mockReturnThis(),
      build: vi.fn().mockReturnValue({
        sign: vi.fn(),
        toXDR: vi.fn().mockReturnValue('mock-xdr'),
        hash: vi.fn().mockReturnValue(new Uint8Array(32)),
      }),
    })),
    nativeToScVal: vi.fn().mockReturnValue({}),
    Address: vi.fn().mockImplementation(() => ({
      toScVal: vi.fn().mockReturnValue({}),
    })),
    xdr: {},
  };
});

vi.mock('cbor-x', () => ({
  decode: vi.fn(),
}));

// ═══════════════════════════════════════════════════════════════════
// Test Suite: DER-to-Raw Signature Conversion
// ═══════════════════════════════════════════════════════════════════

describe('derToRaw', () => {
  // TEST 1: Standard DER signature conversion
  it('converts a standard DER-encoded ECDSA signature to raw 64-byte r||s', () => {
    // DER: 0x30 [44] 0x02 [20] [r: 32 bytes] 0x02 [20] [s: 32 bytes]
    const r = new Uint8Array(32).fill(0x11);
    const s = new Uint8Array(32).fill(0x22);
    const der = new Uint8Array([
      0x30, 0x44,       // SEQUENCE, 68 bytes
      0x02, 0x20,       // INTEGER, 32 bytes
      ...r,
      0x02, 0x20,       // INTEGER, 32 bytes
      ...s,
    ]);

    const raw = derToRaw(der);
    expect(raw.length).toBe(64);
    expect(raw.slice(0, 32)).toEqual(r);
    expect(raw.slice(32, 64)).toEqual(s);
  });

  // TEST 2: DER with leading zero padding on r
  it('strips leading 0x00 padding from r when high bit is set', () => {
    const r = new Uint8Array(32);
    r[0] = 0x80; // high bit set
    r.fill(0xAA, 1);
    const s = new Uint8Array(32).fill(0xBB);

    // DER pads r with 0x00 because the high bit is set
    const der = new Uint8Array([
      0x30, 0x45,        // SEQUENCE, 69 bytes
      0x02, 0x21,        // INTEGER, 33 bytes (padded)
      0x00, ...r,        // 0x00 prefix + 32 bytes
      0x02, 0x20,        // INTEGER, 32 bytes
      ...s,
    ]);

    const raw = derToRaw(der);
    expect(raw.length).toBe(64);
    expect(raw[0]).toBe(0x80);
    expect(raw.slice(32, 64)).toEqual(s);
  });

  // TEST 3: DER with leading zero padding on both r and s
  it('strips leading 0x00 padding from both r and s', () => {
    const r = new Uint8Array(32);
    r[0] = 0x80;
    r.fill(0xCC, 1);
    const s = new Uint8Array(32);
    s[0] = 0x90;
    s.fill(0xDD, 1);

    const der = new Uint8Array([
      0x30, 0x46,        // SEQUENCE, 70 bytes
      0x02, 0x21,        // INTEGER, 33 bytes
      0x00, ...r,
      0x02, 0x21,        // INTEGER, 33 bytes
      0x00, ...s,
    ]);

    const raw = derToRaw(der);
    expect(raw.length).toBe(64);
    expect(raw[0]).toBe(0x80);
    expect(raw[32]).toBe(0x90);
  });

  // TEST 4: Rejects invalid DER (no SEQUENCE tag)
  it('throws on invalid DER without SEQUENCE tag', () => {
    const invalid = new Uint8Array([0x31, 0x00]);
    expect(() => derToRaw(invalid)).toThrow('Invalid DER signature');
  });

  // TEST 5: Rejects DER with missing INTEGER tag
  it('throws on DER with missing INTEGER tag for r', () => {
    const invalid = new Uint8Array([0x30, 0x04, 0x03, 0x02, 0xAA, 0xBB]);
    expect(() => derToRaw(invalid)).toThrow('Invalid DER signature');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Test Suite: COSE Public Key Extraction
// ═══════════════════════════════════════════════════════════════════

describe('extractPublicKeyFromCose', () => {
  // TEST 6: Extracts uncompressed key from COSE map
  it('extracts 65-byte uncompressed P-256 key from COSE encoded bytes', async () => {
    const { decode } = await import('cbor-x');
    const x = new Uint8Array(32).fill(0x01);
    const y = new Uint8Array(32).fill(0x02);

    // Mock cbor-x decode to return a Map (as real CBOR decoding would)
    const coseMap = new Map();
    coseMap.set(1, 2);     // kty = EC2
    coseMap.set(3, -7);    // alg = ES256
    coseMap.set(-1, 1);    // crv = P-256
    coseMap.set(-2, x);    // x coordinate
    coseMap.set(-3, y);    // y coordinate

    (decode as ReturnType<typeof vi.fn>).mockReturnValue(coseMap);

    const result = extractPublicKeyFromCose(new Uint8Array(77)); // dummy input
    expect(result.length).toBe(65);
    expect(result[0]).toBe(0x04); // uncompressed prefix
    expect(result.slice(1, 33)).toEqual(x);
    expect(result.slice(33, 65)).toEqual(y);
  });

  // TEST 7: Throws on missing x coordinate
  it('throws when COSE key is missing x coordinate', async () => {
    const { decode } = await import('cbor-x');
    const coseMap = new Map();
    coseMap.set(-3, new Uint8Array(32)); // y only, no x

    (decode as ReturnType<typeof vi.fn>).mockReturnValue(coseMap);

    expect(() => extractPublicKeyFromCose(new Uint8Array(10))).toThrow('Invalid COSE key');
  });

  // TEST 8: Throws on wrong-length coordinates
  it('throws when COSE key has wrong-length x coordinate', async () => {
    const { decode } = await import('cbor-x');
    const coseMap = new Map();
    coseMap.set(-2, new Uint8Array(16)); // x too short
    coseMap.set(-3, new Uint8Array(32)); // y correct

    (decode as ReturnType<typeof vi.fn>).mockReturnValue(coseMap);

    expect(() => extractPublicKeyFromCose(new Uint8Array(10))).toThrow('Invalid COSE key');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Test Suite: XLM to Stroops Conversion
// ═══════════════════════════════════════════════════════════════════

describe('xlmToStroops', () => {
  // TEST 9: Whole number conversion
  it('converts whole XLM to stroops correctly', () => {
    expect(xlmToStroops('10')).toBe(100_000_000n);
    expect(xlmToStroops('1')).toBe(10_000_000n);
    expect(xlmToStroops('100')).toBe(1_000_000_000n);
  });

  // TEST 10: Fractional XLM conversion
  it('converts fractional XLM to stroops correctly', () => {
    expect(xlmToStroops('10.5')).toBe(105_000_000n);
    expect(xlmToStroops('0.1')).toBe(1_000_000n);
    expect(xlmToStroops('0.0000001')).toBe(1n); // 1 stroop
  });

  // TEST 11: Zero amount
  it('converts zero XLM correctly', () => {
    expect(xlmToStroops('0')).toBe(0n);
    expect(xlmToStroops('0.0')).toBe(0n);
  });

  // TEST 12: Handles extra decimal places by truncating
  it('truncates beyond 7 decimal places', () => {
    // 0.00000019 → should use 0.0000001 = 1 stroop
    expect(xlmToStroops('0.00000019')).toBe(1n);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Test Suite: WebAuthn Mock Integration
// ═══════════════════════════════════════════════════════════════════

describe('signTransaction (mocked)', () => {
  // TEST 13: Calls startAuthentication with correct challenge
  it('calls startAuthentication with the base64url-encoded challenge', async () => {
    const { startAuthentication } = await import('@simplewebauthn/browser');

    // Create a mock DER signature (minimal valid DER)
    const r = new Uint8Array(32).fill(0x11);
    const s = new Uint8Array(32).fill(0x22);
    const derSig = new Uint8Array([
      0x30, 0x44, 0x02, 0x20, ...r, 0x02, 0x20, ...s,
    ]);
    const base64DerSig = btoa(String.fromCharCode(...derSig))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    (startAuthentication as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'test-cred-id',
      response: {
        authenticatorData: btoa(String.fromCharCode(...new Uint8Array(37)))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
        clientDataJSON: btoa('{"type":"webauthn.get"}')
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
        signature: base64DerSig,
      },
    });

    const { signTransaction } = await import('../sign');
    const challenge = new Uint8Array(32).fill(0xFF);

    const result = await signTransaction('test-cred-id', challenge);

    // Verify startAuthentication was called
    expect(startAuthentication).toHaveBeenCalledWith(
      expect.objectContaining({
        allowCredentials: [{ id: 'test-cred-id', type: 'public-key' }],
      })
    );

    // Verify result structure
    expect(result.authenticatorData).toBeInstanceOf(Uint8Array);
    expect(result.clientDataJSON).toBeInstanceOf(Uint8Array);
    expect(result.signature).toBeInstanceOf(Uint8Array);
    expect(result.signature.length).toBe(64);
  });
});
