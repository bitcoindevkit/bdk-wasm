# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `WalletEvent` type and `Wallet::apply_update_events` for reacting to wallet state changes ([#19](https://github.com/bitcoindevkit/bdk-wasm/issues/19))
- Upgrade BDK to 2.3.0 with new API wrappers ([#14](https://github.com/bitcoindevkit/bdk-wasm/pull/14)):
  - `Wallet::create_from_two_path_descriptor` (BIP-389 multipath descriptors)
  - `TxBuilder::exclude_unconfirmed` and `TxBuilder::exclude_below_confirmations`
- Dust check methods on `Amount` and `Script` ([#13](https://github.com/bitcoindevkit/bdk-wasm/pull/13))
- Regtest integration test environment with Docker Compose and Esplora ([#26](https://github.com/bitcoindevkit/bdk-wasm/pull/26))
- `CLAUDE.md` with agent instructions and project conventions ([#14](https://github.com/bitcoindevkit/bdk-wasm/pull/14))

### Changed

- Upgrade wasm-pack from 0.13.1 to 0.14.0 in CI ([#31](https://github.com/bitcoindevkit/bdk-wasm/issues/31)). Install method changed from deprecated `installer/init.sh` script to direct binary download from GitHub releases
- `esplora.test.ts` is now network-agnostic via `NETWORK` and `ESPLORA_URL` environment variables ([#26](https://github.com/bitcoindevkit/bdk-wasm/pull/26))
- Node CI job excludes Esplora tests; dedicated Esplora integration job runs against regtest ([#26](https://github.com/bitcoindevkit/bdk-wasm/pull/26))

### Fixed

- Suppress deprecated `SignOptions` warnings with `#[allow(deprecated)]` ([#14](https://github.com/bitcoindevkit/bdk-wasm/pull/14))

### Dependencies

- `bdk_wallet` 2.0.0 → 2.3.0
- `bdk_esplora` 0.22.0 → 0.22.1
- `wasm-bindgen` 0.2.100 → 0.2.113
- `bitcoin` 0.32.6 → 0.32.8
- `anyhow` 1.0.98 → 1.0.102
- `serde` 1.0.219 → 1.0.228
- `web-sys` 0.3.77 → 0.3.90
- `getrandom` 0.2.16 → 0.2.17
- `wasm-bindgen-test` 0.3.50 → 0.3.63
- CI: `actions/checkout` v4.3.1, `actions/setup-node` v4.4.0, `dtolnay/rust-toolchain` v1, `Swatinem/rust-cache` v2.8.2, `actionlint` 1.7.11
- All CI actions pinned to SHA with version comments

## [0.2.0] - 2025-08-25

Initial release under the [bitcoindevkit](https://github.com/bitcoindevkit) organization. Repository transferred from MetaMask.

### Added

- WASM bindings for `bdk_wallet` 2.0.0 via `wasm-bindgen`
- Core wallet functionality: `Wallet` (create, load, sign, addresses, UTXOs, transactions)
- `TxBuilder` for constructing transactions
- `EsploraClient` for blockchain sync (full scan and incremental sync)
- `Descriptor` utilities
- WASM-compatible type wrappers with `From`/`Into` conversions for all BDK/bitcoin types
- `Clone` and `Copy` trait implementations for applicable types
- Browser and Node.js build targets
- Node.js integration tests (Jest) against Mutinynet signet
- Browser tests via `wasm-pack test`
- CI with GitHub Actions: lint (fmt + clippy), browser builds, Node.js build + test
- CODEOWNERS file
- Automated npm publishing for `@bitcoindevkit/bdk-wallet-web` and `@bitcoindevkit/bdk-wallet-node`

[Unreleased]: https://github.com/bitcoindevkit/bdk-wasm/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/bitcoindevkit/bdk-wasm/releases/tag/v0.2.0
