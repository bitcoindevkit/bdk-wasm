use bdk_wallet::bitcoin::FeeRate as BdkFeeRate;
use std::collections::HashMap;

use wasm_bindgen::prelude::wasm_bindgen;

/// Map where the key is the confirmation target (in number of blocks) and the value is the estimated feerate (in sat/vB).
#[wasm_bindgen]
pub struct FeeEstimates(HashMap<u16, f64>);

impl_inner_wrapper!(FeeEstimates, HashMap<u16, f64>, into_inner);

#[wasm_bindgen]
impl FeeEstimates {
    /// Returns the feerate (in sat/vB) or undefined.
    /// Available confirmation targets are 1-25, 144, 504 and 1008 blocks.
    pub fn get(&self, k: u16) -> Option<f64> {
        self.0.get(&k).copied()
    }
}

/// Represents fee rate.
///
/// This is an integer newtype representing fee rate in `sat/kwu`. It provides protection against mixing
/// up the types as well as basic formatting features.
#[wasm_bindgen]
#[derive(Clone, Copy)]
pub struct FeeRate(BdkFeeRate);

impl_inner_wrapper!(FeeRate, BdkFeeRate, into_inner);

#[wasm_bindgen]
impl FeeRate {
    #[wasm_bindgen(constructor)]
    pub fn new(sat_vb: u64) -> Self {
        FeeRate(BdkFeeRate::from_sat_per_vb_unchecked(sat_vb))
    }

    /// Returns raw fee rate.
    pub fn to_sat_per_kwu(&self) -> u64 {
        self.0.to_sat_per_kwu()
    }

    /// Converts to sat/vB rounding up.
    pub fn to_sat_per_vb_ceil(&self) -> u64 {
        self.0.to_sat_per_vb_ceil()
    }

    /// Converts to sat/vB rounding down.
    pub fn to_sat_per_vb_floor(&self) -> u64 {
        self.0.to_sat_per_vb_floor()
    }
}
