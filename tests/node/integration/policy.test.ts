import assert from "node:assert/strict";
import {
  Amount, Condition, Policy, SignOptions, UnconfirmedTx, Wallet,
} from "../../../pkg/bitcoindevkit";
import {
  fundVault, vaultCondition, vaultPaths, vaultPayment, vaultPolicy, vaultWallet,
} from "../helpers/policy";

describe("caller-owned spending policies", () => {
  it.each(vaultPaths)("builds and signs $name on receive and change keychains", ({ branch, signers, csv }) => {
    for (const keychain of ["external", "internal"] as const) {
      const wallet = vaultWallet();
      const signer = vaultWallet(signers, undefined, branch);
      fundVault(wallet, keychain);
      fundVault(signer, keychain);
      expect(signer.public_descriptor(keychain)).toBe(wallet.public_descriptor(keychain));
      const { policy, tree } = vaultPolicy(wallet, keychain);
      expect(policy.requires_path()).toBe(true);
      expect(tree.type).toBe("THRESH");
      expect(tree.threshold).toBe(1);
      expect(tree.items).toHaveLength(2);
      const condition = vaultCondition(wallet, branch, keychain);
      expect(condition.csv).toBe(csv);
      expect(condition.timelock).toBeUndefined();

      expect(() => vaultPayment(wallet).finish()).toThrow(/Spending policy required/i);
      const psbt = vaultPayment(wallet).set_condition(condition).finish();
      expect(psbt.unsigned_tx.input[0].sequence).toBe(csv ?? 0xfffffffd);
      expect(Buffer.from(psbt.unsigned_tx.to_bytes()).readInt32LE(0)).toBe(2);
      expect(psbt.fee().to_sat()).toBe(1000n);
      // A timelocked transaction can be signed in advance. Core regtest tests
      // independently check when these witnesses become spendable.
      expect(signer.sign(psbt, new SignOptions())).toBe(true);
      const tx = psbt.extract_tx();
      expect(tx.input[0].total_size).toBeGreaterThan(tx.input[0].base_size);

      wallet.apply_unconfirmed_txs([new UnconfirmedTx(tx.clone(), 1700000001n)]);
      const bump = wallet.build_fee_bump(tx.compute_txid())
        .set_condition(condition).fee_absolute(Amount.from_sat(2000n)).finish();
      expect(bump.unsigned_tx.input[0].sequence).toBe(csv ?? 0xfffffffd);
      const bumpOptions = new SignOptions();
      bumpOptions.assume_height = csv ?? 1;
      expect(signer.sign(bump, bumpOptions)).toBe(true);
      expect(bump.fee().to_sat()).toBe(2000n);
    }
  });

  it("combines conditions when spending receive and change inputs together", () => {
    const wallet = vaultWallet([0, 1, 2]);
    fundVault(wallet, "external");
    fundVault(wallet, "internal");
    const condition = vaultCondition(wallet, 1).merge(vaultCondition(wallet, 2, "internal"));
    expect(condition.csv).toBe(52560);
    const psbt = vaultPayment(wallet).drain_wallet().set_condition(condition).finish();
    expect(psbt.unsigned_tx.input.map((input) => input.sequence)).toEqual([52560, 52560]);
    const options = new SignOptions();
    options.assume_height = 52561;
    expect(wallet.sign(psbt, options)).toBe(true);
  });

  it("does not provide missing signatures", () => {
    const singleSigner = vaultWallet([0]);
    fundVault(singleSigner);
    const incomplete = vaultPayment(singleSigner).set_condition(vaultCondition(singleSigner, 0)).finish();
    expect(singleSigner.sign(incomplete, new SignOptions())).toBe(false);
  });

  it("rejects invalid selections and remains usable after errors", () => {
    const { policy, tree } = vaultPolicy(vaultWallet());
    expect(() => policy.get_condition({})).toThrow(/Not enough items selected/);
    expect(() => policy.get_condition({ [tree.id]: [1] })).toThrow(/Not enough items selected/);
    expect(() => policy.get_condition({ [tree.id]: [2] })).toThrow(/out of bounds/i);
    expect(() => policy.get_condition({ [tree.id]: [1], [tree.items[1].id]: [2] })).toThrow(/out of bounds/i);
    for (const invalid of [-1, 0.5, NaN, Infinity, 2 ** 32]) {
      expect(() => policy.get_condition({ [tree.id]: [invalid] })).toThrow(/expected/);
    }
    expect(policy.get_condition({ [tree.id]: [0] }).csv).toBeUndefined();
    expect(() => Policy.from_descriptor("invalid descriptor")).toThrow();
    const wallet = vaultWallet([0, 1]);
    expect(vaultPolicy(wallet).policy.to_json()).toBe(policy.to_json());
  });

  it("preserves BDK validation of explicit version, sequence and locktime", () => {
    const wallet = vaultWallet();
    fundVault(wallet);
    const csv = vaultCondition(wallet, 1);
    expect(() => vaultPayment(wallet).set_condition(csv).version(1).finish()).toThrow(/version `1`.*OP_CSV/);
    expect(() => vaultPayment(wallet).set_condition(csv).set_exact_sequence(1007).finish()).toThrow(/required OP_CSV/);
    expect(() => vaultPayment(wallet).set_condition(csv).set_exact_sequence(0xfffffffd).finish()).toThrow(/required OP_CSV/);
    expect(() => vaultPayment(wallet).set_condition(new Condition(undefined, 500)).nlocktime(499).finish()).toThrow(/requested timelock/);
    expect(vaultPayment(wallet).set_condition(csv).set_exact_sequence(1009).finish().unsigned_tx.input[0].sequence).toBe(1009);
    expect(vaultPayment(wallet).set_condition(csv).set_condition(new Condition()).finish().unsigned_tx.input[0].sequence).toBe(0xfffffffd);
  });
});

