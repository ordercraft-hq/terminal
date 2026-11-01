import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Info } from 'lucide-react';
import { useSyncStore } from '../../store/syncStore';
import { isTimeframeSupported } from '../../utils/timeframeSupport';

export interface ParsedInterval {
  isValid: boolean;
  timeframe: string;
  label: string;
}

/**
 * Parses user interval input syntax:
 * - Pure numbers default to minutes (e.g. 5 -> 5m, 60 -> 1h, 240 -> 4h, 1440 -> 1D)
 * - Single letter or number + letter:
 *   - S / s: Seconds (e.g. 15S -> 15s)
 *   - H / h: Hours (e.g. H -> 1h, 2H -> 2h)
 *   - D / d: Daily (e.g. D -> 1D, 2D -> 2D)
 *   - W / w: Weekly (e.g. W -> 1W)
 *   - M / m: Monthly (e.g. M -> 1M, 3M -> 3M)
 */
export function parseInterval(raw: string): ParsedInterval {
  const input = raw.trim();
  if (!input) {
    return { isValid: false, timeframe: '', label: 'Type the interval number' };
  }

  // 1. Single-letter shortcuts without numbers: S, H, D, W, M
  if (/^[sS]$/.test(input)) {
    return { isValid: true, timeframe: '1s', label: '1 second' };
  }
  if (/^[hH]$/.test(input)) {
    return { isValid: true, timeframe: '1h', label: '1 hour' };
  }
  if (/^[dD]$/.test(input)) {
    return { isValid: true, timeframe: '1D', label: '1 day' };
  }
  if (/^[wW]$/.test(input)) {
    return { isValid: true, timeframe: '1W', label: '1 week' };
  }
  if (/^(m|M|mo|MO)$/.test(input)) {
    return { isValid: true, timeframe: '1M', label: '1 month' };
  }

  // 2. Pure numbers (defaults to minutes)
  if (/^\d+$/.test(input)) {
    const num = parseInt(input, 10);
    if (num <= 0) {
      return { isValid: false, timeframe: '', label: 'Invalid interval' };
    }
    if (num === 1440) {
      return { isValid: true, timeframe: '1D', label: '1 day' };
    }
    if (num % 1440 === 0) {
      const d = num / 1440;
      return { isValid: true, timeframe: `${d}D`, label: `${d} ${d === 1 ? 'day' : 'days'}` };
    }
    if (num === 60) {
      return { isValid: true, timeframe: '1h', label: '1 hour' };
    }
    if (num % 60 === 0 && num < 1440) {
      const h = num / 60;
      return { isValid: true, timeframe: `${h}h`, label: `${h} ${h === 1 ? 'hour' : 'hours'}` };
    }
    return {
      isValid: true,
      timeframe: `${num}m`,
      label: num === 1 ? '1 minute' : `${num} minutes`,
    };
  }

  // 3. Number + Second suffix (s, S, sec)
  const secMatch = input.match(/^(\d+)\s*(s|sec)$/i);
  if (secMatch) {
    const num = parseInt(secMatch[1], 10);
    if (num <= 0) return { isValid: false, timeframe: '', label: 'Invalid interval' };
    return {
      isValid: true,
      timeframe: `${num}s`,
      label: num === 1 ? '1 second' : `${num} seconds`,
    };
  }

  // 4. Number + Month suffix (M, mo, month)
  const monthMatch = input.match(/^(\d+)\s*(M|mo|month|months)$/);
  if (monthMatch) {
    const num = parseInt(monthMatch[1], 10);
    if (num <= 0) return { isValid: false, timeframe: '', label: 'Invalid interval' };
    return {
      isValid: true,
      timeframe: `${num}M`,
      label: num === 1 ? '1 month' : `${num} months`,
    };
  }

  // 5. Number + Hour suffix (h, H, hr, hour)
  const hourMatch = input.match(/^(\d+)\s*(h|hr|hour|hours)$/i);
  if (hourMatch) {
    const num = parseInt(hourMatch[1], 10);
    if (num <= 0) return { isValid: false, timeframe: '', label: 'Invalid interval' };
    if (num === 24) return { isValid: true, timeframe: '1D', label: '1 day' };
    return {
      isValid: true,
      timeframe: `${num}h`,
      label: num === 1 ? '1 hour' : `${num} hours`,
    };
  }

  // 6. Number + Day suffix (d, D, day)
  const dayMatch = input.match(/^(\d+)\s*(d|day|days)$/i);
  if (dayMatch) {
    const num = parseInt(dayMatch[1], 10);
    if (num <= 0) return { isValid: false, timeframe: '', label: 'Invalid interval' };
    if (num === 7) return { isValid: true, timeframe: '1W', label: '1 week' };
    return {
      isValid: true,
      timeframe: `${num}D`,
      label: num === 1 ? '1 day' : `${num} days`,
    };
  }

  // 7. Number + Week suffix (w, W, wk, week)
  const weekMatch = input.match(/^(\d+)\s*(w|wk|week|weeks)$/i);
  if (weekMatch) {
    const num = parseInt(weekMatch[1], 10);
    if (num <= 0) return { isValid: false, timeframe: '', label: 'Invalid interval' };
    return {
      isValid: true,
      timeframe: `${num}W`,
      label: num === 1 ? '1 week' : `${num} weeks`,
    };
  }

  // 8. Number + Minute suffix (m, min, minute)
  const minMatch = input.match(/^(\d+)\s*(m|min|minute|minutes)$/i);
  if (minMatch) {
    const num = parseInt(minMatch[1], 10);
    if (num <= 0) return { isValid: false, timeframe: '', label: 'Invalid interval' };
    if (num === 1440) return { isValid: true, timeframe: '1D', label: '1 day' };
    if (num === 60) return { isValid: true, timeframe: '1h', label: '1 hour' };
    if (num % 60 === 0 && num < 1440) {
      const h = num / 60;
      return { isValid: true, timeframe: `${h}h`, label: `${h} ${h === 1 ? 'hour' : 'hours'}` };
    }
    return {
      isValid: true,
      timeframe: `${num}m`,
      label: num === 1 ? '1 minute' : `${num} minutes`,
    };
  }

  return { isValid: false, timeframe: '', label: 'Invalid interval' };
}

