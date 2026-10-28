import { Psbt, SignOptions } from "../../../pkg/bitcoindevkit";
import { buildPayment, createFundedWallet } from "../helpers/wallet";

// Parse PSBT maps only to mutate security-sensitive fields in the tests. This
// helper is deliberately limited to the small CompactSize lengths used here.
type Entry = { key: Buffer; value: Buffer };
function maps(psbt: Psbt): Entry[][] {
  const data = Buffer.from(psbt.toString(), "base64");
  let offset = 5;
  const readLength = (): number => {
    const first = data[offset++];
    if (first < 253) return first;
    if (first !== 253) throw new Error("Unexpected fixture size");
    const length = data.readUInt16LE(offset);
    offset += 2;
    return length;
  };
  const result: Entry[][] = [];
  while (offset < data.length) {
    const entries: Entry[] = [];
    for (let length = readLength(); length !== 0; length = readLength()) {
      const key = Buffer.from(data.subarray(offset, offset + length));
      offset += length;
      const valueLength = readLength();
      const value = Buffer.from(data.subarray(offset, offset + valueLength));
      offset += valueLength;
      entries.push({ key, value });
    }
    result.push(entries);
  }
  return result;
}

function fromMaps(value: Entry[][]): Psbt {
  const sized = (data: Buffer): Buffer => {
    if (data.length < 253) return Buffer.concat([Buffer.from([data.length]), data]);
    const prefix = Buffer.alloc(3);
    prefix[0] = 253;
    prefix.writeUInt16LE(data.length, 1);
    return Buffer.concat([prefix, data]);
  };
  return Psbt.from_string(
    Buffer.concat([
      Buffer.from("70736274ff", "hex"),
      ...value.flatMap((entries) => [
        ...entries.flatMap(({ key, value }) => [sized(key), sized(value)]),
        Buffer.from([0]),
      ]),
    ]).toString("base64")
  );
}

describe("PSBT signing safeguards", () => {
  it("keeps conservative default signing options", () => {
    const options = new SignOptions();
    expect(options.trust_witness_utxo).toBe(false);
    expect(options.allow_all_sighashes).toBe(false);
    expect(options.try_finalize).toBe(true);
  });

  it("rejects a previous transaction whose txid does not match the input", () => {
    const wallet = createFundedWallet();
    const data = maps(buildPayment(wallet));
    data[1].find(({ key }) => key.length === 1 && key[0] === 0)!.value[0] ^= 1;
    expect(() => wallet.sign(fromMaps(data), new SignOptions())).toThrow(/non-witness UTXO/i);
  });

  it("rejects conflicting witness and non-witness amounts", () => {
    const wallet = createFundedWallet();
    const data = maps(buildPayment(wallet));
    data[1].find(({ key }) => key.length === 1 && key[0] === 1)!.value.writeBigUInt64LE(200000n);
    expect(() => wallet.sign(fromMaps(data), new SignOptions())).toThrow(/non-witness UTXO/i);
  });

  it("requires the previous transaction unless witness trust is explicitly enabled", () => {
    const wallet = createFundedWallet();
    const data = maps(buildPayment(wallet));
    data[1] = data[1].filter(({ key }) => !(key.length === 1 && key[0] === 0));
    expect(() => wallet.sign(fromMaps(data), new SignOptions())).toThrow(/non-witness UTXO/i);
    const options = new SignOptions();
    options.trust_witness_utxo = true;
    expect(wallet.sign(fromMaps(data), options)).toBe(true);
  });

  it("rejects SIGHASH_NONE unless the caller opts in", () => {
    const wallet = createFundedWallet();
    const data = maps(buildPayment(wallet));
    data[1] = data[1].filter(({ key }) => !(key.length === 1 && key[0] === 3));
    data[1].push({ key: Buffer.from([3]), value: Buffer.from([2, 0, 0, 0]) });
    expect(() => wallet.sign(fromMaps(data), new SignOptions())).toThrow(/non standard sighash/i);
    const options = new SignOptions();
    options.allow_all_sighashes = true;
    expect(wallet.sign(fromMaps(data), options)).toBe(true);
  });

  it("can sign without finalizing and finalize separately", () => {
    const wallet = createFundedWallet();
    const psbt = buildPayment(wallet);
    const options = new SignOptions();
    options.try_finalize = false;
    expect(wallet.sign(psbt, options)).toBe(false);
    expect(wallet.finalize_psbt(psbt, new SignOptions())).toBe(true);
  });

  it("does not sign without private descriptors", () => {
    const wallet = createFundedWallet(false);
    const psbt = buildPayment(wallet);
    expect(wallet.sign(psbt, new SignOptions())).toBe(false);
    expect(wallet.finalize_psbt(psbt, new SignOptions())).toBe(false);
  });

  it("rejects a malformed PSBT", () => {
    expect(() => Psbt.from_string("cHNidP8=")).toThrow();
  });
});
