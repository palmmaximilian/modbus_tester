use std::net::{Ipv4Addr, SocketAddr};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio_modbus::client::tcp;
use tokio_modbus::prelude::*;

use crate::{ConnectionParams, DeviceEntry, DeviceState};
use crate::persistence::{
    DeviceRecord, WatchlistEntry,
    load_devices_file, save_devices_file,
    load_watchlist_file, save_watchlist_file,
};
use crate::scanner::scan_range;

type CmdResult<T> = Result<T, String>;

// ─── Network scan ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn scan_network(
    start_ip: String,
    end_ip: String,
    port: u16,
) -> CmdResult<Vec<String>> {
    let start: Ipv4Addr = start_ip.parse().map_err(|e| format!("Bad start IP: {e}"))?;
    let end: Ipv4Addr = end_ip.parse().map_err(|e| format!("Bad end IP: {e}"))?;
    let found = scan_range(start, end, port, Duration::from_millis(500)).await;
    Ok(found)
}

// ─── Device connection ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn connect_device(
    state: tauri::State<'_, DeviceState>,
    device_id: String,
    ip: String,
    port: u16,
    unit_id: u8,
) -> CmdResult<()> {
    let addr: SocketAddr = format!("{ip}:{port}")
        .parse()
        .map_err(|e| format!("Bad address: {e}"))?;

    let slave = Slave(unit_id);
    let ctx = tcp::connect_slave(addr, slave)
        .await
        .map_err(|e| e.to_string())?;

    let mut connections = state.connections.lock().await;
    connections.insert(device_id, DeviceEntry {
        ctx: Arc::new(Mutex::new(ctx)),
        params: ConnectionParams { addr, unit_id },
    });
    Ok(())
}

#[tauri::command]
pub async fn disconnect_device(
    state: tauri::State<'_, DeviceState>,
    device_id: String,
) -> CmdResult<()> {
    let mut connections = state.connections.lock().await;
    if let Some(entry) = connections.remove(&device_id) {
        let mut ctx = entry.ctx.lock().await;
        let _ = ctx.disconnect().await;
    }
    Ok(())
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn is_pipe_error(e: &str) -> bool {
    e.contains("Broken pipe")
        || e.contains("Connection reset")
        || e.contains("os error 32")
        || e.contains("os error 104")
        || e.contains("BrokenPipe")
}

async fn with_device<F, Fut, T>(
    state: &DeviceState,
    device_id: &str,
    f: F,
) -> CmdResult<T>
where
    F: Fn(Arc<Mutex<tokio_modbus::client::Context>>) -> Fut,
    Fut: std::future::Future<Output = CmdResult<T>>,
{
    let (ctx_arc, params) = {
        let connections = state.connections.lock().await;
        let entry = connections
            .get(device_id)
            .ok_or_else(|| format!("Device '{device_id}' not connected"))?;
        (entry.ctx.clone(), entry.params)
    };

    let result = f(ctx_arc).await;

    match result {
        Err(ref e) if is_pipe_error(e) => {
            // Connection was dropped by the device — reconnect and retry once.
            let slave = Slave(params.unit_id);
            match tcp::connect_slave(params.addr, slave).await {
                Ok(new_ctx) => {
                    let new_arc = Arc::new(Mutex::new(new_ctx));
                    {
                        let mut connections = state.connections.lock().await;
                        if let Some(entry) = connections.get_mut(device_id) {
                            entry.ctx = new_arc.clone();
                        }
                    }
                    f(new_arc).await
                }
                Err(e) => Err(format!("Connection lost and reconnect failed: {e}")),
            }
        }
        other => other,
    }
}

/// Split a large read into Modbus-spec-compliant chunks.
async fn chunked_read_bool(
    ctx: &mut tokio_modbus::client::Context,
    start: u16,
    count: u16,
    is_coil: bool,
) -> CmdResult<Vec<bool>> {
    const MAX: u16 = 2000;
    let mut result = Vec::with_capacity(count as usize);
    let mut offset = 0u16;
    while offset < count {
        let n = (count - offset).min(MAX);
        let addr = start.checked_add(offset).ok_or("Address overflow")?;
        let chunk: Vec<bool> = if is_coil {
            ctx.read_coils(addr, n).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?
        } else {
            ctx.read_discrete_inputs(addr, n).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?
        };
        result.extend(chunk);
        offset += n;
    }
    Ok(result)
}

async fn chunked_read_word(
    ctx: &mut tokio_modbus::client::Context,
    start: u16,
    count: u16,
    holding: bool,
) -> CmdResult<Vec<u16>> {
    const MAX: u16 = 125;
    let mut result = Vec::with_capacity(count as usize);
    let mut offset = 0u16;
    while offset < count {
        let n = (count - offset).min(MAX);
        let addr = start.checked_add(offset).ok_or("Address overflow")?;
        let chunk: Vec<u16> = if holding {
            ctx.read_holding_registers(addr, n).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?
        } else {
            ctx.read_input_registers(addr, n).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?
        };
        result.extend(chunk);
        offset += n;
    }
    Ok(result)
}

// ─── Read commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn read_coils(
    state: tauri::State<'_, DeviceState>,
    device_id: String,
    start: u16,
    count: u16,
) -> CmdResult<Vec<bool>> {
    with_device(&state, &device_id, |ctx_arc| async move {
        let mut ctx = ctx_arc.lock().await;
        chunked_read_bool(&mut ctx, start, count, true).await
    })
    .await
}

