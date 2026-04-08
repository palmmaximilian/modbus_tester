use tauri::State;

use crate::persistence::{save_sim_state_file, load_sim_state_file};
use crate::SimulatorAppState;

#[tauri::command]
pub async fn start_simulator(
    port: u16,
    state: State<'_, SimulatorAppState>,
) -> Result<(), String> {
    let mut handle = state.0.lock().await;
    if handle.is_running() {
        return Err("Simulator is already running".into());
    }
    let data = handle.data.clone();
    let task = crate::simulator::start_server(port, data).await?;
    handle.task = Some(task);
    Ok(())
}

#[tauri::command]
pub async fn stop_simulator(state: State<'_, SimulatorAppState>) -> Result<(), String> {
    let mut handle = state.0.lock().await;
    if let Some(task) = handle.task.take() {
        task.abort();
    }
    Ok(())
}

#[tauri::command]
pub async fn get_sim_state(
    start: u16,
    count: u16,
    state: State<'_, SimulatorAppState>,
) -> Result<serde_json::Value, String> {
    let handle = state.0.lock().await;
    let data = handle.data.lock().map_err(|e| e.to_string())?;
    let s = start as usize;
    let e = (s + count as usize).min(65536);
    Ok(serde_json::json!({
        "running": handle.is_running(),
        "coils": &data.coils[s..e],
        "discrete_inputs": &data.discrete_inputs[s..e],
        "input_registers": &data.input_registers[s..e],
        "holding_registers": &data.holding_registers[s..e],
    }))
}

#[tauri::command]
pub async fn set_sim_coil(
    app: tauri::AppHandle,
    addr: u16,
    value: bool,
    state: State<'_, SimulatorAppState>,
) -> Result<(), String> {
    let handle = state.0.lock().await;
    let mut data = handle.data.lock().map_err(|e| e.to_string())?;
    data.coils[addr as usize] = value;
    let _ = save_sim_state_file(&app, &data);
    Ok(())
}

#[tauri::command]
pub async fn set_sim_discrete(
    app: tauri::AppHandle,
    addr: u16,
    value: bool,
    state: State<'_, SimulatorAppState>,
) -> Result<(), String> {
    let handle = state.0.lock().await;
    let mut data = handle.data.lock().map_err(|e| e.to_string())?;
    data.discrete_inputs[addr as usize] = value;
    let _ = save_sim_state_file(&app, &data);
    Ok(())
}

#[tauri::command]
pub async fn set_sim_input_reg(
    app: tauri::AppHandle,
    addr: u16,
    value: u16,
    state: State<'_, SimulatorAppState>,
) -> Result<(), String> {
    let handle = state.0.lock().await;
    let mut data = handle.data.lock().map_err(|e| e.to_string())?;
    data.input_registers[addr as usize] = value;
    let _ = save_sim_state_file(&app, &data);
    Ok(())
}

#[tauri::command]
pub async fn set_sim_holding_reg(
    app: tauri::AppHandle,
    addr: u16,
    value: u16,
    state: State<'_, SimulatorAppState>,
) -> Result<(), String> {
    let handle = state.0.lock().await;
    let mut data = handle.data.lock().map_err(|e| e.to_string())?;
    data.holding_registers[addr as usize] = value;
    let _ = save_sim_state_file(&app, &data);
    Ok(())
}

#[tauri::command]
pub async fn load_sim_state(
    app: tauri::AppHandle,
    state: State<'_, SimulatorAppState>,
) -> Result<(), String> {
    let Some(saved) = load_sim_state_file(&app) else {
        return Ok(());
    };
    let handle = state.0.lock().await;
    let mut data = handle.data.lock().map_err(|e| e.to_string())?;
    for (addr, val) in saved.coils { data.coils[addr as usize] = val; }
    for (addr, val) in saved.discrete_inputs { data.discrete_inputs[addr as usize] = val; }
    for (addr, val) in saved.input_registers { data.input_registers[addr as usize] = val; }
    for (addr, val) in saved.holding_registers { data.holding_registers[addr as usize] = val; }
    Ok(())
}

