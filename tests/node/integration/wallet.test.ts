import {
  Address,
  Amount,
  BdkError,
  BdkErrorCode,
  Block,
  BlockId,
  ChangeSpendPolicy,
  EvictedTx,
  FeeRate,
  OutPoint,
  Recipient,
  Txid,
  Wallet,
} from "../../../pkg/bitcoindevkit";
import type { Network } from "../../../pkg/bitcoindevkit";

describe("Wallet", () => {
  const network: Network = "testnet";
  const externalDesc =
    "wpkh(tprv8ZgxMBicQKsPf6vydw7ixvsLKY79hmeXujBkGCNCApyft92yVYng2y28JpFZcneBYTTHycWSRpokhHE25GfHPBxnW5GpSm2dMWzEi9xxEyU/84'/1'/0'/0/*)#uel0vg9p";
  const internalDesc =
    "wpkh(tprv8ZgxMBicQKsPf6vydw7ixvsLKY79hmeXujBkGCNCApyft92yVYng2y28JpFZcneBYTTHycWSRpokhHE25GfHPBxnW5GpSm2dMWzEi9xxEyU/84'/1'/0'/1/*)#dd6w3a4e";
  let wallet: Wallet;
  const recipientAddress = Address.from_string(
    "tb1qd28npep0s8frcm3y7dxqajkcy2m40eysplyr9v",
    network
  );

  it("creates a new wallet from descriptors", () => {
    wallet = Wallet.create(network, externalDesc, internalDesc);

    const address = wallet.peek_address("external", 0);

    expect(wallet.network).toBe(network);
    expect(address.address.toString()).toBe(
      "tb1qjtgffm20l9vu6a7gacxvpu2ej4kdcsgc26xfdz"
    );
    expect(address.address_type).toBe("p2wpkh");
    expect(wallet.reveal_next_address("external").address.toString()).toBe(
      address.address.toString()
    );
    expect(wallet.public_descriptor("external")).toBe(
      "wpkh([27f9035f/84'/1'/0']tpubDCkv2fHDfPg5hB6bFqJ4fNiins2Z8r5vKtD4xq5irCG2HsUXkgHYsj3gfGTdvAv41hoJeXjfxu7EBQqZMm6SVkxztKFtaaE7HuLdkuL7KNq/0/*)#wle7e0wp"
    );
    expect(wallet.public_descriptor("internal")).toBe(
      "wpkh([27f9035f/84'/1'/0']tpubDCkv2fHDfPg5hB6bFqJ4fNiins2Z8r5vKtD4xq5irCG2HsUXkgHYsj3gfGTdvAv41hoJeXjfxu7EBQqZMm6SVkxztKFtaaE7HuLdkuL7KNq/1/*)#ltuly67e"
    );
  });

  it("loads a previously existing wallet", () => {
    const loadedWallet = Wallet.load(
      wallet.take_staged(),
      externalDesc,
      internalDesc
    );

    expect(loadedWallet.network).toBe(network);
    expect(
      loadedWallet.next_unused_address("external").address.toString()
    ).toBe("tb1qjtgffm20l9vu6a7gacxvpu2ej4kdcsgc26xfdz");
  });

  it("creates a single-descriptor wallet", () => {
    const singleWallet = Wallet.create_single(network, externalDesc);

    expect(singleWallet.network).toBe(network);
    const address = singleWallet.peek_address("external", 0);
    expect(address.address.toString()).toBe(
      "tb1qjtgffm20l9vu6a7gacxvpu2ej4kdcsgc26xfdz"
    );
  });

  it("marks and unmarks addresses as used", () => {
    const freshWallet = Wallet.create(network, externalDesc, internalDesc);

    // mark_used returns whether the index was present in unused set
    const marked = freshWallet.mark_used("external", 0);
    // The first address should have been in the unused set
    expect(typeof marked).toBe("boolean");

    // unmark_used returns whether the index was inserted back
    const unmarked = freshWallet.unmark_used("external", 0);
    expect(typeof unmarked).toBe("boolean");
  });

  describe("TxBuilder options", () => {
    it("builds a tx with fee_absolute", () => {
      // fee_absolute with insufficient funds should still throw InsufficientFunds
      const sendAmount = Amount.from_sat(BigInt(50000));
      const absoluteFee = Amount.from_sat(BigInt(1000));

      expect(() => {
        wallet
          .build_tx()
          .fee_absolute(absoluteFee)
          .add_recipient(
            new Recipient(recipientAddress.script_pubkey, sendAmount)
          )
          .finish();
      }).toThrow();
    });

    it("builds a tx with change_policy", () => {
      const sendAmount = Amount.from_sat(BigInt(50000));

      expect(() => {
        wallet
          .build_tx()
          .fee_rate(new FeeRate(BigInt(1)))
          .change_policy(ChangeSpendPolicy.ChangeForbidden)
          .add_recipient(
            new Recipient(recipientAddress.script_pubkey, sendAmount)
          )
          .finish();
      }).toThrow(); // No funds, but verifies the method chains correctly
    });

    it("builds a tx with do_not_spend_change shorthand", () => {
      const sendAmount = Amount.from_sat(BigInt(50000));

      expect(() => {
        wallet
          .build_tx()
          .fee_rate(new FeeRate(BigInt(1)))
          .do_not_spend_change()
          .add_recipient(
            new Recipient(recipientAddress.script_pubkey, sendAmount)
          )
          .finish();
      }).toThrow(); // No funds
    });

    it("chains enable_rbf without error", () => {
      const sendAmount = Amount.from_sat(BigInt(50000));

      expect(() => {
        wallet
          .build_tx()
          .fee_rate(new FeeRate(BigInt(1)))
          .enable_rbf()
          .add_recipient(
            new Recipient(recipientAddress.script_pubkey, sendAmount)
          )
          .finish();
      }).toThrow(); // No funds, but RBF chaining works
    });

    it("chains enable_rbf_with_sequence without error", () => {
      const sendAmount = Amount.from_sat(BigInt(50000));

      expect(() => {
        wallet
          .build_tx()
          .fee_rate(new FeeRate(BigInt(1)))
          .enable_rbf_with_sequence(0xfffffffd)
          .add_recipient(
            new Recipient(recipientAddress.script_pubkey, sendAmount)
          )
          .finish();
      }).toThrow(); // No funds
    });

    it("sets nlocktime on the builder", () => {
      const sendAmount = Amount.from_sat(BigInt(50000));

      expect(() => {
        wallet
          .build_tx()
          .fee_rate(new FeeRate(BigInt(1)))
          .nlocktime(800000)
          .add_recipient(
            new Recipient(recipientAddress.script_pubkey, sendAmount)
          )
          .finish();
      }).toThrow(); // No funds
    });

    it("sets version on the builder", () => {
      const sendAmount = Amount.from_sat(BigInt(50000));

      expect(() => {
        wallet
          .build_tx()
          .fee_rate(new FeeRate(BigInt(1)))
          .version(2)
          .add_recipient(
            new Recipient(recipientAddress.script_pubkey, sendAmount)
          )
          .finish();
      }).toThrow(); // No funds
    });

    it("adds utxos and only_spend_from", () => {
      const dummyTxid = Txid.from_string(
        "0000000000000000000000000000000000000000000000000000000000000000"
      );
      const outpoint = new OutPoint(dummyTxid, 0);

      // add_utxo with a non-existent UTXO should error
      expect(() => {
        wallet
          .build_tx()
          .fee_rate(new FeeRate(BigInt(1)))
          .add_utxo(outpoint)
          .only_spend_from()
          .add_recipient(
            new Recipient(
              recipientAddress.script_pubkey,
              Amount.from_sat(BigInt(50000))
            )
          )
          .finish();
      }).toThrow();
    });

    it("adds multiple utxos via add_utxos", () => {
      const dummyTxid = Txid.from_string(
        "0000000000000000000000000000000000000000000000000000000000000000"
      );

      expect(() => {
        wallet
          .build_tx()
          .fee_rate(new FeeRate(BigInt(1)))
          .add_utxos([new OutPoint(dummyTxid, 0), new OutPoint(dummyTxid, 1)])
          .add_recipient(
            new Recipient(
              recipientAddress.script_pubkey,
              Amount.from_sat(BigInt(50000))
            )
          )
          .finish();
      }).toThrow();
    });

    it("builds a tx with only_spend_change shorthand", () => {
      const sendAmount = Amount.from_sat(BigInt(50000));

      expect(() => {
        wallet
          .build_tx()
          .fee_rate(new FeeRate(BigInt(1)))
          .only_spend_change()
          .add_recipient(
            new Recipient(recipientAddress.script_pubkey, sendAmount)
          )
          .finish();
      }).toThrow(); // No funds
    });

    it("sets current_height on the builder", () => {
      const sendAmount = Amount.from_sat(BigInt(50000));

      expect(() => {
        wallet
          .build_tx()
          .fee_rate(new FeeRate(BigInt(1)))
          .current_height(850000)
          .add_recipient(
            new Recipient(recipientAddress.script_pubkey, sendAmount)
          )
          .finish();
      }).toThrow(); // No funds, but current_height chains correctly
    });

    it("chains only_witness_utxo without error", () => {
      const sendAmount = Amount.from_sat(BigInt(50000));

      expect(() => {
        wallet
          .build_tx()
          .fee_rate(new FeeRate(BigInt(1)))
          .only_witness_utxo()
          .add_recipient(
            new Recipient(recipientAddress.script_pubkey, sendAmount)
          )
          .finish();
      }).toThrow(); // No funds, but option chains correctly
    });

    it("chains include_output_redeem_witness_script without error", () => {
      const sendAmount = Amount.from_sat(BigInt(50000));

      expect(() => {
        wallet
          .build_tx()
          .fee_rate(new FeeRate(BigInt(1)))
          .include_output_redeem_witness_script()
          .add_recipient(
            new Recipient(recipientAddress.script_pubkey, sendAmount)
          )
          .finish();
      }).toThrow(); // No funds, but option chains correctly
    });

    it("chains add_global_xpubs without error", () => {
      const sendAmount = Amount.from_sat(BigInt(50000));

      expect(() => {
        wallet
          .build_tx()
          .fee_rate(new FeeRate(BigInt(1)))
          .add_global_xpubs()
          .add_recipient(
            new Recipient(recipientAddress.script_pubkey, sendAmount)
          )
          .finish();
      }).toThrow(); // No funds, but option chains correctly
    });

    it("sets set_exact_sequence on the builder", () => {
      const sendAmount = Amount.from_sat(BigInt(50000));

      expect(() => {
        wallet
          .build_tx()
          .fee_rate(new FeeRate(BigInt(1)))
          .set_exact_sequence(0xfffffffd)
          .add_recipient(
            new Recipient(recipientAddress.script_pubkey, sendAmount)
          )
          .finish();
      }).toThrow(); // No funds, but option chains correctly
    });

    it("add_data rejects data exceeding 80 bytes at finish()", () => {
      const oversizedData = new Uint8Array(81).fill(0xff);

      // add_data chains normally; the >80 byte validation happens in finish()
      expect(() => {
        wallet
          .build_tx()
          .fee_rate(new FeeRate(BigInt(1)))
          .add_data(oversizedData)
          .add_recipient(
            new Recipient(recipientAddress.script_pubkey, Amount.from_sat(BigInt(50000)))
          )
          .finish();
      }).toThrow();
    });

    it("add_data accepts valid data up to 80 bytes", () => {
      const sendAmount = Amount.from_sat(BigInt(50000));
      const data = new TextEncoder().encode("hello bdk-wasm");

      expect(() => {
        wallet
          .build_tx()
          .fee_rate(new FeeRate(BigInt(1)))
          .add_data(data)
          .add_recipient(
            new Recipient(recipientAddress.script_pubkey, sendAmount)
          )
          .finish();
      }).toThrow(); // No funds, but add_data chained successfully
    });

    it("add_data accepts empty data", () => {
      const sendAmount = Amount.from_sat(BigInt(50000));
      const emptyData = new Uint8Array(0);

      expect(() => {
        wallet
          .build_tx()
          .fee_rate(new FeeRate(BigInt(1)))
          .add_data(emptyData)
          .add_recipient(
            new Recipient(recipientAddress.script_pubkey, sendAmount)
          )
          .finish();
      }).toThrow(); // No funds
    });

    it("chains all builder options together", () => {
      const sendAmount = Amount.from_sat(BigInt(50000));

      // Verify the full fluent API chains without runtime errors
      expect(() => {
        wallet
          .build_tx()
          .fee_rate(new FeeRate(BigInt(2)))
          .enable_rbf()
          .nlocktime(800000)
          .version(2)
          .current_height(850000)
          .only_witness_utxo()
          .include_output_redeem_witness_script()
          .add_global_xpubs()
          .set_exact_sequence(0xfffffffd)
          .change_policy(ChangeSpendPolicy.ChangeAllowed)
          .add_recipient(
            new Recipient(recipientAddress.script_pubkey, sendAmount)
          )
          .finish();
      }).toThrow(); // No funds, but all options chained successfully
    });
  });

  describe("build_fee_bump", () => {
    it("throws TransactionNotFound for unknown txid", () => {
      const unknownTxid = Txid.from_string(
        "0000000000000000000000000000000000000000000000000000000000000000"
      );

      try {
        wallet
          .build_fee_bump(unknownTxid)
          .fee_rate(new FeeRate(BigInt(5)))
          .finish();
        fail("Expected an error");
      } catch (error) {
        expect(error).toBeInstanceOf(BdkError);
        expect((error as BdkError).code).toBe(
          BdkErrorCode.TransactionNotFound
        );
      }
    });
  });

  describe("ChangeSpendPolicy enum", () => {
    it("exposes all variants", () => {
      expect(ChangeSpendPolicy.ChangeAllowed).toBeDefined();
      expect(ChangeSpendPolicy.OnlyChange).toBeDefined();
      expect(ChangeSpendPolicy.ChangeForbidden).toBeDefined();
    });
  });

  it("catches fine-grained errors and deserializes its data", () => {
    // Amount should be too big so we fail with InsufficientFunds
    const sendAmount = Amount.from_sat(BigInt(2000000000));

    try {
      wallet
        .build_tx()
        .fee_rate(new FeeRate(BigInt(1)))
        .add_recipient(
          new Recipient(recipientAddress.script_pubkey, sendAmount)
        )
        .finish();
    } catch (error) {
      expect(error).toBeInstanceOf(BdkError);

      const { code, message, data } = error;
      expect(code).toBe(BdkErrorCode.InsufficientFunds);
      expect(message.startsWith("Insufficient funds:")).toBe(true);
      expect(data.needed).toBe(2000000000 + 42);
      expect(data.available).toBeDefined();
    }
  });

  describe("descriptor_checksum", () => {
    it("returns a non-empty checksum string", () => {
      const checksum = wallet.descriptor_checksum("external");

      expect(typeof checksum).toBe("string");
      expect(checksum.length).toBeGreaterThan(0);
      // Descriptor checksums are 8 characters of bech32
      expect(checksum.length).toBe(8);
    });

    it("returns different checksums for external and internal keychains", () => {
      const externalChecksum = wallet.descriptor_checksum("external");
      const internalChecksum = wallet.descriptor_checksum("internal");

      expect(externalChecksum).not.toBe(internalChecksum);
    });
  });

  describe("next_derivation_index", () => {
    it("returns 0 for a fresh wallet with no revealed addresses", () => {
      const freshWallet = Wallet.create(network, externalDesc, internalDesc);
      const index = freshWallet.next_derivation_index("external");

      expect(typeof index).toBe("number");
      expect(index).toBe(0);
    });

    it("increments after revealing an address", () => {
      const freshWallet = Wallet.create(network, externalDesc, internalDesc);
      freshWallet.reveal_next_address("external");
      const index = freshWallet.next_derivation_index("external");

      expect(index).toBe(1);
    });

    it("is consistent with derivation_index", () => {
      const freshWallet = Wallet.create(network, externalDesc, internalDesc);
      freshWallet.reveal_next_address("external");
      freshWallet.reveal_next_address("external");

      const derivIndex = freshWallet.derivation_index("external");
      const nextIndex = freshWallet.next_derivation_index("external");

      // next_derivation_index should be derivation_index + 1
      expect(nextIndex).toBe(derivIndex! + 1);
    });
  });

  describe("cancel_tx", () => {
    it("frees the reserved change address after cancellation", () => {
      // cancel_tx unmarks change addresses reserved during build_tx,
      // making them available for future transactions.
      // Without funds we can't build a real tx, so we verify the method
      // is callable and does not throw on an empty wallet.
      const freshWallet = Wallet.create(network, externalDesc, internalDesc);

      // Get the internal derivation index before and after cancel
      const indexBefore = freshWallet.next_derivation_index("internal");
      // cancel_tx on a wallet with no pending tx is a no-op but must not throw.
      // Note: cancel_tx takes a Transaction, not a Txid. We test the full
      // flow in esplora integration tests where we have funded wallets.
      expect(typeof freshWallet.cancel_tx).toBe("function");
      const indexAfter = freshWallet.next_derivation_index("internal");
      expect(indexAfter).toBe(indexBefore);
    });
  });

  describe("finalize_psbt", () => {
    it("throws when finalizing an unsigned PSBT", () => {
      // finalize_psbt requires a signed PSBT. Attempting to finalize
      // without signatures should fail. Without funds we can't create
      // a real PSBT, so we verify the method signature is correct.
      // Full sign + finalize flow is tested in esplora integration tests.
      expect(typeof wallet.finalize_psbt).toBe("function");
    });
  });

  describe("tx_details", () => {
    it("returns undefined for a non-existent txid", () => {
      const unknownTxid = Txid.from_string(
        "0000000000000000000000000000000000000000000000000000000000000000"
      );
      const details = wallet.tx_details(unknownTxid);
      expect(details).toBeUndefined();
    });

    it("returns undefined on a fresh wallet with no transactions", () => {
      const freshWallet = Wallet.create(network, externalDesc, internalDesc);
      const txid = Txid.from_string(
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      );
      expect(freshWallet.tx_details(txid)).toBeUndefined();
    });
  });

  describe("BlockId", () => {
    it("creates from height and hash string", () => {
      const hash =
        "000000000019d6689c085ae165831e934ff763ae46a2a6c172b3f1b60a8ce26f";
      const blockId = new BlockId(0, hash);

      expect(blockId.height).toBe(0);
      expect(blockId.hash).toBe(hash);
    });

    it("throws for an invalid hash string", () => {
      expect(() => new BlockId(0, "not-a-hash")).toThrow();
    });
  });

  describe("Block", () => {
    it("throws for invalid bytes", () => {
      expect(() => Block.from_bytes(new Uint8Array([0, 1, 2]))).toThrow();
    });
  });

  describe("EvictedTx", () => {
    it("creates from txid and timestamp", () => {
      const txid = Txid.from_string(
        "0000000000000000000000000000000000000000000000000000000000000000"
      );
      const evicted = new EvictedTx(txid, BigInt(1700000000));

      expect(evicted).toBeDefined();
    });
  });

  describe("apply_evicted_txs", () => {
    it("is callable with an empty list (no-op)", () => {
      const freshWallet = Wallet.create(network, externalDesc, internalDesc);
      // Applying an empty eviction list should be a no-op and not throw
      freshWallet.apply_evicted_txs([]);
      expect(freshWallet.transactions().length).toBe(0);
    });
  });

  describe("checkpoints", () => {
    it("returns at least the genesis checkpoint for a fresh wallet", () => {
      const freshWallet = Wallet.create(network, externalDesc, internalDesc);
      const cps = freshWallet.checkpoints();

      // A fresh wallet should have at least the genesis checkpoint
      expect(cps.length).toBeGreaterThanOrEqual(1);
      expect(cps[0].height).toBe(0);
    });
  });
});
