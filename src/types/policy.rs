use std::{collections::BTreeMap, str::FromStr};

use bdk_wallet::{
    bitcoin::{absolute, secp256k1::Secp256k1, Sequence},
    descriptor::{policy::BuildSatisfaction, Condition as BdkCondition, ExtractPolicy, Policy as BdkPolicy},
    miniscript::{Descriptor, DescriptorPublicKey},
    signer::SignersContainer,
};
use wasm_bindgen::{prelude::wasm_bindgen, JsError};

use crate::result::JsResult;

#[wasm_bindgen]
extern "C" {
    /// Policy node IDs mapped to the child indexes selected at each node.
    #[wasm_bindgen(typescript_type = "Record<string, number[]>")]
    pub type PolicyPath;
}

/// Caller-owned spending policy extracted from a public descriptor.
///
/// This describes spending requirements, not the caller's available signatures.
#[wasm_bindgen]
pub struct Policy(BdkPolicy);

#[wasm_bindgen]
impl Policy {
    /// Extract a policy without wallet-owned signers or PSBT satisfaction state.
    ///
    /// Pass `wallet.public_descriptor(keychain)` to inspect a resolved receive or
    /// change descriptor. Private keys are not accepted. Returns undefined if the
    /// descriptor has no spending policy.
    pub fn from_descriptor(descriptor: &str) -> JsResult<Option<Policy>> {
        let descriptor = Descriptor::<DescriptorPublicKey>::from_str(descriptor)?;
        Ok(descriptor
            .extract_policy(&SignersContainer::default(), BuildSatisfaction::None, &Secp256k1::new())?
            .map(Policy))
    }

    /// The root policy node ID. Obtain child IDs from `to_json()`.
    #[wasm_bindgen(getter)]
    pub fn id(&self) -> String {
        self.0.id.clone()
    }

    /// Whether choosing a path is necessary to determine the timelock requirements.
    pub fn requires_path(&self) -> bool {
        self.0.requires_path()
    }

    /// Serialize BDK's policy tree, including node IDs, types, items and thresholds.
    ///
    /// Inspect this tree to select child indexes; do not hardcode IDs from another
    /// descriptor or a policy extracted with different signers. Contribution and
    /// satisfaction fields do not indicate which keys the caller actually holds.
    pub fn to_json(&self) -> JsResult<String> {
        Ok(bdk_wallet::serde_json::to_string(&self.0)?)
    }

    /// Derive CSV / CLTV requirements using BDK's policy selection rules.
    ///
    /// `path` maps policy node IDs to selected child indexes. An empty object is
    /// sufficient when `requires_path()` is false. Missing required selections,
    /// out-of-range indexes and incompatible timelock units return an error.
    /// This does not select signing keys or force a particular final witness.
    pub fn get_condition(&self, path: PolicyPath) -> JsResult<Condition> {
        let path: BTreeMap<String, Vec<usize>> = serde_wasm_bindgen::from_value(path.into())?;
        Ok(self.0.get_condition(&path)?.into())
    }
}

/// CSV / CLTV requirements for transaction construction.
///
/// Prefer `Policy.get_condition()` when selecting a descriptor spending path.
#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct Condition(BdkCondition);

impl_inner_wrapper!(Condition, BdkCondition, into_inner);

#[wasm_bindgen]
impl Condition {
    /// Construct known requirements directly, or omit both for an immediate path.
    ///
    /// `csv` is a consensus nSequence value: blocks, or bit 22 plus units of 512
    /// seconds. The disable flag is rejected and unused BIP68 bits are cleared.
    /// `timelock` is consensus nLockTime:
    /// heights below 500,000,000, Unix seconds otherwise. Both must be unsigned
    /// 32-bit integers. These values are not checked against a descriptor.
    #[wasm_bindgen(constructor)]
    pub fn new(csv: Option<f64>, timelock: Option<f64>) -> JsResult<Condition> {
        let csv = csv
            .map(|value| {
                Sequence(consensus_u32(value, "csv")?)
                    .to_relative_lock_time()
                    .map(Into::into)
                    .ok_or_else(|| JsError::new("csv must not set the relative locktime disable flag"))
            })
            .transpose()?;
        let timelock = timelock
            .map(|value| consensus_u32(value, "timelock").map(absolute::LockTime::from_consensus))
            .transpose()?;
        Ok(BdkCondition { csv, timelock }.into())
    }

    /// Optional consensus nSequence requirement.
    #[wasm_bindgen(getter)]
    pub fn csv(&self) -> Option<u32> {
        self.0.csv.map(|value| value.to_consensus_u32())
    }

    /// Optional consensus nLockTime requirement.
    #[wasm_bindgen(getter)]
    pub fn timelock(&self) -> Option<u32> {
        self.0.timelock.map(|value| value.to_consensus_u32())
    }

    /// Combine requirements from every keychain whose inputs may be selected.
    ///
    /// Returns a new condition with the stricter requirements; neither input is
    /// changed or consumed. Mixing height and time units returns an error.
    pub fn merge(&self, other: &Condition) -> JsResult<Condition> {
        Ok(self.0.merge(&other.0)?.into())
    }
}

fn consensus_u32(value: f64, field: &str) -> JsResult<u32> {
    if !value.is_finite() || value.fract() != 0.0 || !(0.0..=u32::MAX as f64).contains(&value) {
        return Err(JsError::new(&format!("{field} must be an unsigned 32-bit integer")));
    }
    Ok(value as u32)
}
