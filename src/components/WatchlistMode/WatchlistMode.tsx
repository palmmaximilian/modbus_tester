import { useEffect, useRef, useState } from 'react';
import { Trash2, RefreshCw, Play, Square } from 'lucide-react';
import toast from 'react-hot-toast';
import { v4 as uuid } from 'uuid';
import { api } from '../../lib/api';
import { useAppStore } from '../../store/useAppStore';
import type { RegisterType, WatchlistEntry } from '../../types';

const REGISTER_TYPES: { value: RegisterType; label: string }[] = [
  { value: 'coil',     label: 'Coil (0x)'              },
  { value: 'discrete', label: 'Discrete Input (1x)'     },
  { value: 'input',    label: 'Input Register (3x)'     },
  { value: 'holding',  label: 'Holding Register (4x)'   },
];

interface Props {
  deviceId: string;
}

export default function WatchlistMode({ deviceId }: Props) {
  const { watchlists, setWatchlist, removeWatchlistEntry, updateWatchlistEntry } = useAppStore();
  const entries = watchlists[deviceId] ?? [];

  const [liveValues, setLiveValues] = useState<Record<string, number | boolean>>({});
  const [polling, setPolling] = useState(false);
  const [pollInterval, setPollInterval] = useState(2000);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Add form state
  const [newType, setNewType] = useState<RegisterType>('holding');
  const [newAddress, setNewAddress] = useState('');
  const [newName, setNewName] = useState('');

  // Inline edit for name
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Write state per entry
  const [writeId, setWriteId] = useState<string | null>(null);
  const [writeVal, setWriteVal] = useState('');

  useEffect(() => {
    // Load watchlist from disk on mount
    api.loadWatchlist(deviceId).then((loaded) => {
      if (loaded.length > 0) setWatchlist(deviceId, loaded);
    }).catch(() => {});
  }, [deviceId]);

  const save = (updated: WatchlistEntry[]) => {
    api.saveWatchlist(deviceId, updated).catch(() => {});
  };

  const readAll = async () => {
    const results: Record<string, number | boolean> = {};
    await Promise.allSettled(
      entries.map(async (e) => {
        try {
          let val: number | boolean;
          if (e.registerType === 'coil') {
            const r = await api.readCoils(deviceId, e.address, 1);
            val = r[0];
          } else if (e.registerType === 'discrete') {
            const r = await api.readDiscreteInputs(deviceId, e.address, 1);
            val = r[0];
          } else if (e.registerType === 'input') {
            const r = await api.readInputRegisters(deviceId, e.address, 1);
            val = r[0];
          } else {
            const r = await api.readHoldingRegisters(deviceId, e.address, 1);
            val = r[0];
          }
          results[e.id] = val;
        } catch {
          // leave stale
        }
      })
    );
    setLiveValues((prev) => ({ ...prev, ...results }));
  };

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setPolling(true);
    pollRef.current = setInterval(readAll, pollInterval);
  };

  const stopPolling = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setPolling(false);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const addr = parseInt(newAddress, 10);
    if (isNaN(addr) || addr < 0 || addr > 65535) { toast.error('Invalid address'); return; }
    const entry: WatchlistEntry = {
      id: uuid(),
      name: newName.trim() || `${newType.toUpperCase()} ${addr}`,
      registerType: newType,
      address: addr,
    };
    const updated = [...entries, entry];
    setWatchlist(deviceId, updated);
    save(updated);
    setNewAddress('');
    setNewName('');
  };

  const handleRemove = (id: string) => {
    removeWatchlistEntry(deviceId, id);
    const updated = entries.filter((e) => e.id !== id);
    save(updated);
  };

  const commitName = (id: string) => {
    updateWatchlistEntry(deviceId, id, { name: editName });
    const updated = entries.map((e) => e.id === id ? { ...e, name: editName } : e);
    save(updated);
    setEditId(null);
  };

  const handleWrite = async (entry: WatchlistEntry) => {
    try {
      if (entry.registerType === 'coil') {
        const v = writeVal === '1' || writeVal.toLowerCase() === 'true';
        await api.writeSingleCoil(deviceId, entry.address, v);
        setLiveValues((prev) => ({ ...prev, [entry.id]: v }));
      } else {
        const v = parseInt(writeVal, 10);
        if (isNaN(v)) { toast.error('Invalid value'); return; }
        await api.writeSingleRegister(deviceId, entry.address, v);
        setLiveValues((prev) => ({ ...prev, [entry.id]: v }));
      }
      setWriteId(null);
      toast.success('Written');
    } catch (e) {
      toast.error(`Write failed: ${String(e)}`);
    }
  };

  const formatValue = (entry: WatchlistEntry): string => {
    const v = liveValues[entry.id];
    if (v === undefined) return '—';
    if (typeof v === 'boolean') return v ? 'ON' : 'OFF';
    const uint = v as number;
    const signed = uint > 32767 ? uint - 65536 : uint;
    return `${uint} / ${signed}`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <button
          onClick={readAll}
          className="btn-primary flex items-center gap-1.5 text-sm py-1.5"
        >
          <RefreshCw size={13} />
          Read All
        </button>

        <div className="flex items-center gap-2">
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

        <span className="ml-auto text-xs text-gray-400">{entries.length} entries</span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm gap-2">
            <p>No entries yet.</p>
            <p>Add registers below, or cherry-pick from Discovery mode.</p>
          </div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-white z-10 shadow-sm">
              <tr>
                <th className="th">Name</th>
                <th className="th w-36">Type</th>
                <th className="th w-24">Address</th>
                <th className="th w-40">Value</th>
                <th className="th w-48">Write</th>
                <th className="th w-10"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isBoolean = entry.registerType === 'coil' || entry.registerType === 'discrete';
                const val = liveValues[entry.id];
                const isOn = val === true;
                return (
                  <tr key={entry.id} className={`border-b border-gray-50 hover:bg-gray-50 ${isBoolean && isOn ? 'bg-green-50' : ''}`}>
                    <td className="td">
                      {editId === entry.id ? (
                        <input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onBlur={() => commitName(entry.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter') commitName(entry.id); }}
                          className="input w-full text-sm py-0.5"
                        />
                      ) : (
                        <button
                          onClick={() => { setEditId(entry.id); setEditName(entry.name); }}
                          className="text-left hover:underline text-gray-800"
                        >
                          {entry.name}
                        </button>
                      )}
                    </td>
                    <td className="td w-36 text-xs text-gray-500 uppercase tracking-wide">{entry.registerType}</td>
                    <td className="td w-24 font-mono text-gray-500">{entry.address}</td>
                    <td className="td w-40 font-mono font-medium">
                      {isBoolean ? (
                        <span className={`inline-flex items-center gap-1.5 ${isOn ? 'text-green-600' : 'text-gray-400'}`}>
                          <span className={`w-2 h-2 rounded-full ${isOn ? 'bg-green-500' : 'bg-gray-300'}`} />
                          {val === undefined ? '—' : isOn ? 'ON' : 'OFF'}
                        </span>
                      ) : (
                        formatValue(entry)
                      )}
                    </td>
                    <td className="td w-48">
                      {(entry.registerType === 'coil' || entry.registerType === 'holding') && (
                        writeId === entry.id ? (
                          <div className="flex gap-1">
                            {entry.registerType === 'coil' ? (
                              <select
                                value={writeVal}
                                onChange={(e) => setWriteVal(e.target.value)}
                                className="input text-sm py-0.5 w-20"
                              >
                                <option value="1">ON</option>
                                <option value="0">OFF</option>
                              </select>
                            ) : (
                              <input
                                type="number"
                                value={writeVal}
                                onChange={(e) => setWriteVal(e.target.value)}
                                className="input w-24 py-0.5 text-sm"
                                min={0}
                                max={65535}
                              />
                            )}
                            <button onClick={() => handleWrite(entry)} className="btn-primary text-xs py-0.5 px-2">Set</button>
                            <button onClick={() => setWriteId(null)} className="btn-ghost text-xs py-0.5 px-2">✕</button>
                          </div>
                        ) : (
                          entry.registerType === 'coil' ? (
                            <button
                              onClick={() => {
                                const next = !isOn;
                                api.writeSingleCoil(deviceId, entry.address, next)
                                  .then(() => setLiveValues((p) => ({ ...p, [entry.id]: next })))
                                  .catch((e) => toast.error(String(e)));
                              }}
                              className={`text-xs px-3 py-0.5 rounded font-medium ${isOn ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            >
                              Toggle
                            </button>
                          ) : (
                            <button
                              onClick={() => { setWriteId(entry.id); setWriteVal(String(val ?? 0)); }}
                              className="btn-ghost text-xs py-0.5 px-2"
                            >
                              Write…
                            </button>
                          )
                        )
                      )}
                    </td>
                    <td className="td w-10">
                      <button
                        onClick={() => handleRemove(entry.id)}
                        className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add row form */}
      <form onSubmit={handleAdd} className="flex items-end gap-2 px-4 py-3 border-t border-gray-200 bg-white flex-wrap">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Type</label>
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as RegisterType)}
            className="input text-sm py-1"
          >
            {REGISTER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Address</label>
          <input
            type="number"
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
            placeholder="0"
            min={0}
            max={65535}
            className="input w-24 text-sm py-1"
            required
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-gray-500 mb-1">Name (optional)</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Pump ON"
            className="input w-full text-sm py-1"
          />
        </div>
        <button type="submit" className="btn-primary text-sm py-1.5">Add</button>
      </form>
    </div>
  );
}
