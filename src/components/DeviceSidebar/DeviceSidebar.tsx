import { useState } from 'react';
import { Plus, Radar, Pencil, Trash2 } from 'lucide-react';
import { v4 as uuid } from 'uuid';
import toast from 'react-hot-toast';
import { api } from '../../lib/api';
import { useAppStore } from '../../store/useAppStore';
import type { Device } from '../../types';
import ScanDialog from './ScanDialog';
import AddDeviceDialog from './AddDeviceDialog';

export default function DeviceSidebar() {
  const [showScan, setShowScan] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editDevice, setEditDevice] = useState<Device | null>(null);

  const { devices, activeDeviceId, setActiveDevice, addDevice, updateDevice, removeDevice } = useAppStore();

  const handleConnect = async (device: Device) => {
    if (device.connected) return;
    try {
      await api.connectDevice(device.id, device.ip, device.port, device.unitId);
      updateDevice(device.id, { connected: true });
      setActiveDevice(device.id);
      toast.success(`Connected to ${device.ip}`);
    } catch (e) {
      toast.error(`Failed to connect: ${String(e)}`);
    }
  };

  const handleEdit = async (updated: Device) => {
    // disconnect old connection if any
    const old = devices.find((d) => d.id === updated.id);
    if (old?.connected) {
      await api.disconnectDevice(updated.id).catch(() => {});
    }
    updateDevice(updated.id, { ...updated, connected: false });
    await handleConnect({ ...updated, connected: false });
  };

  const handleRemove = async (device: Device) => {
    if (device.connected) await api.disconnectDevice(device.id).catch(() => {});
    removeDevice(device.id);
  };

  const handleAddFromScan = async (ip: string, port: number) => {
    const device: Device = {
      id: uuid(),
      ip,
      port,
      unitId: 255,
      name: ip,
      connected: false,
    };
    addDevice(device);
    await handleConnect(device);
  };

  return (
    <aside className="w-56 flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
      <div className="p-3 border-b border-gray-200 flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-700 flex-1">Devices</span>
        <button
          onClick={() => setShowScan(true)}
          title="Scan network"
          className="p-1.5 rounded hover:bg-gray-200 text-gray-600"
        >
          <Radar size={15} />
        </button>
        <button
          onClick={() => setShowAdd(true)}
          title="Add device manually"
          className="p-1.5 rounded hover:bg-gray-200 text-gray-600"
        >
          <Plus size={15} />
        </button>
      </div>

      <ul className="flex-1 overflow-y-auto py-1">
        {devices.length === 0 && (
          <li className="px-3 py-6 text-xs text-gray-400 text-center">
            No devices yet.<br />Scan or add manually.
          </li>
        )}
        {devices.map((d) => (
          <li key={d.id} className="group relative">
            <button
              onClick={() => {
                handleConnect(d);
                setActiveDevice(d.id);
              }}
              className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-gray-100 transition-colors ${
                activeDeviceId === d.id ? 'bg-blue-50 border-r-2 border-blue-500' : ''
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  d.connected ? 'bg-green-500' : 'bg-gray-300'
                }`}
              />
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">{d.name}</div>
                <div className="text-xs text-gray-400 font-mono truncate">{d.ip}:{d.port} · {d.unitId}</div>
              </div>
            </button>
            <div className="absolute right-1 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-0.5">
              <button
                onClick={(e) => { e.stopPropagation(); setEditDevice(d); }}
                title="Edit"
                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700"
              >
                <Pencil size={12} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleRemove(d); }}
                title="Remove"
                className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {showScan && (
        <ScanDialog onClose={() => setShowScan(false)} onAdd={handleAddFromScan} />
      )}
      {showAdd && (
        <AddDeviceDialog
          onClose={() => setShowAdd(false)}
          onAdd={(device) => {
            addDevice(device);
            handleConnect(device);
          }}
        />
      )}
      {editDevice && (
        <AddDeviceDialog
          existing={editDevice}
          onClose={() => setEditDevice(null)}
          onAdd={handleEdit}
        />
      )}
    </aside>
  );
}
