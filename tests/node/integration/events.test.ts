import { execSync } from "child_process";
import {
  Amount,
  EsploraClient,
  FeeRate,
  Network,
  Recipient,
  SignOptions,
  Wallet,
  WalletEvent,
  WalletEventKind,
} from "../../../pkg/bitcoindevkit";

const network: Network = (process.env.NETWORK as Network) || "regtest";
const esploraUrl =
  process.env.ESPLORA_URL || "http://localhost:8094/regtest/api";

// Skip unless running against regtest (needs docker for mining)
const describeRegtest = network === "regtest" ? describe : describe.skip;

const externalDescriptor =
  "wpkh(tprv8ZgxMBicQKsPd5puBG1xsJ5V53vVPfCy2gnZfsqzmDSDjaQx8LEW4REFvrj6PQMuer7NqZeBiy9iP9ucqJZiveeEGqQ5CvcfV6SPcy8LQR7/84'/1'/0'/0/*)#jjcsy5wd";
const internalDescriptor =
  "wpkh(tprv8ZgxMBicQKsPd5puBG1xsJ5V53vVPfCy2gnZfsqzmDSDjaQx8LEW4REFvrj6PQMuer7NqZeBiy9iP9ucqJZiveeEGqQ5CvcfV6SPcy8LQR7/84'/1'/0'/1/*)#rxa3ep74";

// WalletEventKind is a string literal union in TS, so use string constants
const EventKind = {
  ChainTipChanged: "chain_tip_changed" as WalletEventKind,
  TxConfirmed: "tx_confirmed" as WalletEventKind,
  TxUnconfirmed: "tx_unconfirmed" as WalletEventKind,
  TxReplaced: "tx_replaced" as WalletEventKind,
  TxDropped: "tx_dropped" as WalletEventKind,
};

/**
 * Mine blocks on the regtest node via docker exec.
 */
function mineBlocks(count: number): void {
  const address = execSync(
    `docker exec esplora-regtest cli -regtest getnewaddress`,
    { encoding: "utf-8" }
  ).trim();
  execSync(
    `docker exec esplora-regtest cli -regtest generatetoaddress ${count} ${address}`,
    { encoding: "utf-8" }
  );
}

/**
 * Wait for Esplora to index up to a given block height.
 */
