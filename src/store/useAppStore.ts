import { create } from 'zustand';
import type { Device, WatchlistEntry, AppMode } from '../types';

export type LogLevel = 'tx' | 'rx' | 'error';

export interface LogEntry {
  id: number;
  ts: number;       // Date.now()
  level: LogLevel;
  deviceId: string | null;
  fc: string;       // e.g. "FC3", "FC16"
  detail: string;   // e.g. "addr=0 count=10" / "addr=0 [100,200]"
  result?: string;  // response summary or error message
}

const MAX_LOG = 500;
let _logSeq = 0;

interface AppState {
  devices: Device[];
  activeDeviceId: string | null;
  mode: AppMode;
  watchlists: Record<string, WatchlistEntry[]>; // keyed by device id

  log: LogEntry[];
  pushLog: (entry: Omit<LogEntry, 'id' | 'ts'>) => void;
  clearLog: () => void;

  addDevice: (device: Device) => void;
  updateDevice: (id: string, patch: Partial<Device>) => void;
  removeDevice: (id: string) => void;
  setActiveDevice: (id: string | null) => void;
  setMode: (mode: AppMode) => void;

  setWatchlist: (deviceId: string, entries: WatchlistEntry[]) => void;
  addWatchlistEntry: (deviceId: string, entry: WatchlistEntry) => void;
  removeWatchlistEntry: (deviceId: string, entryId: string) => void;
  updateWatchlistEntry: (deviceId: string, entryId: string, patch: Partial<WatchlistEntry>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  devices: [],
  activeDeviceId: null,
  mode: 'discovery',
  watchlists: {},
  log: [],

  pushLog: (entry) =>
    set((s) => {
      const full: LogEntry = { id: ++_logSeq, ts: Date.now(), ...entry };
      const log = s.log.length >= MAX_LOG
        ? [...s.log.slice(s.log.length - MAX_LOG + 1), full]
        : [...s.log, full];
      return { log };
    }),

  clearLog: () => set({ log: [] }),

  addDevice: (device) =>
    set((s) => {
      const duplicate = s.devices.some(
        (d) => d.ip === device.ip && d.port === device.port && d.unitId === device.unitId
      );
      if (duplicate) return s;
      return { devices: [...s.devices, device] };
    }),

  updateDevice: (id, patch) =>
    set((s) => ({
      devices: s.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    })),

  removeDevice: (id) =>
    set((s) => ({
      devices: s.devices.filter((d) => d.id !== id),
      activeDeviceId: s.activeDeviceId === id ? null : s.activeDeviceId,
    })),

  setActiveDevice: (id) => set({ activeDeviceId: id }),

  setMode: (mode) => set({ mode }),

  setWatchlist: (deviceId, entries) =>
    set((s) => ({ watchlists: { ...s.watchlists, [deviceId]: entries } })),

  addWatchlistEntry: (deviceId, entry) =>
    set((s) => ({
      watchlists: {
        ...s.watchlists,
        [deviceId]: [...(s.watchlists[deviceId] ?? []), entry],
      },
    })),

  removeWatchlistEntry: (deviceId, entryId) =>
    set((s) => ({
      watchlists: {
        ...s.watchlists,
        [deviceId]: (s.watchlists[deviceId] ?? []).filter((e) => e.id !== entryId),
      },
    })),

  updateWatchlistEntry: (deviceId, entryId, patch) =>
    set((s) => ({
      watchlists: {
        ...s.watchlists,
        [deviceId]: (s.watchlists[deviceId] ?? []).map((e) =>
          e.id === entryId ? { ...e, ...patch } : e
        ),
      },
    })),
}));