describe("Condition", () => {
  it("merges height and time requirements without consuming either input", () => {
    const a = new Condition(6, 500);
    const b = new Condition(12, 600);
    expect(a.merge(b).csv).toBe(12);
    expect(a.merge(b).timelock).toBe(600);
    expect(a.csv).toBe(6);
    expect(b.timelock).toBe(600);
    const timed = new Condition(0x400002, 1700000000).merge(new Condition(0x400003, 1700000100));
    expect(timed.csv).toBe(0x400003);
    expect(timed.timelock).toBe(1700000100);
    expect(() => a.merge(timed)).toThrow(/Mixed timelock units/);
    expect(() => new Condition(undefined, 500).merge(new Condition(undefined, 1700000000))).toThrow(/Mixed timelock units/);
    expect(new Condition().merge(a).csv).toBe(6);
    expect(a.merge(new Condition()).timelock).toBe(500);
  });

  it("rejects invalid numeric requirements without JS integer wrapping", () => {
    for (const value of [-1, 1.5, NaN, Infinity, 2 ** 32]) {
      expect(() => new Condition(value)).toThrow(/unsigned 32-bit integer/);
      expect(() => new Condition(undefined, value)).toThrow(/unsigned 32-bit integer/);
    }
    expect(() => new Condition(0x80000000)).toThrow(/disable flag/);
    expect(new Condition(0, 0).csv).toBe(0);
    expect(new Condition(undefined, 0xffffffff).timelock).toBe(0xffffffff);
    // Reserved BIP68 bits must not distort BDK's numeric comparison on merge.
    expect(new Condition(0x10001).csv).toBe(1);
    expect(new Condition(0x10001).merge(new Condition(2)).csv).toBe(2);
  });

  it.each([
    { unit: "blocks", csv: 6, timelock: 500 },
    { unit: "time", csv: 0x400002, timelock: 1700000000 },
  ])("extracts combined CSV and CLTV requirements in $unit", ({ csv, timelock }) => {
    const source = vaultWallet().public_descriptor("external");
    const key = source.match(/pk\(([^)]+)\)/)?.[1];
    assert(key);
    const descriptor = `wsh(and_v(v:pk(${key}),and_v(v:older(${csv}),after(${timelock}))))`;
    const policy = Policy.from_descriptor(descriptor);
    assert(policy);
    expect(policy.requires_path()).toBe(false);
    const condition = policy.get_condition({});
    expect(condition.csv).toBe(csv);
    expect(condition.timelock).toBe(timelock);
    const wallet = Wallet.create_single("regtest", descriptor);
    fundVault(wallet);
    const psbt = vaultPayment(wallet).set_condition(condition).finish();
    expect(psbt.unsigned_tx.input[0].sequence).toBe(csv);
    const bytes = Buffer.from(psbt.unsigned_tx.to_bytes());
    expect(bytes.readUInt32LE(bytes.length - 4)).toBe(timelock);
  });
});
