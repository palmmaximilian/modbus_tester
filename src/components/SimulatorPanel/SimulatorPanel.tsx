import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuid } from 'uuid';
import toast from 'react-hot-toast';
import { emit } from '@tauri-apps/api/event';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '../../lib/api';
import type { SimulatorState } from '../../types';
import { useAppStore } from '../../store/useAppStore';

const DEFAULT_PORT = 5020;
const POLL_INTERVAL_MS = 1000;
const DEFAULT_START = 0;
const DEFAULT_END = 999;

type Tab = 'coils' | 'discrete' | 'input' | 'holding';

interface Props {
  standalone?: boolean;
}

export default function SimulatorPanel({ standalone }: Props) {
  const addDevice = useAppStore((s) => s.addDevice);
  const devices = useAppStore((s) => s.devices);

  const [port, setPort] = useState(DEFAULT_PORT);
  const [running, setRunning] = useState(false);
  const [simState, setSimState] = useState<SimulatorState | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('coils');
  const [rangeStart, setRangeStart] = useState(DEFAULT_START);
  const [rangeEnd, setRangeEnd] = useState(DEFAULT_END);
  const [editingCell, setEditingCell] = useState<{ addr: number; draft: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  // keep stable refs so interval doesn't go stale
  const rangeStartRef = useRef(rangeStart);
  const rangeEndRef = useRef(rangeEnd);
  rangeStartRef.current = rangeStart;
  rangeEndRef.current = rangeEnd;

  // ── Polling ──────────────────────────────────────────────────────────────

  const fetchState = useCallback(async () => {
    try {
      const start = rangeStartRef.current;
      const count = Math.max(1, rangeEndRef.current - start + 1);
      const s = await api.getSimState(start, count);
      setRunning(s.running);
      setSimState(s);
    } catch {
      // ignore transient errors
    }
  }, []);

  useEffect(() => {
    fetchState();
    pollRef.current = setInterval(fetchState, POLL_INTERVAL_MS);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchState]);

  // Refetch immediately whenever the range changes
  useEffect(() => {
    setSimState(null);
    fetchState();
  }, [rangeStart, rangeEnd, fetchState]);

  // ── Start / Stop ─────────────────────────────────────────────────────────

  const handleStart = async () => {
    if (port < 1 || port > 65535) { toast.error('Invalid port number'); return; }
    try {
      await api.startSimulator(port);
      toast.success(`Simulator started on port ${port}`);
      await fetchState();
    } catch (err) { toast.error(String(err)); }
  };

  const handleStop = async () => {
    try {
      await api.stopSimulator();
      toast.success('Simulator stopped');
      await fetchState();
    } catch (err) { toast.error(String(err)); }
  };

  // ── Connect app → simulator ───────────────────────────────────────────────

  const handleConnectSelf = async () => {
    const device = { id: uuid(), ip: '127.0.0.1', port, unitId: 1, name: `Simulator :${port}`, connected: false };
    const alreadyExists = devices.some(
      (d) => d.ip === device.ip && d.port === device.port && d.unitId === device.unitId
    );
    if (standalone) {
      await emit('sim:add-device', device);
    } else {
      if (alreadyExists) { toast('Device already in sidebar'); return; }
      addDevice(device);
      toast.success('Added 127.0.0.1 to devices — click it in the sidebar to connect');
    }
  };

  // ── Inline boolean toggle ─────────────────────────────────────────────────

  const handleToggle = async (addr: number, current: boolean) => {
    try {
      if (activeTab === 'coils') await api.setSimCoil(addr, !current);
      else await api.setSimDiscrete(addr, !current);
      await fetchState();
    } catch (err) { toast.error(String(err)); }
  };

  // ── Inline register edit ──────────────────────────────────────────────────

  const commitEdit = async (addr: number, draft: string) => {
    setEditingCell(null);
    const num = parseInt(draft, 10);
    if (isNaN(num) || num < 0 || num > 65535) { toast.error('Value must be 0–65535'); return; }
    try {
      if (activeTab === 'input') await api.setSimInputReg(addr, num);
      else await api.setSimHoldingReg(addr, num);
      await fetchState();
    } catch (err) { toast.error(String(err)); }
  };

  // ── Virtual rows ──────────────────────────────────────────────────────────

  const isBoolean = activeTab === 'coils' || activeTab === 'discrete';

  const displayRows: { addr: number; value: boolean | number }[] = simState
    ? simState.coils.map((_, i) => ({
        addr: rangeStart + i,
        value:
          activeTab === 'coils'    ? simState.coils[i]
          : activeTab === 'discrete' ? simState.discrete_inputs[i]
          : activeTab === 'input'    ? simState.input_registers[i]
          : simState.holding_registers[i],
      }))
    : [];

  const virtualizer = useVirtualizer({
    count: displayRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 20,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0
    ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
    : 0;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'coils',    label: 'Coils' },
    { key: 'discrete', label: 'Discrete Inputs' },
    { key: 'input',    label: 'Input Regs' },
    { key: 'holding',  label: 'Holding Regs' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={`flex flex-col bg-white text-gray-900 ${standalone ? 'h-full' : 'h-full'}`}>

      {/* Controls row */}
      <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
          running ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {running ? `Running on :${port}` : 'Stopped'}
        </span>

        <label className="text-sm text-gray-500">Port</label>
        <input
          type="number"
          className="input w-24"
          value={port}
          min={1}
          max={65535}
          disabled={running}
          onChange={(e) => setPort(Number(e.target.value))}
        />

        {running ? (
          <button className="btn-danger" onClick={handleStop}>Stop</button>
        ) : (
          <button className="btn-primary" onClick={handleStart}>Start</button>
        )}

        {running && (
          <button className="btn-ghost" onClick={handleConnectSelf}>
            + Add as device
          </button>
        )}

        <div className="flex items-center gap-1 ml-auto">
          <label className="text-xs text-gray-500">Range</label>
          <input
            type="number"
            value={rangeStart}
            min={0}
            max={65535}
            onChange={(e) => setRangeStart(Math.min(Number(e.target.value), rangeEnd))}
            className="input w-20 text-sm py-1"
          />
          <span className="text-gray-400 text-xs">–</span>
          <input
            type="number"
            value={rangeEnd}
            min={rangeStart}
            max={65535}
            onChange={(e) => setRangeEnd(Math.max(Number(e.target.value), rangeStart))}
            className="input w-20 text-sm py-1"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 flex-shrink-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setActiveTab(t.key); setEditingCell(null); }}
            className={`px-4 py-1.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === t.key
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
        {(activeTab === 'discrete' || activeTab === 'input') && (
          <span className="ml-auto self-center pr-3 text-xs text-gray-400">Read-only in real Modbus</span>
        )}
      </div>

      {/* Virtualised table */}
      <div ref={parentRef} className="flex-1 overflow-auto min-h-0">
        {displayRows.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            {simState ? 'No rows in range' : 'Loading…'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10 shadow-sm">
              <tr>
                <th className="th w-28">Address</th>
                <th className="th">Value</th>
              </tr>
            </thead>
            <tbody>
              {paddingTop > 0 && <tr><td colSpan={2} style={{ height: paddingTop }} /></tr>}
              {virtualItems.map((vi) => {
                const row = displayRows[vi.index];
                return (
                  <tr key={vi.key} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="td font-mono text-gray-500 w-28">{row.addr}</td>
                    <td className="td">
                      {isBoolean ? (
                        <button
                          onClick={() => handleToggle(row.addr, row.value as boolean)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                            row.value ? 'bg-blue-500' : 'bg-gray-300'
                          }`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                            row.value ? 'translate-x-4.5' : 'translate-x-0.5'
                          }`} />
                        </button>
                      ) : editingCell?.addr === row.addr ? (
                        <input
                          autoFocus
                          type="number"
                          className="input py-0 w-28"
                          value={editingCell.draft}
                          min={0}
                          max={65535}
                          onChange={(e) => setEditingCell({ addr: row.addr, draft: e.target.value })}
                          onBlur={() => commitEdit(row.addr, editingCell.draft)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(row.addr, editingCell.draft);
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                        />
                      ) : (
                        <span
                          className="font-mono cursor-text hover:bg-blue-50 px-1 rounded"
                          onClick={() => setEditingCell({ addr: row.addr, draft: String(row.value) })}
                        >
                          {String(row.value)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {paddingBottom > 0 && <tr><td colSpan={2} style={{ height: paddingBottom }} /></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