async function waitForEsploraHeight(
  minHeight: number,
  timeoutMs = 30000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${esploraUrl}/blocks/tip/height`);
      const height = parseInt(await res.text(), 10);
      if (height >= minHeight) return;
    } catch {
      // Esplora not ready yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(
    `Esplora did not reach height ${minHeight} within ${timeoutMs}ms`
  );
}

describeRegtest("Wallet events (regtest)", () => {
  const stopGap = 5;
  const esploraClient = new EsploraClient(esploraUrl, 0);
  let wallet: Wallet;

  beforeAll(() => {
    wallet = Wallet.create(network, externalDescriptor, internalDescriptor);
  });

  it("returns events on initial full scan", async () => {
    const request = wallet.start_full_scan();
    const update = await esploraClient.full_scan(request, stopGap, 1);

    const events: WalletEvent[] = wallet.apply_update_events(update);

    // Should have at least a ChainTipChanged event (wallet goes from genesis to tip)
    const chainTipEvents = events.filter(
      (e) => e.kind === EventKind.ChainTipChanged
    );
    expect(chainTipEvents.length).toBeGreaterThanOrEqual(1);

    // The chain tip event should have old_tip at height 0 (wallet was fresh)
    const tipEvent = chainTipEvents[0];
    expect(tipEvent.old_tip).toBeDefined();
    expect(tipEvent.old_tip!.height).toBe(0);
    expect(tipEvent.new_tip).toBeDefined();
    expect(tipEvent.new_tip!.height).toBeGreaterThan(0);

    // Should have TxConfirmed for the pre-funded transaction
    const confirmedEvents = events.filter(
      (e) => e.kind === EventKind.TxConfirmed
    );
    expect(confirmedEvents.length).toBeGreaterThanOrEqual(1);

    // Each confirmed event should have a txid and block_time
    for (const event of confirmedEvents) {
      expect(event.txid).toBeDefined();
      expect(event.tx).toBeDefined();
      expect(event.block_time).toBeDefined();
      expect(event.block_time!.block_id.height).toBeGreaterThan(0);
    }

    // Wallet should have balance after applying events
    expect(wallet.balance.trusted_spendable.to_sat()).toBeGreaterThan(0);
  }, 30000);

  it("returns TxConfirmed event after sending and mining", async () => {
    // Get current tip height
    const tipBefore = wallet.latest_checkpoint.height;

    // Send a transaction to ourselves
    const recipientAddress = wallet.peek_address("external", 5);
    const sendAmount = Amount.from_sat(BigInt(5000));
    const feeRate = new FeeRate(BigInt(1));

    const psbt = wallet
      .build_tx()
      .fee_rate(feeRate)
      .add_recipient(
        new Recipient(recipientAddress.address.script_pubkey, sendAmount)
      )
      .finish();

    wallet.sign(psbt, new SignOptions());
    const tx = psbt.extract_tx();
    const txid = tx.compute_txid();
    await esploraClient.broadcast(tx);

    // Mine blocks to confirm
    mineBlocks(1);

    // Wait for Esplora to index the new block
    await waitForEsploraHeight(tipBefore + 1);

    // Sync and get events
    const syncRequest = wallet.start_sync_with_revealed_spks();
    const update = await esploraClient.sync(syncRequest, 1);
    const events: WalletEvent[] = wallet.apply_update_events(update);

    // Should have a ChainTipChanged event
    const chainTipEvents = events.filter(
      (e) => e.kind === EventKind.ChainTipChanged
    );
    expect(chainTipEvents.length).toBeGreaterThanOrEqual(1);

    // Should have a TxConfirmed event for our transaction
    const confirmedEvents = events.filter(
      (e) => e.kind === EventKind.TxConfirmed
    );
    const ourTxEvent = confirmedEvents.find(
      (e) => e.txid?.toString() === txid.toString()
    );
    expect(ourTxEvent).toBeDefined();
    expect(ourTxEvent!.block_time).toBeDefined();
    expect(ourTxEvent!.block_time!.block_id.height).toBeGreaterThan(tipBefore);
    expect(ourTxEvent!.tx).toBeDefined();
  }, 30000);

  it("event kind returns valid string enum values", async () => {
    // Mine a block and sync to get fresh events
    mineBlocks(1);
    const tip = wallet.latest_checkpoint.height;
    await waitForEsploraHeight(tip + 1);

    const syncRequest = wallet.start_sync_with_revealed_spks();
    const update = await esploraClient.sync(syncRequest, 1);
    const events: WalletEvent[] = wallet.apply_update_events(update);

    // All events should have a valid WalletEventKind string
    const validKinds = new Set<string>([
      "chain_tip_changed",
      "tx_confirmed",
      "tx_unconfirmed",
      "tx_replaced",
      "tx_dropped",
    ]);

    for (const event of events) {
      expect(validKinds.has(event.kind)).toBe(true);
    }

    // Should at least get a chain tip changed event from the mined block
    expect(
      events.some((e) => e.kind === EventKind.ChainTipChanged)
    ).toBe(true);
  }, 30000);

  it("returns no tx events when nothing changed", async () => {
    // Sync without any new transactions or blocks
    const syncRequest = wallet.start_sync_with_revealed_spks();
    const update = await esploraClient.sync(syncRequest, 1);
    const events: WalletEvent[] = wallet.apply_update_events(update);

    // No new tx events expected (wallet is already up to date)
    const txEvents = events.filter(
      (e) =>
        e.kind === EventKind.TxConfirmed ||
        e.kind === EventKind.TxUnconfirmed ||
        e.kind === EventKind.TxReplaced ||
        e.kind === EventKind.TxDropped
    );
    expect(txEvents.length).toBe(0);
  }, 30000);
});
