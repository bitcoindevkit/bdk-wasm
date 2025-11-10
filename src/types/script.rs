use std::ops::Deref;

use bdk_wallet::bitcoin::ScriptBuf as BdkScriptBuf;
use wasm_bindgen::prelude::wasm_bindgen;

use crate::{result::JsResult, types::{Amount, FeeRate}};

/// An owned, growable script.
///
/// `ScriptBuf` is the most common script type that has the ownership over the contents of the
/// script. It has a close relationship with its borrowed counterpart, [`Script`].
#[wasm_bindgen]
#[derive(Clone)]
pub struct ScriptBuf(BdkScriptBuf);

impl Deref for ScriptBuf {
    type Target = BdkScriptBuf;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

#[wasm_bindgen]
impl ScriptBuf {
    pub fn from_hex(s: &str) -> JsResult<Self> {
        let script = BdkScriptBuf::from_hex(s)?;
        Ok(script.into())
    }

    pub fn from_bytes(bytes: Vec<u8>) -> Self {
        BdkScriptBuf::from_bytes(bytes).into()
    }

    #[allow(clippy::inherent_to_string)]
    #[wasm_bindgen(js_name = toString)]
    pub fn to_string(&self) -> String {
        self.0.to_string()
    }

    pub fn as_bytes(&self) -> Vec<u8> {
        self.0.as_bytes().to_vec()
    }

    pub fn to_asm_string(&self) -> String {
        self.0.to_asm_string()
    }

    pub fn to_hex_string(&self) -> String {
        self.0.to_hex_string()
    }

    pub fn is_op_return(&self) -> bool {
        self.0.is_op_return()
    }

    #[wasm_bindgen(js_name = clone)]
    pub fn js_clone(&self) -> ScriptBuf {
        self.clone()
    }

    /// Returns the minimum value an output with this script should have in order to be
    /// broadcastable on today's Bitcoin network.
    #[wasm_bindgen(getter)]
    pub fn minimal_non_dust(&self) -> Amount {
        self.0.minimal_non_dust().into()
    }

    /// Returns the minimum value an output with this script should have in order to be
    /// broadcastable on today's Bitcoin network.
    #[wasm_bindgen(getter)]
    pub fn minimal_non_dust_custom(&self, dust_relay_fee: FeeRate) -> Amount {
        self.0.minimal_non_dust_custom(dust_relay_fee.into()).into()
    }
}

impl From<BdkScriptBuf> for ScriptBuf {
    fn from(inner: BdkScriptBuf) -> Self {
        ScriptBuf(inner)
    }
}

impl From<ScriptBuf> for BdkScriptBuf {
    fn from(script_buf: ScriptBuf) -> Self {
        script_buf.0
    }
}