#[tauri::command]
pub async fn read_discrete_inputs(
    state: tauri::State<'_, DeviceState>,
    device_id: String,
    start: u16,
    count: u16,
) -> CmdResult<Vec<bool>> {
    with_device(&state, &device_id, |ctx_arc| async move {
        let mut ctx = ctx_arc.lock().await;
        chunked_read_bool(&mut ctx, start, count, false).await
    })
    .await
}

#[tauri::command]
pub async fn read_input_registers(
    state: tauri::State<'_, DeviceState>,
    device_id: String,
    start: u16,
    count: u16,
) -> CmdResult<Vec<u16>> {
    with_device(&state, &device_id, |ctx_arc| async move {
        let mut ctx = ctx_arc.lock().await;
        chunked_read_word(&mut ctx, start, count, false).await
    })
    .await
}

#[tauri::command]
pub async fn read_holding_registers(
    state: tauri::State<'_, DeviceState>,
    device_id: String,
    start: u16,
    count: u16,
) -> CmdResult<Vec<u16>> {
    with_device(&state, &device_id, |ctx_arc| async move {
        let mut ctx = ctx_arc.lock().await;
        chunked_read_word(&mut ctx, start, count, true).await
    })
    .await
}

// ─── Write commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn write_single_coil(
    state: tauri::State<'_, DeviceState>,
    device_id: String,
    address: u16,
    value: bool,
) -> CmdResult<()> {
    with_device(&state, &device_id, |ctx_arc| async move {
        let mut ctx = ctx_arc.lock().await;
        ctx.write_single_coil(address, value)
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn write_single_register(
    state: tauri::State<'_, DeviceState>,
    device_id: String,
    address: u16,
    value: u16,
) -> CmdResult<()> {
    with_device(&state, &device_id, |ctx_arc| async move {
        let mut ctx = ctx_arc.lock().await;
        ctx.write_single_register(address, value)
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn write_multiple_coils(
    state: tauri::State<'_, DeviceState>,
    device_id: String,
    start_address: u16,
    values: Vec<bool>,
) -> CmdResult<()> {
    with_device(&state, &device_id, |ctx_arc| {
        let values = values.clone();
        async move {
            let mut ctx = ctx_arc.lock().await;
            ctx.write_multiple_coils(start_address, &values)
                .await
                .map_err(|e| e.to_string())?
                .map_err(|e| e.to_string())
        }
    })
    .await
}

#[tauri::command]
pub async fn write_multiple_registers(
    state: tauri::State<'_, DeviceState>,
    device_id: String,
    start_address: u16,
    values: Vec<u16>,
) -> CmdResult<()> {
    with_device(&state, &device_id, |ctx_arc| {
        let values = values.clone();
        async move {
            let mut ctx = ctx_arc.lock().await;
            ctx.write_multiple_registers(start_address, &values)
                .await
                .map_err(|e| e.to_string())?
                .map_err(|e| e.to_string())
        }
    })
    .await
}

// ─── Device persistence ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn save_devices(
    app: tauri::AppHandle,
    devices: Vec<DeviceRecord>,
) -> CmdResult<()> {
    save_devices_file(&app, &devices).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_devices(
    app: tauri::AppHandle,
) -> CmdResult<Vec<DeviceRecord>> {
    Ok(load_devices_file(&app))
}

// ─── Watchlist persistence ────────────────────────────────────────────────────

#[tauri::command]
pub async fn save_watchlist(
    app: tauri::AppHandle,
    device_id: String,
    entries: Vec<WatchlistEntry>,
) -> CmdResult<()> {
    save_watchlist_file(&app, &device_id, &entries).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn load_watchlist(
    app: tauri::AppHandle,
    device_id: String,
) -> CmdResult<Vec<WatchlistEntry>> {
    Ok(load_watchlist_file(&app, &device_id).unwrap_or_default())
}
