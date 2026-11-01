import React, { useState } from 'react';
import { X, Table, Download } from 'lucide-react';
import type { Candle } from '../../transport/client';
import { useSyncStore } from '../../store/syncStore';
import { getTimezoneOffsetSeconds } from '../ChartPane/ChartPane';

export interface DataTableViewModalProps {
  isOpen: boolean;
  candles: Candle[];
  onClose: () => void;
}

export const DataTableViewModal: React.FC<DataTableViewModalProps> = ({
  isOpen,
  candles,
  onClose,
}) => {
  const { symbol, timeframe, timezone } = useSyncStore();
  const [page, setPage] = useState(0);
  const pageSize = 50;

  if (!isOpen) return null;

  const totalCandles = candles.length;
  // Show newest candles first
  const reversed = [...candles].reverse();
  const totalPages = Math.ceil(totalCandles / pageSize);
  const pagedCandles = reversed.slice(page * pageSize, (page + 1) * pageSize);

  const formatCandleTime = (ts: number): string => {
    const offset = getTimezoneOffsetSeconds(timezone);
    const d = new Date((ts + offset) * 1000);
    const yr = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const hr = String(d.getUTCHours()).padStart(2, '0');
    const min = String(d.getUTCMinutes()).padStart(2, '0');
    const sec = String(d.getUTCSeconds()).padStart(2, '0');
    return `${yr}-${mo}-${day} ${hr}:${min}:${sec}`;
  };

  const exportCSV = () => {
    if (candles.length === 0) return;
    const header = 'DateTime,Open,High,Low,Close,Volume\n';
    const rows = candles
      .map(
        (c) =>
          `${formatCandleTime(c.time)},${c.open},${c.high},${c.low},${c.close},${c.volume}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${symbol.replace(':', '_')}_${timeframe}_data.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none animate-in fade-in duration-100">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative w-full max-w-4xl bg-[#1e222d] border border-[#2a2e39] rounded-xl shadow-2xl overflow-hidden flex flex-col z-10 animate-in zoom-in-95 duration-100">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[#2a2e39] bg-[#181b27]">
          <div className="flex items-center space-x-2">
            <Table size={16} className="text-[#2962ff]" />
            <h2 className="text-sm font-semibold text-white">Table View</h2>
            <span className="text-xs text-[#787b86]">
              {symbol} · {timeframe} ({totalCandles} candles · {timezone})
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={exportCSV}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded bg-[#2a2e39] hover:bg-[#363a45] text-xs text-[#d1d4dc] transition-colors cursor-pointer"
              title="Download OHLCV data as CSV"
            >
              <Download size={13} />
              <span>Export CSV</span>
            </button>
            <button
              onClick={onClose}
              className="text-[#787b86] hover:text-white p-1 rounded-md hover:bg-[#2a2e39] transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Table content */}
        <div className="max-h-[460px] overflow-auto font-mono text-xs text-[#d1d4dc]">
          <table className="w-full text-right border-collapse">
            <thead className="sticky top-0 bg-[#181b27] border-b border-[#2a2e39] text-[11px] font-semibold text-[#787b86]">
              <tr>
                <th className="py-2 px-3 text-left">Date / Time ({timezone})</th>
                <th className="py-2 px-3">Open</th>
                <th className="py-2 px-3">High</th>
                <th className="py-2 px-3">Low</th>
                <th className="py-2 px-3">Close</th>
                <th className="py-2 px-3">Change</th>
                <th className="py-2 px-3">Change %</th>
                <th className="py-2 px-3 text-right">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2e39]/40">
              {pagedCandles.map((c, idx) => {
                const diff = c.close - c.open;
                const pct = c.open > 0 ? (diff / c.open) * 100 : 0;
                const isBull = diff >= 0;

                return (
                  <tr
                    key={c.time + '-' + idx}
                    className="hover:bg-[#2a2e39]/60 transition-colors tabular-nums"
                  >
                    <td className="py-1.5 px-3 text-left text-[#787b86] text-[11px]">
                      {formatCandleTime(c.time)}
                    </td>
                    <td className="py-1.5 px-3">{c.open.toFixed(2)}</td>
                    <td className="py-1.5 px-3 text-[#089981]">{c.high.toFixed(2)}</td>
                    <td className="py-1.5 px-3 text-[#f23645]">{c.low.toFixed(2)}</td>
                    <td
                      className={`py-1.5 px-3 font-semibold ${
                        isBull ? 'text-[#089981]' : 'text-[#f23645]'
                      }`}
                    >
                      {c.close.toFixed(2)}
                    </td>
                    <td className={`py-1.5 px-3 ${isBull ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                      {diff >= 0 ? '+' : ''}
                      {diff.toFixed(2)}
                    </td>
                    <td className={`py-1.5 px-3 ${isBull ? 'text-[#089981]' : 'text-[#f23645]'}`}>
                      {diff >= 0 ? '+' : ''}
                      {pct.toFixed(2)}%
                    </td>
                    <td className="py-1.5 px-3 text-[#787b86]">
                      {c.volume ? c.volume.toLocaleString() : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="flex items-center justify-between px-5 py-2.5 border-t border-[#2a2e39] bg-[#181b27] text-xs text-[#787b86]">
          <span>
            Page {page + 1} of {Math.max(1, totalPages)} ({totalCandles} total)
          </span>

          <div className="flex items-center space-x-1.5">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2.5 py-1 rounded bg-[#2a2e39] text-[#d1d4dc] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#363a45] transition-colors cursor-pointer"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2.5 py-1 rounded bg-[#2a2e39] text-[#d1d4dc] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#363a45] transition-colors cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
