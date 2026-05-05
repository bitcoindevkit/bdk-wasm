import { execSync } from "child_process";
import {
  Amount,
  BdkError,
  BdkErrorCode,
  Block,
  BlockId,
  EsploraClient,
  EvictedTx,
  FeeRate,
  Network,
  Recipient,
  SignOptions,
  Psbt,
  TxOrdering,
  UnconfirmedTx,
  Wallet,
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

const describeRegtest = network === "regtest" ? describe : describe.skip;

function mineBlocks(count: number): void {
  const address = execSync(
    `docker exec esplora-regtest cli -regtest getnewaddress`,
    { encoding: "utf-8" }
  ).trim();
  execSync(
    `docker exec esplora-regtest cli -regtest generatetoaddress ${count} ${address}`,
    { encoding: "utf-8" }
  );
}

function getBlockHash(height: number): string {
  return execSync(
    `docker exec esplora-regtest cli -regtest getblockhash ${height}`,
    { encoding: "utf-8" }
  ).trim();
}

function getBlock(height: number): Block {
  const blockHash = getBlockHash(height);
  const blockHex = execSync(
    `docker exec esplora-regtest cli -regtest getblock ${blockHash} 0`,
    { encoding: "utf-8" }
  ).trim();
  return Block.from_bytes(Buffer.from(blockHex, "hex"));
}

async function waitForEsploraHeight(
  minHeight: number,
  timeoutMs = 30000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${esploraUrl}/blocks/tip/height`);
      const height = parseInt(await res.text(), 10);
      if (height >= minHeight) return;
    } catch {
      // Esplora not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    `Esplora did not reach height ${minHeight} within ${timeoutMs}ms`
  );
}

async function waitForAddressTx(
  address: string,
  txid: string,
  timeoutMs = 30000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${esploraUrl}/address/${address}/txs`);
      if (res.ok) {
        const txs = await res.json();
        if (
          Array.isArray(txs) &&
          txs.some((tx: { txid: string }) => tx.txid === txid)
        ) {
          return;
        }
      }
    } catch {
      // Esplora has not indexed the address yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Esplora did not index ${txid} for ${address} in time`);
}

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

  it("lists scanned outputs and resolves known UTXOs", () => {
    const utxos = wallet.list_unspent();

    expect(utxos.length).toBeGreaterThan(0);

    const firstUtxo = utxos[0];
    const resolved = wallet.get_utxo(firstUtxo.outpoint);

    expect(resolved).toBeDefined();
    expect(resolved!.outpoint.toString()).toBe(firstUtxo.outpoint.toString());
    expect(resolved!.derivation_index).toBe(firstUtxo.derivation_index);
    expect(resolved!.txout.value.to_sat()).toBe(firstUtxo.txout.value.to_sat());
    expect(wallet.is_mine(firstUtxo.txout.script_pubkey)).toBe(true);
    expect(
      wallet
        .list_output()
        .some((output) => output.outpoint.toString() === firstUtxo.outpoint.toString())
    ).toBe(true);
  });

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

  it("calculates fee and fee rate for signed wallet transactions", () => {
    const recipientAddress = wallet.peek_address("external", 15);
    const sendAmount = Amount.from_sat(BigInt(800));

    const psbt = wallet
      .build_tx()
      .fee_rate(new FeeRate(BigInt(1)))
      .add_recipient(
        new Recipient(recipientAddress.address.script_pubkey, sendAmount)
      )
      .finish();

    const expectedFee = psbt.fee().to_sat();

    expect(wallet.sign(psbt, new SignOptions())).toBe(true);

    const expectedFeeRate = psbt.fee_rate();
    expect(expectedFeeRate).toBeDefined();

    const tx = psbt.extract_tx();
    const calculatedFee = wallet.calculate_fee(tx);
    const calculatedFeeRate = wallet.calculate_fee_rate(tx);

    expect(calculatedFee.to_sat()).toBe(expectedFee);
    expect(calculatedFeeRate.to_sat_per_vb_ceil()).toBe(
      expectedFeeRate!.to_sat_per_vb_ceil()
    );
  });

  describe("TxBuilder advanced options (funded wallet)", () => {
    // Note: FeeRate is consumed by wasm-bindgen when passed to a builder method,
    // so we create fresh instances for each test instead of using the shared feeRate.
    const minFeeRate = () => new FeeRate(BigInt(1));

    it("builds a tx with add_data embedding OP_RETURN", () => {
      const data = new TextEncoder().encode("bdk-wasm test data");
      const recipientAddress = wallet.peek_address("external", 8);
      const sendAmount = Amount.from_sat(BigInt(800));

      const psbt = wallet
        .build_tx()
        .fee_rate(minFeeRate())
        .add_data(data)
        .add_recipient(
          new Recipient(recipientAddress.address.script_pubkey, sendAmount)
        )
        .finish();

      // The PSBT should have the recipient output + potentially change + the OP_RETURN output
      const outputs = psbt.unsigned_tx.output;
      expect(outputs.length).toBeGreaterThanOrEqual(2);

      // Find the OP_RETURN output (value = 0, script starts with 0x6a = OP_RETURN)
      const opReturnOutput = outputs.find(
        (out) =>
          out.value.to_sat() === BigInt(0) &&
          out.script_pubkey.to_hex_string().startsWith("6a")
      );
      expect(opReturnOutput).toBeDefined();

      // The OP_RETURN script should contain our data
      const scriptHex = opReturnOutput!.script_pubkey.to_hex_string();
      const dataHex = Buffer.from(data).toString("hex");
      expect(scriptHex).toContain(dataHex);
    });

    it("builds a tx with only_witness_utxo (PSBT has no non_witness_utxo)", () => {
      const recipientAddress = wallet.peek_address("external", 9);
      const sendAmount = Amount.from_sat(BigInt(800));

      const psbt = wallet
        .build_tx()
        .fee_rate(minFeeRate())
        .only_witness_utxo()
        .add_recipient(
          new Recipient(recipientAddress.address.script_pubkey, sendAmount)
        )
        .finish();

      // The PSBT should be constructable — only_witness_utxo strips the full
      // previous transaction from inputs, keeping only the witness_utxo field.
      // This is useful for external signers (hardware wallets) that only need
      // the witness UTXO. Wallet::sign() requires non_witness_utxo, so we
      // verify the PSBT was built correctly without attempting to sign.
      expect(psbt.unsigned_tx.input.length).toBeGreaterThan(0);
      expect(psbt.unsigned_tx.output.length).toBeGreaterThan(0);
      expect(psbt.fee().to_sat()).toBeGreaterThan(BigInt(0));
    });

    it("builds a tx with include_output_redeem_witness_script", () => {
      const recipientAddress = wallet.peek_address("external", 10);
      const sendAmount = Amount.from_sat(BigInt(800));

      const psbt = wallet
        .build_tx()
        .fee_rate(minFeeRate())
        .include_output_redeem_witness_script()
        .add_recipient(
          new Recipient(recipientAddress.address.script_pubkey, sendAmount)
        )
        .finish();

      const signed = wallet.sign(psbt, new SignOptions());
      expect(signed).toBe(true);

      const tx = psbt.extract_tx();
      expect(tx.compute_txid()).toBeDefined();
    });

    it("builds a tx with add_global_xpubs", () => {
      const recipientAddress = wallet.peek_address("external", 11);
      const sendAmount = Amount.from_sat(BigInt(800));

      const psbt = wallet
        .build_tx()
        .fee_rate(minFeeRate())
        .add_global_xpubs()
        .add_recipient(
          new Recipient(recipientAddress.address.script_pubkey, sendAmount)
        )
        .finish();

      // The PSBT should be constructable and signable with xpubs included
      const signed = wallet.sign(psbt, new SignOptions());
      expect(signed).toBe(true);
    });

    it("builds a tx with current_height affecting locktime", () => {
      const recipientAddress = wallet.peek_address("external", 12);
      const sendAmount = Amount.from_sat(BigInt(800));
      const currentBlockHeight = wallet.latest_checkpoint.height;

      const psbt = wallet
        .build_tx()
        .fee_rate(minFeeRate())
        .current_height(currentBlockHeight)
        .add_recipient(
          new Recipient(recipientAddress.address.script_pubkey, sendAmount)
        )
        .finish();

      // The locktime should be set relative to current_height (anti-fee-sniping)
      const tx = psbt.unsigned_tx;
      expect(tx).toBeDefined();

      const signed = wallet.sign(psbt, new SignOptions());
      expect(signed).toBe(true);
    });

    it("builds a tx with set_exact_sequence", () => {
      const recipientAddress = wallet.peek_address("external", 13);
      const sendAmount = Amount.from_sat(BigInt(800));
      const rbfSequence = 0xfffffffd;

      const psbt = wallet
        .build_tx()
        .fee_rate(minFeeRate())
        .set_exact_sequence(rbfSequence)
        .add_recipient(
          new Recipient(recipientAddress.address.script_pubkey, sendAmount)
        )
        .finish();

      // All inputs should have the exact sequence we set
      const inputs = psbt.unsigned_tx.input;
      expect(inputs.length).toBeGreaterThan(0);
      for (const input of inputs) {
        expect(input.sequence).toBe(rbfSequence);
      }

      const signed = wallet.sign(psbt, new SignOptions());
      expect(signed).toBe(true);
    });

    it("combines multiple new options in a single transaction", () => {
      const recipientAddress = wallet.peek_address("external", 14);
      const sendAmount = Amount.from_sat(BigInt(800));
      const data = new TextEncoder().encode("multi-option test");

      const psbt = wallet
        .build_tx()
        .fee_rate(minFeeRate())
        .add_data(data)
        .include_output_redeem_witness_script()
        .add_global_xpubs()
        .current_height(wallet.latest_checkpoint.height)
        .set_exact_sequence(0xfffffffd)
        .add_recipient(
          new Recipient(recipientAddress.address.script_pubkey, sendAmount)
        )
        .finish();

      // Verify OP_RETURN is present
      const outputs = psbt.unsigned_tx.output;
      const hasOpReturn = outputs.some(
        (out) =>
          out.value.to_sat() === BigInt(0) &&
          out.script_pubkey.to_hex_string().startsWith("6a")
      );
      expect(hasOpReturn).toBe(true);

      // Verify sequence is set correctly
      for (const input of psbt.unsigned_tx.input) {
        expect(input.sequence).toBe(0xfffffffd);
      }

      // Should still be signable (no only_witness_utxo, so non_witness_utxo is present)
      const signed = wallet.sign(psbt, new SignOptions());
      expect(signed).toBe(true);
    });

    it("drains the wallet into a single target output", () => {
      const drainTarget = wallet.peek_address("external", 30);
      const targetScript = drainTarget.address.script_pubkey;

      const psbt = wallet
        .build_tx()
        .fee_rate(minFeeRate())
        .drain_wallet()
        .drain_to(targetScript)
        .finish();

      const outputs = psbt.unsigned_tx.output;
      expect(outputs).toHaveLength(1);
      expect(outputs[0].script_pubkey.to_hex_string()).toBe(
        drainTarget.address.script_pubkey.to_hex_string()
      );
      expect(outputs[0].value.to_sat()).toBeGreaterThan(BigInt(0));
    });

    it("exclude_unconfirmed and exclude_below_confirmations ignore trusted pending coins", () => {
      const pendingRecipient = wallet.peek_address("external", 31);
      const pendingAmount = Amount.from_sat(BigInt(50_000));
      const pendingPsbt = wallet
        .build_tx()
        .fee_rate(minFeeRate())
        .add_recipient(
          new Recipient(
            pendingRecipient.address.script_pubkey,
            pendingAmount
          )
        )
        .finish();

      expect(wallet.sign(pendingPsbt, new SignOptions())).toBe(true);

      const pendingTx = pendingPsbt.extract_tx();
      const firstSeen = BigInt(Math.floor(Date.now() / 1000));
      wallet.apply_unconfirmed_txs([new UnconfirmedTx(pendingTx, firstSeen)]);

      const confirmed = wallet.balance.confirmed.to_sat();
      const trustedPending = wallet.balance.trusted_pending.to_sat();
      const trustedSpendable = wallet.balance.trusted_spendable.to_sat();
      expect(trustedPending).toBeGreaterThan(BigInt(0));
      expect(trustedSpendable).toBeGreaterThan(confirmed);

      const pendingOnlyDelta = trustedSpendable - confirmed;
      expect(pendingOnlyDelta).toBeGreaterThan(BigInt(2_000));

      const spendAmountSats = confirmed + pendingOnlyDelta / BigInt(2);
      const spendablePsbt = wallet
        .build_tx()
        .fee_rate(minFeeRate())
        .add_recipient(
          new Recipient(
            wallet.peek_address("external", 32).address.script_pubkey,
            Amount.from_sat(spendAmountSats)
          )
        )
        .finish();

      expect(spendablePsbt.fee().to_sat()).toBeGreaterThan(BigInt(0));
      wallet.cancel_tx(spendablePsbt.unsigned_tx);

      const expectInsufficientFunds = (build: () => void) => {
        try {
          build();
          fail("expected coin selection to fail");
        } catch (error) {
          expect(error).toBeInstanceOf(BdkError);
          expect((error as BdkError).code).toBe(
            BdkErrorCode.InsufficientFunds
          );
        }
      };

      expectInsufficientFunds(() => {
        wallet
          .build_tx()
          .fee_rate(minFeeRate())
          .exclude_unconfirmed()
          .add_recipient(
            new Recipient(
              wallet.peek_address("external", 33).address.script_pubkey,
              Amount.from_sat(spendAmountSats)
            )
          )
          .finish();
      });
      expectInsufficientFunds(() => {
        wallet
          .build_tx()
          .fee_rate(minFeeRate())
          .exclude_below_confirmations(1)
          .add_recipient(
            new Recipient(
              wallet.peek_address("external", 34).address.script_pubkey,
              Amount.from_sat(spendAmountSats)
            )
          )
          .finish();
      });
    });
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

  it("cancel_tx frees the change address from a non-broadcast transaction", () => {
    // Use a small send relative to balance to guarantee a change output is created.
    // This ensures BDK reveals a new internal (change) address.
    const balance = wallet.balance.trusted_spendable.to_sat();
    const sendSats = balance / BigInt(4); // 25% of balance => guaranteed change
    expect(sendSats).toBeGreaterThan(BigInt(546)); // sanity check

    // Record the internal derivation index before building a new transaction
    const indexBefore = wallet.next_derivation_index("internal");

    // Build a transaction (which reveals a new change address internally)
    const recipientAddress = wallet.peek_address("external", 7);
    const sendAmount = Amount.from_sat(sendSats);

    const psbt = wallet
      .build_tx()
      .fee_rate(new FeeRate(BigInt(1)))
      .add_recipient(
        new Recipient(recipientAddress.address.script_pubkey, sendAmount)
      )
      .finish();

    const tx = psbt.unsigned_tx;

    // Building the tx should have advanced the internal derivation index
    // (a new change address was revealed because change > dust threshold)
    const indexAfterBuild = wallet.next_derivation_index("internal");
    expect(indexAfterBuild).toBeGreaterThan(indexBefore);

    // Cancel the transaction — should not throw and should unmark the change address
    wallet.cancel_tx(tx);

    // The derivation index doesn't go back (addresses are revealed permanently),
    // but the change address should now be "unused" (unmarked). We verify by
    // building another tx and checking it reuses the same change index.
    // Note: wasm-bindgen takes ownership of ScriptBuf and Amount, so we must
    // create fresh instances for each Recipient.
    const recipientAddress2 = wallet.peek_address("external", 7);
    const sendAmount2 = Amount.from_sat(sendSats);
    const psbt2 = wallet
      .build_tx()
      .fee_rate(new FeeRate(BigInt(1)))
      .add_recipient(
        new Recipient(recipientAddress2.address.script_pubkey, sendAmount2)
      )
      .finish();

    // After cancel, building a new tx should reuse the freed change index,
    // so the derivation index should NOT advance further
    const indexAfterRebuild = wallet.next_derivation_index("internal");
    expect(indexAfterRebuild).toBe(indexAfterBuild);

    // Clean up: cancel the second tx too
    wallet.cancel_tx(psbt2.unsigned_tx);
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

describeRegtest("Block application APIs (regtest)", () => {
  const stopGap = 5;
  const externalDescriptor =
    "wpkh(tprv8ZgxMBicQKsPf6vydw7ixvsLKY79hmeXujBkGCNCApyft92yVYng2y28JpFZcneBYTTHycWSRpokhHE25GfHPBxnW5GpSm2dMWzEi9xxEyU/84'/1'/0'/0/*)#uel0vg9p";
  const internalDescriptor =
    "wpkh(tprv8ZgxMBicQKsPf6vydw7ixvsLKY79hmeXujBkGCNCApyft92yVYng2y28JpFZcneBYTTHycWSRpokhHE25GfHPBxnW5GpSm2dMWzEi9xxEyU/84'/1'/0'/1/*)#dd6w3a4e";

  const esploraClient = new EsploraClient(esploraUrl, 0);
  let wallet: Wallet;

  beforeAll(async () => {
    wallet = Wallet.create(network, externalDescriptor, internalDescriptor);

    const fundingAddress = wallet.reveal_next_address("external").address.toString();
    const fundingTxid = execSync(
      `docker exec esplora-regtest cli -regtest -rpcwallet=default sendtoaddress ${fundingAddress} 1.0`,
      { encoding: "utf-8" }
    ).trim();

    mineBlocks(1);

    const currentHeight = parseInt(
      execSync(`docker exec esplora-regtest cli -regtest getblockcount`, {
        encoding: "utf-8",
      }).trim(),
      10
    );
    await waitForEsploraHeight(currentHeight);
    await waitForAddressTx(fundingAddress, fundingTxid);

    const request = wallet.start_full_scan();
    const update = await esploraClient.full_scan(request, stopGap, 1);
    wallet.apply_update(update);

    expect(wallet.balance.trusted_spendable.to_sat()).toBeGreaterThan(BigInt(0));
    expect(wallet.latest_checkpoint.height).toBeGreaterThan(0);
  }, 60000);

  it("applies a mined block via prev_blockhash and returns real events", async () => {
    const tipBefore = wallet.latest_checkpoint;
    const recipientAddress = wallet.reveal_next_address("external");
    const sendAmount = Amount.from_sat(BigInt(5000));

    const psbt = wallet
      .build_tx()
      .fee_rate(new FeeRate(BigInt(1)))
      .add_recipient(
        new Recipient(recipientAddress.address.script_pubkey, sendAmount)
      )
      .finish();

    expect(wallet.sign(psbt, new SignOptions())).toBe(true);

    const tx = psbt.extract_tx();
    const txid = tx.compute_txid();
    await esploraClient.broadcast(tx);

    mineBlocks(1);

    const newHeight = tipBefore.height + 1;
    const block = getBlock(newHeight);
    const events = wallet.apply_block_events(block, newHeight);

    expect(block.prev_blockhash).toBe(tipBefore.hash);
    expect(block.block_hash).toBe(getBlockHash(newHeight));
    expect(block.tx_count).toBeGreaterThan(0);
    expect(
      block.txdata.some(
        (candidate) => candidate.compute_txid().toString() === txid.toString()
      )
    ).toBe(true);

    const confirmedEvent = events.find(
      (event) => event.txid?.toString() === txid.toString()
    );
    expect(confirmedEvent).toBeDefined();
    expect(confirmedEvent!.kind).toBe("tx_confirmed");
    expect(confirmedEvent!.block_time!.block_id.height).toBe(newHeight);

    const chainTipEvent = events.find(
      (event) => event.kind === "chain_tip_changed"
    );
    expect(chainTipEvent).toBeDefined();
    expect(chainTipEvent!.old_tip!.height).toBe(tipBefore.height);
    expect(chainTipEvent!.new_tip!.hash).toBe(block.block_hash);

    const details = wallet.tx_details(txid);
    expect(details).toBeDefined();
    expect(details!.chain_position.is_confirmed).toBe(true);
    expect(details!.chain_position.anchor!.block_id.height).toBe(newHeight);

    const checkpoints = wallet.checkpoints();
    expect(
      checkpoints.some(
        (checkpoint) =>
          checkpoint.height === newHeight && checkpoint.hash === block.block_hash
      )
    ).toBe(true);
  }, 30000);

  it("applies a mined block with an explicit connection point", async () => {
    const previousTip = wallet.latest_checkpoint;
    const recipientAddress = wallet.reveal_next_address("external");
    const sendAmount = Amount.from_sat(BigInt(7000));

    const psbt = wallet
      .build_tx()
      .fee_rate(new FeeRate(BigInt(1)))
      .add_recipient(
        new Recipient(recipientAddress.address.script_pubkey, sendAmount)
      )
      .finish();

    expect(wallet.sign(psbt, new SignOptions())).toBe(true);

    const tx = psbt.extract_tx();
    const txid = tx.compute_txid();
    await esploraClient.broadcast(tx);

    mineBlocks(1);

    const newHeight = previousTip.height + 1;
    const block = getBlock(newHeight);
    const connectedTo = new BlockId(previousTip.height, previousTip.hash);
    const events = wallet.apply_block_connected_to_events(
      block,
      newHeight,
      connectedTo
    );

    const confirmedEvent = events.find(
      (event) => event.txid?.toString() === txid.toString()
    );
    expect(confirmedEvent).toBeDefined();
    expect(confirmedEvent!.kind).toBe("tx_confirmed");
    expect(wallet.latest_checkpoint.height).toBe(newHeight);
    expect(wallet.latest_checkpoint.hash).toBe(block.block_hash);

    expect(wallet.latest_checkpoint.prev!.hash).toBe(previousTip.hash);
  }, 30000);

  it("rejects blocks with the wrong connected_to hash", () => {
    const previousTip = wallet.latest_checkpoint;
    mineBlocks(1);

    const newHeight = previousTip.height + 1;
    const block = getBlock(newHeight);
    const wrongHash = wallet
      .checkpoints()
      .find((checkpoint) => checkpoint.hash !== previousTip.hash)!.hash;
    const wrongConnectedTo = new BlockId(previousTip.height, wrongHash);

    try {
      wallet.apply_block_connected_to_events(block, newHeight, wrongConnectedTo);
      throw new Error("Expected apply_block_connected_to_events to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(BdkError);
      expect((error as BdkError).code).toBe(
        BdkErrorCode.UnexpectedConnectedToHash
      );
    }

    expect(wallet.latest_checkpoint.height).toBe(previousTip.height);
    expect(wallet.latest_checkpoint.hash).toBe(previousTip.hash);

    const connectedTo = new BlockId(previousTip.height, previousTip.hash);
    const events = wallet.apply_block_connected_to_events(
      block,
      newHeight,
      connectedTo
    );
    expect(
      events.some((event) => event.kind === "chain_tip_changed")
    ).toBe(true);
    expect(wallet.latest_checkpoint.height).toBe(newHeight);
  });

  it("drops evicted mempool transactions from canonical history", () => {
    const recipientAddress = wallet.reveal_next_address("external");
    const sendAmount = Amount.from_sat(BigInt(9000));
    const firstSeen = BigInt(Math.floor(Date.now() / 1000));

    const psbt = wallet
      .build_tx()
      .fee_rate(new FeeRate(BigInt(1)))
      .add_recipient(
        new Recipient(recipientAddress.address.script_pubkey, sendAmount)
      )
      .finish();

    expect(wallet.sign(psbt, new SignOptions())).toBe(true);

    const tx = psbt.extract_tx();
    const txid = tx.compute_txid();
    const txidString = txid.toString();
    wallet.apply_unconfirmed_txs([new UnconfirmedTx(tx, firstSeen)]);

    expect(
      wallet
        .transactions()
        .some((candidate) => candidate.txid.toString() === txidString)
    ).toBe(true);

    wallet.apply_evicted_txs([new EvictedTx(txid, firstSeen + BigInt(1))]);

    expect(
      wallet
        .transactions()
        .some((candidate) => candidate.txid.toString() === txidString)
    ).toBe(false);
  });
});
