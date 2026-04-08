import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import Modal from '../ui/Modal';
import type { Device } from '../../types';

interface Props {
  onClose: () => void;
  onAdd: (device: Device) => void;
}

export default function AddDeviceDialog({ onClose, onAdd }: Props) {
  const [ip, setIp] = useState('');
  const [port, setPort] = useState(502);
  const [unitId, setUnitId] = useState(1);
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ip.trim()) return;
    onAdd({
      id: uuid(),
      ip: ip.trim(),
      port,
      unitId,
      name: name.trim() || ip.trim(),
      connected: false,
    });
    onClose();
  };

  return (
    <Modal title="Add Device" onClose={onClose}>
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
            <label className="block text-xs text-gray-500 mb-1">Unit ID</label>
            <input
              type="number"
              value={unitId}
              onChange={(e) => setUnitId(Number(e.target.value))}
              min={0}
              max={247}
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
          <button type="submit" className="btn-primary">Add & Connect</button>
        </div>
      </form>
    </Modal>
  );
}
