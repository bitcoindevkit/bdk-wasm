import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { Block, Condition, Policy, SignOptions, Wallet, seed_to_descriptor } from "../../../pkg/bitcoindevkit";
import { vaultCondition, vaultPaths, vaultPayment, vaultWallet } from "../helpers/policy";

function rpc<T>(method: string, ...args: (string | number)[]): T {
  return JSON.parse(execFileSync("docker", [
    "exec", "esplora-regtest", "cli", "-regtest", method, ...args.map(String),
  ], { encoding: "utf8" }));
}

// Bitcoin Core prints strings without JSON quotes.
function rpcString(method: string, ...args: (string | number)[]): string {
  return execFileSync("docker", [
    "exec", "esplora-regtest", "cli", "-regtest", method, ...args.map(String),
  ], { encoding: "utf8" }).trim();
}

interface Acceptance { allowed: boolean; "reject-reason"?: string }

describe.skipIf(process.env.NETWORK !== "regtest")("spending paths validated by Bitcoin Core", () => {
  // Same policy as #54 with shorter delays for CI. Offline tests use 1008/52560.
  const delays = [6, 12];

  for (const keychain of ["external", "internal"] as const) {
    it.each(vaultPaths)(`spends $name from ${keychain} at the maturity boundary`, ({ branch, signers }) => {
      const wallet = vaultWallet([], delays);
      const signer = vaultWallet(signers, delays, branch);
      const address = wallet.reveal_next_address(keychain).address.toString();
      expect(signer.reveal_next_address(keychain).address.toString()).toBe(address);
      rpcString("sendtoaddress", address, "0.001");
      const miner = rpcString("getnewaddress");
      const [hash] = rpc<string[]>("generatetoaddress", 1, miner);
      const height = rpc<number>("getblockcount");
      const block = Block.from_bytes(Buffer.from(rpcString("getblock", hash, 0), "hex"));
      for (const w of [wallet, signer]) {
        w.apply_block_connected_to_events(block, height, w.latest_checkpoint.block_id);
      }

      const condition = vaultCondition(wallet, branch, keychain);
      const csv = branch === 0 ? undefined : delays[branch - 1];
      expect(condition.csv).toBe(csv);
      const psbt = vaultPayment(wallet).set_condition(condition).finish();
      const options = new SignOptions();
      // Construct the future-valid witness; Core independently checks actual maturity.
      options.assume_height = height + (csv ?? 0);
      expect(signer.sign(psbt, options)).toBe(true);
      const hex = Buffer.from(psbt.extract_tx().to_bytes()).toString("hex");
      const decoded = rpc<{ version: number; vin: { sequence: number; txinwitness: string[] }[] }>("decoderawtransaction", hex);
      expect(decoded.version).toBe(2);
      expect(decoded.vin[0].sequence).toBe(csv ?? 0xfffffffd);
      const witness = decoded.vin[0].txinwitness;
      // Check the actual or_i branch selectors, not just that signing returned true.
      expect(witness.slice(branch === 0 ? -2 : -3, -1)).toEqual(
        branch === 0 ? ["01"] : branch === 1 ? ["01", ""] : ["", ""]
      );
      const accept = () => rpc<Acceptance[]>("testmempoolaccept", JSON.stringify([hex]))[0];
      if (csv !== undefined) {
        expect(accept()).toMatchObject({ allowed: false, "reject-reason": "non-BIP68-final" });
        rpc("generatetoaddress", csv - 2, miner);
        // Candidate next block is still one block too early.
        expect(accept()).toMatchObject({ allowed: false, "reject-reason": "non-BIP68-final" });
        rpc("generatetoaddress", 1, miner);

        // A caller-supplied condition is not proof of descriptor satisfaction.
        // Even after maturity, omitting CSV makes the recovery witness invalid.
        const wrong = vaultPayment(wallet).set_condition(new Condition()).finish();
        const future = new SignOptions();
        future.assume_height = height + csv;
        expect(signer.sign(wrong, future)).toBe(true);
        const wrongHex = Buffer.from(wrong.extract_tx().to_bytes()).toString("hex");
        const rejected = rpc<Acceptance[]>("testmempoolaccept", JSON.stringify([wrongHex]))[0];
        expect(rejected.allowed).toBe(false);
        expect(rejected["reject-reason"]).toMatch(/Locktime requirement not satisfied/i);
      }
      expect(accept().allowed).toBe(true);
      const txid = rpcString("sendrawtransaction", hex);
      const [confirmed] = rpc<string[]>("generatetoaddress", 1, miner);
      expect(rpc<{ tx: string[] }>("getblock", confirmed).tx).toContain(txid);
    }, 30000);
  }

  it("enforces CSV and CLTV together until both requirements mature", () => {
    const locktime = rpc<number>("getblockcount") + 5;
    const keyDescriptor = seed_to_descriptor(new Uint8Array(32).fill(14), "regtest", "p2wpkh").external;
    const key = keyDescriptor.slice(5, keyDescriptor.lastIndexOf(")"));
    const signer = Wallet.create_single("regtest", `wsh(and_v(v:pk(${key}),and_v(v:older(3),after(${locktime}))))`);
    const wallet = Wallet.create_single("regtest", signer.public_descriptor("external"));
    const address = wallet.reveal_next_address("external").address.toString();
    signer.reveal_next_address("external");
    rpcString("sendtoaddress", address, "0.001");
    const miner = rpcString("getnewaddress");
    const [hash] = rpc<string[]>("generatetoaddress", 1, miner);
    const height = rpc<number>("getblockcount");
    const block = Block.from_bytes(Buffer.from(rpcString("getblock", hash, 0), "hex"));
    for (const w of [wallet, signer]) w.apply_block_connected_to_events(block, height, w.latest_checkpoint.block_id);
    const policy = Policy.from_descriptor(wallet.public_descriptor("external"));
    assert(policy);
    const condition = policy.get_condition({});
    expect(condition.csv).toBe(3);
    expect(condition.timelock).toBe(locktime);
    const psbt = vaultPayment(wallet).set_condition(condition).finish();
    expect(signer.sign(psbt, new SignOptions())).toBe(true);
    const hex = Buffer.from(psbt.extract_tx().to_bytes()).toString("hex");
    const decoded = rpc<{ locktime: number; vin: { sequence: number }[] }>("decoderawtransaction", hex);
    expect(decoded.locktime).toBe(locktime);
    expect(decoded.vin[0].sequence).toBe(3);
    const accept = () => rpc<Acceptance[]>("testmempoolaccept", JSON.stringify([hex]))[0];
    expect(accept()).toMatchObject({ allowed: false, "reject-reason": "non-final" });
    // CSV is mature; CLTV is still one block short of permitting the next block.
    rpc("generatetoaddress", locktime - height - 1, miner);
    expect(accept()).toMatchObject({ allowed: false, "reject-reason": "non-final" });
    rpc("generatetoaddress", 1, miner);
    expect(accept().allowed).toBe(true);
  }, 30000);
});
