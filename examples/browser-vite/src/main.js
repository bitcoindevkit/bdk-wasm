import init, { Wallet } from "@bitcoindevkit/bdk-wallet-web";

const network = "signet";

const demoDescriptors = {
  external:
    "wpkh(tprv8ZgxMBicQKsPd5puBG1xsJ5V53vVPfCy2gnZfsqzmDSDjaQx8LEW4REFvrj6PQMuer7NqZeBiy9iP9ucqJZiveeEGqQ5CvcfV6SPcy8LQR7/84'/1'/0'/0/*)#jjcsy5wd",
  internal:
    "wpkh(tprv8ZgxMBicQKsPd5puBG1xsJ5V53vVPfCy2gnZfsqzmDSDjaQx8LEW4REFvrj6PQMuer7NqZeBiy9iP9ucqJZiveeEGqQ5CvcfV6SPcy8LQR7/84'/1'/0'/1/*)#rxa3ep74",
};

document.querySelector("#app").innerHTML = `
  <main style="font-family: sans-serif; margin: 2rem auto; max-width: 52rem; line-height: 1.5;">
    <h1>bdk-wasm browser example</h1>
    <p>
      This page loads <code>@bitcoindevkit/bdk-wallet-web</code>, creates a
      demo signet wallet, and derives a couple of addresses in the browser.
    </p>
    <dl>
      <dt><strong>Network</strong></dt>
      <dd id="network">Loading...</dd>

      <dt><strong>First external address</strong></dt>
      <dd id="first-address">Loading...</dd>

      <dt><strong>Next revealed external address</strong></dt>
      <dd id="next-address">Loading...</dd>

      <dt><strong>Public external descriptor</strong></dt>
      <dd><code id="descriptor" style="word-break: break-all;">Loading...</code></dd>
    </dl>

    <p id="error" style="color: #b00020;"></p>
  </main>
`;

async function main() {
  await init();

  const wallet = Wallet.create(
    network,
    demoDescriptors.external,
    demoDescriptors.internal
  );

  const firstAddress = wallet.peek_address("external", 0).address.toString();
  const nextAddress = wallet.reveal_next_address("external").address.toString();

  document.querySelector("#network").textContent = wallet.network;
  document.querySelector("#first-address").textContent = firstAddress;
  document.querySelector("#next-address").textContent = nextAddress;
  document.querySelector("#descriptor").textContent =
    wallet.public_descriptor("external");
}

main().catch((error) => {
  console.error(error);
  document.querySelector("#error").textContent =
    error instanceof Error ? error.message : String(error);
});
