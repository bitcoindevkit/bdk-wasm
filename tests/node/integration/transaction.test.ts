import {
  BdkError,
  Transaction,
  Txid,
} from "../../../pkg/bitcoindevkit";

/**
 * Tests for Transaction.to_bytes() and Transaction.from_bytes()
 *
 * Uses a known mainnet coinbase transaction (block 170, first block with a
 * non-coinbase tx) serialized as raw consensus bytes.
 */
describe("Transaction serialization", () => {
  // Raw consensus-encoded bytes of the coinbase tx from block 170
  // txid: b1fea52486ce0c62bb442b530a3f0132b826c74e473d1f2c220bfa78111c5082
  const COINBASE_TX_HEX =
    "01000000010000000000000000000000000000000000000000000000000000000000000000ffffffff0704ffff001d0102ffffffff0100f2052a0100000043410496b538e853519c726a2c91e61ec11600ae1390813a627c66fb8be7947be63c52da7589379515d4e0a604f8141781e62294721166bf621e73a82cbf2342c858eeac00000000";

  // Known txid of the above transaction
  const COINBASE_TXID =
    "b1fea52486ce0c62bb442b530a3f0132b826c74e473d1f2c220bfa78111c5082";

  // Satoshi's famous first spend (block 170)
  // txid: f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16
  const FIRST_SPEND_TX_HEX =
    "0100000001c997a5e56e104102fa209c6a852dd90660a20b2d9c352423edce25857fcd3704000000004847304402204e45e16932b8af514961a1d3a1a25fdf3f4f7732e9d624c6c61548ab5fb8cd410220181522ec8eca07de4860a4acdd12909d831cc56cbbac4622082221a8768d1d0901ffffffff0200ca9a3b00000000434104ae1a62fe09c5f51b13905f07f06b99a2f7159b2225f374cd378d71302fa28414e7aab37397f554a7df5f142c21c1b7303b8a0626f1baded5c72a704f7e6cd84cac00286bee0000000043410411db93e1dcdb8a016b49840f8c53bc1eb68a382e97b1482ecad7b148a6909a5cb2e0eaddfb84ccf9744464f82e160bfa9b8b64f9d4c03f999b8643f656b412a3ac00000000";

  const FIRST_SPEND_TXID =
    "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16";

  function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  }

  function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  describe("from_bytes", () => {
    it("deserializes a valid coinbase transaction", () => {
      const txBytes = hexToBytes(COINBASE_TX_HEX);
      const tx = Transaction.from_bytes(txBytes);

      expect(tx).toBeDefined();
      expect(tx.compute_txid().toString()).toBe(COINBASE_TXID);
      expect(tx.is_coinbase).toBe(true);
    });

    it("deserializes a valid non-coinbase transaction", () => {
      const txBytes = hexToBytes(FIRST_SPEND_TX_HEX);
      const tx = Transaction.from_bytes(txBytes);

      expect(tx).toBeDefined();
      expect(tx.compute_txid().toString()).toBe(FIRST_SPEND_TXID);
      expect(tx.is_coinbase).toBe(false);
      expect(tx.input.length).toBe(1);
      expect(tx.output.length).toBe(2);
    });

    it("throws on empty bytes", () => {
      expect(() => {
        Transaction.from_bytes(new Uint8Array(0));
      }).toThrow("Failed to deserialize transaction");
    });

    it("throws on truncated bytes", () => {
      const txBytes = hexToBytes(COINBASE_TX_HEX);
      const truncated = txBytes.slice(0, 20);

      expect(() => {
        Transaction.from_bytes(truncated);
      }).toThrow("Failed to deserialize transaction");
    });

    it("throws on random garbage bytes", () => {
      const garbage = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);

      expect(() => {
        Transaction.from_bytes(garbage);
      }).toThrow("Failed to deserialize transaction");
    });

    it("throws on single zero byte", () => {
      expect(() => {
        Transaction.from_bytes(new Uint8Array([0x00]));
      }).toThrow("Failed to deserialize transaction");
    });
  });

  describe("to_bytes", () => {
    it("serializes a coinbase transaction to correct bytes", () => {
      const originalBytes = hexToBytes(COINBASE_TX_HEX);
      const tx = Transaction.from_bytes(originalBytes);
      const serialized = tx.to_bytes();

      expect(bytesToHex(serialized)).toBe(COINBASE_TX_HEX);
    });

    it("serializes a non-coinbase transaction to correct bytes", () => {
      const originalBytes = hexToBytes(FIRST_SPEND_TX_HEX);
      const tx = Transaction.from_bytes(originalBytes);
      const serialized = tx.to_bytes();

      expect(bytesToHex(serialized)).toBe(FIRST_SPEND_TX_HEX);
    });

    it("returns a Uint8Array", () => {
      const txBytes = hexToBytes(COINBASE_TX_HEX);
      const tx = Transaction.from_bytes(txBytes);
      const serialized = tx.to_bytes();

      expect(serialized).toBeInstanceOf(Uint8Array);
      expect(serialized.length).toBeGreaterThan(0);
    });
  });

  describe("round-trip", () => {
    it("round-trips a coinbase transaction", () => {
      const originalBytes = hexToBytes(COINBASE_TX_HEX);
      const tx1 = Transaction.from_bytes(originalBytes);
      const serialized = tx1.to_bytes();
      const tx2 = Transaction.from_bytes(serialized);

      expect(tx2.compute_txid().toString()).toBe(tx1.compute_txid().toString());
      expect(tx2.is_coinbase).toBe(tx1.is_coinbase);
      expect(tx2.input.length).toBe(tx1.input.length);
      expect(tx2.output.length).toBe(tx1.output.length);
      expect(tx2.total_size).toBe(tx1.total_size);
      expect(tx2.vsize).toBe(tx1.vsize);
    });

    it("round-trips a non-coinbase transaction", () => {
      const originalBytes = hexToBytes(FIRST_SPEND_TX_HEX);
      const tx1 = Transaction.from_bytes(originalBytes);
      const serialized = tx1.to_bytes();
      const tx2 = Transaction.from_bytes(serialized);

      expect(tx2.compute_txid().toString()).toBe(tx1.compute_txid().toString());
      expect(tx2.is_coinbase).toBe(tx1.is_coinbase);
      expect(tx2.input.length).toBe(tx1.input.length);
      expect(tx2.output.length).toBe(tx1.output.length);
      expect(tx2.total_size).toBe(tx1.total_size);
      expect(tx2.vsize).toBe(tx1.vsize);
      expect(tx2.base_size).toBe(tx1.base_size);
    });

    it("preserves txid through multiple round-trips", () => {
      const originalBytes = hexToBytes(FIRST_SPEND_TX_HEX);
      let tx = Transaction.from_bytes(originalBytes);

      // Round-trip 3 times
      for (let i = 0; i < 3; i++) {
        const bytes = tx.to_bytes();
        tx = Transaction.from_bytes(bytes);
      }

      expect(tx.compute_txid().toString()).toBe(FIRST_SPEND_TXID);
      expect(bytesToHex(tx.to_bytes())).toBe(FIRST_SPEND_TX_HEX);
    });
  });

  describe("properties after deserialization", () => {
    it("exposes correct properties on coinbase tx", () => {
      const tx = Transaction.from_bytes(hexToBytes(COINBASE_TX_HEX));

      expect(tx.is_coinbase).toBe(true);
      expect(tx.is_explicitly_rbf).toBe(false);
      expect(tx.input.length).toBe(1);
      expect(tx.output.length).toBe(1);
      expect(tx.total_size).toBeGreaterThan(0);
      expect(tx.base_size).toBeGreaterThan(0);
      expect(tx.vsize).toBeGreaterThan(0);
    });

    it("exposes correct properties on first-spend tx", () => {
      const tx = Transaction.from_bytes(hexToBytes(FIRST_SPEND_TX_HEX));

      expect(tx.is_coinbase).toBe(false);
      expect(tx.input.length).toBe(1);
      expect(tx.output.length).toBe(2);

      // First output: 10 BTC (1_000_000_000 sats)
      expect(tx.tx_out(0).value.to_sat()).toBe(BigInt(1000000000));
      // Second output: 40 BTC (4_000_000_000 sats)
      expect(tx.tx_out(1).value.to_sat()).toBe(BigInt(4000000000));
    });
  });
});
