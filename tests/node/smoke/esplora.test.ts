import { randomBytes } from "node:crypto";
import { EsploraClient, Wallet, seed_to_descriptor } from "../../../pkg/bitcoindevkit";
import type { Network } from "../../../pkg/bitcoindevkit";

const network: Network = process.env.NETWORK === "signet" ? "signet" : "regtest";
const url = process.env.ESPLORA_URL || (network === "signet"
  ? "https://mutinynet.com/api"
  : "http://localhost:8094/regtest/api");

describe("Read-only Esplora smoke test", () => {
  it("scans and syncs an unfunded wallet and reads fee estimates", async () => {
    // A fresh watch-only wallet avoids shared state and an ever-growing address history.
    const descriptors = seed_to_descriptor(randomBytes(32), network, "p2wpkh");
    const signer = Wallet.create_single(network, descriptors.external);
    const wallet = Wallet.create_single(network, signer.public_descriptor("external"));
    signer.free();
    const client = new EsploraClient(url, 2);

    // One address and one request at a time; transient 429/5xx responses get bounded backoff.
    wallet.apply_update(await client.full_scan(wallet.start_full_scan(), 1, 1));
    expect(wallet.latest_checkpoint.height).toBeGreaterThan(0);
    expect(wallet.balance.total.to_sat()).toBe(0n);

    wallet.reveal_next_address("external");
    wallet.apply_update(await client.sync(wallet.start_sync_with_revealed_spks(), 1));
    expect(wallet.list_unspent()).toHaveLength(0);

    const estimates = await client.get_fee_estimates();
    // An empty estimate map is valid on quiet networks, especially regtest.
    const nextBlockFee = estimates.get(1);
    if (nextBlockFee !== undefined) {
      expect(Number.isFinite(nextBlockFee)).toBe(true);
      expect(nextBlockFee).toBeGreaterThanOrEqual(0);
    }
  }, 90000);
});
