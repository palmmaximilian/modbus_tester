use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

// ─── Device persistence ───────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceRecord {
    pub id: String,
    pub ip: String,
    pub port: u16,
    pub unit_id: u8,
    pub name: String,
}

fn devices_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("Failed to resolve app data dir")
        .join("devices.json")
}

pub fn save_devices_file(app: &tauri::AppHandle, devices: &[DeviceRecord]) -> std::io::Result<()> {
    let path = devices_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(devices)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    fs::write(path, json)
}

pub fn load_devices_file(app: &tauri::AppHandle) -> Vec<DeviceRecord> {
    let path = devices_path(app);
    fs::read_to_string(path)
        .ok()
        .and_then(|d| serde_json::from_str(&d).ok())
        .unwrap_or_default()
}

// ─── Simulator state persistence (sparse) ────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SimPersistState {
    pub coils: HashMap<u16, bool>,
    pub discrete_inputs: HashMap<u16, bool>,
    pub input_registers: HashMap<u16, u16>,
    pub holding_registers: HashMap<u16, u16>,
}

fn sim_state_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("Failed to resolve app data dir")
        .join("sim_state.json")
}

pub fn save_sim_state_file(
    app: &tauri::AppHandle,
    state: &crate::simulator::SimulatorState,
) -> std::io::Result<()> {
    let persist = SimPersistState {
        coils: state.coils.iter().enumerate()
            .filter(|(_, &v)| v)
            .map(|(i, &v)| (i as u16, v))
            .collect(),
        discrete_inputs: state.discrete_inputs.iter().enumerate()
            .filter(|(_, &v)| v)
            .map(|(i, &v)| (i as u16, v))
            .collect(),
        input_registers: state.input_registers.iter().enumerate()
            .filter(|(_, &v)| v != 0)
            .map(|(i, &v)| (i as u16, v))
            .collect(),
        holding_registers: state.holding_registers.iter().enumerate()
            .filter(|(_, &v)| v != 0)
            .map(|(i, &v)| (i as u16, v))
            .collect(),
    };
    let path = sim_state_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(&persist)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    fs::write(path, json)
}

pub fn load_sim_state_file(app: &tauri::AppHandle) -> Option<SimPersistState> {
    let path = sim_state_path(app);
    let data = fs::read_to_string(path).ok()?;
    serde_json::from_str(&data).ok()
}

// ─── Watchlist persistence ────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchlistEntry {
    pub id: String,
    pub name: String,
    pub register_type: String, // "coil" | "discrete" | "input" | "holding"
    pub address: u16,
}

fn watchlist_path(app: &tauri::AppHandle, device_id: &str) -> PathBuf {
    // Sanitise device_id so it's safe as a filename component.
    let safe_id: String = device_id
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();

    let data_dir = app
        .path()
        .app_data_dir()
        .expect("Failed to resolve app data dir");
    data_dir.join(format!("watchlist_{safe_id}.json"))
}

pub fn save_watchlist_file(
    app: &tauri::AppHandle,
    device_id: &str,
    entries: &[WatchlistEntry],
) -> std::io::Result<()> {
    let path = watchlist_path(app, device_id);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(entries)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
    fs::write(path, json)
}

pub fn load_watchlist_file(
    app: &tauri::AppHandle,
    device_id: &str,
) -> Option<Vec<WatchlistEntry>> {
    let path = watchlist_path(app, device_id);
    let data = fs::read_to_string(path).ok()?;
    serde_json::from_str(&data).ok()
}