export const ChangeIntervalModal: React.FC = () => {
  const isIntervalModalOpen = useSyncStore((s) => s.isIntervalModalOpen);
  const intervalModalInitialQuery = useSyncStore((s) => s.intervalModalInitialQuery);
  const closeIntervalModal = useSyncStore((s) => s.closeIntervalModal);
  const setTimeframe = useSyncStore((s) => s.setTimeframe);
  const activePaneId = useSyncStore((s) => s.activePaneId || 'pane-1');
  const activeSymbol = useSyncStore((s) => s.panes[activePaneId]?.symbol || s.symbol);

  const [query, setQuery] = useState(intervalModalInitialQuery);
  const [showTooltip, setShowTooltip] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sync initial query when modal opens or initial query changes
  useEffect(() => {
    if (isIntervalModalOpen) {
      setQuery(intervalModalInitialQuery);
      requestAnimationFrame(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          const len = inputRef.current.value.length;
          inputRef.current.setSelectionRange(len, len);
        }
      });
    }
  }, [isIntervalModalOpen, intervalModalInitialQuery]);

  const parsed = parseInterval(query);
  const support = parsed.isValid ? isTimeframeSupported(activeSymbol, parsed.timeframe) : null;

  // Compute label text
  let labelText = parsed.label;
  if (!query.trim()) {
    labelText = 'Type the interval number';
  } else if (!parsed.isValid) {
    labelText = 'Invalid interval';
  } else if (support && !support.supported) {
    labelText = `${parsed.label} · Not supported by ${support.providerDisplay}`;
  }

  const handleApply = useCallback(() => {
    if (!parsed.isValid) return;
    if (support && !support.supported) return;

    setTimeframe(parsed.timeframe);
    closeIntervalModal();
  }, [parsed, support, setTimeframe, closeIntervalModal]);

  // Global keydown inside modal (handles Enter and Escape reliably)
  useEffect(() => {
    if (!isIntervalModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeIntervalModal();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleApply();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isIntervalModalOpen, closeIntervalModal, handleApply]);

  if (!isIntervalModalOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-50 p-4 animate-in fade-in duration-100 select-none"
      onClick={closeIntervalModal}
    >
      <div
        className="relative w-[280px] bg-[#1e222d] border border-[#2a2e39] rounded-xl shadow-2xl p-4 text-[#d1d4dc] flex flex-col animate-in zoom-in-95 duration-100"
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.focus();
        }}
      >
        {/* Header: Title + Info Tooltip */}
        <div className="flex items-center justify-center space-x-1.5 mb-3 select-none">
          <span className="font-semibold text-sm text-[#e0e3eb]">Change interval</span>
          <div
            className="relative inline-flex items-center justify-center cursor-pointer"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            onClick={(e) => {
              e.stopPropagation();
              setShowTooltip((prev) => !prev);
            }}
          >
            <Info
              size={14}
              className="text-[#787b86] hover:text-[#d1d4dc] transition-colors"
            />

            {/* Tooltip Bubble */}
            {showTooltip && (
              <div className="absolute bottom-full mb-2.5 left-1/2 -translate-x-1/2 w-[270px] bg-[#2a2e39] border border-[#363a45] rounded-lg p-2.5 text-[11.5px] leading-relaxed text-[#d1d4dc] shadow-2xl z-50 pointer-events-none">
                Type the interval number for minute charts (i.e. 5 if it's going to be a five minute chart). Or number plus letter for other intervals: S for 1 second chart (15S for 15 second chart, etc.), H (Hourly), D (Daily), W (Weekly), M (Monthly) intervals (i.e. D or 2H)
                {/* Arrow pointing down */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-[#2a2e39]" />
              </div>
            )}
          </div>
        </div>

        {/* Centered Input Box Container with Blue Border */}
        <div
          className="flex items-center justify-center w-full bg-[#131722] border-2 border-[#2962ff] rounded-lg py-2 px-3 shadow-[0_0_0_2px_rgba(41,98,255,0.25)] cursor-text"
          onClick={() => inputRef.current?.focus()}
        >
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            spellCheck={false}
            style={{
              width: `${Math.max(1, query.length || 1) * 12 + 10}px`,
              textAlign: 'center',
            }}
            className="bg-transparent border-none outline-none text-white text-base font-semibold tracking-wider font-mono p-0 m-0 text-center"
          />
        </div>

        {/* Interpretation Label Below */}
        <div
          className={`mt-2.5 text-center text-xs select-none transition-colors ${
            !query.trim()
              ? 'text-[#787b86]'
              : !parsed.isValid
              ? 'text-[#f23645]'
              : support && !support.supported
              ? 'text-[#f59e0b]'
              : 'text-[#787b86]'
          }`}
        >
          {labelText}
        </div>
      </div>
    </div>
  );
};
