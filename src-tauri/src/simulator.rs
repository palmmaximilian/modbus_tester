use std::future;
use std::io;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tokio::net::{TcpListener, TcpStream};
use tokio::task::JoinHandle;
use tokio_modbus::prelude::*;
use tokio_modbus::server::tcp::Server;
use tokio_modbus::server::Service;

// ── Simulator state (shared with the Tauri command layer) ────────────────────

#[derive(Clone, serde::Serialize)]
pub struct SimulatorState {
    pub coils: Vec<bool>,
    pub discrete_inputs: Vec<bool>,
    pub input_registers: Vec<u16>,
    pub holding_registers: Vec<u16>,
}

impl SimulatorState {
    pub fn new() -> Self {
        Self {
            coils: vec![false; 65536],
            discrete_inputs: vec![false; 65536],
            input_registers: vec![0u16; 65536],
            holding_registers: vec![0u16; 65536],
        }
    }
}

// ── Tauri-managed handle ─────────────────────────────────────────────────────

pub struct SimulatorHandle {
    /// The register data — uses std::sync::Mutex so Service::call (synchronous)
    /// can lock it without needing to await anything.
    pub data: Arc<Mutex<SimulatorState>>,
    /// Join handle for the server task, present only while running.
    pub task: Option<JoinHandle<()>>,
}

impl SimulatorHandle {
    pub fn new() -> Self {
        Self {
            data: Arc::new(Mutex::new(SimulatorState::new())),
            task: None,
        }
    }

    pub fn is_running(&self) -> bool {
        self.task
            .as_ref()
            .map(|h| !h.is_finished())
            .unwrap_or(false)
    }
}

// ── Service implementation ───────────────────────────────────────────────────

#[derive(Clone)]
struct SimService(Arc<Mutex<SimulatorState>>);

impl Service for SimService {
    type Request = Request<'static>;
    type Response = Response;
    type Exception = Exception;
    type Future = future::Ready<Result<Self::Response, Self::Exception>>;

    fn call(&self, req: Self::Request) -> Self::Future {
        let mut state = self.0.lock().unwrap();

        let response = match req {
            Request::ReadCoils(addr, qty) => {
                let addr = addr as usize;
                let qty = qty as usize;
                if addr + qty > 65536 {
                    return future::ready(Err(Exception::IllegalDataAddress));
                }
                Ok(Response::ReadCoils(state.coils[addr..addr + qty].to_vec()))
            }
            Request::ReadDiscreteInputs(addr, qty) => {
                let addr = addr as usize;
                let qty = qty as usize;
                if addr + qty > 65536 {
                    return future::ready(Err(Exception::IllegalDataAddress));
                }
                Ok(Response::ReadDiscreteInputs(
                    state.discrete_inputs[addr..addr + qty].to_vec(),
                ))
            }
            Request::WriteSingleCoil(addr, val) => {
                if (addr as usize) >= 65536 {
                    return future::ready(Err(Exception::IllegalDataAddress));
                }
                state.coils[addr as usize] = val;
                Ok(Response::WriteSingleCoil(addr, val))
            }
            Request::WriteMultipleCoils(addr, coils) => {
                let addr = addr as usize;
                let len = coils.len();
                if addr + len > 65536 {
                    return future::ready(Err(Exception::IllegalDataAddress));
                }
                for (i, &v) in coils.iter().enumerate() {
                    state.coils[addr + i] = v;
                }
                Ok(Response::WriteMultipleCoils(addr as u16, len as u16))
            }
            Request::ReadInputRegisters(addr, qty) => {
                let addr = addr as usize;
                let qty = qty as usize;
                if addr + qty > 65536 {
                    return future::ready(Err(Exception::IllegalDataAddress));
                }
                Ok(Response::ReadInputRegisters(
                    state.input_registers[addr..addr + qty].to_vec(),
                ))
            }
            Request::ReadHoldingRegisters(addr, qty) => {
                let addr = addr as usize;
                let qty = qty as usize;
                if addr + qty > 65536 {
                    return future::ready(Err(Exception::IllegalDataAddress));
                }
                Ok(Response::ReadHoldingRegisters(
                    state.holding_registers[addr..addr + qty].to_vec(),
                ))
            }
            Request::WriteSingleRegister(addr, val) => {
                if (addr as usize) >= 65536 {
                    return future::ready(Err(Exception::IllegalDataAddress));
                }
                state.holding_registers[addr as usize] = val;
                Ok(Response::WriteSingleRegister(addr, val))
            }
            Request::WriteMultipleRegisters(addr, regs) => {
                let addr = addr as usize;
                let len = regs.len();
                if addr + len > 65536 {
                    return future::ready(Err(Exception::IllegalDataAddress));
                }
                for (i, &v) in regs.iter().enumerate() {
                    state.holding_registers[addr + i] = v;
                }
                Ok(Response::WriteMultipleRegisters(addr as u16, len as u16))
            }
            Request::MaskWriteRegister(addr, and_mask, or_mask) => {
                if (addr as usize) >= 65536 {
                    return future::ready(Err(Exception::IllegalDataAddress));
                }
                let cur = state.holding_registers[addr as usize];
                state.holding_registers[addr as usize] = (cur & and_mask) | (or_mask & !and_mask);
                Ok(Response::MaskWriteRegister(addr, and_mask, or_mask))
            }
            Request::ReadWriteMultipleRegisters(read_addr, read_qty, write_addr, values) => {
                let read_addr = read_addr as usize;
                let read_qty = read_qty as usize;
                let write_addr = write_addr as usize;
                let write_len = values.len();
                if read_addr + read_qty > 65536 || write_addr + write_len > 65536 {
                    return future::ready(Err(Exception::IllegalDataAddress));
                }
                for (i, &v) in values.iter().enumerate() {
                    state.holding_registers[write_addr + i] = v;
                }
                let regs = state.holding_registers[read_addr..read_addr + read_qty].to_vec();
                Ok(Response::ReadWriteMultipleRegisters(regs))
            }
            _ => Err(Exception::IllegalFunction),
        };

        future::ready(response)
    }
}

// ── Start helper (called from Tauri commands) ────────────────────────────────

/// Binds a TCP listener on `port` and spawns the server task.
/// Returns an error string if the port is already in use.
pub async fn start_server(
    port: u16,
    data: Arc<Mutex<SimulatorState>>,
) -> Result<JoinHandle<()>, String> {
    let listener = TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .map_err(|e| format!("Failed to bind port {port}: {e}"))?;

    let handle = tokio::spawn(async move {
        let server = Server::new(listener);
        let data_clone = data.clone();

        let on_connected = move |stream: TcpStream, _addr: SocketAddr| {
            let svc = SimService(data_clone.clone());
            async move {
                let result: io::Result<Option<(SimService, TcpStream)>> = Ok(Some((svc, stream)));
                result
            }
        };

        let on_process_error = |e: io::Error| {
            eprintln!("[simulator] processing error: {e}");
        };

        if let Err(e) = server.serve(&on_connected, on_process_error).await {
            eprintln!("[simulator] server error: {e}");
        }
    });

    Ok(handle)
}
