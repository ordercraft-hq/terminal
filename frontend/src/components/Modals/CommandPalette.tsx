import React, { useEffect, useState, useRef, useMemo } from 'react';
import { Search, X, Clock, TrendingUp } from 'lucide-react';
import { useSyncStore } from '../../store/syncStore';
import { transport } from '../../transport/client';
import type { SymbolInfo } from '../../transport/client';
import { isTimeframeSupported } from '../../utils/timeframeSupport';

type CategoryTab =
  | 'All'
  | 'Stocks'
  | 'Funds'
  | 'Futures'
  | 'Forex'
  | 'Crypto'
  | 'Indices'
  | 'Bonds'
  | 'Economy'
  | 'Options';

const CATEGORIES: CategoryTab[] = [
  'All',
  'Stocks',
  'Funds',
  'Futures',
  'Forex',
  'Crypto',
  'Indices',
  'Bonds',
  'Economy',
  'Options',
];

// Helper: Filter dynamically fetched symbols by category tab
function matchesCategory(sym: SymbolInfo, cat: CategoryTab): boolean {
  if (cat === 'All') return true;

  const t = (sym.type || '').toLowerCase();
  const s = (sym.symbol || '').toUpperCase();

  switch (cat) {
    case 'Stocks':
      return t === 'stock' || t === 'stocks';
    case 'Funds':
      return t === 'fund' || t === 'funds' || t === 'etf' || s === 'QQQ' || s === 'SPY' || s === 'IWM';
    case 'Futures':
      return (
        t === 'futures' ||
        t === 'commodity' ||
        t === 'metals' ||
        s.endsWith('1!') ||
        s.startsWith('NQ') ||
        s.startsWith('MNQ') ||
        s.startsWith('ES') ||
        s.startsWith('MES') ||
        s.startsWith('YM') ||
        s.startsWith('MYM') ||
        s.startsWith('RTY') ||
        s.startsWith('CL') ||
        s.startsWith('GC') ||
        s.startsWith('SI') ||
        s.startsWith('ZB') ||
        s.startsWith('ZN') ||
        s.startsWith('NQM') ||
        s.includes('WTICO') ||
        s.includes('XAU') ||
        s.includes('XAG')
      );
    case 'Forex':
      if (
        t === 'index' ||
        t === 'metals' ||
        t === 'commodity' ||
        s.includes('100') ||
        s.includes('500') ||
        s.includes('30') ||
        s.includes('SPX') ||
        s.includes('NAS') ||
        s.includes('XAU') ||
        s.includes('XAG') ||
        s.includes('WTICO')
      ) {
        return false;
      }
      return (
        t === 'forex' ||
        s.includes('_USD') ||
        s.includes('USD_') ||
        s.startsWith('USD') ||
        s.startsWith('EUR') ||
        s.startsWith('GBP') ||
        s.startsWith('AUD') ||
        s.startsWith('NZD')
      );
    case 'Crypto':
      if (t === 'index' || s.includes('100') || s.includes('500') || s.includes('30') || s.includes('NAS')) {
        return false;
      }
      return (
        t === 'crypto' ||
        s.endsWith('USDT') ||
        s.endsWith('USDC') ||
        s.endsWith('BTC') ||
        (s.includes('-USD') && !s.includes('NAS'))
      );
    case 'Indices':
      return (
        t === 'index' ||
        s.includes('100') ||
        s.includes('500') ||
        s.includes('30') ||
        s.includes('SPX') ||
        s.includes('NAS') ||
        s.includes('RTY') ||
        s.includes('DAX')
      );
    case 'Bonds':
      return t === 'bonds' || s.startsWith('ZB') || s.startsWith('ZN');
    case 'Economy':
      return t === 'economy';
    case 'Options':
      return t === 'options';
    default:
      return true;
  }
}

// Helper: Format type badge text
function formatTypeBadge(sym: SymbolInfo): string {
  const t = (sym.type || '').toLowerCase();
  const s = (sym.symbol || '').toUpperCase();

  if (s.includes('NAS100') || s.includes('SPX500') || s.includes('US30') || (t === 'index' && !s.includes('1!'))) {
    return 'INDEX CFD';
  }
  if (t === 'futures' || s.endsWith('1!') || s.startsWith('MNQ') || s.startsWith('MES') || s.startsWith('NQM')) {
    return 'FUTURES';
  }
  if (t === 'crypto') {
    return 'SPOT CRYPTO';
  }
  if (t === 'fund' || s === 'QQQ' || s === 'SPY') {
    return 'FUND ETF';
  }
  if (t === 'forex') {
    return 'FOREX';
  }
  if (t === 'stock') {
    return 'STOCK';
  }
  if (t === 'commodity') {
    return 'COMMODITY';
  }
  if (t === 'metals') {
    return 'METALS CFD';
  }
  if (t === 'bonds') {
    return 'BONDS';
  }
  return sym.type ? sym.type.toUpperCase() : 'ASSET';
}

