import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import Modal from '../ui/Modal';
import type { Device } from '../../types';

interface Props {
  onClose: () => void;
  onAdd: (device: Device) => void;
  existing?: Device; // if provided, dialog is in edit mode
}

export default function AddDeviceDialog({ onClose, onAdd, existing }: Props) {
  const [ip, setIp] = useState(existing?.ip ?? '');
  const [port, setPort] = useState(existing?.port ?? 502);
  const [unitId, setUnitId] = useState(existing?.unitId ?? 1);
  const [name, setName] = useState(existing?.name ?? '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ip.trim()) return;
    onAdd({
      id: existing?.id ?? uuid(),
      ip: ip.trim(),
      port,
      unitId,
      name: name.trim() || ip.trim(),
      connected: false,
    });
    onClose();
  };

  return (
    <Modal title={existing ? 'Edit Device' : 'Add Device'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">IP Address</label>
          <input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="192.168.1.100"
            className="input w-full font-mono text-sm"
            required
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className="input w-full"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Unit ID (0–255)</label>
            <input
              type="number"
              value={unitId}
              onChange={(e) => setUnitId(Number(e.target.value))}
              min={0}
              max={255}
              className="input w-full"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Name (optional)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My PLC"
            className="input w-full"
          />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="submit" className="btn-primary">{existing ? 'Save & Reconnect' : 'Add & Connect'}</button>
        </div>
      </form>
    </Modal>
  );
}
