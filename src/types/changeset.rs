use bdk_wallet::{
    chain::Merge,
    serde_json::{from_str, to_string},
    ChangeSet as BdkChangeSet,
};
use wasm_bindgen::{prelude::wasm_bindgen, JsError};

use crate::result::JsResult;

/// A changeset for [`Wallet`].
#[wasm_bindgen]
#[derive(PartialEq)]
pub struct ChangeSet(BdkChangeSet);

impl_inner_wrapper!(ChangeSet, BdkChangeSet, into_inner);

#[wasm_bindgen]
impl ChangeSet {
    /// Merge another [`ChangeSet`] into itself.
    ///
    /// Reject conflicting wallet identities before modifying either changeset's data.
    pub fn merge(&mut self, other: ChangeSet) -> JsResult<()> {
        if matches!((&self.0.descriptor, &other.0.descriptor), (Some(a), Some(b)) if a != b)
            || matches!((&self.0.change_descriptor, &other.0.change_descriptor), (Some(a), Some(b)) if a != b)
            || matches!((self.0.network, other.0.network), (Some(a), Some(b)) if a != b)
        {
            return Err(JsError::new("Cannot merge changesets from different wallets"));
        }
        self.0.merge(other.into());
        Ok(())
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// Serialize `ChangeSet` to JSON.
    pub fn to_json(&self) -> String {
        to_string(&self.0).expect("Serialization should not fail")
    }

    /// Create a new `ChangeSet` from a JSON string.
    pub fn from_json(val: &str) -> JsResult<ChangeSet> {
        Ok(ChangeSet(from_str(val)?))
    }
}
