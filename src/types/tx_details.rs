use bdk_wallet::TxDetails as BdkTxDetails;
use wasm_bindgen::prelude::wasm_bindgen;

use super::{Amount, ChainPosition, FeeRate, Transaction, Txid};

/// Detailed information about a wallet transaction.
///
/// This type provides a comprehensive view of a transaction from the wallet's perspective,
/// including sent/received amounts, fees, fee rate, balance delta, and chain position.
///
/// Obtain a `TxDetails` by calling `Wallet::tx_details(txid)`.
#[wasm_bindgen]
pub struct TxDetails {
    txid: bitcoin::Txid,
    sent: bitcoin::Amount,
    received: bitcoin::Amount,
    fee: Option<bitcoin::Amount>,
    fee_rate: Option<bitcoin::FeeRate>,
    balance_delta_sat: i64,
    chain_position: bdk_wallet::chain::ChainPosition<bdk_wallet::chain::ConfirmationBlockTime>,
    tx: bitcoin::Transaction,
}

#[wasm_bindgen]
impl TxDetails {
    /// The transaction id.
    #[wasm_bindgen(getter)]
    pub fn txid(&self) -> Txid {
        self.txid.into()
    }

    /// The sum of the transaction input amounts that spend from previous outputs
    /// tracked by this wallet.
    #[wasm_bindgen(getter)]
    pub fn sent(&self) -> Amount {
        self.sent.into()
    }

    /// The sum of the transaction outputs that send to script pubkeys tracked by
    /// this wallet.
    #[wasm_bindgen(getter)]
    pub fn received(&self) -> Amount {
        self.received.into()
    }

    /// The fee paid for the transaction, if known.
    ///
    /// This will be `None` if the transaction has inputs not owned by this wallet
    /// and their `TxOut` values have not been inserted via `Wallet::insert_txout`.
    #[wasm_bindgen(getter)]
    pub fn fee(&self) -> Option<Amount> {
        self.fee.map(Into::into)
    }

    /// The fee rate paid for the transaction, if known.
    ///
    /// Same conditions as `fee` for when this is `None`.
    #[wasm_bindgen(getter)]
    pub fn fee_rate(&self) -> Option<FeeRate> {
        self.fee_rate.map(Into::into)
    }

    /// The net effect of the transaction on the wallet balance, in satoshis.
    ///
    /// Positive values mean the wallet received more than it spent (net inflow).
    /// Negative values mean the wallet spent more than it received (net outflow).
    #[wasm_bindgen(getter)]
    pub fn balance_delta_sat(&self) -> i64 {
        self.balance_delta_sat
    }

    /// The position of the transaction in the chain (confirmed or unconfirmed).
    #[wasm_bindgen(getter)]
    pub fn chain_position(&self) -> ChainPosition {
        self.chain_position.into()
    }

    /// The complete transaction.
    #[wasm_bindgen(getter)]
    pub fn tx(&self) -> Transaction {
        self.tx.clone().into()
    }
}

impl From<BdkTxDetails> for TxDetails {
    fn from(details: BdkTxDetails) -> Self {
        TxDetails {
            txid: details.txid,
            sent: details.sent,
            received: details.received,
            fee: details.fee,
            fee_rate: details.fee_rate,
            balance_delta_sat: details.balance_delta.to_sat(),
            chain_position: details.chain_position,
            tx: details.tx.as_ref().clone(),
        }
    }
}
