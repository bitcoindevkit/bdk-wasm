import {
  Address,
  AddressType,
  Amount,
  Network,
  Psbt,
  ScriptBuf,
  Transaction,
  TxOut,
  seed_to_descriptor,
  seed_to_xpriv,
  xpriv_to_descriptor,
  xpub_to_descriptor,
} from "../../../pkg/bitcoindevkit";
import { mnemonicToSeedSync } from "bip39";

describe("Utilities", () => {
  const addressType: AddressType = "p2wpkh";
  const network: Network = "testnet";
  const seed = mnemonicToSeedSync(
    "journey embrace permit coil indoor stereo welcome maid movie easy clock spider tent slush bright luxury awake waste legal modify awkward answer acid goose"
  );

  it("generates xpriv from seed", async () => {
    const xpriv = seed_to_xpriv(seed, network);

    expect(xpriv).toBe(
      "tprv8ZgxMBicQKsPf6vydw7ixvsLKY79hmeXujBkGCNCApyft92yVYng2y28JpFZcneBYTTHycWSRpokhHE25GfHPBxnW5GpSm2dMWzEi9xxEyU"
    );
  });

  it("generates descriptors from seed", async () => {
    const descriptors = seed_to_descriptor(seed, network, addressType);

    expect(descriptors.external).toBe(
      "wpkh(tprv8ZgxMBicQKsPf6vydw7ixvsLKY79hmeXujBkGCNCApyft92yVYng2y28JpFZcneBYTTHycWSRpokhHE25GfHPBxnW5GpSm2dMWzEi9xxEyU/84'/1'/0'/0/*)#uel0vg9p"
    );
    expect(descriptors.internal).toBe(
      "wpkh(tprv8ZgxMBicQKsPf6vydw7ixvsLKY79hmeXujBkGCNCApyft92yVYng2y28JpFZcneBYTTHycWSRpokhHE25GfHPBxnW5GpSm2dMWzEi9xxEyU/84'/1'/0'/1/*)#dd6w3a4e"
    );
  });

  it("extracts descriptors from xpriv", async () => {
    const xpriv =
      "tprv8g4stFEyX1zQoi4oNBdUFy4cDqWcyWu1kacHgK3RRvTdTPDm8HTxhERpV9JLTct69h4479xKJXm85SYkFZ4eMUsru5MdUNkeouuzbivKAJp";
    const fingerprint = "27f9035f";
    const descriptors = xpriv_to_descriptor(
      xpriv,
      fingerprint,
      network,
      addressType
    );

    expect(descriptors.external).toBe(
      "wpkh([27f9035f/84'/1'/0']tprv8g4stFEyX1zQoi4oNBdUFy4cDqWcyWu1kacHgK3RRvTdTPDm8HTxhERpV9JLTct69h4479xKJXm85SYkFZ4eMUsru5MdUNkeouuzbivKAJp/0/*)#sx5quhf7"
    );
    expect(descriptors.internal).toBe(
      "wpkh([27f9035f/84'/1'/0']tprv8g4stFEyX1zQoi4oNBdUFy4cDqWcyWu1kacHgK3RRvTdTPDm8HTxhERpV9JLTct69h4479xKJXm85SYkFZ4eMUsru5MdUNkeouuzbivKAJp/1/*)#pj3ppzex"
    );
  });

  it("extracts descriptors from xpub", async () => {
    const xpub =
      "tpubDCkv2fHDfPg5hB6bFqJ4fNiins2Z8r5vKtD4xq5irCG2HsUXkgHYsj3gfGTdvAv41hoJeXjfxu7EBQqZMm6SVkxztKFtaaE7HuLdkuL7KNq";
    const fingerprint = "27f9035f";
    const descriptors = xpub_to_descriptor(
      xpub,
      fingerprint,
      network,
      addressType
    );

    expect(descriptors.external).toBe(
      "wpkh([27f9035f/84'/1'/0']tpubDCkv2fHDfPg5hB6bFqJ4fNiins2Z8r5vKtD4xq5irCG2HsUXkgHYsj3gfGTdvAv41hoJeXjfxu7EBQqZMm6SVkxztKFtaaE7HuLdkuL7KNq/0/*)#wle7e0wp"
    );
    expect(descriptors.internal).toBe(
      "wpkh([27f9035f/84'/1'/0']tpubDCkv2fHDfPg5hB6bFqJ4fNiins2Z8r5vKtD4xq5irCG2HsUXkgHYsj3gfGTdvAv41hoJeXjfxu7EBQqZMm6SVkxztKFtaaE7HuLdkuL7KNq/1/*)#ltuly67e"
    );
  });
});

describe("Address", () => {
  const network: Network = "testnet";

  it("returns address_type for P2WPKH address", () => {
    const address = Address.from_string(
      "tb1qd28npep0s8frcm3y7dxqajkcy2m40eysplyr9v",
      network
    );
    expect(address.address_type).toBe("p2wpkh");
  });

  it("returns address_type for P2PKH address", () => {
    const address = Address.from_string(
      "mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn",
      network
    );
    expect(address.address_type).toBe("p2pkh");
  });

  it("returns address_type for P2SH address", () => {
    const address = Address.from_string(
      "2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc",
      network
    );
    expect(address.address_type).toBe("p2sh");
  });

  it("returns address_type for P2TR address", () => {
    const address = Address.from_string(
      "tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c",
      network
    );
    expect(address.address_type).toBe("p2tr");
  });

  it("is_related_to_pubkey matches own script_pubkey", () => {
    const address = Address.from_string(
      "tb1qd28npep0s8frcm3y7dxqajkcy2m40eysplyr9v",
      network
    );
    expect(address.is_related_to_pubkey(address.script_pubkey)).toBe(true);
  });

  it("is_related_to_pubkey returns false for different script", () => {
    const address = Address.from_string(
      "tb1qd28npep0s8frcm3y7dxqajkcy2m40eysplyr9v",
      network
    );
    const other = Address.from_string(
      "tb1qjtgffm20l9vu6a7gacxvpu2ej4kdcsgc26xfdz",
      network
    );
    expect(address.is_related_to_pubkey(other.script_pubkey)).toBe(false);
  });
});

