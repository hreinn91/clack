//! What the app remembers between launches: which server it opens, and the
//! Clack folder it can start one from. Kept as JSON in the app's config folder.

use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

pub const DEFAULT_SERVER: &str = "http://localhost:4317";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// The Clack server the window opens.
    pub server: String,
    /// A Clack folder (a checkout with server/ and web/) to start a server from.
    pub folder: Option<String>,
    /// Start the server from `folder` by itself when nothing answers at a local address.
    pub auto_start: bool,
    /// How much the page is zoomed: 1 is actual size.
    pub zoom: f64,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            server: DEFAULT_SERVER.to_string(),
            folder: None,
            auto_start: false,
            zoom: 1.0,
        }
    }
}

pub fn load(path: &PathBuf) -> Settings {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

pub fn save(path: &PathBuf, settings: &Settings) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|err| err.to_string())?;
    }
    let text = serde_json::to_string_pretty(settings).map_err(|err| err.to_string())?;
    // Written beside it first, so a crash never leaves half a file.
    let temp = path.with_extension("json.tmp");
    fs::write(&temp, text).map_err(|err| err.to_string())?;
    fs::rename(&temp, path).map_err(|err| err.to_string())
}
