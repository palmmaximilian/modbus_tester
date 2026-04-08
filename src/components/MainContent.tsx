import { useAppStore } from '../store/useAppStore';
import DiscoveryMode from './DiscoveryMode/DiscoveryMode';
import WatchlistMode from './WatchlistMode/WatchlistMode';

export default function MainContent() {
  const { activeDeviceId, devices, mode, setMode } = useAppStore();
  const device = devices.find((d) => d.id === activeDeviceId);

  if (!activeDeviceId || !device) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
        <p className="text-sm">Select or add a device to get started</p>
        <p className="text-xs text-zinc-500">Use the ⚡ Simulator bar at the bottom to start a built-in slave</p>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      {/* Device header + mode switcher */}
      <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-200 bg-white">
        <div>
          <h1 className="font-semibold text-gray-800">{device.name}</h1>
          <p className="text-xs text-gray-400 font-mono">{device.ip}:{device.port} · Unit {device.unitId}</p>
        </div>

        <div className="ml-auto flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
          {(['discovery', 'watchlist'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                mode === m
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Mode content */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {mode === 'discovery' ? (
          <DiscoveryMode deviceId={activeDeviceId} />
        ) : (
          <WatchlistMode deviceId={activeDeviceId} />
        )}
      </div>
    </main>
  );
}

