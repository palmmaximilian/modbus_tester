import { useState, useCallback, useRef } from 'react';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { RefreshCw, Play, Square } from 'lucide-react';
import toast from 'react-hot-toast';
import { loggedApi as api } from '../../lib/loggedApi';
import { useAppStore } from '../../store/useAppStore';
import type { RegisterType, DiscoveryRow, AddressRange } from '../../types';
import { REGISTER_PRESETS } from '../../types';
import { v4 as uuid } from 'uuid';

import CoilsTable from './CoilsTable';
import RegistersTable from './RegistersTable';

const TABS: { key: RegisterType; label: string; writable: boolean }[] = [
  { key: 'coil',     label: 'Coils (0x)',              writable: true  },
  { key: 'discrete', label: 'Discrete Inputs (1x)',     writable: false },
  { key: 'input',    label: 'Input Registers (3x)',     writable: false },
  { key: 'holding',  label: 'Holding Registers (4x)',   writable: true  },
];

interface Props {
  deviceId: string;
}

export default function DiscoveryMode({ deviceId }: Props) {
  const [activeTab, setActiveTab] = useState<RegisterType>('coil');
  const [range, setRange] = useState<AddressRange>({ start: 0, end: 999 });
  const [presetKey, setPresetKey] = useState<string>('0–999');
  const [rows, setRows] = useState<Partial<Record<RegisterType, DiscoveryRow[]>>>({});
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [pollInterval, setPollInterval] = useState(2000);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // FC16 write-block state
  const [showWriteBlock, setShowWriteBlock] = useState(false);
  const [wbStart, setWbStart] = useState('');
  const [wbValues, setWbValues] = useState('');
  const [wbBusy, setWbBusy] = useState(false);

  const { addWatchlistEntry, watchlists } = useAppStore();
  const devices = useAppStore((s) => s.devices);

  const openProbe = async () => {
    const winLabel = `probe-${deviceId}`;
    const existing = await WebviewWindow.getByLabel(winLabel);
    if (existing) { await existing.setFocus(); return; }
    const dev = devices.find((d) => d.id === deviceId);
    const devName = dev?.name ?? 'Device';
    const url = `/?probe=1&deviceId=${encodeURIComponent(deviceId)}&devName=${encodeURIComponent(devName)}&start=${range.start}&end=${range.end}`;
    const win = new WebviewWindow(winLabel, {
      url,
      title: `Probe – ${devName}`,
      width: 420,
      height: 540,
      alwaysOnTop: true,
      resizable: true,
    });
    win.once('tauri://error', (e) => console.error('Probe window error', e));
  };

  const readTab = useCallback(async (tab: RegisterType, r: AddressRange) => {
    const count = r.end - r.start + 1;
    if (count <= 0 || count > 65536) { toast.error('Invalid address range'); return; }
    setLoading(true);
    try {
      let values: (boolean | number)[];
      if (tab === 'coil')     values = await api.readCoils(deviceId, r.start, count);
      else if (tab === 'discrete') values = await api.readDiscreteInputs(deviceId, r.start, count);
      else if (tab === 'input')    values = await api.readInputRegisters(deviceId, r.start, count);
      else                         values = await api.readHoldingRegisters(deviceId, r.start, count);

      const newRows: DiscoveryRow[] = values.map((v, i) => ({
        address: r.start + i,
        registerType: tab,
        value: v,
      }));
      setRows((prev) => ({ ...prev, [tab]: newRows }));
    } catch (e) {
      toast.error(`Read failed: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setPolling(true);
    pollRef.current = setInterval(() => {
      readTab(activeTab, range);
    }, pollInterval);
  };

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setPolling(false);
  };

  const handlePreset = (key: string) => {
    setPresetKey(key);
    if (key === 'custom') return;
    setRange(REGISTER_PRESETS[key]);
  };

  const handleAddToWatchlist = (row: DiscoveryRow) => {
    const existing = watchlists[deviceId] ?? [];
    const alreadyExists = existing.some(
      (e) => e.registerType === row.registerType && e.address === row.address
    );
    if (alreadyExists) { toast('Already in watchlist'); return; }
    const entry = {
      id: uuid(),
      name: `${row.registerType.toUpperCase()} ${row.address}`,
      registerType: row.registerType,
      address: row.address,
    };
    addWatchlistEntry(deviceId, entry);
    const updated = [...existing, entry];
    api.saveWatchlist(deviceId, updated).catch(() => {});
    toast.success('Added to watchlist');
  };

  const handleWriteCoil = async (address: number, value: boolean) => {
    try {
      await api.writeSingleCoil(deviceId, address, value);
      setRows((prev) => ({
        ...prev,
        coil: (prev.coil ?? []).map((r) =>
          r.address === address ? { ...r, value } : r
        ),
      }));
    } catch (e) {
      toast.error(`Write failed: ${String(e)}`);
    }
  };

  const handleWriteRegister = async (address: number, value: number) => {
    try {
      await api.writeSingleRegister(deviceId, address, value);
      setRows((prev) => ({
        ...prev,
        [activeTab]: (prev[activeTab] ?? []).map((r) =>
          r.address === address ? { ...r, value } : r
        ),
      }));
    } catch (e) {
      toast.error(`Write failed: ${String(e)}`);
    }
  };

  const handleWriteBlock = async () => {
    const start = parseInt(wbStart, 10);
    if (isNaN(start) || start < 0 || start > 65535) { toast.error('Invalid start address'); return; }
    const values = wbValues.split(',').map((s) => parseInt(s.trim(), 10));
    if (values.some(isNaN) || values.some((v) => v < 0 || v > 65535)) {
      toast.error('Values must be comma-separated integers 0–65535'); return;
    }
    if (values.length === 0) { toast.error('Enter at least one value'); return; }
    setWbBusy(true);
    try {
      await api.writeMultipleRegisters(deviceId, start, values);
      toast.success(`FC16: wrote ${values.length} register${values.length > 1 ? 's' : ''} from address ${start}`);
    } catch (e) {
      toast.error(`FC16 write failed: ${String(e)}`);
    } finally {
      setWbBusy(false);
    }
  };

  const exportCsv = () => {
    const tabRows = rows[activeTab] ?? [];
    if (tabRows.length === 0) { toast('No data to export'); return; }
    const header = 'Address,Type,Value\n';
    const body = tabRows.map((r) => `${r.address},${r.registerType},${r.value}`).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `modbus_${activeTab}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentTab = TABS.find((t) => t.key === activeTab)!;
  const currentRows = rows[activeTab] ?? [];
  const markedAddresses = new Set(
    (watchlists[deviceId] ?? [])
      .filter((e) => e.registerType === activeTab)
      .map((e) => e.address)
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-4 pt-3">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); stopPolling(); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors mr-1 ${
              activeTab === tab.key
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">Range preset</label>
          <select
            value={presetKey}
            onChange={(e) => handlePreset(e.target.value)}
            className="input text-sm py-1"
          >
            {Object.keys(REGISTER_PRESETS).map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
            <option value="custom">Custom…</option>
          </select>
        </div>

        {presetKey === 'custom' && (
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={range.start}
              onChange={(e) => setRange((r) => ({ ...r, start: Number(e.target.value) }))}
              className="input w-24 text-sm py-1"
              placeholder="Start"
            />
            <span className="text-gray-400">–</span>
            <input
              type="number"
              value={range.end}
              onChange={(e) => setRange((r) => ({ ...r, end: Number(e.target.value) }))}
              className="input w-24 text-sm py-1"
              placeholder="End"
            />
          </div>
        )}

        <button
          onClick={() => readTab(activeTab, range)}
          disabled={loading}
          className="btn-primary flex items-center gap-1.5 text-sm py-1.5"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Read Now
        </button>

        <div className="flex items-center gap-2 ml-2">
          <label className="text-xs text-gray-500">Poll</label>
          <select
            value={pollInterval}
            onChange={(e) => setPollInterval(Number(e.target.value))}
            className="input text-sm py-1"
          >
            <option value={100}>100 ms</option>
            <option value={250}>250 ms</option>
            <option value={500}>500 ms</option>
            <option value={1000}>1 s</option>
            <option value={2000}>2 s</option>
            <option value={5000}>5 s</option>
            <option value={10000}>10 s</option>
          </select>
          {polling ? (
            <button onClick={stopPolling} className="btn-danger flex items-center gap-1 text-sm py-1.5">
              <Square size={12} /> Stop
            </button>
          ) : (
            <button onClick={startPolling} className="btn-ghost flex items-center gap-1 text-sm py-1.5">
              <Play size={12} /> Start
            </button>
          )}
        </div>

        {activeTab === 'coil' && (
          <button onClick={openProbe} className="btn-ghost text-sm py-1.5">
            Probe…
          </button>
        )}
        {activeTab === 'holding' && (
          <button
            onClick={() => { setShowWriteBlock((v) => !v); setWbStart(String(range.start)); }}
            className={`btn-ghost text-sm py-1.5 ${showWriteBlock ? 'bg-blue-50 text-blue-600' : ''}`}
          >
            Write Block (FC16)…
          </button>
        )}
        <button onClick={exportCsv} className="btn-ghost text-sm py-1.5 ml-auto">
          Export CSV
        </button>
      </div>

      {/* FC16 write-block panel */}
      {showWriteBlock && activeTab === 'holding' && (
        <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 border-b border-blue-100 flex-wrap">
          <span className="text-xs font-medium text-blue-700">FC16 Write Block</span>
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">Start address</label>
            <input
              type="number"
              value={wbStart}
              onChange={(e) => setWbStart(e.target.value)}
              className="input w-24 text-sm py-1"
              min={0}
              max={65535}
            />
          </div>
          <div className="flex items-center gap-1.5 flex-1">
            <label className="text-xs text-gray-500">Values (comma-separated)</label>
            <input
              type="text"
              value={wbValues}
              onChange={(e) => setWbValues(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleWriteBlock(); }}
              placeholder="e.g. 100, 200, 300"
              className="input text-sm py-1 flex-1 min-w-48"
            />
          </div>
          <button
            onClick={handleWriteBlock}
            disabled={wbBusy}
            className="btn-primary text-sm py-1.5"
          >
            {wbBusy ? 'Writing…' : 'Send'}
          </button>
          <button onClick={() => setShowWriteBlock(false)} className="btn-ghost text-sm py-1.5">✕</button>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-hidden min-h-0">
        {(activeTab === 'coil' || activeTab === 'discrete') ? (
          <CoilsTable
            rows={currentRows as DiscoveryRow[]}
            writable={currentTab.writable}
            markedAddresses={markedAddresses}
            onWrite={handleWriteCoil}
            onAddToWatchlist={handleAddToWatchlist}
          />
        ) : (
          <RegistersTable
            rows={currentRows as DiscoveryRow[]}
            writable={currentTab.writable}
            markedAddresses={markedAddresses}
            onWrite={handleWriteRegister}
            onAddToWatchlist={handleAddToWatchlist}
          />
        )}
      </div>
    </div>
  );
}
