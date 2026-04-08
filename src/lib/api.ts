import { invoke } from '@tauri-apps/api/core';
import type { Device, RegisterType, SimulatorState, WatchlistEntry } from '../types';

export const api = {
  scanNetwork: (startIp: string, endIp: string, port: number): Promise<string[]> =>
    invoke('scan_network', { startIp, endIp, port }),

  connectDevice: (deviceId: string, ip: string, port: number, unitId: number): Promise<void> =>
    invoke('connect_device', { deviceId, ip, port, unitId }),

  disconnectDevice: (deviceId: string): Promise<void> =>
    invoke('disconnect_device', { deviceId }),

  readCoils: (deviceId: string, start: number, count: number): Promise<boolean[]> =>
    invoke('read_coils', { deviceId, start, count }),

  readDiscreteInputs: (deviceId: string, start: number, count: number): Promise<boolean[]> =>
    invoke('read_discrete_inputs', { deviceId, start, count }),

  readInputRegisters: (deviceId: string, start: number, count: number): Promise<number[]> =>
    invoke('read_input_registers', { deviceId, start, count }),

  readHoldingRegisters: (deviceId: string, start: number, count: number): Promise<number[]> =>
    invoke('read_holding_registers', { deviceId, start, count }),

  writeSingleCoil: (deviceId: string, address: number, value: boolean): Promise<void> =>
    invoke('write_single_coil', { deviceId, address, value }),

  writeSingleRegister: (deviceId: string, address: number, value: number): Promise<void> =>
    invoke('write_single_register', { deviceId, address, value }),

  writeMultipleCoils: (deviceId: string, startAddress: number, values: boolean[]): Promise<void> =>
    invoke('write_multiple_coils', { deviceId, startAddress, values }),

  writeMultipleRegisters: (deviceId: string, startAddress: number, values: number[]): Promise<void> =>
    invoke('write_multiple_registers', { deviceId, startAddress, values }),

  saveWatchlist: (deviceId: string, entries: WatchlistEntry[]): Promise<void> =>
    invoke('save_watchlist', {
      deviceId,
      entries: entries.map((e) => ({
        id: e.id,
        name: e.name,
        register_type: e.registerType,
        address: e.address,
      })),
    }),

  // Simulator commands
  startSimulator: (port: number): Promise<void> =>
    invoke('start_simulator', { port }),

  stopSimulator: (): Promise<void> =>
    invoke('stop_simulator'),

  getSimState: (start: number, count: number): Promise<SimulatorState> =>
    invoke('get_sim_state', { start, count }),

  setSimCoil: (addr: number, value: boolean): Promise<void> =>
    invoke('set_sim_coil', { addr, value }),

  setSimDiscrete: (addr: number, value: boolean): Promise<void> =>
    invoke('set_sim_discrete', { addr, value }),

  setSimInputReg: (addr: number, value: number): Promise<void> =>
    invoke('set_sim_input_reg', { addr, value }),

  setSimHoldingReg: (addr: number, value: number): Promise<void> =>
    invoke('set_sim_holding_reg', { addr, value }),

  loadWatchlist: (deviceId: string): Promise<WatchlistEntry[]> =>
    invoke<Array<{
      id: string;
      name: string;
      register_type: RegisterType;
      address: number;
    }>>('load_watchlist', { deviceId }).then((raw) =>
      raw.map((r) => ({
        id: r.id,
        name: r.name,
        registerType: r.register_type,
        address: r.address,
      }))
    ),

  saveDevices: (devices: Device[]): Promise<void> =>
    invoke('save_devices', {
      devices: devices.map((d) => ({
        id: d.id,
        ip: d.ip,
        port: d.port,
        unitId: d.unitId,
        name: d.name,
      })),
    }),

  loadDevices: (): Promise<Array<Omit<Device, 'connected'>>> =>
    invoke<Array<{ id: string; ip: string; port: number; unitId: number; name: string }>>(
      'load_devices'
    ),

  loadSimState: (): Promise<void> =>
    invoke('load_sim_state'),
};

