import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { listen } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { api } from './lib/api';
import { useAppStore } from './store/useAppStore';
import type { Device } from './types/index';
import DeviceSidebar from './components/DeviceSidebar/DeviceSidebar';
import MainContent from './components/MainContent';
import SimulatorPanel from './components/SimulatorPanel/SimulatorPanel';
import ProbeWindow from './components/ProbeWindow/ProbeWindow';

const DOCK_MIN_H = 180;
const DOCK_DEFAULT_H = 280;

// If this window was opened as the pop-out, render the simulator fullscreen.
const IS_POPOUT = new URLSearchParams(window.location.search).get('sim') === '1';
const IS_PROBE  = new URLSearchParams(window.location.search).get('probe') === '1';

async function openPopout() {
  try {
    // If window already exists, focus it instead of creating a duplicate.
    const existing = await WebviewWindow.getByLabel('simulator');
    if (existing) {
      await existing.setFocus();
      return;
    }
    const win = new WebviewWindow('simulator', {
      url: '/?sim=1',
      title: 'Modbus Simulator',
      width: 920,
      height: 620,
      resizable: true,
    });
    win.once('tauri://error', (e) => {
      console.error('Simulator window error', e);
      toast.error('Could not open simulator window');
    });
  } catch (e) {
    console.error('openPopout failed', e);
    toast.error('Could not open simulator window');
  }
}

const HEARTBEAT_INTERVAL_MS = 15_000;

export default function App() {
  const addDevice = useAppStore((s) => s.addDevice);
  const addWatchlistEntry = useAppStore((s) => s.addWatchlistEntry);
  const [dockOpen, setDockOpen] = useState(false);
  const [dockH, setDockH] = useState(DOCK_DEFAULT_H);

  // Load persisted data on startup and auto-save devices whenever the list changes.
  useEffect(() => {
    // Auto-save devices on any change to the device list.
    const unsub = useAppStore.subscribe(async (state, prev) => {
      if (state.devices !== prev.devices) {
        api.saveDevices(state.devices).catch(() => {});
      }
    });

    // Load devices, their watchlists, and simulator state.
    (async () => {
      const savedDevices = await api.loadDevices().catch(() => [] as Awaited<ReturnType<typeof api.loadDevices>>);
      for (const dev of savedDevices) {
        useAppStore.getState().addDevice({ ...dev, connected: false });
      }
      await Promise.all(
        savedDevices.map(async (dev) => {
          try {
            const entries = await api.loadWatchlist(dev.id);
            useAppStore.getState().setWatchlist(dev.id, entries);
          } catch { /* no watchlist saved yet for this device */ }
        })
      );
      await api.loadSimState().catch(() => {});
    })();

    return unsub;
  }, []);

  // Heartbeat: poll each connected device every 15s to keep the TCP socket alive.
  useEffect(() => {
    const interval = setInterval(() => {
      const { devices, updateDevice } = useAppStore.getState();
      for (const device of devices) {
        if (!device.connected) continue;
        api.readHoldingRegisters(device.id, 0, 1).catch(() => {
          updateDevice(device.id, { connected: false });
        });
      }
    }, HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Receive mark-coil events from the probe window → add to watchlist.
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<{ deviceId: string; address: number; label: string }>('probe:mark-coil', (event) => {
      const { deviceId, address, label } = event.payload;
      const { watchlists } = useAppStore.getState();
      const existing = watchlists[deviceId] ?? [];
      if (existing.some((e) => e.registerType === 'coil' && e.address === address)) return;
      const entry = { id: crypto.randomUUID(), name: label, registerType: 'coil' as const, address };
      addWatchlistEntry(deviceId, entry);
      const updated = [...existing, entry];
      import('./lib/api').then(({ api: a }) => a.saveWatchlist(deviceId, updated).catch(() => {}));
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => { cancelled = true; unlisten?.(); };
  }, [addWatchlistEntry]);

  // Receive add-device events from the pop-out simulator window.
  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    listen<Device>('sim:add-device', (event) => {
      const { devices } = useAppStore.getState();
      const dev = event.payload;
      const duplicate = devices.some(
        (d) => d.ip === dev.ip && d.port === dev.port && d.unitId === dev.unitId
      );
      if (duplicate) { toast('Device already in sidebar'); return; }
      addDevice(dev);
      toast.success('Added 127.0.0.1 to devices — click it in the sidebar to connect');
    }).then((fn) => {
      if (cancelled) fn(); // effect already cleaned up — immediately unsubscribe
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [addDevice]);

  // Pop-out window: render only the simulator panel.
  if (IS_POPOUT) {
    return (
      <div className="h-screen bg-white text-gray-900 overflow-auto">
        <SimulatorPanel standalone />
        <Toaster position="bottom-right" toastOptions={{ style: { fontSize: '13px' } }} />
      </div>
    );
  }

  // Probe window: render the coil probe UI.
  if (IS_PROBE) {
    return (
      <>
        <ProbeWindow />
        <Toaster position="bottom-right" toastOptions={{ style: { fontSize: '13px' } }} />
      </>
    );
  }

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startH = dockH;
    const onMove = (mv: MouseEvent) => {
      setDockH(Math.max(DOCK_MIN_H, startH + (startY - mv.clientY)));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="flex flex-col h-screen bg-white text-gray-900 overflow-hidden">
      {/* main row: sidebar + content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <DeviceSidebar />
        <MainContent />
      </div>

      {/* simulator dock */}
      {dockOpen && (
        <div
          className="flex flex-col border-t border-gray-200 bg-white flex-shrink-0"
          style={{ height: dockH }}
        >
          {/* drag handle + header bar */}
          <div
            className="flex items-center gap-2 px-3 py-1 cursor-ns-resize select-none border-b border-gray-200 bg-gray-50 flex-shrink-0"
            onMouseDown={handleDragStart}
          >
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Simulator</span>
            <button
              onClick={() => { openPopout().then(() => setDockOpen(false)); }}
              className="ml-auto text-gray-400 hover:text-gray-700 text-xs px-2 py-0.5 rounded hover:bg-gray-100"
              title="Pop out into separate window"
            >
              ⤢ Pop out
            </button>
            <button
              onClick={() => setDockOpen(false)}
              className="text-gray-400 hover:text-gray-700 text-lg leading-none px-1"
              title="Close"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            <SimulatorPanel />
          </div>
        </div>
      )}

      {/* status bar */}
      <div className="flex items-center px-3 py-0.5 bg-gray-100 text-gray-500 text-xs gap-3 flex-shrink-0 border-t border-gray-200">
        <button
          onClick={() => setDockOpen((o) => !o)}
          className={`hover:text-gray-900 transition-colors ${dockOpen ? 'text-blue-600 font-medium' : ''}`}
        >
          ⚡ Simulator
        </button>
      </div>

      <Toaster
        position="bottom-right"
        toastOptions={{
          style: { fontSize: '13px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
        }}
      />
    </div>
  );
}

