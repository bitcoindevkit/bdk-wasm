//! Deterministic tests for the Web and headless browsers.

#![cfg(target_arch = "wasm32")]

use bdk_wallet::bitcoin::hex::FromHex;
use bitcoindevkit::{
    bitcoin::{SignOptions, UnconfirmedTx, Wallet},
    seed_to_descriptor,
    types::{AddressType, Amount, Condition, FeeRate, KeychainKind, Network, Policy, Recipient, Transaction},
};
use wasm_bindgen::JsCast;
use wasm_bindgen_test::*;

wasm_bindgen_test_configure!(run_in_browser);

#[wasm_bindgen_test]
fn creates_and_signs_wallet() {
    let descriptors = seed_to_descriptor(&[1; 32], Network::Regtest, AddressType::P2wpkh).expect("descriptors");
    let wallet = Wallet::create(Network::Regtest, descriptors.external(), descriptors.internal()).expect("wallet");
    assert_eq!(
        wallet.reveal_next_address(KeychainKind::External).address().to_string(),
        "bcrt1q022amqf3jv7mg744rcjmst222dfazqvmurt943"
    );
    // Synthetic funding with a dummy input; never broadcast.
    let funding = Transaction::from_bytes(
        &Vec::<u8>::from_hex(
            "020000000111111111111111111111111111111111111111111111111111111111111111110000000000ffffffff01a0860100000000001600147a95dd8131933db47ab51e25b82d4a5353d1019b00000000"
        ).expect("funding bytes")
    ).expect("funding transaction");
    wallet.apply_unconfirmed_txs(vec![UnconfirmedTx::new(funding, 1_700_000_000)]);
    let recipient = Recipient::new(
        wallet.peek_address(KeychainKind::External, 5).address().script_pubkey(),
        Amount::from_sat(40_000),
    );
    let mut psbt = wallet
        .build_tx()
        .fee_absolute(Amount::from_sat(1_000))
        .add_recipient(recipient)
        .finish()
        .unwrap_or_else(|error| panic!("build payment: {}", error.message()));
    assert!(wallet.sign(&mut psbt, SignOptions::new()).expect("sign"));
    assert_eq!(psbt.fee().expect("fee").to_sat(), 1_000);
    assert!(psbt.extract_tx().is_ok());
}

#[wasm_bindgen_test]
fn overflowing_fee_rate_is_recoverable() {
    assert!(FeeRate::new(u64::MAX).is_err());
    assert_eq!(FeeRate::new(1).expect("valid fee rate").to_sat_per_kwu(), 250);
}

#[wasm_bindgen_test]
fn extracts_spending_conditions_from_a_javascript_path() {
    let descriptors = seed_to_descriptor(&[1; 32], Network::Regtest, AddressType::P2wpkh).expect("descriptors");
    let wallet = Wallet::create(Network::Regtest, descriptors.external(), descriptors.internal()).expect("wallet");
    let descriptor = wallet.public_descriptor(KeychainKind::External);
    let key = descriptor
        .strip_prefix("wpkh(")
        .expect("wpkh")
        .split(')')
        .next()
        .expect("key");
    let policy = Policy::from_descriptor(&format!("wsh(or_i(pk({key}),and_v(v:pk({key}),older(6))))"))
        .expect("extract policy")
        .expect("policy");
    assert!(policy.requires_path());
    let missing = web_sys::js_sys::JSON::parse("{}").expect("object");
    assert!(policy.get_condition(missing.unchecked_into()).is_err());
    let path = web_sys::js_sys::JSON::parse(&format!(r#"{{"{}":[1]}}"#, policy.id())).expect("path");
    let condition = policy.get_condition(path.unchecked_into()).expect("condition");
    assert_eq!(condition.csv(), Some(6));
    assert_eq!(condition.timelock(), None);
    let stricter = Condition::new(Some(12.0), Some(500.0)).expect("condition");
    let combined = condition.merge(&stricter).expect("merge");
    assert_eq!(combined.csv(), Some(12));
    assert_eq!(combined.timelock(), Some(500));
    assert_eq!(condition.csv(), Some(6));
    assert!(Condition::new(Some(-1.0), None).is_err());
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
