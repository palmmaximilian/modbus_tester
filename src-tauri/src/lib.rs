use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_modbus::client::Context;

pub mod commands;
pub mod scanner;
pub mod persistence;
pub mod simulator;
pub mod sim_commands;

/// Connection parameters needed to re-establish a dropped TCP link.
#[derive(Clone, Copy)]
pub struct ConnectionParams {
    pub addr: SocketAddr,
    pub unit_id: u8,
}

/// Live connection + the params required to reconnect if the socket drops.
pub struct DeviceEntry {
    pub ctx: Arc<Mutex<Context>>,
    pub params: ConnectionParams,
}

/// Per-device Modbus TCP connection, shared across async command calls.
pub struct DeviceState {
    pub connections: Arc<Mutex<HashMap<String, DeviceEntry>>>,
}

impl DeviceState {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

/// Simulator server handle, managed by Tauri.
pub struct SimulatorAppState(pub Arc<Mutex<simulator::SimulatorHandle>>);

impl SimulatorAppState {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(simulator::SimulatorHandle::new())))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(DeviceState::new())
        .manage(SimulatorAppState::new())
        .invoke_handler(tauri::generate_handler![
            commands::scan_network,
            commands::connect_device,
            commands::disconnect_device,
            commands::read_coils,
            commands::read_discrete_inputs,
            commands::read_input_registers,
            commands::read_holding_registers,
            commands::write_single_coil,
            commands::write_single_register,
            commands::write_multiple_coils,
            commands::write_multiple_registers,
            commands::save_devices,
            commands::load_devices,
            commands::save_watchlist,
            commands::load_watchlist,
            sim_commands::start_simulator,
            sim_commands::stop_simulator,
            sim_commands::get_sim_state,
            sim_commands::set_sim_coil,
            sim_commands::set_sim_discrete,
            sim_commands::set_sim_input_reg,
            sim_commands::set_sim_holding_reg,
            sim_commands::load_sim_state,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
