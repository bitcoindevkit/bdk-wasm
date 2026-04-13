# Node.js wallet example

This example uses `@bitcoindevkit/bdk-wallet-node` to:

1. create a wallet from descriptors
2. sync it with Esplora
3. build and sign a PSBT
4. broadcast a self-send transaction

## 1. Create a new directory

```sh
mkdir node-wallet
cd node-wallet
npm init -y
npm install @bitcoindevkit/bdk-wallet-node
```

## 2. Copy the sample script

Copy `index.mjs` from this directory into your new project.

## 3. Fund the wallet

The script defaults to the same demo signet descriptors used in the repository
tests. Before it can broadcast a transaction, fund the first derived address on
signet or point it at your own descriptors via environment variables.

Useful environment variables:

- `NETWORK` — defaults to `signet`
- `ESPLORA_URL` — defaults to `https://mutinynet.com/api`
- `EXTERNAL_DESCRIPTOR`
- `INTERNAL_DESCRIPTOR`
- `SEND_SATS` — defaults to `1000`
- `FEE_RATE_SAT_VB` — defaults to `1`

## 4. Run it

```sh
node index.mjs
```

The example self-sends back into the same wallet, so you do not need a second
recipient address.
