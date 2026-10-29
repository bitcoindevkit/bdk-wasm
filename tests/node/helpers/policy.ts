import assert from "node:assert/strict";
import {
  Amount, Block, Condition, KeychainKind, Policy, Recipient, Transaction, Wallet,
  seed_to_descriptor,
} from "../../../pkg/bitcoindevkit";

// Public test seeds only. Keep the hardened account path and key origin intact
// when replacing BIP84's receive suffix with the vault's multipath suffixes.
const keys = [11, 12, 13].map((seed) => {
  const descriptors = seed_to_descriptor(new Uint8Array(32).fill(seed), "regtest", "p2wpkh");
  const wallet = Wallet.create("regtest", descriptors.external, descriptors.internal);
  const account = (descriptor: string) => descriptor.slice(5, descriptor.lastIndexOf(")")).replace(/\/0\/\*$/, "");
  return { secret: account(descriptors.external), public: account(wallet.public_descriptor("external")) };
});

export const vaultPaths = [
  { name: "owner + cosigner", branch: 0, signers: [0, 1], csv: undefined },
  { name: "owner + inheritance", branch: 1, signers: [0, 2], csv: 1008 },
  { name: "cosigner + inheritance", branch: 2, signers: [1, 2], csv: 52560 },
];

export function vaultWallet(signers: number[] = [], delays = [1008, 52560], branch = 0): Wallet {
  const key = (index: number, path: number) =>
    `${signers.includes(index) && path === branch * 2 ? keys[index].secret : keys[index].public}/<${path};${path + 1}>/*`;
  // The three branches and <0;1>, <2;3>, <4;5> pairs from issue #54.
  const descriptor = `wsh(or_i(and_v(v:pk(${key(0, 0)}),pk(${key(1, 0)})),or_i(and_v(v:pk(${key(0, 2)}),and_v(v:pk(${key(2, 2)}),older(${delays[0]}))),and_v(v:pk(${key(1, 4)}),and_v(v:pk(${key(2, 4)}),older(${delays[1]}))))))`;
  if (signers.length === 0) return Wallet.create_from_two_path_descriptor("regtest", descriptor);
  // BDK's wallet-owned signer import needs resolved private derivation paths.
  // The public multipath wallet above is the browser/hardware-wallet use case.
  // Import keys only for the intended branch; repeated xpriv roots at different
  // derivation paths share a signer ID in the legacy wallet-owned signer API.
  return Wallet.create("regtest",
    descriptor.replace(/<(\d+);(\d+)>/g, "$1"),
    descriptor.replace(/<(\d+);(\d+)>/g, "$2")
  );
}

export interface PolicyNode {
  id: string;
  type: string;
  threshold?: number;
  items: PolicyNode[];
}

export function vaultPolicy(wallet: Wallet, keychain: KeychainKind = "external") {
  const policy = Policy.from_descriptor(wallet.public_descriptor(keychain));
  assert(policy);
  const tree: PolicyNode = JSON.parse(policy.to_json());
  return { policy, tree };
}

export function vaultCondition(wallet: Wallet, branch: number, keychain: KeychainKind = "external"): Condition {
  const { policy, tree } = vaultPolicy(wallet, keychain);
  const path: Record<string, number[]> = { [tree.id]: [branch === 0 ? 0 : 1] };
  if (branch !== 0) path[tree.items[1].id] = [branch - 1];
  return policy.get_condition(path);
}

export function vaultPayment(wallet: Wallet) {
  return wallet.build_tx()
    .fee_absolute(Amount.from_sat(1000n))
    .add_recipient(new Recipient(
      wallet.peek_address("external", 5).address.script_pubkey, Amount.from_sat(40000n)
    ));
}

export function fundVault(wallet: Wallet, keychain: KeychainKind = "external") {
  const script = wallet.reveal_next_address(keychain).address.script_pubkey.as_bytes();
  // Synthetic non-coinbase funding, anchored at the next height. Never broadcast.
  const funding = Transaction.from_bytes(Buffer.concat([
    Buffer.from("0200000001", "hex"), Buffer.alloc(32, keychain === "external" ? 1 : 2),
    Buffer.from("0000000000ffffffff01a086010000000000", "hex"),
    Buffer.from([script.length]), script, Buffer.alloc(4),
  ]));
  const header = Buffer.alloc(80);
  header.writeInt32LE(1);
  Buffer.from(wallet.latest_checkpoint.hash, "hex").reverse().copy(header, 4);
  header.writeUInt32LE(1700000000, 68);
  const block = Block.from_bytes(Buffer.concat([header, Buffer.from([1]), funding.to_bytes()]));
  wallet.apply_block_events(block, wallet.latest_checkpoint.height + 1);
}
