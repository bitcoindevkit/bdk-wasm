use bdk_wallet::wallet::event::WalletEvent as BdkWalletEvent;
use wasm_bindgen::prelude::wasm_bindgen;

use super::{BlockId, ConfirmationBlockTime, Transaction, Txid};

/// An event representing a change to the wallet state.
///
/// Returned by `Wallet::apply_update_events`.
#[wasm_bindgen]
pub struct WalletEvent(BdkWalletEvent);

#[wasm_bindgen]
impl WalletEvent {
    /// The kind of event.
    ///
    /// One of: `"chain_tip_changed"`, `"tx_confirmed"`, `"tx_unconfirmed"`, `"tx_replaced"`, `"tx_dropped"`.
    #[wasm_bindgen(getter)]
    pub fn kind(&self) -> String {
        match &self.0 {
            BdkWalletEvent::ChainTipChanged { .. } => "chain_tip_changed".to_string(),
            BdkWalletEvent::TxConfirmed { .. } => "tx_confirmed".to_string(),
            BdkWalletEvent::TxUnconfirmed { .. } => "tx_unconfirmed".to_string(),
            BdkWalletEvent::TxReplaced { .. } => "tx_replaced".to_string(),
            BdkWalletEvent::TxDropped { .. } => "tx_dropped".to_string(),
            _ => "unknown".to_string(),
        }
    }

    /// The transaction id, if applicable.
    ///
    /// Available for: `tx_confirmed`, `tx_unconfirmed`, `tx_replaced`, `tx_dropped`.
    #[wasm_bindgen(getter)]
    pub fn txid(&self) -> Option<Txid> {
        match &self.0 {
            BdkWalletEvent::TxConfirmed { txid, .. }
            | BdkWalletEvent::TxUnconfirmed { txid, .. }
            | BdkWalletEvent::TxReplaced { txid, .. }
            | BdkWalletEvent::TxDropped { txid, .. } => Some((*txid).into()),
            _ => None,
        }
    }

    /// The transaction, if applicable.
    ///
    /// Available for: `tx_confirmed`, `tx_unconfirmed`, `tx_replaced`, `tx_dropped`.
    #[wasm_bindgen(getter)]
    pub fn tx(&self) -> Option<Transaction> {
        match &self.0 {
            BdkWalletEvent::TxConfirmed { tx, .. }
            | BdkWalletEvent::TxUnconfirmed { tx, .. }
            | BdkWalletEvent::TxReplaced { tx, .. }
            | BdkWalletEvent::TxDropped { tx, .. } => {
                Some(tx.as_ref().clone().into())
            }
            _ => None,
        }
    }

    /// The old chain tip, for `chain_tip_changed` events.
    #[wasm_bindgen(getter)]
    pub fn old_tip(&self) -> Option<BlockId> {
        match &self.0 {
            BdkWalletEvent::ChainTipChanged { old_tip, .. } => Some((*old_tip).into()),
            _ => None,
        }
    }

    /// The new chain tip, for `chain_tip_changed` events.
    #[wasm_bindgen(getter)]
    pub fn new_tip(&self) -> Option<BlockId> {
        match &self.0 {
            BdkWalletEvent::ChainTipChanged { new_tip, .. } => Some((*new_tip).into()),
            _ => None,
        }
    }

    /// The confirmation block time, for `tx_confirmed` events.
    #[wasm_bindgen(getter)]
    pub fn block_time(&self) -> Option<ConfirmationBlockTime> {
        match &self.0 {
            BdkWalletEvent::TxConfirmed { block_time, .. } => Some(block_time.into()),
            _ => None,
        }
    }

    /// The previous confirmation block time, if the transaction was previously confirmed.
    ///
    /// Available for: `tx_confirmed` (reorg), `tx_unconfirmed` (reorg).
    #[wasm_bindgen(getter)]
    pub fn old_block_time(&self) -> Option<ConfirmationBlockTime> {
        match &self.0 {
            BdkWalletEvent::TxConfirmed {
                old_block_time: Some(bt),
                ..
            }
            | BdkWalletEvent::TxUnconfirmed {
                old_block_time: Some(bt),
                ..
            } => Some(bt.into()),
            _ => None,
        }
    }
}

impl From<BdkWalletEvent> for WalletEvent {
    fn from(inner: BdkWalletEvent) -> Self {
        WalletEvent(inner)
    }
}
