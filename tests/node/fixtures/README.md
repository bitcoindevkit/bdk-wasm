# BDK 2.3.0 wallet snapshots

`bdk-2.3.0.json` was generated from bdk-wasm commit `73cb4df` with its original Cargo.lock and a Node WASM build, before the BDK 3 upgrade. Do not regenerate it with the new dependencies: it tests actual prior-version persistence.

All wallets use the public test seed of 32 bytes of `0x01`. Cases include P2WPKH on all five networks, plus legacy P2PKH, nested P2WPKH, and Taproot on regtest. Each wallet reveals external indices 0–2 and internal indices 0–1, then applies one synthetic 100,000-sat transaction paying external index 0 with a last-seen timestamp of 1700000000. The input is a dummy outpoint, so the funding transaction is not valid on any real chain. The snapshot comes directly from `wallet.take_staged().to_json()`.

Expected descriptors, addresses, and transaction IDs were captured from that same baseline. Tests reconstruct descriptors from the seed, load the unchanged snapshots, merge new staged data, and build/sign spends with and without the private descriptors. The fixtures contain test keys, never real wallet keys.
