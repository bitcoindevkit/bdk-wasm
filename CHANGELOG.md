# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-10-29

### Added

- Caller-owned spending policies and conditions ([#61](https://github.com/bitcoindevkit/bdk-wasm/pull/61), fixes [#54](https://github.com/bitcoindevkit/bdk-wasm/issues/54)):
  - `Wallet::policies` and `Policy::get_condition` for selecting descriptor branches
  - `Condition` for inspecting and merging relative and absolute timelock requirements
  - `TxBuilder::set_condition` for applying the selected requirements to ordinary transactions and fee bumps
  - Conditions apply to the whole transaction; callers must combine requirements for all inputs. They do not select signing keys, force a witness branch, or make an immature timelock spendable.
- Expand Wallet API surface ([#21](https://github.com/bitcoindevkit/bdk-wasm/issues/21)):
  - `Wallet::finalize_psbt` for finalizing PSBTs (adding finalized script/witness to inputs)
  - `Wallet::cancel_tx` for releasing reserved change addresses when a transaction won't be broadcast
  - `Wallet::tx_details` for retrieving comprehensive transaction details (sent, received, fee, fee rate, balance delta, chain position)
  - `Wallet::descriptor_checksum` for getting the descriptor checksum string for a keychain
  - `Wallet::next_derivation_index` for getting the next unused derivation index for a keychain
- `TxDetails` type with getters for `txid`, `sent`, `received`, `fee`, `fee_rate`, `balance_delta_sat`, `chain_position`, and `tx`
- Block-by-block processing with events ([#20](https://github.com/bitcoindevkit/bdk-wasm/issues/20)):
  - `Wallet::apply_block_events` for applying a block and connecting via `prev_blockhash`, returns `WalletEvent`s
  - `Wallet::apply_block_connected_to_events` for applying a block with explicit chain connection point, returns `WalletEvent`s
  - `Wallet::apply_evicted_txs` for marking unconfirmed transactions as evicted from the mempool
  - `Wallet::checkpoints` for listing all checkpoints in the wallet's internal chain
- `Block` type with `from_bytes()` deserialization and accessors (`block_hash`, `prev_blockhash`, `time`, `txdata`, `tx_count`)
- `BlockId` constructor from height and hash string
- `EvictedTx` type for pairing a transaction ID with an eviction timestamp
- `BdkErrorCode::CannotConnect` and `BdkErrorCode::UnexpectedConnectedToHash` error codes for block application errors
- Expand TxBuilder API for hardware wallet support and advanced transaction construction ([#21](https://github.com/bitcoindevkit/bdk-wasm/issues/21)):
  - `TxBuilder::add_data` for embedding OP_RETURN data in transactions (up to 80 bytes)
  - `TxBuilder::only_spend_change` shorthand for `ChangeSpendPolicy::OnlyChange`
  - `TxBuilder::current_height` for coinbase maturity checks and anti-fee-sniping locktime
  - `TxBuilder::only_witness_utxo` to reduce PSBT size for segwit-only wallets
  - `TxBuilder::include_output_redeem_witness_script` for ColdCard/BitBox hardware wallet compatibility
  - `TxBuilder::add_global_xpubs` for multisig hardware wallet workflows
  - `TxBuilder::set_exact_sequence` for fine-grained nSequence control
- `TxIn::sequence` getter for reading the nSequence value of transaction inputs

### Changed

- Require Rust 1.88 or newer for builds. Node development tooling requires Node 22.13+, 24, or newer supported releases.
- Keep wallet-owned signing, descriptor key extraction, RBF helpers, and cancellation available with BDK 3.2. Caller-owned signing remains a follow-up ([#15](https://github.com/bitcoindevkit/bdk-wasm/issues/15)).
- Replace Jest with Vitest and remove Node dependency-audit exceptions ([#60](https://github.com/bitcoindevkit/bdk-wasm/pull/60)).
- Run funded Esplora spending tests exclusively on local regtest, including the output-only PSBT template case. Move the public signet check to a manually dispatched, read-only smoke test with serialized requests and bounded retries; no signet funds are required.
- Expand Node and regtest integration coverage for wallet address lifecycle, output introspection, fee calculation, and TxBuilder coin-selection behavior ([#22](https://github.com/bitcoindevkit/bdk-wasm/issues/22))
  - Add regtest assertions for `drain_wallet` + `drain_to` producing a single drain output
  - Add regtest assertions for `exclude_unconfirmed` and `exclude_below_confirmations(1)` ignoring trusted pending coins during coin selection
- Audit and refresh Rust and Node development dependencies to their latest compatible releases ([#24](https://github.com/bitcoindevkit/bdk-wasm/issues/24))
- Prototype a declarative macro for tuple-wrapper `Deref`/`From` boilerplate while keeping `wasm_bindgen` getters explicit ([#25](https://github.com/bitcoindevkit/bdk-wasm/issues/25))

### Fixed

- Include the full Apache 2.0 and MIT license texts in both npm package archives.
- Use global timers for Esplora retry backoff in Node.js, browsers, and workers; remove the unsafe timer `Send` assertion ([#58](https://github.com/bitcoindevkit/bdk-wasm/pull/58)).
- Throw a recoverable error for fee rates that overflow the internal sat/kwu representation ([#58](https://github.com/bitcoindevkit/bdk-wasm/pull/58)).
- Reject conflicting networks or descriptors in `ChangeSet::merge` before mutating the destination ([#60](https://github.com/bitcoindevkit/bdk-wasm/pull/60)). Callers must handle merge errors rather than relying on conflicting wallet identities being accepted.
- Reject unsupported fee-bump builder options instead of silently ignoring them ([#58](https://github.com/bitcoindevkit/bdk-wasm/pull/58), fixes [#57](https://github.com/bitcoindevkit/bdk-wasm/issues/57)).

### Dependencies

- Upgrade `bdk_wallet` 2.3.0 → 3.2.0, `bdk_esplora` 0.22.1 → 0.22.3, and `bitcoin` 0.32.8 → 0.32.102 ([#58](https://github.com/bitcoindevkit/bdk-wasm/pull/58)). The BDK 2.3 persisted-wallet fixture remains loadable and spendable; this is not a guarantee that newer snapshots can be loaded by older versions.
- Upgrade `wasm-bindgen` to 0.2.129, `wasm-bindgen-futures` to 0.4.79, `web-sys` to 0.3.106, and `wasm-bindgen-test` to 0.3.79; refresh both lockfiles.
- Update CI actions, checksum-verified wasm-pack installation, and the pinned Esplora regtest image. Enforce locked builds and Rust/Node dependency audits.
- Node tests: Vitest and its V8 coverage provider 5.0.5, Vite 8.3.5, TypeScript 6.0.3, ESLint 10.13.0, typescript-eslint 8.72.1, and Yarn 4.18.1. Coverage measures generated JavaScript bindings, not Rust/WASM instructions.

## [0.3.0] - 2026-03-16

### Added

- Expand TxBuilder API ([#21](https://github.com/bitcoindevkit/bdk-wasm/issues/21)):
  - `fee_absolute` for setting absolute fee amounts
  - `add_utxo` and `add_utxos` for must-spend UTXOs
  - `only_spend_from` to restrict to manually added UTXOs
  - `enable_rbf` and `enable_rbf_with_sequence` for BIP 125 signaling
  - `nlocktime` for setting absolute locktime
  - `version` for setting transaction version
  - `change_policy` and `do_not_spend_change` for controlling change output usage
  - `ChangeSpendPolicy` enum (`ChangeAllowed`, `OnlyChange`, `ChangeForbidden`)
- `Wallet::build_fee_bump` for creating RBF fee-bump transactions ([#21](https://github.com/bitcoindevkit/bdk-wasm/issues/21))
- `Wallet::create_single` for single-descriptor wallets ([#21](https://github.com/bitcoindevkit/bdk-wasm/issues/21))
- `Wallet::mark_used` and `Wallet::unmark_used` for address usage management ([#21](https://github.com/bitcoindevkit/bdk-wasm/issues/21))
- `Wallet::insert_txout` for providing external TxOut values for fee calculation ([#21](https://github.com/bitcoindevkit/bdk-wasm/issues/21))
- `BuildFeeBumpError` variants: `TransactionNotFound`, `TransactionConfirmed`, `IrreplaceableTransaction`, `FeeRateUnavailable`, `InvalidOutputIndex`
- `WalletEvent` type and `Wallet::apply_update_events` for reacting to wallet state changes ([#19](https://github.com/bitcoindevkit/bdk-wasm/issues/19))
- `Transaction::to_bytes` and `Transaction::from_bytes` for consensus serialization ([#38](https://github.com/bitcoindevkit/bdk-wasm/issues/38), [#39](https://github.com/bitcoindevkit/bdk-wasm/pull/39)). Enables BDK ↔ LDK interop (e.g. channel funding transactions)
- Upgrade BDK to 2.3.0 with new API wrappers ([#14](https://github.com/bitcoindevkit/bdk-wasm/pull/14)):
  - `Wallet::create_from_two_path_descriptor` (BIP-389 multipath descriptors)
  - `TxBuilder::exclude_unconfirmed` and `TxBuilder::exclude_below_confirmations`
- Dust check methods ([#13](https://github.com/bitcoindevkit/bdk-wasm/pull/13)):
  - `Amount::is_dust(script)` — check whether an amount is below the dust limit for a given script
  - `ScriptBuf::minimal_non_dust()` — returns the minimum non-dust amount for a script
  - `ScriptBuf::minimal_non_dust_custom(dust_relay_fee)` — same with a custom dust relay fee rate
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
- `wasm-bindgen` 0.2.100 → 0.2.114
- `bitcoin` 0.32.6 → 0.32.8
- `anyhow` 1.0.98 → 1.0.102
- `serde` 1.0.219 → 1.0.228
- `web-sys` 0.3.77 → 0.3.91
- `getrandom` 0.2.16 → 0.2.17
- `wasm-bindgen-test` 0.3.50 → 0.3.64
- CI: `actions/checkout` v4.3.1 → v6.0.2, `actions/setup-node` v4.4.0 → v6.2.0, `actions/cache` v4 → v5.0.3
- CI: `dtolnay/rust-toolchain` v1, `Swatinem/rust-cache` v2.8.2 (unchanged), `actionlint` 1.7.11
- All CI actions SHA-pinned with version comments (including `publish-release.yml`)
- Node tests: `jest` 29 → 30, `@types/jest` 29 → 30, `eslint` 9 → 10, `eslint-plugin-jest` 28 → 29, `globals` 16 → 17

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

[Unreleased]: https://github.com/bitcoindevkit/bdk-wasm/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/bitcoindevkit/bdk-wasm/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/bitcoindevkit/bdk-wasm/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/bitcoindevkit/bdk-wasm/releases/tag/v0.2.0
