import {
  Amount,
  Recipient,
  SignOptions,
  Txid,
  UnconfirmedTx,
  Wallet,
} from "../../../pkg/bitcoindevkit";
import type { TxBuilder } from "../../../pkg/bitcoindevkit";
import { buildPayment, createFundedWallet } from "../helpers/wallet";

describe("fee-bump option validation", () => {
  const unsupported: [string, (builder: TxBuilder, wallet: Wallet) => TxBuilder][] = [
    ["version", (builder) => builder.version(1)],
    ["locktime", (builder) => builder.nlocktime(42)],
    ["sequence", (builder) => builder.set_exact_sequence(0xfffffffc)],
    ["height", (builder) => builder.current_height(10)],
    ["confirmations", (builder) => builder.exclude_unconfirmed()],
    ["change policy", (builder) => builder.do_not_spend_change()],
    ["drain wallet", (builder) => builder.drain_wallet()],
    ["drain destination", (builder, wallet) => builder.drain_to(wallet.peek_address("external", 6).address.script_pubkey)],
    ["manual selection", (builder) => builder.only_spend_from()],
    ["UTXOs", (builder, wallet) => builder.add_utxo(wallet.list_unspent()[0].outpoint)],
    ["unspendable UTXOs", (builder, wallet) => builder.add_unspendable(wallet.list_unspent()[0].outpoint)],
    ["OP_RETURN", (builder) => builder.add_data(new Uint8Array([1]))],
    ["recipients", (builder, wallet) => builder.add_recipient(new Recipient(wallet.peek_address("external", 6).address.script_pubkey, Amount.from_sat(10000n)))],
    ["empty recipients", (builder) => builder.set_recipients([])],
  ];

  it.each(unsupported)("rejects unsupported %s and still permits a normal bump", (_name, configure) => {
    const wallet = createFundedWallet();
    const psbt = buildPayment(wallet);
    expect(wallet.sign(psbt, new SignOptions())).toBe(true);
    const tx = psbt.extract_tx();
    const txid = tx.compute_txid();
    wallet.apply_unconfirmed_txs([new UnconfirmedTx(tx, 1700000001n)]);
    const rejected = configure(wallet.build_fee_bump(Txid.from_string(txid.toString())), wallet)
      .fee_absolute(Amount.from_sat(2000n));
    expect(() => rejected.finish()).toThrow(/Unsupported fee-bump option/);
    const bump = wallet.build_fee_bump(txid).fee_absolute(Amount.from_sat(2000n)).finish();
    expect(wallet.sign(bump, new SignOptions())).toBe(true);
    expect(bump.fee().to_sat()).toBe(2000n);
  });
});
