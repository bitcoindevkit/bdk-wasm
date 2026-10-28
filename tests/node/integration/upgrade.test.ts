import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  Amount,
  ChangeSet,
  FeeRate,
  Psbt,
  Recipient,
  SignOptions,
  Txid,
  UnconfirmedTx,
  Wallet,
  seed_to_descriptor,
} from "../../../pkg/bitcoindevkit";
import type { AddressType, Network, TxBuilder } from "../../../pkg/bitcoindevkit";

type Fixture = {
  network: Network;
  addressType: AddressType;
  external: string;
  internal: string;
  receiveAddress: string;
  nextAddress: string;
  txid: string;
  changeset: object;
};

// Generated with main@73cb4df / BDK 2.3.0, before updating Cargo.lock.
// Seed: 32 bytes of 0x01. Funding is synthetic and never broadcast.
const fixtures: Fixture[] = JSON.parse(
  readFileSync(join(__dirname, "../fixtures/bdk-2.3.0.json"), "utf8")
);

function load(fixture: Fixture, withKeys = true): Wallet {
  return Wallet.load(
    ChangeSet.from_json(JSON.stringify(fixture.changeset)),
    withKeys ? fixture.external : undefined,
    withKeys ? fixture.internal : undefined
  );
}

function build(wallet: Wallet): Psbt {
  return wallet
    .build_tx()
    .fee_absolute(Amount.from_sat(1000n))
    .include_output_redeem_witness_script()
    .add_recipient(
      new Recipient(
        wallet.peek_address("external", 5).address.script_pubkey,
        Amount.from_sat(40000n)
      )
    )
    .finish();
}

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

describe.each(fixtures)("BDK 2.3 recovery: $network / $addressType", (fixture) => {
  it("preserves derivation, network, transaction history and balance", () => {
    const wallet = load(fixture);
    const pair = seed_to_descriptor(
      new Uint8Array(32).fill(1), fixture.network, fixture.addressType
    );
    expect(pair.external).toBe(fixture.external);
    expect(pair.internal).toBe(fixture.internal);
    expect(wallet.network).toBe(fixture.network);
    expect(wallet.network_kind).toBe(fixture.network === "bitcoin" ? "main" : "test");
    expect(wallet.peek_address("external", 0).address.toString()).toBe(fixture.receiveAddress);
    expect(wallet.next_derivation_index("external")).toBe(3);
    expect(wallet.next_derivation_index("internal")).toBe(2);
    expect(wallet.reveal_next_address("external").address.toString()).toBe(fixture.nextAddress);
    expect(wallet.balance.total.to_sat()).toBe(100000n);
    expect(wallet.transactions().map((tx) => tx.txid.toString())).toEqual([fixture.txid]);
    expect(wallet.list_unspent()).toHaveLength(1);

    const aggregate = ChangeSet.from_json(JSON.stringify(fixture.changeset));
    aggregate.merge(wallet.take_staged()!);
    const restored = Wallet.load(ChangeSet.from_json(aggregate.to_json()));
    expect(restored.next_derivation_index("external")).toBe(4);
    expect(restored.balance.total.to_sat()).toBe(100000n);
  });

  it("signs and finalizes with restored keys and conserves the fee", () => {
    const wallet = load(fixture);
    const psbt = build(wallet);
    expect(wallet.sign(psbt, new SignOptions())).toBe(true);
    expect(psbt.fee().to_sat()).toBe(1000n);
    const tx = psbt.extract_tx();
    expect(tx.output.reduce((sum, output) => sum + output.value.to_sat(), 0n)).toBe(99000n);
    expect(wallet.calculate_fee(tx).to_sat()).toBe(1000n);
  });

  it("does not sign when restored without private descriptors", () => {
    const wallet = load(fixture, false);
    const psbt = build(wallet);
    expect(wallet.sign(psbt, new SignOptions())).toBe(false);
    expect(wallet.finalize_psbt(psbt, new SignOptions())).toBe(false);
  });
});

