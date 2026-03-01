use std::{cell::RefCell, rc::Rc};

use bdk_wallet::{
    error::{BuildFeeBumpError, CreateTxError},
    AddUtxoError, ChangeSpendPolicy as BdkChangeSpendPolicy, TxOrdering as BdkTxOrdering, Wallet as BdkWallet,
};
use serde::Serialize;
use wasm_bindgen::prelude::wasm_bindgen;

use crate::types::{Amount, BdkError, BdkErrorCode, FeeRate, OutPoint, Psbt, Recipient, ScriptBuf};

/// Fee policy: either a rate (sat/vB) or an absolute amount.
enum FeePolicy {
    Rate(FeeRate),
    Absolute(Amount),
}

/// A transaction builder.
///
/// A `TxBuilder` is created by calling [`build_tx`] or [`build_fee_bump`] on a wallet. After
/// assigning it, you set options on it until finally calling [`finish`] to consume the builder and
/// generate the transaction.
///
/// Each option setting method on `TxBuilder` takes and returns a new builder so you can chain calls
#[wasm_bindgen]
pub struct TxBuilder {
    wallet: Rc<RefCell<BdkWallet>>,
    recipients: Vec<Recipient>,
    utxos: Vec<OutPoint>,
    unspendable: Vec<OutPoint>,
    fee_policy: FeePolicy,
    drain_wallet: bool,
    drain_to: Option<ScriptBuf>,
    allow_dust: bool,
    ordering: TxOrdering,
    min_confirmations: Option<u32>,
    change_policy: Option<ChangeSpendPolicy>,
    only_spend_from: bool,
    nlocktime: Option<u32>,
    version: Option<i32>,
    is_fee_bump: bool,
    fee_bump_txid: Option<bdk_wallet::bitcoin::Txid>,
}

#[wasm_bindgen]
impl TxBuilder {
    // We make this constructor only visible to the crate to hide the use of the `Rc<RefCell<BdkWallet>>` in `Wallet::build_tx`.
    pub(crate) fn new(wallet: Rc<RefCell<BdkWallet>>) -> TxBuilder {
        TxBuilder {
            wallet,
            recipients: vec![],
            utxos: vec![],
            unspendable: vec![],
            fee_policy: FeePolicy::Rate(FeeRate::new(1)),
            drain_wallet: false,
            allow_dust: false,
            drain_to: None,
            ordering: BdkTxOrdering::default().into(),
            min_confirmations: None,
            change_policy: None,
            only_spend_from: false,
            nlocktime: None,
            version: None,
            is_fee_bump: false,
            fee_bump_txid: None,
        }
    }

    pub(crate) fn new_fee_bump(wallet: Rc<RefCell<BdkWallet>>, txid: bdk_wallet::bitcoin::Txid) -> TxBuilder {
        let mut builder = TxBuilder::new(wallet);
        builder.is_fee_bump = true;
        builder.fee_bump_txid = Some(txid);
        builder
    }

    /// Replace the recipients already added with a new list
    pub fn set_recipients(mut self, recipients: Vec<Recipient>) -> Self {
        self.recipients = recipients;
        self
    }

    /// Add a recipient to the internal list
    pub fn add_recipient(mut self, recipient: Recipient) -> Self {
        self.recipients.push(recipient);
        self
    }

    /// Add a UTXO to the internal list of UTXOs that **must** be spent.
    ///
    /// These have priority over the "unspendable" UTXOs, meaning that if a UTXO is present both
    /// in the "UTXOs" and the "unspendable" list, it will be spent.
    pub fn add_utxo(mut self, outpoint: OutPoint) -> Self {
        self.utxos.push(outpoint);
        self
    }

    /// Add a list of UTXOs to the internal list of UTXOs that **must** be spent.
    pub fn add_utxos(mut self, outpoints: Vec<OutPoint>) -> Self {
        self.utxos.extend(outpoints);
        self
    }

    /// Only spend UTXOs added by [`add_utxo`](Self::add_utxo).
    ///
    /// The wallet will **not** add additional UTXOs to the transaction even if they are needed
    /// to make the transaction valid.
    pub fn only_spend_from(mut self) -> Self {
        self.only_spend_from = true;
        self
    }

    /// Replace the internal list of unspendable utxos with a new list
    pub fn unspendable(mut self, unspendable: Vec<OutPoint>) -> Self {
        self.unspendable = unspendable;
        self
    }

    /// Add a utxo to the internal list of unspendable utxos
    pub fn add_unspendable(mut self, outpoint: OutPoint) -> Self {
        self.unspendable.push(outpoint);
        self
    }

