//! Deterministic tests for the Web and headless browsers.

#![cfg(target_arch = "wasm32")]

use bitcoindevkit::{
    bitcoin::{SignOptions, Wallet},
    types::{Amount, ChangeSet, FeeRate, KeychainKind, Network, Recipient},
};
use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_browser);

#[wasm_bindgen_test]
fn restores_and_signs_bdk_2_wallets() {
    let fixtures: Vec<bdk_wallet::serde_json::Value> =
        bdk_wallet::serde_json::from_str(include_str!("node/fixtures/bdk-2.3.0.json")).expect("fixtures");
    for fixture in fixtures.iter().filter(|f| f["network"] == "regtest") {
        let wallet = Wallet::load(
            ChangeSet::from_json(&fixture["changeset"].to_string()).expect("old changeset"),
            Some(fixture["external"].as_str().expect("descriptor").into()),
            Some(fixture["internal"].as_str().expect("descriptor").into()),
        )
        .expect("load BDK 2 wallet");
        assert!(wallet.network() == Network::Regtest);
        assert_eq!(wallet.balance().total().to_sat(), 100_000);
        assert_eq!(
            wallet.peek_address(KeychainKind::External, 0).address().to_string(),
            fixture["receiveAddress"].as_str().expect("address")
        );
        let recipient = Recipient::new(
            wallet.peek_address(KeychainKind::External, 5).address().script_pubkey(),
            Amount::from_sat(40_000),
        );
        let mut psbt = wallet
            .build_tx()
            .fee_absolute(Amount::from_sat(1_000))
            .add_recipient(recipient)
            .finish()
            .unwrap_or_else(|error| panic!("failed to build fixture spend: {}", error.message()));
        assert!(wallet.sign(&mut psbt, SignOptions::new()).expect("sign"));
        assert_eq!(psbt.fee().expect("fee").to_sat(), 1_000);
        assert!(psbt.extract_tx().is_ok());
    }
}

#[wasm_bindgen_test]
fn overflowing_fee_rate_is_recoverable() {
    assert!(FeeRate::new(u64::MAX).is_err());
    assert_eq!(FeeRate::new(1).expect("valid fee rate").to_sat_per_kwu(), 250);
}

#[cfg(feature = "esplora")]
mod esplora {
    use bitcoindevkit::bitcoin::EsploraClient;
    use wasm_bindgen::prelude::wasm_bindgen;
    use wasm_bindgen_test::*;

    #[wasm_bindgen(inline_js = "
        let originalFetch;
        let requests = 0;
        export function install_retry_mock() {
            requests = 0;
            originalFetch = globalThis.fetch;
            globalThis.fetch = (request) => {
                requests++;
                const response = new Response(
                    requests === 1 ? '{}' : '{\"1\":2}',
                    { status: requests === 1 ? 503 : 200,
                      headers: { 'Content-Type': 'application/json' } }
                );
                Object.defineProperty(response, 'url', { value: request.url || String(request) });
                return Promise.resolve(response);
            };
        }
        export function restore_fetch() { globalThis.fetch = originalFetch; }
        export function retry_requests() { return requests; }
    ")]
    extern "C" {
        fn install_retry_mock();
        fn restore_fetch();
        fn retry_requests() -> u32;
    }

    #[wasm_bindgen_test]
    async fn retries_with_browser_global_timer() {
        install_retry_mock();
        let result = EsploraClient::new("https://bdk-wasm.invalid", 1)
            .expect("client")
            .get_fee_estimates()
            .await;
        restore_fetch();
        assert_eq!(result.expect("retry succeeded").get(1), Some(2.0));
        assert_eq!(retry_requests(), 2);
    }
}
