import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { LogEntry } from '../../store/useAppStore';

function formatTime(ts: number) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

function rowClass(e: LogEntry) {
  if (e.level === 'error') return 'text-red-400';
  if (e.level === 'rx') return 'text-green-400';
  return 'text-blue-300';
}

function levelLabel(e: LogEntry) {
  if (e.level === 'tx') return '→ TX';
  if (e.level === 'rx') return '← RX';
  return '✕ ERR';
}

export default function ConsolePanel() {
  const log = useAppStore((s) => s.log);
  const clearLog = useAppStore((s) => s.clearLog);
  const devices = useAppStore((s) => s.devices);

  const [open, setOpen] = useState(false);
  const [filterDevice, setFilterDevice] = useState<string>('all');
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const filtered = log.filter((e) => {
    if (filterDevice !== 'all' && e.deviceId !== filterDevice) return false;
    if (filterLevel !== 'all' && e.level !== filterLevel) return false;
    return true;
  });

  useEffect(() => {
    if (autoScroll && open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filtered.length, autoScroll, open]);

  return (
    <div className="border-t border-gray-700 bg-gray-900 flex flex-col" style={{ flexShrink: 0 }}>
      {/* Header bar */}
      <div className="flex items-center gap-3 px-3 py-1.5 select-none cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <span className="text-xs font-mono font-semibold text-gray-300 flex items-center gap-1.5">
          {open ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          Console
        </span>
        <span className="text-xs text-gray-500">{log.length} entries</span>

        {/* Filters — only visible when open, stop click from toggling panel */}
        {open && (
          <div className="flex items-center gap-2 ml-2" onClick={(e) => e.stopPropagation()}>
            <select
              value={filterDevice}
              onChange={(e) => setFilterDevice(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-1.5 py-0.5"
            >
              <option value="all">All devices</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-1.5 py-0.5"
            >
              <option value="all">All</option>
              <option value="tx">TX only</option>
              <option value="rx">RX only</option>
              <option value="error">Errors only</option>
            </select>
            <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="accent-blue-500"
              />
              Auto-scroll
            </label>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={clearLog}
            title="Clear console"
            className="text-gray-500 hover:text-gray-300 p-0.5 rounded"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Log body */}
      {open && (
        <div className="overflow-auto font-mono text-xs" style={{ height: 200 }}>
          {filtered.length === 0 ? (
            <div className="text-gray-600 px-3 py-4 text-center">No entries yet</div>
          ) : (
            <table className="w-full border-collapse">
              <tbody>
                {filtered.map((e) => {
                  const dev = e.deviceId ? (devices.find((d) => d.id === e.deviceId)?.name ?? e.deviceId.slice(0, 8)) : '—';
                  return (
                    <tr key={e.id} className={`border-b border-gray-800 hover:bg-gray-800/50 ${rowClass(e)}`}>
                      <td className="px-3 py-0.5 whitespace-nowrap text-gray-500 w-32">{formatTime(e.ts)}</td>
                      <td className="px-2 py-0.5 whitespace-nowrap w-14">{levelLabel(e)}</td>
                      <td className="px-2 py-0.5 whitespace-nowrap w-14 text-yellow-400">{e.fc}</td>
                      <td className="px-2 py-0.5 whitespace-nowrap w-32 text-gray-400">{dev}</td>
                      <td className="px-2 py-0.5 whitespace-nowrap text-gray-300">{e.detail}</td>
                      <td className="px-2 py-0.5 text-gray-400 break-all max-w-xs">{e.result ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