    /// Set a custom fee rate.
    ///
    /// This method sets the mining fee paid by the transaction as a rate on its size.
    /// This means that the total fee paid is equal to `fee_rate` times the size
    /// of the transaction. Default is 1 sat/vB in accordance with Bitcoin Core's default
    /// relay policy.
    ///
    /// Note that this is really a minimum feerate -- it's possible to
    /// overshoot it slightly since adding a change output to drain the remaining
    /// excess might not be viable.
    pub fn fee_rate(mut self, fee_rate: FeeRate) -> Self {
        self.fee_policy = FeePolicy::Rate(fee_rate);
        self
    }

    /// Set an absolute fee.
    ///
    /// The `fee_absolute` method refers to the absolute transaction fee in satoshis.
    /// If both `fee_absolute` and `fee_rate` are set, whichever is called last takes precedence.
    ///
    /// Note that this is really a minimum absolute fee -- it's possible to
    /// overshoot it slightly since adding a change output to drain the remaining
    /// excess might not be viable.
    pub fn fee_absolute(mut self, fee: Amount) -> Self {
        self.fee_policy = FeePolicy::Absolute(fee);
        self
    }

    /// Spend all the available inputs. This respects filters like [`TxBuilder::unspendable`] and the change policy.
    pub fn drain_wallet(mut self) -> Self {
        self.drain_wallet = true;
        self
    }

    /// Sets the address to *drain* excess coins to.
    ///
    /// Usually, when there are excess coins they are sent to a change address generated by the
    /// wallet. This option replaces the usual change address with an arbitrary `script_pubkey` of
    /// your choosing. Just as with a change output, if the drain output is not needed (the excess
    /// coins are too small) it will not be included in the resulting transaction. The only
    /// difference is that it is valid to use `drain_to` without setting any ordinary recipients
    /// with [`add_recipient`] (but it is perfectly fine to add recipients as well).
    ///
    /// If you choose not to set any recipients, you should provide the utxos that the
    /// transaction should spend via [`add_utxos`].
    pub fn drain_to(mut self, script_pubkey: ScriptBuf) -> Self {
        self.drain_to = Some(script_pubkey);
        self
    }

    /// Exclude outpoints whose enclosing transaction has fewer than `min_confirms`
    /// confirmations.
    ///
    /// - Passing `0` will include all transactions (no filtering).
    /// - Passing `1` will exclude all unconfirmed transactions (equivalent to
    ///   [`exclude_unconfirmed`]).
    /// - Passing `6` will only allow outpoints from transactions with at least 6 confirmations.
    pub fn exclude_below_confirmations(mut self, min_confirms: u32) -> Self {
        self.min_confirmations = Some(min_confirms);
        self
    }

    /// Exclude outpoints whose enclosing transaction is unconfirmed.
    ///
    /// This is a shorthand for [`exclude_below_confirmations(1)`](Self::exclude_below_confirmations).
    pub fn exclude_unconfirmed(self) -> Self {
        self.exclude_below_confirmations(1)
    }

    /// Set whether or not the dust limit is checked.
    ///
    /// **Note**: by avoiding a dust limit check you may end up with a transaction that is non-standard.
    pub fn allow_dust(mut self, allow_dust: bool) -> Self {
        self.allow_dust = allow_dust;
        self
    }

    /// Choose the ordering for inputs and outputs of the transaction
    pub fn ordering(mut self, ordering: TxOrdering) -> Self {
        self.ordering = ordering;
        self
    }

    /// Set the change spending policy.
    ///
    /// Controls whether change outputs from previous transactions can be spent.
    pub fn change_policy(mut self, change_policy: ChangeSpendPolicy) -> Self {
        self.change_policy = Some(change_policy);
        self
    }

    /// Shorthand to set the change policy to [`ChangeSpendPolicy::ChangeForbidden`].
    ///
    /// This effectively forbids the wallet from spending change outputs.
    pub fn do_not_spend_change(mut self) -> Self {
        self.change_policy = Some(ChangeSpendPolicy::ChangeForbidden);
        self
    }

    /// Enable Replace-By-Fee (BIP 125) signaling.
    ///
    /// **Note:** RBF is enabled by default in BDK 2.x (nSequence = `0xFFFFFFFD`).
    /// This method is kept for API compatibility but is effectively a no-op.
    pub fn enable_rbf(self) -> Self {
        // RBF is enabled by default in BDK 2.x
        self
    }

