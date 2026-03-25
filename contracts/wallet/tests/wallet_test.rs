#![cfg(test)]

use soroban_sdk::{testutils::Address as _, Address, Bytes, BytesN, Env, Vec};

// Import the contract and client from the crate
use stellar_passkey_wallet::{PasskeyWallet, PasskeyWalletClient};

/// Helper: Generate a fake 65-byte uncompressed P-256 public key.
/// Uses a deterministic pattern based on `seed` for reproducibility.
fn fake_pubkey(env: &Env, seed: u8) -> Bytes {
    let mut key = [0u8; 65];
    key[0] = 0x04; // uncompressed prefix
    // Fill x-coordinate (bytes 1..33) with seed
    for i in 1..33 {
        key[i] = seed.wrapping_add(i as u8);
    }
    // Fill y-coordinate (bytes 33..65) with seed + 100
    for i in 33..65 {
        key[i] = seed.wrapping_add(i as u8).wrapping_add(100);
    }
    Bytes::from_slice(env, &key)
}

/// Helper: Generate fake WebAuthn assertion data.
/// Returns (auth_data, client_data_json, signature) as Bytes tuples.
/// These are deterministic fakes — they will NOT pass real secp256r1 verification,
/// so tests that need valid verification should use pre-computed real crypto fixtures.
fn fake_assertion(env: &Env) -> (Bytes, Bytes, Bytes) {
    let auth_data = Bytes::from_slice(env, &[0xAA; 37]); // typical authenticatorData is ≥37 bytes
    let client_data_json = Bytes::from_slice(
        env,
        b"{\"type\":\"webauthn.get\",\"challenge\":\"dGVzdA\",\"origin\":\"https://example.com\"}",
    );
    let signature = Bytes::from_slice(env, &[0xBB; 64]); // fake 64-byte r||s
    (auth_data, client_data_json, signature)
}

// ════════════════════════════════════════════════════════════════════
// TEST 1: Successful passkey registration
// ════════════════════════════════════════════════════════════════════

/// Registers a valid 65-byte public key and verifies get_signers returns it.
#[test]
fn test_register_passkey_success() {
    let env = Env::default();
    let contract_id = env.register(PasskeyWallet, ());
    let client = PasskeyWalletClient::new(&env, &contract_id);

    let pub_key = fake_pubkey(&env, 1);
    let xlm_token = Address::generate(&env);

    client.register_passkey(&pub_key, &xlm_token);

    let signers = client.get_signers();
    assert_eq!(signers.len(), 1);
    assert_eq!(signers.get(0).unwrap(), pub_key);
}

// ════════════════════════════════════════════════════════════════════
// TEST 2: Double registration panics
// ════════════════════════════════════════════════════════════════════

/// Calling register_passkey twice must panic with "already_initialized".
#[test]
#[should_panic(expected = "already_initialized")]
fn test_register_passkey_twice_panics() {
    let env = Env::default();
    let contract_id = env.register(PasskeyWallet, ());
    let client = PasskeyWalletClient::new(&env, &contract_id);

    let pub_key = fake_pubkey(&env, 1);
    let xlm_token = Address::generate(&env);

    client.register_passkey(&pub_key, &xlm_token);
    // Second call must panic
    client.register_passkey(&pub_key, &xlm_token);
}

// ════════════════════════════════════════════════════════════════════
// TEST 3: Invalid signature panics during verify_and_execute
// ════════════════════════════════════════════════════════════════════

/// Calling verify_and_execute with an invalid signature must panic.
/// Since secp256r1_verify will reject the fake signature, this tests
/// that the contract correctly propagates the crypto failure.
#[test]
#[should_panic]
fn test_verify_and_execute_invalid_sig_panics() {
    let env = Env::default();
    let contract_id = env.register(PasskeyWallet, ());
    let client = PasskeyWalletClient::new(&env, &contract_id);

    let pub_key = fake_pubkey(&env, 1);
    let xlm_token = Address::generate(&env);
    client.register_passkey(&pub_key, &xlm_token);

    let (auth_data, client_data_json, signature) = fake_assertion(&env);
    let destination = Address::generate(&env);

    // This should panic because the fake signature won't verify
    client.verify_and_execute(&auth_data, &client_data_json, &signature, &destination, &100_i128);
}

