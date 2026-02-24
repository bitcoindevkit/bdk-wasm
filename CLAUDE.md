# CLAUDE.md - Agent Instructions for bdk-wasm

## Overview

WASM bindings for [BDK](https://github.com/bitcoindevkit/bdk_wallet) (Bitcoin Dev Kit).
Wraps `bdk_wallet` for use in browsers and Node.js via `wasm-bindgen`.

**Used in production by MetaMask Bitcoin Snap (~30M+ AUM). Treat all changes with extreme care.**

## Architecture

```
src/
├── lib.rs              # Crate root, re-exports
├── bitcoin/            # Core wallet functionality wrappers
│   ├── wallet.rs       # Wallet (create, load, sign, sync, addresses, UTXOs)
│   ├── tx_builder.rs   # Transaction builder
│   ├── esplora_client.rs # Esplora blockchain client (behind `esplora` feature)
│   ├── descriptor.rs   # Descriptor utilities
│   └── wallet_tx.rs    # Wallet transaction wrapper
├── types/              # WASM-compatible type wrappers (From/Into pattern)
│   ├── address.rs, amount.rs, balance.rs, block.rs, chain.rs,
│   │   changeset.rs, checkpoint.rs, error.rs, fee.rs, input.rs,
│   │   keychain.rs, network.rs, output.rs, psbt.rs, script.rs,
│   │   slip10.rs, transaction.rs
│   └── mod.rs
└── utils/              # Helpers (descriptor utils, panic hook, result type)
```

### Pattern

Every BDK type is wrapped with a WASM-compatible struct that:
1. Holds the inner BDK type
2. Implements `From<BdkType>` and `Into<BdkType>` conversions
3. Exposes methods via `#[wasm_bindgen]`

`Wallet` uses `Rc<RefCell<BdkWallet>>` because `wasm_bindgen` doesn't support Rust lifetimes.
`TxBuilder` shares the wallet reference via `Rc<RefCell<>>` and builds its own parameter set,
then calls the real BDK builder in `finish()`.

## Building

Requires: Rust stable, `wasm-pack`, `wasm32-unknown-unknown` target.

```bash
# Browser target (default)
wasm-pack build --all-features

# Node.js target
wasm-pack build --target nodejs --all-features

# Specific features
wasm-pack build --features esplora
wasm-pack build --features debug,esplora
```

## Testing

### Browser tests (Rust)
```bash
wasm-pack test --chrome --firefox --headless --features debug,default
wasm-pack test --chrome --firefox --headless --features debug,esplora
```

### Node.js tests (TypeScript/Jest)
```bash
cd tests/node
yarn install --immutable
yarn build          # runs wasm-pack build --target nodejs --all-features
yarn test           # runs jest
yarn lint           # runs eslint
```

Node tests are in `tests/node/integration/`:
- `wallet.test.ts` — Wallet creation, addresses, descriptors
- `esplora.test.ts` — Esplora sync, full scan, transaction sending (uses **Mutinynet signet**)
- `utilities.test.ts` — Amount, Script, Address utilities
- `errors.test.ts` — Error handling and error codes

**Note:** `esplora.test.ts` depends on Mutinynet signet (`https://mutinynet.com/api`) with a
pre-funded test wallet. This test can be flaky if the faucet/signet is down.

### CI

GitHub Actions runs on every PR:
- **Lint:** `cargo fmt --check` + `cargo clippy --all-features --all-targets -- -D warnings`
- **Browser build:** Three matrix configs (all features, debug+default, debug+esplora)
- **Node build + test:** Full wasm-pack build + Jest test suite

CI must be green before merging. Clippy treats warnings as errors (`-D warnings`).

## Features

- `default` — Core wallet functionality only
- `esplora` — Adds `EsploraClient` for blockchain sync (enables `bdk_esplora` + `wasm-bindgen-futures`)
- `debug` — Enables `console_error_panic_hook` for better WASM error messages

## Dependencies

Key dependencies (keep these in sync):
- `bdk_wallet` — Core wallet library
- `bdk_esplora` — Esplora client (must match `bdk_wallet` version series)
- `bitcoin` — Bitcoin primitives
- `wasm-bindgen` — Rust/JS interop

Check https://crates.io/crates/bdk_wallet/versions for latest releases.
BDK uses a monorepo-ish approach: `bdk_wallet` and `bdk_esplora` versions must be compatible.

## Conventions

- **Conventional commits:** `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`
- **Formatting:** `cargo fmt` with default settings
- **All public items must be documented**
- **Safe Rust only** — no `unsafe` without exceptional justification
- **New features require tests**

## Known Issues

- `SignOptions` is deprecated in BDK 2.2.0+ (signer module moved to `bitcoin::psbt`).
  We use `#[allow(deprecated)]` until BDK provides a migration path, since `Wallet::sign`
  still requires it internally.
- Esplora integration tests use Mutinynet signet which can be flaky.

## Maintenance Notes

- This repo is maintained by an AI agent (Toshi) with human review by @darioAnongba
- All changes go through PRs — never push to main directly
- One PR at a time to keep review manageable
- Check BDK releases periodically for new APIs to wrap