export const CommandPalette: React.FC = () => {
  const {
    symbol,
    isCommandPaletteOpen,
    closeCommandPalette,
    commandPaletteInitialQuery,
    setSymbol,
    setTimeframe,
  } = useSyncStore();

  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<CategoryTab>('All');
  const [results, setResults] = useState<SymbolInfo[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus input and populate initial query when opened
  useEffect(() => {
    if (isCommandPaletteOpen) {
      const initQ = (commandPaletteInitialQuery || '').toUpperCase();
      setQuery(initQ);
      setSelectedIndex(0);
      setActiveTab('All');

      const focusAndPositionCursor = () => {
        if (inputRef.current) {
          inputRef.current.focus();
          const len = inputRef.current.value.length;
          inputRef.current.setSelectionRange(len, len);
        }
      };

      focusAndPositionCursor();
      requestAnimationFrame(focusAndPositionCursor);
    }
  }, [isCommandPaletteOpen, commandPaletteInitialQuery]);

  // Dynamically fetch symbols from active providers
  useEffect(() => {
    if (!isCommandPaletteOpen) return;

    let isCancelled = false;
    const fetchSymbols = async () => {
      try {
        const matches = await transport.searchSymbols(query);
        if (!isCancelled) {
          setResults(Array.isArray(matches) ? matches : []);
          setSelectedIndex(0);
        }
      } catch (err) {
        console.error('Failed to search symbols:', err);
      }
    };

    const timer = setTimeout(fetchSymbols, 50);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [query, isCommandPaletteOpen]);

  // Filter dynamically fetched results by the active category tab with equal priority
  const displayedResults = useMemo(() => {
    return (results || []).filter((sym) => matchesCategory(sym, activeTab));
  }, [results, activeTab]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [displayedResults.length, activeTab]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeElement = listRef.current.children[selectedIndex] as HTMLElement | undefined;
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const cleanQuery = query.trim().toLowerCase();
  const recognizedTfs = [
    '1s', '5s', '10s', '15s', '30s',
    '1m', '2m', '3m', '4m', '5m', '10m', '15m', '30m', '45m',
    '1h', '2h', '3h', '4h', '6h', '8h', '12h',
    '1d', '3d', '1w', '1mo',
  ];
  const isTimeframeQuery = recognizedTfs.includes(cleanQuery);

  const handleSelect = (sym: SymbolInfo) => {
    setSymbol(sym.full_symbol);
    closeCommandPalette();
  };

  // Keyboard navigation for ArrowUp, ArrowDown, Enter, Esc
  useEffect(() => {
    if (!isCommandPaletteOpen) return;

    const handleModalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % Math.max(1, displayedResults.length));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + displayedResults.length) % Math.max(1, displayedResults.length));
      } else if (e.key === 'Enter') {
        e.preventDefault();

        // Direct timeframe shortcut (e.g. "15m", "1h", "1D", "30s")
        if (isTimeframeQuery) {
          const support = isTimeframeSupported(symbol, cleanQuery);
          if (support.supported) {
            let appliedTf = cleanQuery;
            if (cleanQuery === '1d') appliedTf = '1D';
            else if (cleanQuery === '1w') appliedTf = '1W';
            else if (cleanQuery === '1m' && query.trim() === '1M') appliedTf = '1M';
            setTimeframe(appliedTf);
            closeCommandPalette();
          }
          return;
        }

        if (displayedResults[selectedIndex]) {
          handleSelect(displayedResults[selectedIndex]);
        } else if (query.trim() && /^[a-zA-Z0-9_\-\.\/:]+$/.test(query.trim())) {
          const raw = query.trim().toUpperCase();
          setSymbol(raw.includes(':') ? raw : `BINANCE:${raw}`);
          closeCommandPalette();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeCommandPalette();
      } else if (
        document.activeElement !== inputRef.current &&
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        if (inputRef.current) {
          inputRef.current.focus();
        }
        setQuery((prev) => (prev + e.key).toUpperCase());
      }
    };

    window.addEventListener('keydown', handleModalKeyDown);
    return () => window.removeEventListener('keydown', handleModalKeyDown);
  }, [isCommandPaletteOpen, displayedResults, selectedIndex, query, isTimeframeQuery, cleanQuery, symbol]);

  if (!isCommandPaletteOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-[2px] flex items-start justify-center pt-12 md:pt-16 z-50 p-4 animate-in fade-in duration-100"
      onClick={closeCommandPalette}
    >
      <div
        className="w-full max-w-[720px] bg-[#131722] border border-[#2a2e39] rounded-[20px] shadow-2xl overflow-hidden text-xs text-[#d1d4dc] flex flex-col min-h-[540px] max-h-[85vh] animate-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 space-x-3 border-b border-[#222631]">
          <Search size={20} className="text-[#787b86] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            placeholder="Symbol, ISIN, or CUSIP"
            autoFocus
            className="flex-1 bg-transparent border-none outline-none text-white text-base tracking-wide placeholder:text-[#606573] font-normal uppercase"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="p-1 rounded-full text-[#787b86] hover:text-white hover:bg-[#2a2e39] transition-colors"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Horizontal Category Filter Pills */}
        <div className="px-4 py-2.5 flex items-center space-x-1.5 overflow-x-auto no-scrollbar border-b border-[#1e222d] select-none shrink-0">
          {CATEGORIES.map((cat) => {
            const isActive = activeTab === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveTab(cat)}
                className={`px-3.5 py-1 rounded-full text-xs transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-white text-black font-semibold shadow-sm'
                    : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]/60 font-medium'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Timeframe Direct Action Banner */}
        {isTimeframeQuery && (
          <div
            onClick={() => {
              const support = isTimeframeSupported(symbol, cleanQuery);
              if (support.supported) {
                let appliedTf = cleanQuery;
                if (cleanQuery === '1d') appliedTf = '1D';
                else if (cleanQuery === '1w') appliedTf = '1W';
                else if (cleanQuery === '1m' && query.trim() === '1M') appliedTf = '1M';
                setTimeframe(appliedTf);
                closeCommandPalette();
              }
            }}
            className="mx-4 mt-2 px-3.5 py-2.5 rounded-xl bg-[#2962ff]/15 border border-[#2962ff]/40 flex items-center justify-between text-white cursor-pointer hover:bg-[#2962ff]/25 transition-colors"
          >
            <div className="flex items-center space-x-2.5">
              <Clock size={16} className="text-[#2962ff]" />
              <span className="font-semibold text-sm">
                Switch chart timeframe to <span className="text-[#2962ff] uppercase">{cleanQuery}</span>
              </span>
            </div>
            <kbd className="px-2 py-0.5 bg-[#2962ff] text-white rounded text-[11px] font-mono font-bold">
              Enter ↵
            </kbd>
          </div>
        )}

        {/* Results List */}
        <div
          ref={listRef}
          role="listbox"
          className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5 custom-scrollbar min-h-[400px]"
        >
          {displayedResults.length > 0 ? (
            displayedResults.map((sym, idx) => {
              const isSelected = idx === selectedIndex;
              const typeTag = formatTypeBadge(sym);

              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  key={`${sym.full_symbol}-${idx}`}
                  onClick={() => handleSelect(sym)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left flex items-center justify-between px-3.5 py-2.5 rounded-xl cursor-pointer transition-colors border-none outline-none ${
                    isSelected ? 'bg-[#1e222d]' : 'hover:bg-[#1a1e29]'
                  }`}
                >
                  {/* Left: Icon + Symbol Name & Description */}
                  <div className="flex items-center space-x-3.5 min-w-0 pr-2">
                    <div className="w-8 h-8 rounded-lg bg-[#1e222d] border border-[#2a2e39] flex items-center justify-center shrink-0 text-[#2962ff]">
                      <TrendingUp size={16} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-[15px] text-white tracking-wide truncate">
                          {sym.symbol}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2 mt-0.5">
                        <span className="text-xs text-[#787b86] truncate max-w-[280px] md:max-w-lg">
                          {sym.description}
                        </span>
                        <span className="bg-[#242835] text-[#8e92a2] text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded shrink-0">
                          {typeTag}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Exchange Badge Text */}
                  <div className="flex items-center shrink-0 ml-2">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[#1e222d] border border-[#2a2e39] text-[#787b86] font-semibold">
                      {sym.exchange}
                    </span>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="py-20 text-center text-[#787b86] flex flex-col items-center justify-center space-y-2">
              <Search size={32} className="text-[#3a3f50] stroke-[1.5]" />
              <div className="text-sm font-medium text-[#d1d4dc]">
                {query ? `No symbols found for "${query}"` : 'No active symbols found'}
              </div>
              <div className="text-xs text-[#787b86]">
                {query ? (
                  <>
                    Press <kbd className="px-1.5 py-0.5 bg-[#1e222d] border border-[#2a2e39] rounded text-[11px] text-white">Enter</kbd> to search directly on {activeTab === 'All' ? 'connected feeds' : activeTab}
                  </>
                ) : (
                  'Type a ticker name, currency pair, or timeframe'
                )}
              </div>
            </div>
          )}
        </div>

        {/* Clean Footer Bar (No Instant Search badge) */}
        <div className="px-4 py-2.5 border-t border-[#222631] bg-[#11141c] flex items-center justify-between text-[11px] text-[#787b86] select-none shrink-0">
          <div className="flex items-center space-x-4">
            <span className="flex items-center space-x-1.5">
              <kbd className="px-1 py-0.5 bg-[#1e222d] border border-[#2a2e39] rounded text-[10px] text-[#d1d4dc]">↑↓</kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <kbd className="px-1 py-0.5 bg-[#1e222d] border border-[#2a2e39] rounded text-[10px] text-[#d1d4dc]">Enter</kbd>
              <span>Select</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <kbd className="px-1 py-0.5 bg-[#1e222d] border border-[#2a2e39] rounded text-[10px] text-[#d1d4dc]">Esc</kbd>
              <span>Close</span>
            </span>
          </div>
          <div className="text-[#50535e] text-[10px] font-mono">
            {displayedResults.length} active symbols
          </div>
        </div>
      </div>
    </div>
  );
};
