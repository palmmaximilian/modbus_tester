/**
 * Thin logging wrapper around api.
 * Every Modbus request logs a TX entry, then patches it with RX or error.
 */
import { api } from './api';
import { useAppStore } from '../store/useAppStore';

function push(...args: Parameters<ReturnType<typeof useAppStore.getState>['pushLog']>) {
  useAppStore.getState().pushLog(...args);
}

function fcLabel(fc: number) { return `FC${fc}`; }

export const loggedApi = {
  // ── reads ──────────────────────────────────────────────────────────────────

  readCoils: async (deviceId: string, start: number, count: number): Promise<boolean[]> => {
    push({ level: 'tx', deviceId, fc: fcLabel(1), detail: `addr=${start} count=${count}` });
    try {
      const res = await api.readCoils(deviceId, start, count);
      push({ level: 'rx', deviceId, fc: fcLabel(1), detail: `addr=${start} count=${count}`, result: `[${res.map(Number).join(', ')}]` });
      return res;
    } catch (e) {
      push({ level: 'error', deviceId, fc: fcLabel(1), detail: `addr=${start} count=${count}`, result: String(e) });
      throw e;
    }
  },

  readDiscreteInputs: async (deviceId: string, start: number, count: number): Promise<boolean[]> => {
    push({ level: 'tx', deviceId, fc: fcLabel(2), detail: `addr=${start} count=${count}` });
    try {
      const res = await api.readDiscreteInputs(deviceId, start, count);
      push({ level: 'rx', deviceId, fc: fcLabel(2), detail: `addr=${start} count=${count}`, result: `[${res.map(Number).join(', ')}]` });
      return res;
    } catch (e) {
      push({ level: 'error', deviceId, fc: fcLabel(2), detail: `addr=${start} count=${count}`, result: String(e) });
      throw e;
    }
  },

  readHoldingRegisters: async (deviceId: string, start: number, count: number): Promise<number[]> => {
    push({ level: 'tx', deviceId, fc: fcLabel(3), detail: `addr=${start} count=${count}` });
    try {
      const res = await api.readHoldingRegisters(deviceId, start, count);
      push({ level: 'rx', deviceId, fc: fcLabel(3), detail: `addr=${start} count=${count}`, result: `[${res.join(', ')}]` });
      return res;
    } catch (e) {
      push({ level: 'error', deviceId, fc: fcLabel(3), detail: `addr=${start} count=${count}`, result: String(e) });
      throw e;
    }
  },

  readInputRegisters: async (deviceId: string, start: number, count: number): Promise<number[]> => {
    push({ level: 'tx', deviceId, fc: fcLabel(4), detail: `addr=${start} count=${count}` });
    try {
      const res = await api.readInputRegisters(deviceId, start, count);
      push({ level: 'rx', deviceId, fc: fcLabel(4), detail: `addr=${start} count=${count}`, result: `[${res.join(', ')}]` });
      return res;
    } catch (e) {
      push({ level: 'error', deviceId, fc: fcLabel(4), detail: `addr=${start} count=${count}`, result: String(e) });
      throw e;
    }
  },

  // ── writes ─────────────────────────────────────────────────────────────────

  writeSingleCoil: async (deviceId: string, address: number, value: boolean): Promise<void> => {
    push({ level: 'tx', deviceId, fc: fcLabel(5), detail: `addr=${address} value=${value ? 1 : 0}` });
    try {
      await api.writeSingleCoil(deviceId, address, value);
      push({ level: 'rx', deviceId, fc: fcLabel(5), detail: `addr=${address} value=${value ? 1 : 0}`, result: 'OK' });
    } catch (e) {
      push({ level: 'error', deviceId, fc: fcLabel(5), detail: `addr=${address} value=${value ? 1 : 0}`, result: String(e) });
      throw e;
    }
  },

  writeSingleRegister: async (deviceId: string, address: number, value: number): Promise<void> => {
    push({ level: 'tx', deviceId, fc: fcLabel(6), detail: `addr=${address} value=${value}` });
    try {
      await api.writeSingleRegister(deviceId, address, value);
      push({ level: 'rx', deviceId, fc: fcLabel(6), detail: `addr=${address} value=${value}`, result: 'OK' });
    } catch (e) {
      push({ level: 'error', deviceId, fc: fcLabel(6), detail: `addr=${address} value=${value}`, result: String(e) });
      throw e;
    }
  },

  writeMultipleCoils: async (deviceId: string, startAddress: number, values: boolean[]): Promise<void> => {
    push({ level: 'tx', deviceId, fc: fcLabel(15), detail: `addr=${startAddress} count=${values.length} values=[${values.map(Number).join(', ')}]` });
    try {
      await api.writeMultipleCoils(deviceId, startAddress, values);
      push({ level: 'rx', deviceId, fc: fcLabel(15), detail: `addr=${startAddress} count=${values.length}`, result: 'OK' });
    } catch (e) {
      push({ level: 'error', deviceId, fc: fcLabel(15), detail: `addr=${startAddress} count=${values.length}`, result: String(e) });
      throw e;
    }
  },

  writeMultipleRegisters: async (deviceId: string, startAddress: number, values: number[]): Promise<void> => {
    push({ level: 'tx', deviceId, fc: fcLabel(16), detail: `addr=${startAddress} count=${values.length} values=[${values.join(', ')}]` });
    try {
      await api.writeMultipleRegisters(deviceId, startAddress, values);
      push({ level: 'rx', deviceId, fc: fcLabel(16), detail: `addr=${startAddress} count=${values.length}`, result: 'OK' });
    } catch (e) {
      push({ level: 'error', deviceId, fc: fcLabel(16), detail: `addr=${startAddress} count=${values.length}`, result: String(e) });
      throw e;
    }
  },

  // ── pass-through (no logging needed) ──────────────────────────────────────
  scanNetwork: api.scanNetwork,
  connectDevice: api.connectDevice,
  disconnectDevice: api.disconnectDevice,
  saveWatchlist: api.saveWatchlist,
  loadWatchlist: api.loadWatchlist,
  saveDevices: api.saveDevices,
  loadDevices: api.loadDevices,
  loadSimState: api.loadSimState,
  startSimulator: api.startSimulator,
  stopSimulator: api.stopSimulator,
  getSimState: api.getSimState,
  setSimCoil: api.setSimCoil,
  setSimDiscrete: api.setSimDiscrete,
  setSimInputReg: api.setSimInputReg,
  setSimHoldingReg: api.setSimHoldingReg,
};
