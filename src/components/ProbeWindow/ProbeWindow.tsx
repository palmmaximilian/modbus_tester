import { useEffect, useRef, useState } from 'react';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import toast from 'react-hot-toast';
import { invoke } from '@tauri-apps/api/core';

// Read params from URL: ?probe=1&deviceId=XXX&start=0&end=31&devName=MyDevice
const params = new URLSearchParams(window.location.search);
const DEVICE_ID = params.get('deviceId') ?? '';
const DEV_NAME = params.get('devName') ?? 'Device';
const PARAM_START = Math.max(0, parseInt(params.get('start') ?? '0', 10));
const PARAM_END = Math.min(65535, parseInt(params.get('end') ?? '31', 10));

type ProbeStatus = 'idle' | 'running' | 'paused' | 'done';

interface MarkedCoil {
  address: number;
  label: string;
}

async function writeCoil(deviceId: string, address: number, value: boolean) {
  await invoke('write_single_coil', { deviceId, address, value });
}

export default function ProbeWindow() {
  const [start, setStart] = useState(PARAM_START);
  const [end, setEnd] = useState(PARAM_END);
  const [onMs, setOnMs] = useState(300);
  const [offMs, setOffMs] = useState(700);
  const [status, setStatus] = useState<ProbeStatus>('idle');
  const [currentAddr, setCurrentAddr] = useState<number | null>(null);
  const [progress, setProgress] = useState(0); // 0–1
  const [marked, setMarked] = useState<MarkedCoil[]>([]);
  const [labelDraft, setLabelDraft] = useState('');

  // Control refs — shared with the async probe loop
  const stopRef = useRef(false);
  const pauseRef = useRef(false);
  const currentAddrRef = useRef<number | null>(null);

  // Close window cleanly on unmount / stop
  const closeWindow = () => getCurrentWindow().close();

  // ── Probe loop ────────────────────────────────────────────────────────────

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  const waitIfPaused = async () => {
    while (pauseRef.current && !stopRef.current) {
      await sleep(100);
    }
  };

  const runProbe = async (s: number, e: number, onTime: number, offTime: number) => {
    const total = e - s + 1;
    stopRef.current = false;
    pauseRef.current = false;

    for (let i = 0; i < total; i++) {
      if (stopRef.current) break;
      await waitIfPaused();
      if (stopRef.current) break;

      const addr = s + i;
      setCurrentAddr(addr);
      currentAddrRef.current = addr;
      setProgress(i / total);

      try {
        await writeCoil(DEVICE_ID, addr, true);
        await sleep(onTime);
        if (stopRef.current) { await writeCoil(DEVICE_ID, addr, false); break; }
        await waitIfPaused();
        await writeCoil(DEVICE_ID, addr, false);
        await sleep(offTime);
      } catch (err) {
        toast.error(`Coil ${addr} write failed: ${String(err)}`);
        // try to turn off and continue
        try { await writeCoil(DEVICE_ID, addr, false); } catch { /* ignore */ }
      }
    }

    setProgress(1);
    setCurrentAddr(null);
    currentAddrRef.current = null;
    setStatus('done');
  };

  const handleStart = () => {
    if (end < start) { toast.error('End must be ≥ start'); return; }
    setStatus('running');
    setProgress(0);
    setCurrentAddr(null);
    runProbe(start, end, onMs, offMs);
  };

  const handlePause = () => {
    if (status === 'paused') {
      pauseRef.current = false;
      setStatus('running');
    } else {
      pauseRef.current = true;
      setStatus('paused');
    }
  };

  const handleStop = async () => {
    stopRef.current = true;
    pauseRef.current = false;
    // ensure current coil is left off
    const addr = currentAddrRef.current;
    if (addr !== null) {
      try { await writeCoil(DEVICE_ID, addr, false); } catch { /* ignore */ }
    }
    setStatus('idle');
    setCurrentAddr(null);
    setProgress(0);
  };

  // ── Mark current coil ─────────────────────────────────────────────────────

  const handleMark = async () => {
    const addr = currentAddrRef.current ?? currentAddr;
    if (addr === null) { toast('No coil currently active'); return; }
    const label = labelDraft.trim() || `Coil ${addr}`;
    setMarked((prev) => {
      if (prev.some((m) => m.address === addr)) return prev;
      return [...prev, { address: addr, label }];
    });
    setLabelDraft('');
    // Emit to main window so it can add to watchlist
    try {
      await emit('probe:mark-coil', { deviceId: DEVICE_ID, address: addr, label });
    } catch { /* ignore if main window gone */ }
    toast.success(`Marked Coil ${addr}`);
  };

  const removeMark = (addr: number) =>
    setMarked((prev) => prev.filter((m) => m.address !== addr));

  // Keyboard shortcut: M = mark, Space = pause/resume
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'm' || e.key === 'M') handleMark();
      if (e.key === ' ') { e.preventDefault(); if (status === 'running' || status === 'paused') handlePause(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [status, currentAddr]);

  // ── Render ────────────────────────────────────────────────────────────────

  const total = end - start + 1;
  const pct = Math.round(progress * 100);
  const currentIndex = currentAddr !== null ? currentAddr - start + 1 : 0;

  return (
    <div className="flex flex-col h-screen bg-white text-gray-900 select-none overflow-hidden">

      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Coil Probe</span>
        <span className="text-xs text-gray-400 ml-1">— {DEV_NAME}</span>
        <button
          onClick={closeWindow}
          className="ml-auto text-gray-400 hover:text-gray-700 text-lg leading-none px-1"
          title="Close"
        >×</button>
      </div>

      {/* Settings row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0 text-sm">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">Range</label>
          <input
            type="number" value={start} min={0} max={65535} disabled={status === 'running'}
            onChange={(e) => setStart(Math.max(0, Number(e.target.value)))}
            className="input w-20 py-1 text-sm"
          />
          <span className="text-gray-400">–</span>
          <input
            type="number" value={end} min={0} max={65535} disabled={status === 'running'}
            onChange={(e) => setEnd(Math.min(65535, Number(e.target.value)))}
            className="input w-20 py-1 text-sm"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">ON</label>
          <input
            type="number" value={onMs} min={50} max={10000} disabled={status === 'running'}
            onChange={(e) => setOnMs(Number(e.target.value))}
            className="input w-20 py-1 text-sm"
          />
          <span className="text-xs text-gray-400">ms</span>
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">OFF</label>
          <input
            type="number" value={offMs} min={50} max={10000} disabled={status === 'running'}
            onChange={(e) => setOffMs(Number(e.target.value))}
            className="input w-20 py-1 text-sm"
          />
          <span className="text-xs text-gray-400">ms</span>
        </div>
      </div>

      {/* Main probe display */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">

        {/* Big current coil indicator */}
        <div className="text-center">
          {status === 'idle' && (
            <p className="text-gray-400 text-sm">Press Start to begin probing</p>
          )}
          {status === 'done' && (
            <p className="text-green-600 font-semibold text-lg">Done — all coils probed</p>
          )}
          {(status === 'running' || status === 'paused') && currentAddr !== null && (
            <>
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">
                {status === 'paused' ? 'Paused at' : 'Now probing'}
              </p>
              <p className="text-5xl font-bold tabular-nums text-gray-900">
                Coil {currentAddr}
              </p>
              <p className="text-sm text-gray-400 mt-1">{currentIndex} of {total}</p>
            </>
          )}
        </div>

        {/* Progress bar */}
        {status !== 'idle' && (
          <div className="w-full max-w-sm">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 text-right mt-1">{pct}%</p>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-3">
          {status === 'idle' || status === 'done' ? (
            <button onClick={handleStart} className="btn-primary px-6 py-2">
              {status === 'done' ? 'Restart' : 'Start'}
            </button>
          ) : (
            <>
              <button
                onClick={handlePause}
                className={status === 'paused' ? 'btn-primary px-5 py-2' : 'btn-ghost px-5 py-2'}
              >
                {status === 'paused' ? '▶ Resume' : '⏸ Pause'}
              </button>
              <button onClick={handleStop} className="btn-danger px-5 py-2">
                ⏹ Stop
              </button>
            </>
          )}
        </div>

        {/* Mark controls — only show while running/paused */}
        {(status === 'running' || status === 'paused') && (
          <div className="flex items-center gap-2 w-full max-w-sm">
            <input
              type="text"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleMark(); }}
              placeholder="Optional label…"
              className="input flex-1 py-1 text-sm"
            />
            <button onClick={handleMark} className="btn-ghost px-3 py-1 text-sm" title="Mark current coil (M)">
              📌 Mark
            </button>
          </div>
        )}

        <p className="text-xs text-gray-300">Space = pause/resume · M = mark current coil</p>
      </div>

      {/* Marked coils list */}
      {marked.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-3 flex-shrink-0 max-h-40 overflow-auto">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Marked ({marked.length}) — added to watchlist
          </p>
          <div className="flex flex-wrap gap-2">
            {marked.map((m) => (
              <span
                key={m.address}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs"
              >
                {m.label}
                <button
                  onClick={() => removeMark(m.address)}
                  className="text-blue-400 hover:text-blue-700 leading-none"
                >×</button>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
