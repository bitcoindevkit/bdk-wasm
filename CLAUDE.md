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

### Node.js tests (TypeScript/Vitest)
```bash
cd tests/node
yarn install --immutable
yarn build          # runs wasm-pack build --target nodejs --all-features
yarn test           # runs offline Node tests
yarn test:coverage  # covers generated JavaScript bindings; Rust/WASM is not instrumented
yarn lint           # runs eslint
```

Node tests are in `tests/node/integration/`:
- `wallet.test.ts` — Wallet creation, addresses, descriptors
- `esplora.test.ts` — Esplora sync, full scan, transaction sending on funded regtest
- `utilities.test.ts` — Amount, Script, Address utilities
- `errors.test.ts` — Error handling and error codes

`esplora.test.ts` requires regtest; `ESPLORA_URL` defaults to
`http://localhost:8094/regtest/api`. Run `bash tests/run-integration.sh` after building
to start Bitcoin Core/Esplora, mine coins, and fund the test wallets.

The separate `smoke/esplora.test.ts` scans an unfunded watch-only wallet without
broadcasting. `yarn test:signet` uses Mutinynet by default; `ESPLORA_URL` can select
another signet Esplora endpoint. No faucet or persistent signet wallet is needed.

### CI

GitHub Actions runs on every PR:
- **Lint:** `cargo fmt --check` + `cargo clippy --all-features --all-targets -- -D warnings`
- **Browser build:** Three matrix configs (all features, debug+default, debug+esplora)
- **Node build + test:** Unit tests only (Esplora tests excluded)
- **Esplora integration tests:** Regtest environment via Docker Compose (`blockstream/esplora`)

On manual dispatch of `signet-smoke.yml`:
- **Signet smoke test:** Optional read-only public-network check, outside the release gate.
  The same smoke test also runs against local regtest in required CI.

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

- **Conventional commits** (required for all commits and PR titles):
  - `feat:` — New feature or API wrapper
  - `fix:` — Bug fix
  - `refactor:` — Code restructuring without behavior change
  - `docs:` — Documentation only
  - `test:` — Adding or updating tests
  - `chore:` — Maintenance (deps, config, tooling)
  - `ci:` — CI/CD pipeline changes
  - `build:` — Build system changes
  - Scope is optional but encouraged: `feat(wallet):`, `fix(tx_builder):`, `chore(deps):`
  - Breaking changes: add `!` after type, e.g. `feat!:` or `feat(wallet)!:`
  - These prefixes feed into CHANGELOG.md generation
- **Formatting:** `cargo fmt` with default settings
- **All public items must be documented**
- **Safe Rust only** — no `unsafe` without exceptional justification
- **New features require tests**

## Known Issues

- BDK 3.2 deprecates wallet-owned signing and key extraction; `SignOptions` remains supported.
  The JS API retains these paths with narrowly scoped `#[allow(deprecated)]` annotations.
  Caller-owned signing is tracked in issue #15.
- The optional Mutinynet smoke test depends on public service availability and rate limits.

## Maintenance Notes

- This repo is maintained by an AI agent (Toshi) with human review by @darioAnongba
- All changes go through PRs — never push to main directly
- One PR at a time to keep review manageable
- Check BDK releases periodically for new APIs to wrap