    /// Enable Replace-By-Fee (BIP 125) with a specific nSequence value.
    ///
    /// **Note:** RBF is enabled by default in BDK 2.x. Custom nSequence values
    /// are not currently supported through this builder. This method is kept for
    /// API compatibility but is effectively a no-op.
    pub fn enable_rbf_with_sequence(self, _nsequence: u32) -> Self {
        // RBF is enabled by default in BDK 2.x; custom sequence not supported
        self
    }

    /// Set an absolute locktime for the transaction.
    ///
    /// This is used to set a specific block height or timestamp before which
    /// the transaction cannot be mined.
    pub fn nlocktime(mut self, locktime: u32) -> Self {
        self.nlocktime = Some(locktime);
        self
    }

    /// Set the transaction version.
    ///
    /// By default, transactions are created with version 1. Set to 2 if you need
    /// features like OP_CSV (BIP 68/112/113).
    pub fn version(mut self, version: i32) -> Self {
        self.version = Some(version);
        self
    }

    /// Finish building the transaction.
    ///
    /// Returns a new [`Psbt`] per [`BIP174`].
    pub fn finish(self) -> Result<Psbt, BdkError> {
        let mut wallet = self.wallet.borrow_mut();

        if self.is_fee_bump {
            let txid = self.fee_bump_txid.expect("fee bump txid must be set");
            let mut builder = wallet.build_fee_bump(txid)?;

            match self.fee_policy {
                FeePolicy::Rate(rate) => {
                    builder.fee_rate(rate.into());
                }
                FeePolicy::Absolute(amount) => {
                    builder.fee_absolute(amount.into());
                }
            }

            builder.ordering(self.ordering.into()).allow_dust(self.allow_dust);

            // RBF is enabled by default in BDK 2.x (nSequence = 0xFFFFFFFD).
            // No explicit enable_rbf call needed.

            let psbt = builder.finish()?;
            return Ok(psbt.into());
        }

        let mut builder = wallet.build_tx();

        builder
            .ordering(self.ordering.into())
            .set_recipients(self.recipients.into_iter().map(Into::into).collect())
            .unspendable(self.unspendable.into_iter().map(Into::into).collect())
            .allow_dust(self.allow_dust);

        match self.fee_policy {
            FeePolicy::Rate(rate) => {
                builder.fee_rate(rate.into());
            }
            FeePolicy::Absolute(amount) => {
                builder.fee_absolute(amount.into());
            }
        }

        if !self.utxos.is_empty() {
            let outpoints: Vec<_> = self.utxos.into_iter().map(Into::into).collect();
            builder.add_utxos(&outpoints).map_err(|e| BdkError::from(e))?;
        }

        if self.only_spend_from {
            builder.manually_selected_only();
        }

        if let Some(min_confirms) = self.min_confirmations {
            builder.exclude_below_confirmations(min_confirms);
        }

        if let Some(policy) = self.change_policy {
            builder.change_policy(policy.into());
        }

        if self.drain_wallet {
            builder.drain_wallet();
        }

        if let Some(drain_recipient) = self.drain_to {
            builder.drain_to(drain_recipient.into());
        }

        // RBF is enabled by default in BDK 2.x (nSequence = 0xFFFFFFFD).
        // No explicit enable_rbf call needed.

        if let Some(locktime) = self.nlocktime {
            builder.nlocktime(bdk_wallet::bitcoin::absolute::LockTime::from_consensus(locktime));
        }

        if let Some(version) = self.version {
            builder.version(version);
        }

        let psbt = builder.finish()?;
        Ok(psbt.into())
    }
}

/// Ordering of the transaction's inputs and outputs
#[derive(Clone, Default)]
#[wasm_bindgen]
pub enum TxOrdering {
    /// Randomized (default)
    #[default]
    Shuffle,
    /// Unchanged
    Untouched,
}

impl From<BdkTxOrdering> for TxOrdering {
    fn from(ordering: BdkTxOrdering) -> Self {
        match ordering {
            BdkTxOrdering::Shuffle => TxOrdering::Shuffle,
            BdkTxOrdering::Untouched => TxOrdering::Untouched,
            _ => panic!("Unsupported ordering"),
        }
    }
}

impl From<TxOrdering> for BdkTxOrdering {
    fn from(ordering: TxOrdering) -> Self {
        match ordering {
            TxOrdering::Shuffle => BdkTxOrdering::Shuffle,
            TxOrdering::Untouched => BdkTxOrdering::Untouched,
        }
    }
}

/// Policy regarding the use of change outputs when creating a transaction.
#[derive(Clone)]
#[wasm_bindgen]
pub enum ChangeSpendPolicy {
    /// Use both change and non-change outputs (default)
    ChangeAllowed,
    /// Only use change outputs
    OnlyChange,
    /// Do not use any change outputs
    ChangeForbidden,
}

