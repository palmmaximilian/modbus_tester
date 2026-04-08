import { useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Bookmark } from 'lucide-react';
import type { DiscoveryRow } from '../../types';

interface Props {
  rows: DiscoveryRow[];
  writable: boolean;
  markedAddresses: Set<number>;
  onWrite: (address: number, value: number) => void;
  onAddToWatchlist: (row: DiscoveryRow) => void;
}

export default function RegistersTable({ rows, writable, markedAddresses, onWrite, onAddToWatchlist }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [editAddr, setEditAddr] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 20,
  });

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        No data — press Read Now or start polling
      </div>
    );
  }

  const commitEdit = (address: number) => {
    const v = parseInt(editVal, 10);
    if (!isNaN(v) && v >= 0 && v <= 65535) onWrite(address, v);
    setEditAddr(null);
  };

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom = virtualItems.length > 0
    ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
    : 0;

  return (
    <div ref={parentRef} className="overflow-auto h-full">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 bg-white z-10 shadow-sm">
          <tr className="flex w-full items-center border-b border-gray-200">
            <th className="th w-28">Address</th>
            <th className="th w-32">Raw (uint16)</th>
            <th className="th w-32">Signed int16</th>
            {writable && <th className="th w-40">Write</th>}
            <th className="th w-10"><Bookmark size={12} /></th>
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && (
            <tr><td colSpan={writable ? 5 : 4} style={{ height: paddingTop }} /></tr>
          )}
          {virtualItems.map((vi) => {
            const row = rows[vi.index];
            const raw = row.value as number | null;
            const uint16 = raw ?? 0;
            const signed = uint16 > 32767 ? uint16 - 65536 : uint16;
            return (
              <tr
                key={vi.key}
                className="flex w-full items-center border-b border-gray-50 hover:bg-gray-50"
              >
                <td className="td w-28 font-mono text-gray-500">{row.address}</td>
                <td className="td w-32 font-mono">{raw === null ? '—' : uint16}</td>
                <td className="td w-32 font-mono text-gray-500">{raw === null ? '—' : signed}</td>
                {writable && (
                  <td className="td w-40">
                    {editAddr === row.address ? (
                      <div className="flex gap-1">
                        <input
                          type="number"
                          autoFocus
                          value={editVal}
                          onChange={(e) => setEditVal(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(row.address);
                            if (e.key === 'Escape') setEditAddr(null);
                          }}
                          className="input w-24 py-0.5 text-sm"
                          min={0}
                          max={65535}
                        />
                        <button
                          onClick={() => commitEdit(row.address)}
                          className="btn-primary text-xs py-0.5 px-2"
                        >
                          Set
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditAddr(row.address); setEditVal(String(uint16)); }}
                        className="btn-ghost text-xs py-0.5 px-2"
                      >
                        Write…
                      </button>
                    )}
                  </td>
                )}
                <td className="td w-10">
                  {(() => {
                    const already = markedAddresses.has(row.address);
                    return (
                      <button
                        onClick={() => onAddToWatchlist(row)}
                        title={already ? 'Already in watchlist' : 'Add to watchlist'}
                        className={`p-1 rounded hover:bg-gray-200 ${
                          already ? 'text-blue-500' : 'text-gray-400 hover:text-blue-500'
                        }`}
                      >
                        <Bookmark size={12} fill={already ? 'currentColor' : 'none'} />
                      </button>
                    );
                  })()}
                </td>
              </tr>
            );
          })}
          {paddingBottom > 0 && (
            <tr><td colSpan={writable ? 5 : 4} style={{ height: paddingBottom }} /></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