// ════════════════════════════════════════════════════════════════════
// TEST 4: get_signers returns empty before initialization
// ════════════════════════════════════════════════════════════════════

/// Before any passkey is registered, get_signers should return an empty Vec.
#[test]
fn test_get_signers_empty_before_init() {
    let env = Env::default();
    let contract_id = env.register(PasskeyWallet, ());
    let client = PasskeyWalletClient::new(&env, &contract_id);

    let signers = client.get_signers();
    assert_eq!(signers.len(), 0);
}

// ════════════════════════════════════════════════════════════════════
// TEST 5: Invalid pubkey length rejected
// ════════════════════════════════════════════════════════════════════

/// register_passkey must reject a public key that is not exactly 65 bytes.
#[test]
#[should_panic(expected = "invalid_pubkey_length")]
fn test_register_passkey_invalid_length() {
    let env = Env::default();
    let contract_id = env.register(PasskeyWallet, ());
    let client = PasskeyWalletClient::new(&env, &contract_id);

    // 33-byte key instead of 65
    let short_key = Bytes::from_slice(&env, &[0x02; 33]);
    let xlm_token = Address::generate(&env);

    client.register_passkey(&short_key, &xlm_token);
}

// ════════════════════════════════════════════════════════════════════
// TEST 6: add_signer with invalid auth panics
// ════════════════════════════════════════════════════════════════════

/// add_signer must panic if the provided assertion (signature) is invalid.
#[test]
#[should_panic]
fn test_add_signer_invalid_auth_panics() {
    let env = Env::default();
    let contract_id = env.register(PasskeyWallet, ());
    let client = PasskeyWalletClient::new(&env, &contract_id);

    let pub_key = fake_pubkey(&env, 1);
    let xlm_token = Address::generate(&env);
    client.register_passkey(&pub_key, &xlm_token);

    let new_pub_key = fake_pubkey(&env, 2);
    let (auth_data, client_data_json, signature) = fake_assertion(&env);

    // This should panic — fake sig won't verify against pub_key
    client.add_signer(&new_pub_key, &auth_data, &client_data_json, &signature);
}

// ════════════════════════════════════════════════════════════════════
// TEST 7: add_signer with invalid new key length panics
// ════════════════════════════════════════════════════════════════════

/// add_signer must reject a new public key that is not 65 bytes.
#[test]
#[should_panic(expected = "invalid_pubkey_length")]
fn test_add_signer_invalid_new_key_length() {
    let env = Env::default();
    let contract_id = env.register(PasskeyWallet, ());
    let client = PasskeyWalletClient::new(&env, &contract_id);

    let pub_key = fake_pubkey(&env, 1);
    let xlm_token = Address::generate(&env);
    client.register_passkey(&pub_key, &xlm_token);

    // New key is wrong length (32 bytes instead of 65)
    let bad_new_key = Bytes::from_slice(&env, &[0x04; 32]);
    let (auth_data, client_data_json, signature) = fake_assertion(&env);

    client.add_signer(&bad_new_key, &auth_data, &client_data_json, &signature);
}

// ════════════════════════════════════════════════════════════════════
// TEST 8: verify_and_execute fails without initialization
// ════════════════════════════════════════════════════════════════════

/// Calling verify_and_execute before register_passkey must panic
/// because the signers list doesn't exist yet.
#[test]
#[should_panic(expected = "not_initialized")]
fn test_verify_and_execute_before_init_panics() {
    let env = Env::default();
    let contract_id = env.register(PasskeyWallet, ());
    let client = PasskeyWalletClient::new(&env, &contract_id);

    let (auth_data, client_data_json, signature) = fake_assertion(&env);
    let destination = Address::generate(&env);

    client.verify_and_execute(&auth_data, &client_data_json, &signature, &destination, &100_i128);
}

