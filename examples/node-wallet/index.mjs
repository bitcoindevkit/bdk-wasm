import {
  Amount,
  EsploraClient,
  FeeRate,
  Recipient,
  SignOptions,
  Wallet,
} from "@bitcoindevkit/bdk-wallet-node";

const network = process.env.NETWORK ?? "signet";
const esploraUrl = process.env.ESPLORA_URL ?? "https://mutinynet.com/api";
const sendSats = BigInt(process.env.SEND_SATS ?? "1000");
const feeRateSatVb = BigInt(process.env.FEE_RATE_SAT_VB ?? "1");
const stopGap = Number(process.env.STOP_GAP ?? "20");
const parallelRequests = Number(process.env.PARALLEL_REQUESTS ?? "5");

const externalDescriptor =
  process.env.EXTERNAL_DESCRIPTOR ??
  "wpkh(tprv8ZgxMBicQKsPd5puBG1xsJ5V53vVPfCy2gnZfsqzmDSDjaQx8LEW4REFvrj6PQMuer7NqZeBiy9iP9ucqJZiveeEGqQ5CvcfV6SPcy8LQR7/84'/1'/0'/0/*)#jjcsy5wd";
const internalDescriptor =
  process.env.INTERNAL_DESCRIPTOR ??
  "wpkh(tprv8ZgxMBicQKsPd5puBG1xsJ5V53vVPfCy2gnZfsqzmDSDjaQx8LEW4REFvrj6PQMuer7NqZeBiy9iP9ucqJZiveeEGqQ5CvcfV6SPcy8LQR7/84'/1'/0'/1/*)#rxa3ep74";

async function main() {
  const wallet = Wallet.create(network, externalDescriptor, internalDescriptor);
  const client = new EsploraClient(esploraUrl, 0);

  const fundingAddress = wallet.peek_address("external", 0).address.toString();
  console.log(`Network: ${wallet.network}`);
  console.log(`Fund this address first: ${fundingAddress}`);

  const update = await client.full_scan(
    wallet.start_full_scan(),
    stopGap,
    parallelRequests
  );
  wallet.apply_update(update);

  const spendable = wallet.balance.trusted_spendable.to_sat();
  console.log(`Spendable balance: ${spendable.toString()} sats`);

  if (spendable <= sendSats) {
    throw new Error(
      `Wallet needs more than ${sendSats.toString()} sats before it can self-send.`
    );
  }

  const recipient = wallet.peek_address("external", 5);
  const psbt = wallet
    .build_tx()
    .fee_rate(new FeeRate(feeRateSatVb))
    .add_recipient(
      new Recipient(recipient.address.script_pubkey, Amount.from_sat(sendSats))
    )
    .finish();

  const signOptions = new SignOptions();
  const finalized = wallet.sign(psbt, signOptions);

  if (!finalized) {
    throw new Error("wallet.sign() did not finalize the PSBT");
  }

  const tx = psbt.extract_tx();
  await client.broadcast(tx);

  console.log(`Broadcast txid: ${tx.compute_txid().toString()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