describe("TxOut", () => {
  it("creates a TxOut with constructor", () => {
    const value = Amount.from_sat(BigInt(50000));
    const script = ScriptBuf.from_hex("0014d51e61c85f81c91e3891e69807656c11573e5e48");
    const txout = new TxOut(value, script);

    expect(txout.value.to_sat()).toBe(BigInt(50000));
    expect(txout.script_pubkey.to_hex_string()).toBe(
      "0014d51e61c85f81c91e3891e69807656c11573e5e48"
    );
    expect(txout.size).toBeGreaterThan(0);
  });
});

describe("Transaction", () => {
  // A known testnet coinbase transaction (hex-encoded)
  // This is a minimal valid transaction for testing getters.
  // We use from_bytes to construct it from raw consensus bytes.
  const COINBASE_TX_HEX =
    "01000000010000000000000000000000000000000000000000000000000000000000000000" +
    "ffffffff0704ffff001d0104ffffffff0100f2052a0100000043410496b538e853519c726a" +
    "2c91e61ec11600ae1390813a627c66fb8be7947be63c52da7589379515d4e0a604f8141781" +
    "e62294721166bf621e73a82cbf2342c858eeac00000000";

  function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  }

  it("exposes version getter", () => {
    const tx = Transaction.from_bytes(hexToBytes(COINBASE_TX_HEX));
    expect(tx.version).toBe(1);
  });

  it("exposes lock_time getter", () => {
    const tx = Transaction.from_bytes(hexToBytes(COINBASE_TX_HEX));
    expect(tx.lock_time).toBe(0);
  });

  it("exposes weight getter", () => {
    const tx = Transaction.from_bytes(hexToBytes(COINBASE_TX_HEX));
    // Weight should be positive and base_size * 4 for non-segwit transactions
    expect(tx.weight).toBeGreaterThan(0);
    expect(tx.weight).toBe(BigInt(tx.base_size * 4));
  });

  it("weight is consistent with vsize", () => {
    const tx = Transaction.from_bytes(hexToBytes(COINBASE_TX_HEX));
    // vsize = ceil(weight / 4)
    const expectedVsize = Math.ceil(Number(tx.weight) / 4);
    expect(tx.vsize).toBe(expectedVsize);
  });

  it("exposes input sequence via TxIn.sequence", () => {
    const tx = Transaction.from_bytes(hexToBytes(COINBASE_TX_HEX));
    const inputs = tx.input;
    expect(inputs.length).toBeGreaterThan(0);
    // Coinbase input has sequence 0xFFFFFFFF
    expect(inputs[0].sequence).toBe(0xffffffff);
  });
});

describe("Psbt", () => {
  // A minimal valid PSBT (base64-encoded)
  // Created from a simple unsigned transaction with one input and one output
  const PSBT_BASE64 =
    "cHNidP8BAHECAAAAAbiWoQ6LzBOyGdMOTSma/0AZMxuAKXOFECsHxe69kMEAAAAAAP////8BYIkV" +
    "AAAAAAAZdqkU/wnITVpEpeCXb9MRxWC5GGtptOWIrAAAAAAAAQEfgJaYAAAAAAAZdqkUCMkO8CyW" +
    "gcJzT0WfmUi+nfBc+ZeIrAAAAA==";

  it("round-trips through to_bytes/from_bytes", () => {
    const psbt = Psbt.from_string(PSBT_BASE64);
    const bytes = psbt.to_bytes();
    expect(bytes.length).toBeGreaterThan(0);

    const restored = Psbt.from_bytes(bytes);
    expect(restored.toString()).toBe(psbt.toString());
  });

  it("round-trips through to_string/from_string", () => {
    const psbt = Psbt.from_string(PSBT_BASE64);
    const base64 = psbt.toString();
    const restored = Psbt.from_string(base64);
    expect(restored.toString()).toBe(psbt.toString());
  });

  it("reports correct n_inputs and n_outputs", () => {
    const psbt = Psbt.from_string(PSBT_BASE64);
    expect(psbt.n_inputs()).toBe(1);
    expect(psbt.n_outputs()).toBe(1);
  });

  it("returns version", () => {
    const psbt = Psbt.from_string(PSBT_BASE64);
    expect(psbt.version).toBe(0);
  });

  it("unsigned_tx is accessible", () => {
    const psbt = Psbt.from_string(PSBT_BASE64);
    const tx = psbt.unsigned_tx;
    expect(tx.input.length).toBe(1);
    expect(tx.output.length).toBe(1);
  });

  it("from_bytes rejects invalid data", () => {
    expect(() => {
      Psbt.from_bytes(new Uint8Array([0x00, 0x01, 0x02]));
    }).toThrow("Failed to deserialize PSBT");
  });
});
