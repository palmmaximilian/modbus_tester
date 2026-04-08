export type RegisterType = 'coil' | 'discrete' | 'input' | 'holding';

export interface Device {
  id: string;         // uuid
  ip: string;
  port: number;
  unitId: number;
  name: string;
  connected: boolean;
}

export interface WatchlistEntry {
  id: string;
  name: string;
  registerType: RegisterType;
  address: number;
  value?: number | boolean;
}

export interface DiscoveryRow {
  address: number;
  registerType: RegisterType;
  value: number | boolean | null;
}

export type AppMode = 'discovery' | 'watchlist';

export interface SimulatorState {
  running: boolean;
  coils: boolean[];
  discrete_inputs: boolean[];
  input_registers: number[];
  holding_registers: number[];
}

export interface AddressRange {
  start: number;
  end: number;
}

export const REGISTER_PRESETS: Record<string, AddressRange> = {
  '0–999':   { start: 0, end: 999 },
  '0–9999':  { start: 0, end: 9999 },
  '0–65535': { start: 0, end: 65535 },
};