impl From<ChangeSpendPolicy> for BdkChangeSpendPolicy {
    fn from(policy: ChangeSpendPolicy) -> Self {
        match policy {
            ChangeSpendPolicy::ChangeAllowed => BdkChangeSpendPolicy::ChangeAllowed,
            ChangeSpendPolicy::OnlyChange => BdkChangeSpendPolicy::OnlyChange,
            ChangeSpendPolicy::ChangeForbidden => BdkChangeSpendPolicy::ChangeForbidden,
        }
    }
}

/// Wallet's UTXO set is not enough to cover recipient's requested plus fee.
#[wasm_bindgen]
#[derive(Clone, Serialize)]
pub struct InsufficientFunds {
    /// Amount needed for the transaction
    pub needed: Amount,
    /// Amount available for spending
    pub available: Amount,
}

impl From<AddUtxoError> for BdkError {
    fn from(e: AddUtxoError) -> Self {
        BdkError::new(BdkErrorCode::UnknownUtxo, e.to_string(), ())
    }
}

impl From<BuildFeeBumpError> for BdkError {
    fn from(e: BuildFeeBumpError) -> Self {
        use BuildFeeBumpError::*;
        match &e {
            UnknownUtxo(_) => BdkError::new(BdkErrorCode::UnknownUtxo, e.to_string(), ()),
            TransactionNotFound(txid) => BdkError::new(BdkErrorCode::TransactionNotFound, e.to_string(), txid),
            TransactionConfirmed(txid) => BdkError::new(BdkErrorCode::TransactionConfirmed, e.to_string(), txid),
            IrreplaceableTransaction(txid) => {
                BdkError::new(BdkErrorCode::IrreplaceableTransaction, e.to_string(), txid)
            }
            FeeRateUnavailable => BdkError::new(BdkErrorCode::FeeRateUnavailable, e.to_string(), ()),
            InvalidOutputIndex(outpoint) => BdkError::new(BdkErrorCode::InvalidOutputIndex, e.to_string(), outpoint),
        }
    }
}

impl From<CreateTxError> for BdkError {
    fn from(e: CreateTxError) -> Self {
        use CreateTxError::*;
        match &e {
            Descriptor(_) => BdkError::new(BdkErrorCode::Descriptor, e.to_string(), ()),
            Policy(_) => BdkError::new(BdkErrorCode::Policy, e.to_string(), ()),
            SpendingPolicyRequired(keychain_kind) => {
                BdkError::new(BdkErrorCode::SpendingPolicyRequired, e.to_string(), keychain_kind)
            }
            Version0 => BdkError::new(BdkErrorCode::Version0, e.to_string(), ()),
            Version1Csv => BdkError::new(BdkErrorCode::Version1Csv, e.to_string(), ()),
            LockTime { .. } => BdkError::new(BdkErrorCode::LockTime, e.to_string(), ()),
            RbfSequenceCsv { .. } => BdkError::new(BdkErrorCode::RbfSequenceCsv, e.to_string(), ()),
            FeeTooLow { required } => BdkError::new(BdkErrorCode::FeeTooLow, e.to_string(), required),
            FeeRateTooLow { required } => BdkError::new(BdkErrorCode::FeeRateTooLow, e.to_string(), required),
            NoUtxosSelected => BdkError::new(BdkErrorCode::NoUtxosSelected, e.to_string(), ()),
            OutputBelowDustLimit(limit) => BdkError::new(BdkErrorCode::OutputBelowDustLimit, e.to_string(), limit),
            CoinSelection(insufficient_funds) => BdkError::new(
                BdkErrorCode::InsufficientFunds,
                e.to_string(),
                InsufficientFunds {
                    available: insufficient_funds.available.into(),
                    needed: insufficient_funds.needed.into(),
                },
            ),
            NoRecipients => BdkError::new(BdkErrorCode::NoRecipients, e.to_string(), ()),
            Psbt(_) => BdkError::new(BdkErrorCode::Psbt, e.to_string(), ()),
            MissingKeyOrigin(_) => BdkError::new(BdkErrorCode::MissingKeyOrigin, e.to_string(), ()),
            UnknownUtxo => BdkError::new(BdkErrorCode::UnknownUtxo, e.to_string(), ()),
            MissingNonWitnessUtxo(outpoint) => {
                BdkError::new(BdkErrorCode::MissingNonWitnessUtxo, e.to_string(), outpoint)
            }
            MiniscriptPsbt(_) => BdkError::new(BdkErrorCode::MiniscriptPsbt, e.to_string(), ()),
        }
    }
}
