import { useState } from 'react';
import { api } from '../../lib/api';
import toast from 'react-hot-toast';
import Modal from '../ui/Modal';

interface Props {
  onClose: () => void;
  onAdd: (ip: string, port: number) => void;
}

export default function ScanDialog({ onClose, onAdd }: Props) {
  const [startIp, setStartIp] = useState('192.168.1.1');
  const [endIp, setEndIp] = useState('192.168.1.254');
  const [port, setPort] = useState(502);
  const [scanning, setScanning] = useState(false);
  const [found, setFound] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleScan = async () => {
    setScanning(true);
    setFound([]);
    setSelected(new Set());
    try {
      const results = await api.scanNetwork(startIp, endIp, port);
      setFound(results);
      if (results.length === 0) toast('No devices found');
    } catch (e) {
      toast.error(String(e));
    } finally {
      setScanning(false);
    }
  };

  const toggle = (ip: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(ip) ? next.delete(ip) : next.add(ip);
      return next;
    });
  };

  const handleAdd = () => {
    selected.forEach((ip) => onAdd(ip, port));
    onClose();
  };

  return (
    <Modal title="Scan Network" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Start IP</label>
            <input
              value={startIp}
              onChange={(e) => setStartIp(e.target.value)}
              className="input w-full font-mono text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">End IP</label>
            <input
              value={endIp}
              onChange={(e) => setEndIp(e.target.value)}
              className="input w-full font-mono text-sm"
            />
          </div>
          <div className="w-24">
            <label className="block text-xs text-gray-500 mb-1">Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className="input w-full"
            />
          </div>
        </div>

        <button
          onClick={handleScan}
          disabled={scanning}
          className="btn-primary w-full"
        >
          {scanning ? 'Scanning…' : 'Scan'}
        </button>

        {found.length > 0 && (
          <div className="border rounded divide-y max-h-52 overflow-y-auto">
            {found.map((ip) => (
              <label key={ip} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selected.has(ip)}
                  onChange={() => toggle(ip)}
                  className="rounded"
                />
                <span className="font-mono text-sm">{ip}:{port}</span>
              </label>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button
            onClick={handleAdd}
            disabled={selected.size === 0}
            className="btn-primary"
          >
            Add {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </div>
      </div>
    </Modal>
  );
}
