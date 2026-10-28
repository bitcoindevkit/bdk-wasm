import {
  Amount,
  Psbt,
  Recipient,
  Transaction,
  UnconfirmedTx,
  Wallet,
  seed_to_descriptor,
} from "../../../pkg/bitcoindevkit";

export function createFundedWallet(withKeys = true): Wallet {
  // Public test seed; the funding transaction has a dummy input and is never broadcast.
  const descriptors = seed_to_descriptor(new Uint8Array(32).fill(1), "regtest", "p2wpkh");
  let wallet = Wallet.create("regtest", descriptors.external, descriptors.internal);
  if (!withKeys) {
    wallet = Wallet.create("regtest", wallet.public_descriptor("external"), wallet.public_descriptor("internal"));
  }
  wallet.reveal_next_address("external");
  const funding = Transaction.from_bytes(Buffer.from(
    "020000000111111111111111111111111111111111111111111111111111111111111111110000000000ffffffff01a0860100000000001600147a95dd8131933db47ab51e25b82d4a5353d1019b00000000",
    "hex"
  ));
  wallet.apply_unconfirmed_txs([new UnconfirmedTx(funding, 1700000000n)]);
  return wallet;
}

export function buildPayment(wallet: Wallet): Psbt {
  return wallet.build_tx()
    .fee_absolute(Amount.from_sat(1000n))
    .include_output_redeem_witness_script()
    .add_recipient(new Recipient(
      wallet.peek_address("external", 5).address.script_pubkey,
      Amount.from_sat(40000n)
    ))
    .finish();
}
