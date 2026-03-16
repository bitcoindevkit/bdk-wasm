use std::{ops::Deref, str::FromStr};
use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::JsError;

use bdk_wallet::bitcoin::consensus::{deserialize, serialize};
use bdk_wallet::bitcoin::{Transaction as BdkTransaction, Txid as BdkTxid};

use crate::result::JsResult;

use super::{TxIn, TxOut};

/// Bitcoin transaction.
///
/// An authenticated movement of coins.
#[wasm_bindgen]
#[derive(Clone)]
pub struct Transaction(BdkTransaction);

impl Deref for Transaction {
    type Target = BdkTransaction;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[wasm_bindgen]
impl Transaction {
    /// Returns the base transaction size.
    ///
    /// > Base transaction size is the size of the transaction serialised with the witness data stripped.
    #[wasm_bindgen(getter)]
    pub fn base_size(&self) -> usize {
        self.0.base_size()
    }

    /// Returns the total transaction size.
    ///
    /// > Total transaction size is the transaction size in bytes serialized as described in BIP144,
    /// > including base data and witness data.
    #[wasm_bindgen(getter)]
    pub fn total_size(&self) -> usize {
        self.0.total_size()
    }

    /// Returns the "virtual size" (vsize) of this transaction.
    ///
    /// Will be `ceil(weight / 4.0)`. Note this implements the virtual size as per [`BIP141`], which
    /// is different to what is implemented in Bitcoin Core. The computation should be the same for
    /// any remotely sane transaction, and a standardness-rule-correct version is available in the
    /// [`policy`] module.
    ///
    /// > Virtual transaction size is defined as Transaction weight / 4 (rounded up to the next integer).
    #[wasm_bindgen(getter)]
    pub fn vsize(&self) -> usize {
        self.0.vsize()
    }

    /// Returns the weight of this transaction, as defined by BIP-141.
    ///
    /// > Transaction weight is defined as Base transaction size * 3 + Total transaction size
    /// > (ie. the same method as determining the weight of individual transactions in a block).
    ///
    /// Returns the weight in Weight Units (WU). Divide by 4 (rounding up) to get vsize.
    #[wasm_bindgen(getter)]
    pub fn weight(&self) -> u64 {
        self.0.weight().to_wu()
    }

    /// The protocol version, is currently expected to be 1, 2, or 3.
    ///
    /// Version 2 is required for transactions using relative timelocks (BIP 68/112/113).
    /// Version 3 enables additional relay policy rules.
    #[wasm_bindgen(getter)]
    pub fn version(&self) -> i32 {
        self.0.version.0
    }

    /// Block height or timestamp after which this transaction can be mined.
    ///
    /// Returns the raw lock_time value as a u32. A value of 0 means the transaction
    /// is not locked. Values below 500,000,000 are interpreted as block heights;
    /// values at or above 500,000,000 are interpreted as Unix timestamps.
    #[wasm_bindgen(getter)]
    pub fn lock_time(&self) -> u32 {
        self.0.lock_time.to_consensus_u32()
    }

    /// Computes the [`Txid`].
    ///
    /// Hashes the transaction **excluding** the segwit data (i.e. the marker, flag bytes, and the
    /// witness fields themselves). For non-segwit transactions which do not have any segwit data,
    /// this will be equal to [`Transaction::compute_wtxid()`].
    pub fn compute_txid(&self) -> Txid {
        self.0.compute_txid().into()
    }

    /// List of transaction inputs.
    #[wasm_bindgen(getter)]
    pub fn input(&self) -> Vec<TxIn> {
        self.0.input.clone().into_iter().map(Into::into).collect()
    }

    /// List of transaction outputs.
    #[wasm_bindgen(getter)]
    pub fn output(&self) -> Vec<TxOut> {
        self.0.output.clone().into_iter().map(Into::into).collect()
    }

    /// Checks if this is a coinbase transaction.
    ///
    /// The first transaction in the block distributes the mining reward and is called the coinbase
    /// transaction. It is impossible to check if the transaction is first in the block, so this
    /// function checks the structure of the transaction instead - the previous output must be
    /// all-zeros (creates satoshis "out of thin air").
    #[wasm_bindgen(getter)]
    pub fn is_coinbase(&self) -> bool {
        self.0.is_coinbase()
    }

    /// Returns `true` if the transaction itself opted in to be BIP-125-replaceable (RBF).
    ///
    /// # Warning
    ///
    /// **Incorrectly relying on RBF may lead to monetary loss!**
    ///
    /// This **does not** cover the case where a transaction becomes replaceable due to ancestors
    /// being RBF. Please note that transactions **may be replaced** even if they **do not** include
    /// the RBF signal: <https://bitcoinops.org/en/newsletters/2022/10/19/#transaction-replacement-option>.
    #[wasm_bindgen(getter)]
    pub fn is_explicitly_rbf(&self) -> bool {
        self.0.is_explicitly_rbf()
    }

    /// Returns `true` if this transactions nLockTime is enabled ([BIP-65]).
    #[wasm_bindgen(getter)]
    pub fn is_lock_time_enabled(&self) -> bool {
        self.0.is_lock_time_enabled()
    }

    /// Returns the input at `input_index` if it exists.
    pub fn tx_in(&self, input_index: usize) -> JsResult<TxIn> {
        let input = self.0.tx_in(input_index)?;
        Ok(input.into())
    }

    /// Returns the output at `output_index` if it exists.
    pub fn tx_out(&self, output_index: usize) -> JsResult<TxOut> {
        let output = self.0.tx_out(output_index)?;
        Ok(output.into())
    }

    /// Serialize the transaction to consensus-encoded bytes (BIP144 format).
    ///
    /// Returns the raw transaction as a `Uint8Array` suitable for broadcasting,
    /// passing to other WASM modules (e.g. LDK), or storing in IndexedDB.
    pub fn to_bytes(&self) -> Vec<u8> {
        serialize(&self.0)
    }

    /// Deserialize a transaction from consensus-encoded bytes.
    ///
    /// Accepts a `Uint8Array` of raw transaction bytes (as produced by `to_bytes()`
    /// or any standard Bitcoin serializer).
    pub fn from_bytes(bytes: &[u8]) -> JsResult<Transaction> {
        let tx: BdkTransaction =
            deserialize(bytes).map_err(|e| JsError::new(&format!("Failed to deserialize transaction: {e}")))?;
        Ok(Transaction(tx))
    }

    #[wasm_bindgen(js_name = clone)]
    pub fn js_clone(&self) -> Transaction {
        self.clone()
    }
}

impl From<BdkTransaction> for Transaction {
    fn from(inner: BdkTransaction) -> Self {
        Transaction(inner)
    }
}

impl From<Transaction> for BdkTransaction {
    fn from(tx: Transaction) -> Self {
        tx.0
    }
}

/// A bitcoin transaction hash/transaction ID.
#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct Txid(BdkTxid);

impl Deref for Txid {
    type Target = BdkTxid;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[wasm_bindgen]
impl Txid {
    pub fn from_string(txid_str: &str) -> JsResult<Self> {
        let txid = BdkTxid::from_str(txid_str)?;
        Ok(txid.into())
    }

    #[allow(clippy::inherent_to_string)]
    #[wasm_bindgen(js_name = toString)]
    pub fn to_string(&self) -> String {
        self.0.to_string()
    }
}

impl From<BdkTxid> for Txid {
    fn from(inner: BdkTxid) -> Self {
        Txid(inner)
    }
}

impl From<Txid> for BdkTxid {
    fn from(txid: Txid) -> Self {
        txid.0
    }
}
