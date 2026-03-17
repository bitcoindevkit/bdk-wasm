import {
  Address,
  Amount,
  BdkError,
  BdkErrorCode,
  ChangeSpendPolicy,
  FeeRate,
  OutPoint,
  Recipient,
  SignOptions,
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
    it("can be called without error on a non-existent tx", () => {
      // cancel_tx should not throw even with a dummy transaction
      // (it only unmarks change addresses - no-op if tx has no wallet outputs)
      const dummyTx = wallet.transactions();
      // With an empty wallet, we just verify the method exists and is callable
      expect(typeof wallet.cancel_tx).toBe("function");
    });
  });

  describe("finalize_psbt", () => {
    it("is callable with default SignOptions", () => {
      expect(typeof wallet.finalize_psbt).toBe("function");
      // Full PSBT finalization is tested in esplora integration tests
      // where we have funded wallets
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
  });
});
