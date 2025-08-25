import {
  Address,
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

// Tests are expected to run in order
describe("Esplora client", () => {
  const stopGap = 2;
  const parallelRequests = 10;
  const externalDescriptor =
    "wpkh(tprv8ZgxMBicQKsPd5puBG1xsJ5V53vVPfCy2gnZfsqzmDSDjaQx8LEW4REFvrj6PQMuer7NqZeBiy9iP9ucqJZiveeEGqQ5CvcfV6SPcy8LQR7/84'/1'/0'/0/*)#jjcsy5wd";
  const internalDescriptor =
    "wpkh(tprv8ZgxMBicQKsPd5puBG1xsJ5V53vVPfCy2gnZfsqzmDSDjaQx8LEW4REFvrj6PQMuer7NqZeBiy9iP9ucqJZiveeEGqQ5CvcfV6SPcy8LQR7/84'/1'/0'/1/*)#rxa3ep74";
  const network: Network = "signet";
  const esploraUrl = "https://mutinynet.com/api";
  const recipientAddress = Address.from_string(
    "tb1qd28npep0s8frcm3y7dxqajkcy2m40eysplyr9v",
    network
  );
  const unixTimestamp = BigInt(Math.floor(Date.now() / 1000));

  let feeRate: FeeRate;
  let wallet: Wallet;
  const esploraClient = new EsploraClient(esploraUrl, 0);

  it("creates a new wallet", () => {
    wallet = Wallet.create(network, externalDescriptor, internalDescriptor);
    expect(wallet.peek_address("external", 0).address.toString()).toBe(
      "tb1qkn59f87tznmmjw5nu6ng8p7k6vcur2eme637rm"
    );
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
    expect(fee).toBeDefined();
    feeRate = new FeeRate(BigInt(Math.floor(fee)));
  });

  it("sends a transaction", async () => {
    const sendAmount = Amount.from_sat(BigInt(1000));
    expect(wallet.balance.trusted_spendable.to_sat()).toBeGreaterThan(
      sendAmount.to_sat()
    );

    const initialDerivationIndex = wallet.derivation_index("internal");
    const psbt = wallet
      .build_tx()
      .fee_rate(feeRate)
      .add_recipient(new Recipient(recipientAddress.script_pubkey, sendAmount))
      .finish();

    expect(psbt.fee().to_sat()).toBeGreaterThan(100); // We cannot know the exact fees

    const finalized = wallet.sign(psbt, new SignOptions());
    expect(finalized).toBeTruthy();

    const tx = psbt.extract_tx();
    const txid = tx.compute_txid();
    await esploraClient.broadcast(tx);

    // Assert that we are aware of newly created addresses that were revealed during PSBT creation
    const currentDerivationIndex = wallet.derivation_index("internal");
    expect(initialDerivationIndex).toBeLessThan(currentDerivationIndex);

    // Assert that the transaction is in the wallet
    wallet.apply_unconfirmed_txs([new UnconfirmedTx(tx, unixTimestamp)]);
    const walletTx = wallet.get_tx(txid);
    expect(walletTx.last_seen).toEqual(unixTimestamp);
    expect(walletTx.chain_position.is_confirmed).toBe(false);
  }, 30000);

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
});
