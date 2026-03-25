# Integration Guide — @stellar-passkey/sdk

This guide walks you through integrating the StellarPassKey SDK into your own dApp.

## Prerequisites

- Node.js 20+
- A deployed StellarPassKey wallet contract on Testnet (or Mainnet)
- Your app must be served over HTTPS (WebAuthn requires a secure context)

## 1. Install the SDK

```bash
npm install @stellar-passkey/sdk
```

## 2. Deploy the Wallet Contract

If you haven't deployed the contract yet:

```bash
# Clone the repo
git clone https://github.com/stellar-passkey/stellar-passkey.git
cd stellar-passkey

# Deploy to Testnet
./scripts/deploy-testnet.sh
```

This outputs a `CONTRACT_ID` (starts with `C...`). Save it.

## 3. Configure the SDK

```typescript
import type { PasskeyWalletConfig } from '@stellar-passkey/sdk';

const config: PasskeyWalletConfig = {
  rpcUrl: 'https://soroban-testnet.stellar.org',
  contractId: 'C...YOUR_CONTRACT_ID...',
  networkPassphrase: 'Test SDF Network ; September 2015',
  sponsorUrl: 'https://your-app.vercel.app/api/sponsor', // optional
};
```

## 4. Create a Wallet

```typescript
import { createWallet } from '@stellar-passkey/sdk';

const result = await createWallet(
  config,
  'yourdomain.com',     // WebAuthn Relying Party ID
  'Your dApp Name',     // Human-readable name
  'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC' // XLM SAC
);

console.log('Credential ID:', result.credentialId);
console.log('Public Key:', result.publicKey);
```

The user will see a biometric prompt (fingerprint, Face ID, PIN).
After approval, the public key is registered on-chain.

## 5. Send XLM

```typescript
import { sendTransfer } from '@stellar-passkey/sdk';

const tx = await sendTransfer(
  config,
  result.credentialId,
  'GABC...DESTINATION...',  // Stellar address
  '10.5'                    // XLM amount
);

console.log('TX Hash:', tx.txHash);
console.log('Ledger:', tx.ledger);
```

## 6. Add a Recovery Key

```typescript
import { addRecoveryKey } from '@stellar-passkey/sdk';

const recovery = await addRecoveryKey(
  config,
  result.credentialId,  // existing credential
  'yourdomain.com',
  'Your dApp Name'
);

console.log('Recovery Credential:', recovery.newCredentialId);
```

## 7. Fee-Bump Sponsor (Optional)

If your users shouldn't need to hold XLM to transact:

1. Deploy the `sponsor/` serverless function to Vercel
2. Fund the sponsor account: `./scripts/fund-sponsor.sh`
3. Set `sponsorUrl` in your `PasskeyWalletConfig`

The SDK will automatically route transactions through the fee-bump sponsor.

## API Reference

| Function | Description |
|----------|-------------|
| `createWallet(config, rpId, rpName, xlmAddr)` | Register a passkey and initialize the wallet contract |
| `signTransaction(credId, challenge)` | Get a raw WebAuthn assertion (used internally) |
| `sendTransfer(config, credId, dest, amount)` | Sign and submit an XLM transfer |
| `addRecoveryKey(config, credId, rpId, rpName)` | Register a backup passkey as a co-signer |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "NotAllowedError" from WebAuthn | Ensure HTTPS and correct rpId |
| "already_initialized" from contract | The contract has already been registered — deploy a new instance |
| Transaction simulation fails | Check that the contract is funded and the XLM SAC address is correct |
