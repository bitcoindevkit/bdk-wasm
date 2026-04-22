use bdk_wallet::chain::CheckPoint as BdkCheckPoint;
use wasm_bindgen::prelude::wasm_bindgen;

use super::BlockId;

/// A checkpoint is a node of a reference-counted linked list of [`BlockId`]s.
///
/// Checkpoints are cheaply cloneable and are useful to find the agreement point between two sparse
/// block chains.
#[wasm_bindgen]
#[derive(Clone)]
pub struct CheckPoint(BdkCheckPoint);

impl_inner_wrapper!(CheckPoint, BdkCheckPoint);

#[wasm_bindgen]
impl CheckPoint {
    /// Get the [`BlockId`] of the checkpoint.
    #[wasm_bindgen(getter)]
    pub fn block_id(&self) -> BlockId {
        self.0.block_id().into()
    }

    /// Get the height of the checkpoint.
    #[wasm_bindgen(getter)]
    pub fn height(&self) -> u32 {
        self.0.height()
    }

    /// Get the block hash of the checkpoint.
    #[wasm_bindgen(getter)]
    pub fn hash(&self) -> String {
        self.0.hash().to_string()
    }

    /// Get the previous checkpoint in the chain
    #[wasm_bindgen(getter)]
    pub fn prev(&self) -> Option<Self> {
        self.0.prev().map(Into::into)
    }

    /// Get checkpoint at `height`.
    ///
    /// Returns `None` if checkpoint at `height` does not exist.
    pub fn get(&self, height: u32) -> Option<Self> {
        self.0.get(height).map(Into::into)
    }
}
