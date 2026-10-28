import assert from "node:assert/strict";
import {
  ChangeSet,
  SignOptions,
  UnconfirmedTx,
  Wallet,
  seed_to_descriptor,
} from "../../../pkg/bitcoindevkit";
import { buildPayment, createFundedWallet } from "../helpers/wallet";

function walletChanges() {
  const wallet = createFundedWallet();
  const initial = wallet.take_staged();
  assert(initial);
  wallet.reveal_addresses_to("external", 4);
  const payment = buildPayment(wallet);
  assert(wallet.sign(payment, new SignOptions()));
  wallet.apply_unconfirmed_txs([new UnconfirmedTx(payment.extract_tx(), 1700000001n)]);
  const incremental = wallet.take_staged();
  assert(incremental);
  return { initial: initial.to_json(), incremental: incremental.to_json() };
}

function differentIdentity() {
  const descriptors = seed_to_descriptor(new Uint8Array(32).fill(2), "testnet", "p2wpkh");
  const wallet = Wallet.create("testnet", descriptors.external, descriptors.internal);
  const changeset = wallet.take_staged();
  assert(changeset);
  return JSON.parse(changeset.to_json());
}

describe("ChangeSet.merge", () => {
  it.each(["descriptor", "change_descriptor", "network"] as const)(
    "rejects a conflicting %s before merging transaction or index data", (field) => {
      const { initial, incremental } = walletChanges();
      const destination = ChangeSet.from_json(initial);
      const incoming = JSON.parse(incremental);
      incoming[field] = differentIdentity()[field];

      expect(() => destination.merge(ChangeSet.from_json(JSON.stringify(incoming))))
        .toThrow(`conflicting ${field}`);
      expect(destination.to_json()).toBe(initial);

      // The failure must leave the WASM instance and destination usable.
      destination.merge(ChangeSet.from_json(incremental));
      const restored = Wallet.load(destination);
      expect(restored.balance.total.to_sat()).toBe(99000n);
      expect(restored.transactions()).toHaveLength(2);
      // The observed payment to external index 5 also reveals that address.
      expect(restored.next_derivation_index("external")).toBe(6);
    }
  );

  it.each(["change_descriptor", "network"] as const)(
    "does not initialize missing fields before rejecting a conflicting %s", (field) => {
      const { initial, incremental } = walletChanges();
      const original = JSON.parse(initial);
      const incoming = JSON.parse(incremental);
      incoming.descriptor = original.descriptor;
      incoming[field] = differentIdentity()[field];
      original.descriptor = null;
      const destination = ChangeSet.from_json(JSON.stringify(original));
      const before = destination.to_json();

      expect(() => destination.merge(ChangeSet.from_json(JSON.stringify(incoming))))
        .toThrow(`conflicting ${field}`);
      expect(destination.to_json()).toBe(before);
    }
  );

  it("accepts equal identities and repeated incremental merges with absent identities", () => {
    const { initial, incremental } = walletChanges();
    const destination = ChangeSet.from_json(initial);
    destination.merge(ChangeSet.from_json(initial));
    expect(destination.to_json()).toBe(initial);

    const delta = ChangeSet.from_json(incremental);
    const identity = JSON.parse(incremental);
    expect(identity.descriptor).toBeNull();
    expect(identity.change_descriptor).toBeNull();
    expect(identity.network).toBeNull();
    // None + None is valid, as is applying the resulting delta to a full identity.
    delta.merge(ChangeSet.from_json(incremental));
    destination.merge(delta);
    const after = destination.to_json();
    destination.merge(ChangeSet.from_json(incremental));
    expect(destination.to_json()).toBe(after);
    expect(Wallet.load(destination).balance.total.to_sat()).toBe(99000n);
  });

  it("initializes absent identity fields from an incoming changeset", () => {
    const { initial } = walletChanges();
    const partial = JSON.parse(initial);
    partial.descriptor = null;
    partial.change_descriptor = null;
    partial.network = null;
    const destination = ChangeSet.from_json(JSON.stringify(partial));
    destination.merge(ChangeSet.from_json(initial));
    expect(destination.to_json()).toBe(initial);
    expect(Wallet.load(destination).balance.total.to_sat()).toBe(100000n);
  });
});