describe("PSBT signing safeguards", () => {
  const fixture = fixtures.find((f) => f.network === "regtest" && f.addressType === "p2wpkh")!;

  it("keeps conservative default signing options", () => {
    const options = new SignOptions();
    expect(options.trust_witness_utxo).toBe(false);
    expect(options.allow_all_sighashes).toBe(false);
    expect(options.try_finalize).toBe(true);
  });

  it("rejects a previous transaction whose txid does not match the input", () => {
    const wallet = load(fixture);
    const data = maps(build(wallet));
    data[1].find(({ key }) => key.length === 1 && key[0] === 0)!.value[0] ^= 1;
    expect(() => wallet.sign(fromMaps(data), new SignOptions())).toThrow(/non-witness UTXO/i);
  });

  it("rejects conflicting witness and non-witness amounts", () => {
    const wallet = load(fixture);
    const data = maps(build(wallet));
    data[1].find(({ key }) => key.length === 1 && key[0] === 1)!.value.writeBigUInt64LE(200000n);
    expect(() => wallet.sign(fromMaps(data), new SignOptions())).toThrow(/non-witness UTXO/i);
  });

  it("requires the previous transaction unless witness trust is explicitly enabled", () => {
    const wallet = load(fixture);
    const data = maps(build(wallet));
    data[1] = data[1].filter(({ key }) => !(key.length === 1 && key[0] === 0));
    expect(() => wallet.sign(fromMaps(data), new SignOptions())).toThrow(/non-witness UTXO/i);
    const options = new SignOptions();
    options.trust_witness_utxo = true;
    expect(wallet.sign(fromMaps(data), options)).toBe(true);
  });

  it("rejects SIGHASH_NONE unless the caller opts in", () => {
    const wallet = load(fixture);
    const data = maps(build(wallet));
    data[1] = data[1].filter(({ key }) => !(key.length === 1 && key[0] === 3));
    data[1].push({ key: Buffer.from([3]), value: Buffer.from([2, 0, 0, 0]) });
    expect(() => wallet.sign(fromMaps(data), new SignOptions())).toThrow(/non standard sighash/i);
    const options = new SignOptions();
    options.allow_all_sighashes = true;
    expect(wallet.sign(fromMaps(data), options)).toBe(true);
  });

  it("can sign without finalizing and finalize separately", () => {
    const wallet = load(fixture);
    const psbt = build(wallet);
    const options = new SignOptions();
    options.try_finalize = false;
    expect(wallet.sign(psbt, options)).toBe(false);
    expect(wallet.finalize_psbt(psbt, new SignOptions())).toBe(true);
  });

  it("only releases unused addresses when cancelling a transaction", () => {
    const wallet = load(fixture);
    const psbt = build(wallet);
    const tx = psbt.unsigned_tx;
    const change = tx.output.map((output) => wallet.derivation_of_spk(output.script_pubkey))
      .find((spk) => spk?.[0] === "internal")!;
    expect(wallet.list_unused_addresses("internal").map((a) => a.index)).not.toContain(change[1]);
    wallet.cancel_tx(tx);
    expect(wallet.list_unused_addresses("internal").map((a) => a.index)).toContain(change[1]);
    expect(wallet.sign(psbt, new SignOptions())).toBe(true);
    const signed = psbt.extract_tx();
    wallet.apply_unconfirmed_txs([new UnconfirmedTx(signed.clone(), 1700000001n)]);
    wallet.cancel_tx(signed);
    expect(wallet.list_unused_addresses("internal").map((a) => a.index)).not.toContain(change[1]);
  });
});

describe("boundary validation", () => {
  it("rejects overflowing fee rates without trapping the WASM instance", () => {
    const maximum = ((1n << 64n) - 1n) / 250n;
    expect(new FeeRate(maximum).to_sat_per_kwu()).toBe(maximum * 250n);
    expect(() => new FeeRate(maximum + 1n)).toThrow(/overflows/);
    expect(new FeeRate(1n).to_sat_per_kwu()).toBe(250n);
  });

  it.each(["descriptor", "change_descriptor", "network"])(
    "rejects conflicting %s without partially merging state", (field) => {
      const original = JSON.stringify(fixtures[0].changeset);
      const changeset = ChangeSet.from_json(original);
      const conflicting = JSON.parse(original);
      const other = fixtures[1].changeset as Record<string, unknown>;
      conflicting[field] = other[field];
      expect(() => changeset.merge(ChangeSet.from_json(JSON.stringify(conflicting)))).toThrow(/different wallets/);
      expect(JSON.parse(changeset.to_json())).toMatchObject(JSON.parse(original));
      expect(load(fixtures[0]).balance.total.to_sat()).toBe(100000n);
    }
  );

  it("rejects malformed persisted state and PSBTs", () => {
    expect(() => ChangeSet.from_json("{}")).toThrow();
    expect(() => Psbt.from_string("cHNidP8=")).toThrow();
    expect(() => Wallet.load(ChangeSet.from_json(JSON.stringify(fixtures[0].changeset)), fixtures[1].external)).toThrow();
  });
});

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
    const fixture = fixtures.find((f) => f.network === "regtest" && f.addressType === "p2wpkh")!;
    const wallet = load(fixture);
    const psbt = build(wallet);
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
