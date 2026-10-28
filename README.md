<div align="center">
  <h1>The Bitcoin Dev Kit: WebAssembly</h1>

  <img src="./static/bdk.png" width="220" />

  <p>
    <strong>The Bitcoin Dev Kit for Browsers, Node, and React Native</strong>
  </p>

  <p>
    <a href="https://www.npmjs.com/package/@bitcoindevkit/bdk-wallet-web"><img alt="NPM Package (Web)" src="https://img.shields.io/npm/v/@bitcoindevkit/bdk-wallet-web.svg"/></a>
    <a href="https://www.npmjs.com/package/@bitcoindevkit/bdk-wallet-node"><img alt="NPM Package (Node)" src="https://img.shields.io/npm/v/@bitcoindevkit/bdk-wallet-node.svg"/></a>
    <a href="https://github.com/bitcoindevkit/bdk-wasm/blob/main/LICENSE-MIT"><img alt="MIT or Apache-2.0 Licensed" src="https://img.shields.io/badge/license-MIT%2FApache--2.0-blue.svg"/></a>
    <a href="https://blog.rust-lang.org/2025/06/26/Rust-1.88.0/"><img alt="Rustc Version 1.88.0+" src="https://img.shields.io/badge/rustc-1.88.0%2B-lightgrey.svg"/></a>
    <a href="https://discord.gg/d7NkDKm"><img alt="Chat on Discord" src="https://img.shields.io/discord/753336465005608961?logo=discord"></a>
  </p>

</div>

## About

The `bdk-wasm` library aims at providing access to the excellent [BitcoinDevKit](https://github.com/bitcoindevkit/bdk) to JS and Node environments (and eventually any device supporting WebAssembly).
It specializes in compiling BDK on the `wasm32-unknown-unknown` target and use [`wasm-bindgen`](https://github.com/rustwasm/wasm-bindgen) to create TypeScript bindings.

This repo handles the packaging and publishing of the `bdk-wallet-web` (for browsers) and `bdk-wallet-node` (for Node.js) NPM packages, using `wasm-pack`.

This library offers all the desired functionality to build a Bitcoin wallet out of the box:

- UTXO management
- Coin selection
- Wallet upates by syncing and scanning the chain data
- Bitcoin descriptors for flexibility in the definition of spending conditions. Supports all address types from legacy to Taproot.
- State update and persistence
- Transaction creation, signing and broadcasting
- Dynamic addresses
- and much more

For a lightweight library providing stateless utility functions, see [`bitcoinjs`](https://github.com/bitcoinjs/bitcoinjs-lib).

## Installation

### Browser/Web

```sh
yarn add @bitcoindevkit/bdk-wallet-web
```

### Node.js

```sh
yarn add @bitcoindevkit/bdk-wallet-node
```

## Notes on WASM Specific Considerations

> [!WARNING]
> There are several limitations to using BDK in WASM. Basically any functionality that requires the OS standard library is not directly available in WASM. However, there are viable workarounds documented below. Some key limitations include:
>
> - No access to the file system
> - Network access is limited to http(s)

### WASM Considerations Overview

#### No access to the file system

With no direct access to the file system, persistence cannot be handled by BDK directly. Instead, an in memory wallet must be used in the WASM environment, and the data must be exported using `wallet.take_staged()`. This will export the changeset for the updates to the wallet state, which must then be merged with current wallet state in JS (will depend on your persistence strategy). The persisted `ChangeSet` can be passed to `wallet.load()` to recover the wallet.

#### Network access is limited to http(s)

This essentially means the library only supports [Esplora](https://github.com/blockstream/esplora/blob/master/API.md) as blockchain client. Both RPC and Electrum clients require sockets and will not work for BDK in a WASM environment out of the box.

## Selecting a spending path

Descriptors with alternative timelocks need an explicit spending condition. Use
`Policy.from_descriptor(wallet.public_descriptor(keychain))` to inspect a public
policy without wallet-owned signers, then `Policy.get_condition(path)` and
`TxBuilder.set_condition(condition)` to set its CSV/CLTV requirements.

For the three-branch vault in [#54](https://github.com/bitcoindevkit/bdk-wasm/issues/54),
the owner + inheritance branch is selected as follows:

```typescript
const policy = Policy.from_descriptor(wallet.public_descriptor("external"));
if (!policy) throw new Error("Descriptor has no spending policy");
const tree = JSON.parse(policy.to_json());
const condition = policy.get_condition({
  [tree.id]: [1],          // choose the recovery subtree
  [tree.items[1].id]: [0], // choose owner + inheritance, with older(1008)
});
const psbt = wallet.build_tx()
  .do_not_spend_change()
  .set_condition(condition)
  .add_recipient(recipient)
  .finish();
```

The indexes above describe that specific policy; inspect your own tree and use its
node IDs. If inputs from both keychains may be selected, derive both conditions and
pass `externalCondition.merge(internalCondition)` instead. Conditions with
incompatible height/time units cannot be merged. Repeated `set_condition` calls
replace the previous value.

An immediate path produces an empty condition. Known requirements can also be
constructed with `new Condition(csv, timelock)`, using consensus nSequence and
nLockTime values. An explicit condition overrides automatic policy inference;
callers must ensure it matches every selected input. It does not select signing
keys, force a witness branch, or establish maturity. Transactions can be signed
before their timelocks expire; they become spendable only when consensus permits.

## Development Environment

### Requirements

- Install [Rust](https://www.rust-lang.org/tools/install)
- Install [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)

#### MacOS special requirement

Refers to [this section](./DEVELOPMENT.md#build-on-macos).

### Build with `wasm-pack build`

> [!IMPORTANT]
> You need the `wasm32-unknown-unknown` toolchain to be installed:
>
> ```sh
> rustup target add wasm32-unknown-unknown
> ```

To build for browser/web:

```sh
wasm-pack build --target bundler --features "esplora"
```

To build for Node.js:

```sh
wasm-pack build --target nodejs --all-features
```

### Test in Headless Browsers with `wasm-pack test`

```sh
wasm-pack test --headless --firefox
```

> Works with `--firefox`, `--chrome` or `--safari`.

## License

Licensed under either of

- Apache License, Version 2.0, ([LICENSE-APACHE](LICENSE-APACHE) or <https://www.apache.org/licenses/LICENSE-2.0>)
- MIT license ([LICENSE-MIT](LICENSE-MIT) or <https://opensource.org/licenses/MIT>)

at your option.

### Contribution

Unless you explicitly state otherwise, any contribution intentionally
submitted for inclusion in the work by you, as defined in the Apache-2.0
license, shall be dual licensed as above, without any additional terms or
conditions.
