use std::{ops::Deref, str::FromStr};

use bdk_wallet::{
    bitcoin::{consensus::deserialize, Block as BdkBlock, BlockHash as BdkBlockHash},
    chain::{BlockId as BdkBlockId, ConfirmationBlockTime as BdkConfirmationBlockTime},
};
use wasm_bindgen::{prelude::wasm_bindgen, JsError};

use crate::result::JsResult;

use super::Transaction;

/// A reference to a block in the canonical chain.
#[wasm_bindgen]
#[derive(Clone)]
pub struct BlockId(BdkBlockId);

#[wasm_bindgen]
impl BlockId {
    /// Create a new `BlockId` from a height and block hash string.
    #[wasm_bindgen(constructor)]
    pub fn new(height: u32, hash: &str) -> JsResult<BlockId> {
        let block_hash =
            BdkBlockHash::from_str(hash).map_err(|e| JsError::new(&format!("Invalid block hash: {e}")))?;
        Ok(BlockId(BdkBlockId {
            height,
            hash: block_hash,
        }))
    }

    /// The height of the block.
    #[wasm_bindgen(getter)]
    pub fn height(&self) -> u32 {
        self.0.height
    }

    /// The hash of the block.
    #[wasm_bindgen(getter)]
    pub fn hash(&self) -> String {
        self.0.hash.to_string()
    }
}

impl From<BdkBlockId> for BlockId {
    fn from(inner: BdkBlockId) -> Self {
        BlockId(inner)
    }
}

impl From<BlockId> for BdkBlockId {
    fn from(block_id: BlockId) -> Self {
        block_id.0
    }
}

/// A full Bitcoin block (header + transactions).
///
/// Construct from consensus-encoded bytes using `Block.from_bytes()`.
#[wasm_bindgen]
#[derive(Clone)]
pub struct Block(BdkBlock);

impl Deref for Block {
    type Target = BdkBlock;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[wasm_bindgen]
impl Block {
    /// Deserialize a block from consensus-encoded bytes.
    ///
    /// Accepts a `Uint8Array` of raw block bytes as produced by Bitcoin Core
    /// or any standard Bitcoin serializer.
    pub fn from_bytes(bytes: &[u8]) -> JsResult<Block> {
        let block: BdkBlock =
            deserialize(bytes).map_err(|e| JsError::new(&format!("Failed to deserialize block: {e}")))?;
        Ok(Block(block))
    }

    /// Returns the block hash.
    #[wasm_bindgen(getter)]
    pub fn block_hash(&self) -> String {
        self.0.block_hash().to_string()
    }

    /// Returns the previous block hash from the header.
    #[wasm_bindgen(getter)]
    pub fn prev_blockhash(&self) -> String {
        self.0.header.prev_blockhash.to_string()
    }

    /// Returns the block header timestamp.
    #[wasm_bindgen(getter)]
    pub fn time(&self) -> u32 {
        self.0.header.time
    }

    /// Returns the list of transactions in the block.
    #[wasm_bindgen(getter)]
    pub fn txdata(&self) -> Vec<Transaction> {
        self.0.txdata.clone().into_iter().map(Into::into).collect()
    }

    /// Returns the number of transactions in the block.
    #[wasm_bindgen(getter)]
    pub fn tx_count(&self) -> usize {
        self.0.txdata.len()
    }
}

impl From<BdkBlock> for Block {
    fn from(inner: BdkBlock) -> Self {
        Block(inner)
    }
}

impl From<&Block> for BdkBlock {
    fn from(block: &Block) -> Self {
        block.0.clone()
    }
}

/// A transaction ID paired with an eviction timestamp.
///
/// Used with `Wallet::apply_evicted_txs` to mark unconfirmed transactions
/// as evicted from the mempool.
#[wasm_bindgen]
pub struct EvictedTx {
    pub(crate) txid: bdk_wallet::bitcoin::Txid,
    pub(crate) evicted_at: u64,
}

#[wasm_bindgen]
impl EvictedTx {
    /// Create a new `EvictedTx`.
    ///
    /// - `txid`: The transaction ID to evict
    /// - `evicted_at`: Unix timestamp of when the transaction was evicted
    #[wasm_bindgen(constructor)]
    pub fn new(txid: super::Txid, evicted_at: u64) -> EvictedTx {
        EvictedTx {
            txid: txid.into(),
            evicted_at,
        }
    }
}

/// Represents the observed position of some chain data.
#[wasm_bindgen]
pub struct ConfirmationBlockTime(BdkConfirmationBlockTime);

impl Deref for ConfirmationBlockTime {
    type Target = BdkConfirmationBlockTime;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[wasm_bindgen]
impl ConfirmationBlockTime {
    /// The anchor block.
    #[wasm_bindgen(getter)]
    pub fn block_id(&self) -> BlockId {
        self.0.block_id.into()
    }

    /// The confirmation time of the transaction being anchored.
    #[wasm_bindgen(getter)]
    pub fn confirmation_time(&self) -> u64 {
        self.0.confirmation_time
    }
}

impl From<&BdkConfirmationBlockTime> for ConfirmationBlockTime {
    fn from(inner: &BdkConfirmationBlockTime) -> Self {
        ConfirmationBlockTime(*inner)
    }
}

impl From<ConfirmationBlockTime> for BdkConfirmationBlockTime {
    fn from(conf_block_time: ConfirmationBlockTime) -> Self {
        conf_block_time.0
    }
}
