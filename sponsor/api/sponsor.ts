/**
 * Fee-Bump Sponsor API — Vercel Serverless Function
 *
 * Wraps an inner Soroban transaction in a fee-bump envelope so that
 * the wallet user never needs to hold XLM to pay transaction fees.
 *
 * POST /api/sponsor
 * Body: { innerTxXdr: string }
 * Response: { signedFeeBumpXdr: string }
 *
 * The sponsor account Keypair is read from process.env.SPONSOR_SECRET_KEY.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  TransactionBuilder,
  Keypair,
  Networks,
  Transaction,
} from '@stellar/stellar-sdk';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate request body
  const { innerTxXdr } = req.body;
  if (!innerTxXdr || typeof innerTxXdr !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid innerTxXdr' });
  }

  // Load the sponsor secret key from environment
  const sponsorSecret = process.env.SPONSOR_SECRET_KEY;
  if (!sponsorSecret) {
    return res.status(500).json({ error: 'Sponsor not configured' });
  }

  try {
    const sponsorKeypair = Keypair.fromSecret(sponsorSecret);

    // Deserialize the inner transaction
    const innerTx = TransactionBuilder.fromXDR(
      innerTxXdr,
      Networks.TESTNET
    ) as Transaction;

    // Build the fee-bump transaction
    // The sponsor pays 1000 stroops (0.0001 XLM) base fee
    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      sponsorKeypair,
      '1000',
      innerTx,
      Networks.TESTNET
    );

    // Sign the fee-bump with the sponsor key
    feeBump.sign(sponsorKeypair);

    return res.status(200).json({
      signedFeeBumpXdr: feeBump.toXDR(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return res.status(500).json({ error: `Fee-bump failed: ${message}` });
  }
}