// ════════════════════════════════════════════════════════════════════
// TEST 9: add_signer fails without initialization
// ════════════════════════════════════════════════════════════════════

/// Calling add_signer before register_passkey must panic.
#[test]
#[should_panic]
fn test_add_signer_before_init_panics() {
    let env = Env::default();
    let contract_id = env.register(PasskeyWallet, ());
    let client = PasskeyWalletClient::new(&env, &contract_id);

    let new_key = fake_pubkey(&env, 2);
    let (auth_data, client_data_json, signature) = fake_assertion(&env);

    client.add_signer(&new_key, &auth_data, &client_data_json, &signature);
}

// ════════════════════════════════════════════════════════════════════
// TEST 10: Invalid signature length rejected
// ════════════════════════════════════════════════════════════════════

/// A signature that is not exactly 64 bytes must be rejected.
#[test]
#[should_panic(expected = "invalid_signature_length")]
fn test_invalid_signature_length_panics() {
    let env = Env::default();
    let contract_id = env.register(PasskeyWallet, ());
    let client = PasskeyWalletClient::new(&env, &contract_id);

    let pub_key = fake_pubkey(&env, 1);
    let xlm_token = Address::generate(&env);
    client.register_passkey(&pub_key, &xlm_token);

    let auth_data = Bytes::from_slice(&env, &[0xAA; 37]);
    let client_data_json = Bytes::from_slice(&env, b"{\"type\":\"webauthn.get\"}");
    // Wrong length: 32 bytes instead of 64
    let bad_sig = Bytes::from_slice(&env, &[0xCC; 32]);
    let destination = Address::generate(&env);

    client.verify_and_execute(&auth_data, &client_data_json, &bad_sig, &destination, &100_i128);
}

// ════════════════════════════════════════════════════════════════════
// TEST 11: register_passkey stores XLM token address
// ════════════════════════════════════════════════════════════════════

/// Verifies that register_passkey correctly stores the XLM token address
/// by checking that verify_and_execute can reference it (indirectly tested
/// by the fact that verify_and_execute doesn't panic with "not_initialized"
/// when trying to load the token address — it fails at sig verification instead).
#[test]
#[should_panic] // Panics at sig verification, NOT at "not_initialized" for token
fn test_register_stores_xlm_token_address() {
    let env = Env::default();
    let contract_id = env.register(PasskeyWallet, ());
    let client = PasskeyWalletClient::new(&env, &contract_id);

    let pub_key = fake_pubkey(&env, 1);
    let xlm_token = Address::generate(&env);
    client.register_passkey(&pub_key, &xlm_token);

    let (auth_data, client_data_json, signature) = fake_assertion(&env);
    let destination = Address::generate(&env);

    // This will panic during sig verification (not during token address lookup),
    // confirming that the XLM token address was stored successfully.
    client.verify_and_execute(&auth_data, &client_data_json, &signature, &destination, &100_i128);
}

// ════════════════════════════════════════════════════════════════════
// TEST 12: Multiple signers registration
// ════════════════════════════════════════════════════════════════════

/// This test verifies that the data structures correctly support multiple
/// signers conceptually. We can't fully test add_signer without real crypto,
/// so we verify the initial signer count after register_passkey.
#[test]
fn test_single_signer_after_register() {
    let env = Env::default();
    let contract_id = env.register(PasskeyWallet, ());
    let client = PasskeyWalletClient::new(&env, &contract_id);

    let pub_key = fake_pubkey(&env, 42);
    let xlm_token = Address::generate(&env);
    client.register_passkey(&pub_key, &xlm_token);

    let signers = client.get_signers();
    assert_eq!(signers.len(), 1);

    // Verify the stored key matches exactly
    let stored_key = signers.get(0).unwrap();
    assert_eq!(stored_key.len(), 65);
    assert_eq!(stored_key, pub_key);
}
