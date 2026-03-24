import {
  Amount,
  EsploraClient,
  FeeRate,
  Network,
  Recipient,
  UnconfirmedTx,
  Wallet,
  SignOptions,
  Psbt,
  TxOrdering,
} from "../../../pkg/bitcoindevkit";

// Network configuration via environment variables.
// Defaults to Mutinynet signet for backward compatibility.
// Set ESPLORA_URL and NETWORK to override (e.g. for regtest CI).
const network: Network = (process.env.NETWORK as Network) || "signet";
const esploraUrl = process.env.ESPLORA_URL || "https://mutinynet.com/api";

// Expected first external address per network (same descriptor, different bech32 HRP)
const expectedAddress: Record<string, string> = {
  signet: "tb1qkn59f87tznmmjw5nu6ng8p7k6vcur2eme637rm",
  regtest: "bcrt1qkn59f87tznmmjw5nu6ng8p7k6vcur2emmngn5j",
};

// Tests are expected to run in order
describe(`Esplora client (${network})`, () => {
  const stopGap = 5;
  const parallelRequests = network === "regtest" ? 1 : 10;
  const externalDescriptor =
    "wpkh(tprv8ZgxMBicQKsPd5puBG1xsJ5V53vVPfCy2gnZfsqzmDSDjaQx8LEW4REFvrj6PQMuer7NqZeBiy9iP9ucqJZiveeEGqQ5CvcfV6SPcy8LQR7/84'/1'/0'/0/*)#jjcsy5wd";
  const internalDescriptor =
    "wpkh(tprv8ZgxMBicQKsPd5puBG1xsJ5V53vVPfCy2gnZfsqzmDSDjaQx8LEW4REFvrj6PQMuer7NqZeBiy9iP9ucqJZiveeEGqQ5CvcfV6SPcy8LQR7/84'/1'/0'/1/*)#rxa3ep74";
  const unixTimestamp = BigInt(Math.floor(Date.now() / 1000));

  let feeRate: FeeRate;
  let wallet: Wallet;
  const esploraClient = new EsploraClient(esploraUrl, 0);

  it("creates a new wallet", () => {
    wallet = Wallet.create(network, externalDescriptor, internalDescriptor);
    const addr = wallet.peek_address("external", 0).address.toString();
    if (expectedAddress[network]) {
      expect(addr).toBe(expectedAddress[network]);
    }
  });

  it("performs full scan on a wallet", async () => {
    const request = wallet.start_full_scan();
    const update = await esploraClient.full_scan(
      request,
      stopGap,
      parallelRequests
    );
    wallet.apply_update(update);

    expect(wallet.balance.trusted_spendable.to_sat()).toBeGreaterThan(0);
    expect(wallet.latest_checkpoint.height).toBeGreaterThan(0);
  }, 30000);

  it("fetches fee estimates", async () => {
    const confirmationTarget = 2;
    const feeEstimates = await esploraClient.get_fee_estimates();

    const fee = feeEstimates.get(confirmationTarget);
    // Regtest may not have meaningful fee estimates; use a floor of 1 sat/vbyte
    const feeValue = fee ?? 1;
    feeRate = new FeeRate(BigInt(Math.max(1, Math.floor(feeValue))));
  });

  it("sends a transaction", async () => {
    // Send to the wallet's own address at index 5 (self-contained, works on any network)
    const recipientAddress = wallet.peek_address("external", 5);
    const sendAmount = Amount.from_sat(BigInt(1000));
    expect(wallet.balance.trusted_spendable.to_sat()).toBeGreaterThan(
      sendAmount.to_sat()
    );

    const initialDerivationIndex = wallet.derivation_index("internal");
    const psbt = wallet
      .build_tx()
      .fee_rate(feeRate)
      .add_recipient(
        new Recipient(recipientAddress.address.script_pubkey, sendAmount)
      )
      .finish();

    expect(psbt.fee().to_sat()).toBeGreaterThan(BigInt(0));

    const finalized = wallet.sign(psbt, new SignOptions());
    expect(finalized).toBeTruthy();

    const tx = psbt.extract_tx();
    const txid = tx.compute_txid();
    await esploraClient.broadcast(tx);

    // Assert that we are aware of newly created addresses that were revealed during PSBT creation
    const currentDerivationIndex = wallet.derivation_index("internal");
    if (initialDerivationIndex !== undefined) {
      expect(initialDerivationIndex).toBeLessThan(currentDerivationIndex);
    } else {
      // Fresh wallet had no internal derivation index; after building a tx with change it should exist
      expect(currentDerivationIndex).toBeDefined();
    }

    // Assert that the transaction is in the wallet
    wallet.apply_unconfirmed_txs([new UnconfirmedTx(tx, unixTimestamp)]);
    const walletTx = wallet.get_tx(txid);
    expect(walletTx.last_seen).toEqual(unixTimestamp);
    expect(walletTx.chain_position.is_confirmed).toBe(false);
  }, 30000);

  it("returns tx_details for a known transaction", () => {
    // After the "sends a transaction" test, the wallet has at least one tx
    const txs = wallet.transactions();
    expect(txs.length).toBeGreaterThan(0);

    // Find a transaction where we sent funds (the self-send from the previous test).
    // The funding tx from the faucet has sent=0, so we pick one where tx_details
    // reports sent > 0.
    let walletTx = txs[0];
    for (const tx of txs) {
      const d = wallet.tx_details(tx.txid);
      if (d && d.sent.to_sat() > BigInt(0)) {
        walletTx = tx;
        break;
      }
    }

    const details = wallet.tx_details(walletTx.txid);

    expect(details).toBeDefined();
    expect(details!.txid.toString()).toBe(walletTx.txid.toString());
    // For the self-send tx, both sent and received should be > 0
    expect(details!.sent.to_sat()).toBeGreaterThan(BigInt(0));
    expect(details!.received.to_sat()).toBeGreaterThan(BigInt(0));
    // Fee should be known for our own transaction
    expect(details!.fee).toBeDefined();
    expect(details!.fee!.to_sat()).toBeGreaterThan(BigInt(0));
    // Fee rate should also be available
    expect(details!.fee_rate).toBeDefined();
    // balance_delta_sat for a self-send is negative (we paid fees)
    expect(details!.balance_delta_sat).toBeLessThan(BigInt(0));
    // Chain position should exist
    expect(details!.chain_position).toBeDefined();
    expect(details!.chain_position.is_confirmed).toBe(false);
    // The full transaction should be accessible
    expect(details!.tx).toBeDefined();
    expect(details!.tx.compute_txid().toString()).toBe(
      walletTx.txid.toString()
    );
  });

  it("signs and finalizes a PSBT separately", () => {
    const recipientAddress = wallet.peek_address("external", 6);
    const sendAmount = Amount.from_sat(BigInt(800));

    const psbt = wallet
      .build_tx()
      .fee_rate(new FeeRate(BigInt(1)))
      .add_recipient(
        new Recipient(recipientAddress.address.script_pubkey, sendAmount)
      )
      .finish();

    // Sign without auto-finalize: sign() returns false because it reports
    // finalization status, not signing status. With try_finalize=false,
    // finalization is skipped so it returns false even though signing succeeded.
    const signOpts = new SignOptions();
    signOpts.try_finalize = false;
    const signed = wallet.sign(psbt, signOpts);
    expect(signed).toBe(false);

    // Now finalize separately — this should succeed since signing is done
    const finalizeOpts = new SignOptions();
    const finalized = wallet.finalize_psbt(psbt, finalizeOpts);
    expect(finalized).toBeTruthy();

    // The finalized PSBT should be extractable
    const tx = psbt.extract_tx();
    expect(tx.compute_txid()).toBeDefined();
  });

  it("cancel_tx returns change address to the unused pool", () => {
    // Build a transaction (which reveals and marks a change address as used)
    const recipientAddress = wallet.peek_address("external", 7);
    const sendAmount = Amount.from_sat(BigInt(600));

    const psbt = wallet
      .build_tx()
      .fee_rate(new FeeRate(BigInt(1)))
      .add_recipient(
        new Recipient(recipientAddress.address.script_pubkey, sendAmount)
      )
      .finish();

    const tx = psbt.unsigned_tx;

    // After building, the change address was revealed and marked as used
    const unusedDuring = wallet.list_unused_addresses("internal");

    // Cancel the transaction — change address should return to the unused pool
    wallet.cancel_tx(tx);

    const unusedAfter = wallet.list_unused_addresses("internal");
    // After cancellation, the unused pool should have more addresses than during
    // (the change address was freed back)
    expect(unusedAfter.length).toBeGreaterThan(unusedDuring.length);
  });

  it("excludes utxos from a transaction", () => {
    const utxos = wallet.list_unspent();
    expect(utxos.length).toBeGreaterThan(0);

    // Exclude all UTXOs and expect an insufficient funds error
    expect(() => {
      wallet
        .build_tx()
        .drain_wallet()
        .unspendable(utxos.map((utxo) => utxo.outpoint))
        .finish();
    }).toThrow();
  });

  // PSBT template test only runs on signet (the base64 encodes signet-specific data)
  if (network === "signet") {
    it("fills inputs of an output-only Psbt", () => {
      const psbtBase64 =
        "cHNidP8BAI4CAAAAAAM1gwEAAAAAACJRIORP1Ndiq325lSC/jMG0RlhATHYmuuULfXgEHUM3u5i4AAAAAAAAAAAxai8AAUSx+i9Igg4HWdcpyagCs8mzuRCklgA7nRMkm69rAAAAAAAAAAAAAQACAAAAACp2AAAAAAAAFgAUtOhUn8sU97k6k+amg4fW0zHBqzsAAAAAAAAAAAA=";
      const template = Psbt.from_string(psbtBase64);

      let builder = wallet
        .build_tx()
        .fee_rate(new FeeRate(BigInt(1)))
        .ordering(TxOrdering.Untouched);

      for (const txout of template.unsigned_tx.output) {
        if (wallet.is_mine(txout.script_pubkey)) {
          builder = builder.drain_to(txout.script_pubkey);
        } else {
          const recipient = new Recipient(txout.script_pubkey, txout.value);
          builder = builder.add_recipient(recipient);
        }
      }

      const psbt = builder.finish();
      expect(psbt.unsigned_tx.output).toHaveLength(
        template.unsigned_tx.output.length
      );
      expect(psbt.unsigned_tx.tx_out(2).value.to_btc()).toBeGreaterThan(0);
    });
  }
});
