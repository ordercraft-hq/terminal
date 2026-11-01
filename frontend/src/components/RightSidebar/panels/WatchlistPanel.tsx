import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Plus,
  MoreVertical,
  ChevronDown,
  ChevronRight,
  X,
  Search,
  SlidersHorizontal,
  Check,
  TableProperties,
  Trash2,
  FolderPlus,
  Edit2,
} from 'lucide-react';
import { useSyncStore } from '../../../store/syncStore';
import type { WatchlistItem } from '../../../store/syncStore';

interface SearchResultItem {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
}

export const WatchlistPanel: React.FC = () => {
  const watchlists = useSyncStore((s) => s.watchlists);
  const activeWatchlistId = useSyncStore((s) => s.activeWatchlistId);
  const setActiveWatchlistId = useSyncStore((s) => s.setActiveWatchlistId);
  const addSymbolToWatchlist = useSyncStore((s) => s.addSymbolToWatchlist);
  const removeSymbolFromWatchlist = useSyncStore((s) => s.removeSymbolFromWatchlist);
  const createWatchlist = useSyncStore((s) => s.createWatchlist);
  const deleteWatchlist = useSyncStore((s) => s.deleteWatchlist);
  const renameWatchlist = useSyncStore((s) => s.renameWatchlist);
  const clearWatchlist = useSyncStore((s) => s.clearWatchlist);
  const sortWatchlist = useSyncStore((s) => s.sortWatchlist);
  const updateWatchlistTick = useSyncStore((s) => s.updateWatchlistTick);

  const tableSettings = useSyncStore((s) => s.watchlistTableSettings);
  const setTableSettings = useSyncStore((s) => s.setWatchlistTableSettings);

  // Local UI state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isTableViewMenuOpen, setIsTableViewMenuOpen] = useState(false);
  const [isOptionsMenuOpen, setIsOptionsMenuOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Search in current watchlist
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected row in watchlist (purely local selection, does NOT load chart)
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  // New symbol search modal state
  const [searchModalQuery, setSearchModalQuery] = useState('');
  const [searchCategory, setSearchCategory] = useState<string>('ALL');
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [targetGroupForAdd, setTargetGroupForAdd] = useState('STOCKS');

  const filteredSearchResults = useMemo(() => {
    if (searchCategory === 'ALL') return searchResults;
    return searchResults.filter((r) => {
      const t = (r.type || '').toUpperCase();
      if (searchCategory === 'STOCKS') return t.includes('EQUITY');
      if (searchCategory === 'CRYPTO') return t.includes('CRYPTO');
      if (searchCategory === 'FOREX') return t.includes('CURRENCY');
      if (searchCategory === 'INDICES') return t.includes('INDEX');
      return true;
    });
  }, [searchResults, searchCategory]);

  const currentWatchlist = useMemo(() => {
    return watchlists.find((w) => w.id === activeWatchlistId) || watchlists[0];
  }, [watchlists, activeWatchlistId]);

  // Ref to hold all symbols for polling
  const symbolsRef = useRef<string[]>([]);
  symbolsRef.current = useMemo(() => {
    if (!currentWatchlist) return [];
    return currentWatchlist.items.map((it) => it.symbol);
  }, [currentWatchlist]);

  // Fetch live quotes from Go backend (/api/watchlist/quotes)
  const fetchLiveQuotes = async () => {
    const list = symbolsRef.current;
    if (list.length === 0) return;

    try {
      const endpoint = `/api/watchlist/quotes?symbols=${encodeURIComponent(
        list.join(',')
      )}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.quotes)) {
          for (const q of json.quotes) {
            const sym = q.originalKey || q.symbol;
            updateWatchlistTick(sym, q.price, q.change, q.changePct, q.volume, q.name);
          }
        }
      }
    } catch {
      // Backend may be warming up
    }
  };

  // Poll live quotes on mount and every 20s
  useEffect(() => {
    fetchLiveQuotes();
    const interval = setInterval(fetchLiveQuotes, 20000);
    return () => clearInterval(interval);
  }, [activeWatchlistId]);

  // Debounced search for the Add Symbol Modal
  useEffect(() => {
    if (!isAddModalOpen) return;
    if (!searchModalQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/watchlist/search?q=${encodeURIComponent(
            searchModalQuery.trim()
          )}`
        );
        if (res.ok) {
          const json = await res.json();
          setSearchResults(json.results || []);
        }
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchModalQuery, isAddModalOpen]);

  // Group items
  const groupedItems = useMemo(() => {
    if (!currentWatchlist) return {};
    const groups: Record<string, WatchlistItem[]> = {};

    const filtered = currentWatchlist.items.filter((it) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        it.symbol.toLowerCase().includes(q) ||
        (it.name && it.name.toLowerCase().includes(q))
      );
    });

    for (const item of filtered) {
      const g = item.group || 'GENERAL';
      if (!groups[g]) groups[g] = [];
      groups[g].push(item);
    }
    return groups;
  }, [currentWatchlist, searchQuery]);

  const toggleGroup = (grp: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [grp]: !prev[grp] }));
  };

  const handleRenameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameValue.trim() || !currentWatchlist) return;
    renameWatchlist(currentWatchlist.id, renameValue.trim());
    setIsRenameOpen(false);
  };

  const handleAddSectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectionName.trim() || !currentWatchlist) return;
    // Insert a dummy item with the new section name so the group shows up
    addSymbolToWatchlist(currentWatchlist.id, `${newSectionName.toUpperCase()}_SECTION`, newSectionName.trim().toUpperCase());
    setNewSectionName('');
    setIsAddSectionOpen(false);
  };

  const handleAddSymbolFromModal = (res: SearchResultItem) => {
    if (!currentWatchlist) return;
    addSymbolToWatchlist(currentWatchlist.id, res.symbol, targetGroupForAdd, res.name);
    setIsAddModalOpen(false);
    setSearchModalQuery('');
    setTimeout(fetchLiveQuotes, 300);
  };

  const getBadgeInfo = (symbol: string) => {
    const clean = symbol.replace('OANDA:', '').replace('BINANCE:', '').toUpperCase();
    if (clean.includes('NAS100') || clean.includes('NDX') || clean.includes('NQ')) {
      return { text: '100', bg: 'bg-[#0052cc] text-white' };
    }
    if (clean.includes('SPX500') || clean.includes('GSPC') || clean.includes('ES')) {
      return { text: '500', bg: 'bg-[#d32f2f] text-white' };
    }
    if (clean.includes('US30') || clean.includes('DJI') || clean.includes('YM')) {
      return { text: '30', bg: 'bg-[#e65100] text-white' };
    }
    if (clean.includes('BTC')) {
      return { text: '₿', bg: 'bg-[#f7931a] text-white' };
    }
    if (clean.includes('ETH')) {
      return { text: 'Ξ', bg: 'bg-[#627eea] text-white' };
    }
    if (clean.includes('SOL')) {
      return { text: '◎', bg: 'bg-[#14f195] text-black font-bold' };
    }
    if (clean.includes('XRP')) {
      return { text: '✕', bg: 'bg-[#23292f] text-white font-bold' };
    }
    if (clean === 'AAPL') {
      return { text: 'AP', bg: 'bg-[#a2aaad] text-black font-bold' };
    }
    if (clean === 'MSFT') {
      return { text: 'MS', bg: 'bg-[#00a4ef] text-white font-bold' };
    }
    if (clean === 'NVDA') {
      return { text: 'NV', bg: 'bg-[#76b900] text-black font-bold' };
    }
    if (clean === 'TSLA') {
      return { text: 'TS', bg: 'bg-[#cc0000] text-white font-bold' };
    }
    return {
      text: clean.slice(0, 2),
      bg: 'bg-[#2a2e39] text-[#d1d4dc]',
    };
  };

  const formatPrice = (price?: number) => {
    if (price === undefined || isNaN(price)) return '—';
    if (price > 1000) return price.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
    if (price > 1) return price.toFixed(2);
    return price.toFixed(4);
  };

  const formatVolume = (vol?: number) => {
    if (!vol) return '—';
    if (vol >= 1e9) return `${(vol / 1e9).toFixed(1)}B`;
    if (vol >= 1e6) return `${(vol / 1e6).toFixed(1)}M`;
    if (vol >= 1e3) return `${(vol / 1e3).toFixed(0)}K`;
    return vol.toString();
  };

  // Close menus on outside click
  const dropdownRef = useRef<HTMLDivElement>(null);
  const tableViewRef = useRef<HTMLDivElement>(null);
  const optionsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsDropdownOpen(false);
      }
      if (tableViewRef.current && !tableViewRef.current.contains(target)) {
        setIsTableViewMenuOpen(false);
      }
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(target)) {
        setIsOptionsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#131722] text-[#d1d4dc] select-none text-xs">
      {/* 1. Header Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2e39] bg-[#181b27]">
        {/* Watchlist Dropdown Selector */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center space-x-1.5 font-semibold text-white hover:text-[#2962ff] transition-colors cursor-pointer text-sm"
          >
            <span className="truncate max-w-[130px]">{currentWatchlist?.name || 'Watchlist'}</span>
            <ChevronDown size={14} className="text-[#787b86]" />
          </button>

          {isDropdownOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-52 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl z-50 py-1 divide-y divide-[#2a2e39]/50">
              <div>
                <div className="px-3 py-1.5 text-[10px] uppercase font-bold text-[#787b86] tracking-wider">
                  Watchlists
                </div>
                {watchlists.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => {
                      setActiveWatchlistId(w.id);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 hover:bg-[#2a2e39] text-left transition-colors cursor-pointer ${
                      w.id === activeWatchlistId ? 'text-[#2962ff] font-medium' : 'text-[#d1d4dc]'
                    }`}
                  >
                    <span className="truncate">{w.name}</span>
                    {w.id === activeWatchlistId && <Check size={14} />}
                  </button>
                ))}
              </div>
              <div className="pt-1">
                <button
                  onClick={() => {
                    setIsDropdownOpen(false);
                    const name = prompt('Enter new watchlist name:');
                    if (name && name.trim()) {
                      createWatchlist(name.trim());
                    }
                  }}
                  className="w-full flex items-center space-x-1.5 px-3 py-1.5 hover:bg-[#2a2e39] text-[#2962ff] text-left transition-colors cursor-pointer font-medium"
                >
                  <Plus size={14} />
                  <span>Create new watchlist</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Action Icons: [+] [Table View] [Search] [...] */}
        <div className="flex items-center space-x-0.5">
          {/* Add Symbol Button */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="p-1.5 rounded-md hover:bg-[#2a2e39] text-[#787b86] hover:text-white transition-colors cursor-pointer"
            title="Add Symbol"
          >
            <Plus size={16} />
          </button>

          {/* Table View / Columns Customizer Button (Matching Screenshot 2) */}
          <div className="relative" ref={tableViewRef}>
            <button
              onClick={() => setIsTableViewMenuOpen(!isTableViewMenuOpen)}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                isTableViewMenuOpen
                  ? 'bg-[#2962ff]/20 text-[#2962ff]'
                  : 'hover:bg-[#2a2e39] text-[#787b86] hover:text-white'
              }`}
              title="Table View Settings"
            >
              <TableProperties size={15} />
            </button>

            {/* Popover matching Screenshot 2 */}
            {isTableViewMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-60 bg-[#1e222d] border border-[#2a2e39] rounded-xl shadow-2xl z-50 p-3 space-y-3">
                {/* Table View Switch */}
                <div className="flex items-center justify-between pb-2 border-b border-[#2a2e39]">
                  <span className="font-semibold text-white text-xs">Table view</span>
                  <button
                    onClick={() =>
                      setTableSettings({ isTableView: !tableSettings.isTableView })
                    }
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      tableSettings.isTableView ? 'bg-[#2962ff]' : 'bg-[#2a2e39]'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        tableSettings.isTableView ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Customize Columns Checkboxes */}
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase font-bold text-[#787b86] tracking-wider mb-1">
                    Customize Columns
                  </div>
                  {[
                    { key: 'showLast', label: 'Last' },
                    { key: 'showChange', label: 'Change' },
                    { key: 'showChangePct', label: 'Change %' },
                    { key: 'showVolume', label: 'Volume' },
                    { key: 'showExtendedHours', label: 'Extended Hours' },
                  ].map((col) => {
                    const isChecked = !!(tableSettings as any)[col.key];
                    return (
                      <label
                        key={col.key}
                        className="flex items-center space-x-2.5 text-xs text-[#d1d4dc] hover:text-white cursor-pointer select-none py-0.5"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) =>
                            setTableSettings({ [col.key]: e.target.checked })
                          }
                          className="w-3.5 h-3.5 rounded border-[#2a2e39] bg-[#131722] text-[#2962ff] focus:ring-0 cursor-pointer"
                        />
                        <span>{col.label}</span>
                      </label>
                    );
                  })}
                </div>

                {/* Symbol Display Radios */}
                <div className="space-y-1.5 pt-2 border-t border-[#2a2e39]">
                  <div className="text-[10px] uppercase font-bold text-[#787b86] tracking-wider mb-1">
                    Symbol Display
                  </div>
                  <label className="flex items-center space-x-2.5 text-xs text-[#d1d4dc] hover:text-white cursor-pointer select-none py-0.5">
                    <input
                      type="checkbox"
                      checked={tableSettings.showLogo}
                      onChange={(e) =>
                        setTableSettings({ showLogo: e.target.checked })
                      }
                      className="w-3.5 h-3.5 rounded border-[#2a2e39] bg-[#131722] text-[#2962ff] focus:ring-0 cursor-pointer"
                    />
                    <span>Logo</span>
                  </label>
                  <label className="flex items-center space-x-2.5 text-xs text-[#d1d4dc] hover:text-white cursor-pointer select-none py-0.5">
                    <input
                      type="radio"
                      name="symDisplay"
                      checked={tableSettings.symbolDisplay === 'symbol'}
                      onChange={() => setTableSettings({ symbolDisplay: 'symbol' })}
                      className="w-3.5 h-3.5 border-[#2a2e39] bg-[#131722] text-[#2962ff] focus:ring-0 cursor-pointer"
                    />
                    <span>Symbol</span>
                  </label>
                  <label className="flex items-center space-x-2.5 text-xs text-[#d1d4dc] hover:text-white cursor-pointer select-none py-0.5">
                    <input
                      type="radio"
                      name="symDisplay"
                      checked={tableSettings.symbolDisplay === 'name'}
                      onChange={() => setTableSettings({ symbolDisplay: 'name' })}
                      className="w-3.5 h-3.5 border-[#2a2e39] bg-[#131722] text-[#2962ff] focus:ring-0 cursor-pointer"
                    />
                    <span>Name</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Search Toggle Button */}
          <button
            onClick={() => {
              setIsSearchActive(!isSearchActive);
              if (isSearchActive) setSearchQuery('');
            }}
            className={`p-1.5 rounded-md transition-colors cursor-pointer ${
              isSearchActive
                ? 'bg-[#2962ff]/20 text-[#2962ff]'
                : 'hover:bg-[#2a2e39] text-[#787b86] hover:text-white'
            }`}
            title="Search Watchlist"
          >
            <Search size={15} />
          </button>

          {/* 3 Dots Options Button (Matching Screenshot 3) */}
          <div className="relative" ref={optionsMenuRef}>
            <button
              onClick={() => setIsOptionsMenuOpen(!isOptionsMenuOpen)}
              className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                isOptionsMenuOpen
                  ? 'bg-[#2a2e39] text-white'
                  : 'hover:bg-[#2a2e39] text-[#787b86] hover:text-white'
              }`}
              title="Watchlist Options"
            >
              <MoreVertical size={15} />
            </button>

            {isOptionsMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-[#1e222d] border border-[#2a2e39] rounded-xl shadow-2xl z-50 py-1.5 divide-y divide-[#2a2e39]/50 text-xs">
                {/* Sorting options */}
                <div className="py-1">
                  <div className="px-3 py-1 text-[10px] uppercase font-bold text-[#787b86] tracking-wider">
                    Sort By
                  </div>
                  <button
                    onClick={() => {
                      if (currentWatchlist) sortWatchlist(currentWatchlist.id, 'symbol_asc');
                      setIsOptionsMenuOpen(false);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-[#2a2e39] text-left text-[#d1d4dc] hover:text-white flex items-center justify-between cursor-pointer"
                  >
                    <span>Symbol (A-Z)</span>
                  </button>
                  <button
                    onClick={() => {
                      if (currentWatchlist) sortWatchlist(currentWatchlist.id, 'chg_desc');
                      setIsOptionsMenuOpen(false);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-[#2a2e39] text-left text-[#d1d4dc] hover:text-white flex items-center justify-between cursor-pointer"
                  >
                    <span>% Change (Gainers)</span>
                  </button>
                  <button
                    onClick={() => {
                      if (currentWatchlist) sortWatchlist(currentWatchlist.id, 'chg_asc');
                      setIsOptionsMenuOpen(false);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-[#2a2e39] text-left text-[#d1d4dc] hover:text-white flex items-center justify-between cursor-pointer"
                  >
                    <span>% Change (Losers)</span>
                  </button>
                  <button
                    onClick={() => {
                      if (currentWatchlist) sortWatchlist(currentWatchlist.id, 'price_desc');
                      setIsOptionsMenuOpen(false);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-[#2a2e39] text-left text-[#d1d4dc] hover:text-white flex items-center justify-between cursor-pointer"
                  >
                    <span>Price (High to Low)</span>
                  </button>
                  <button
                    onClick={() => {
                      if (currentWatchlist) sortWatchlist(currentWatchlist.id, 'vol_desc');
                      setIsOptionsMenuOpen(false);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-[#2a2e39] text-left text-[#d1d4dc] hover:text-white flex items-center justify-between cursor-pointer"
                  >
                    <span>Volume</span>
                  </button>
                </div>

                {/* Management Options */}
                <div className="py-1">
                  <button
                    onClick={() => {
                      setRenameValue(currentWatchlist?.name || '');
                      setIsRenameOpen(true);
                      setIsOptionsMenuOpen(false);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-[#2a2e39] text-left text-[#d1d4dc] hover:text-white flex items-center space-x-2 cursor-pointer"
                  >
                    <Edit2 size={13} />
                    <span>Rename Watchlist</span>
                  </button>
                  <button
                    onClick={() => {
                      setIsAddSectionOpen(true);
                      setIsOptionsMenuOpen(false);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-[#2a2e39] text-left text-[#d1d4dc] hover:text-white flex items-center space-x-2 cursor-pointer"
                  >
                    <FolderPlus size={13} />
                    <span>Add Section Divider</span>
                  </button>
                </div>

                {/* Danger zone */}
                <div className="pt-1">
                  <button
                    onClick={() => {
                      if (currentWatchlist && confirm(`Clear all items from "${currentWatchlist.name}"?`)) {
                        clearWatchlist(currentWatchlist.id);
                      }
                      setIsOptionsMenuOpen(false);
                    }}
                    className="w-full px-3 py-1.5 hover:bg-[#f23645]/20 text-left text-[#f23645] flex items-center space-x-2 cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Clear Watchlist</span>
                  </button>
                  {watchlists.length > 1 && (
                    <button
                      onClick={() => {
                        if (currentWatchlist && confirm(`Delete "${currentWatchlist.name}"?`)) {
                          deleteWatchlist(currentWatchlist.id);
                        }
                        setIsOptionsMenuOpen(false);
                      }}
                      className="w-full px-3 py-1.5 hover:bg-[#f23645]/20 text-left text-[#f23645] flex items-center space-x-2 cursor-pointer"
                    >
                      <X size={13} />
                      <span>Delete Watchlist</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. Top Search Filter Input (When toggled) */}
      {isSearchActive && (
        <div className="px-3 py-1.5 border-b border-[#2a2e39] bg-[#181b27]/60 flex items-center space-x-2">
          <Search size={13} className="text-[#2962ff]" />
          <input
            type="text"
            placeholder="Filter current symbols..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-xs text-white placeholder-[#787b86] outline-none"
            autoFocus
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="text-[#787b86] hover:text-white cursor-pointer"
            >
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {/* Rename Watchlist Form Modal */}
      {isRenameOpen && (
        <form onSubmit={handleRenameSubmit} className="p-2 border-b border-[#2a2e39] bg-[#181b27] flex items-center space-x-1.5">
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="New name..."
            className="flex-1 bg-[#131722] border border-[#2a2e39] rounded px-2 py-1 text-xs text-white outline-none focus:border-[#2962ff]"
            autoFocus
          />
          <button
            type="submit"
            className="px-2.5 py-1 bg-[#2962ff] text-white rounded text-xs font-semibold cursor-pointer"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setIsRenameOpen(false)}
            className="p-1 text-[#787b86] hover:text-white cursor-pointer"
          >
            <X size={14} />
          </button>
        </form>
      )}

      {/* Add Section Header Form Modal */}
      {isAddSectionOpen && (
        <form onSubmit={handleAddSectionSubmit} className="p-2 border-b border-[#2a2e39] bg-[#181b27] flex items-center space-x-1.5">
          <input
            type="text"
            value={newSectionName}
            onChange={(e) => setNewSectionName(e.target.value)}
            placeholder="New section title (e.g. TECH, COMMODITIES)..."
            className="flex-1 bg-[#131722] border border-[#2a2e39] rounded px-2 py-1 text-xs text-white outline-none focus:border-[#2962ff]"
            autoFocus
          />
          <button
            type="submit"
            className="px-2.5 py-1 bg-[#2962ff] text-white rounded text-xs font-semibold cursor-pointer"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setIsAddSectionOpen(false)}
            className="p-1 text-[#787b86] hover:text-white cursor-pointer"
          >
            <X size={14} />
          </button>
        </form>
      )}

      {/* 3. Table Column Headers */}
      <div className="grid grid-cols-12 px-3 py-1.5 border-b border-[#2a2e39] text-[10px] font-semibold text-[#787b86] uppercase tracking-wider bg-[#131722]">
        <div
          className={`${
            tableSettings.showVolume ? 'col-span-4' : 'col-span-5'
          } text-left`}
        >
          Symbol
        </div>
        {tableSettings.showLast && (
          <div
            className={`${
              tableSettings.showVolume ? 'col-span-3' : 'col-span-3'
            } text-right`}
          >
            Last
          </div>
        )}
        {tableSettings.showChange && (
          <div className="col-span-2 text-right">Chg</div>
        )}
        {tableSettings.showChangePct && (
          <div
            className={`${
              tableSettings.showVolume ? 'col-span-1.5' : 'col-span-2'
            } text-right`}
          >
            Chg%
          </div>
        )}
        {tableSettings.showVolume && (
          <div className="col-span-1.5 text-right">Vol</div>
        )}
      </div>

      {/* 4. Watchlist Items List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#2a2e39]/30">
        {Object.keys(groupedItems).length === 0 ? (
          <div className="py-12 text-center text-xs text-[#787b86]">
            No symbols found in this watchlist.
            <div className="mt-2">
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="text-[#2962ff] hover:underline font-medium cursor-pointer"
              >
                + Add Symbol
              </button>
            </div>
          </div>
        ) : (
          Object.entries(groupedItems).map(([groupName, items]) => {
            const isCollapsed = collapsedGroups[groupName];
            return (
              <div key={groupName} className="flex flex-col">
                {/* Group Header */}
                <button
                  onClick={() => toggleGroup(groupName)}
                  className="flex items-center space-x-1.5 px-3 py-1 bg-[#181b27]/80 text-[10px] font-bold text-[#787b86] uppercase tracking-wider hover:text-[#d1d4dc] transition-colors cursor-pointer"
                >
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                  <span>{groupName}</span>
                  <span className="text-[9px] font-mono opacity-60">({items.length})</span>
                </button>

                {/* Items in Section */}
                {!isCollapsed &&
                  items.map((item) => {
                    const isSelected = item.symbol === selectedSymbol;
                    const badge = getBadgeInfo(item.symbol);
                    const isPositive = (item.changePct ?? 0) >= 0;
                    const isNegative = (item.changePct ?? 0) < 0;

                    // Display symbol text or name text
                    let mainText = item.symbol;
                    let subText = item.name;
                    if (tableSettings.symbolDisplay === 'name' && item.name) {
                      mainText = item.name;
                      subText = item.symbol;
                    }

                    return (
                      <div
                        key={item.symbol}
                        onClick={() => setSelectedSymbol(item.symbol)}
                        className={`group relative grid grid-cols-12 items-center px-3 py-2 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#2962ff]/20 text-white font-medium shadow-sm'
                            : 'hover:bg-[#1e222d] text-[#d1d4dc]'
                        }`}
                      >
                        {/* Symbol Column */}
                        <div
                          className={`${
                            tableSettings.showVolume ? 'col-span-4' : 'col-span-5'
                          } flex items-center space-x-2 min-w-0 pr-1`}
                        >
                          {tableSettings.showLogo && (
                            <span
                              className={`w-4.5 h-4.5 rounded-full flex items-center justify-center text-[9px] shrink-0 ${badge.bg}`}
                            >
                              {badge.text}
                            </span>
                          )}
                          <div className="flex flex-col min-w-0">
                            <span className="truncate font-semibold tracking-tight text-[11px] text-white">
                              {mainText}
                            </span>
                            {tableSettings.symbolDisplay === 'both' && subText && subText !== mainText && (
                              <span className="text-[9px] text-[#787b86] truncate">
                                {subText}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Last Price Column */}
                        {tableSettings.showLast && (
                          <div
                            className={`${
                              tableSettings.showVolume ? 'col-span-3' : 'col-span-3'
                            } text-right font-mono font-medium text-[11px] transition-colors`}
                          >
                            {formatPrice(item.lastPrice)}
                          </div>
                        )}

                        {/* Change Column */}
                        {tableSettings.showChange && (
                          <div
                            className={`col-span-2 text-right font-mono text-[10px] ${
                              isPositive
                                ? 'text-[#089981]'
                                : isNegative
                                ? 'text-[#f23645]'
                                : 'text-[#787b86]'
                            }`}
                          >
                            {item.change !== undefined
                              ? `${item.change > 0 ? '+' : ''}${formatPrice(item.change)}`
                              : '—'}
                          </div>
                        )}

                        {/* Change % Column */}
                        {tableSettings.showChangePct && (
                          <div
                            className={`${
                              tableSettings.showVolume ? 'col-span-1.5' : 'col-span-2'
                            } text-right font-mono font-medium text-[10px] ${
                              isPositive
                                ? 'text-[#089981]'
                                : isNegative
                                ? 'text-[#f23645]'
                                : 'text-[#787b86]'
                            }`}
                          >
                            {item.changePct !== undefined
                              ? `${item.changePct > 0 ? '+' : ''}${item.changePct.toFixed(2)}%`
                              : '—'}
                          </div>
                        )}

                        {/* Volume Column (when enabled) */}
                        {tableSettings.showVolume && (
                          <div className="col-span-1.5 text-right font-mono text-[9px] text-[#787b86]">
                            {formatVolume(item.volume)}
                          </div>
                        )}

                        {/* Hover Delete Action */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (currentWatchlist) {
                              removeSymbolFromWatchlist(currentWatchlist.id, item.symbol);
                            }
                          }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-[#787b86] hover:text-[#f23645] bg-[#1e222d] rounded opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shadow"
                          title="Remove from watchlist"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
              </div>
            );
          })
        )}
      </div>

      {/* 5. Bottom Active Ticker Status Bar (matches screenshot) */}
      <div className="px-3 py-2 border-t border-[#2a2e39] bg-[#181b27] flex items-center justify-between">
        <div className="flex items-center space-x-2 min-w-0">
          <span className="w-5 h-5 rounded-full bg-[#2962ff] text-white flex items-center justify-center font-bold text-[10px] shrink-0">
            {getBadgeInfo(selectedSymbol || currentWatchlist?.items[0]?.symbol || 'AAPL').text}
          </span>
          <span className="font-bold text-white text-xs truncate">
            {selectedSymbol || currentWatchlist?.items[0]?.symbol || 'Select a symbol'}
          </span>
        </div>

        <div className="flex items-center space-x-1.5 text-[#787b86]">
          <button
            onClick={() => setIsTableViewMenuOpen(true)}
            className="p-1 hover:text-white hover:bg-[#2a2e39] rounded transition-colors cursor-pointer"
            title="Columns"
          >
            <SlidersHorizontal size={13} />
          </button>
          <button
            onClick={() => setIsOptionsMenuOpen(true)}
            className="p-1 hover:text-white hover:bg-[#2a2e39] rounded transition-colors cursor-pointer"
            title="Options"
          >
            <MoreVertical size={13} />
          </button>
        </div>
      </div>

      {/* 6. Comprehensive Symbol Search Modal (Add Symbol) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none animate-in fade-in duration-100">
          <div className="fixed inset-0" onClick={() => setIsAddModalOpen(false)} />

          <div className="relative w-full max-w-lg bg-[#1e222d] border border-[#2a2e39] rounded-xl shadow-2xl overflow-hidden flex flex-col z-10 animate-in zoom-in-95 duration-100">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2e39] bg-[#181b27]">
              <div className="flex items-center space-x-2 font-bold text-white text-sm">
                <Search size={16} className="text-[#2962ff]" />
                <span>Add Symbol to Watchlist</span>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-[#787b86] hover:text-white p-1 rounded hover:bg-[#2a2e39] cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Search Input Bar */}
            <div className="p-3 border-b border-[#2a2e39] bg-[#131722]/50">
              <div className="relative flex items-center">
                <Search size={15} className="absolute left-3 text-[#787b86]" />
                <input
                  type="text"
                  placeholder="Search ticker, company name, crypto, forex (e.g. AAPL, NVDA, BTC, EURUSD)..."
                  value={searchModalQuery}
                  onChange={(e) => setSearchModalQuery(e.target.value)}
                  className="w-full bg-[#181b27] border border-[#2a2e39] focus:border-[#2962ff] rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-[#787b86] outline-none"
                  autoFocus
                />
              </div>

              {/* Category Filter Tabs */}
              <div className="flex items-center space-x-1.5 mt-2 overflow-x-auto pb-1">
                {[
                  { id: 'ALL', label: 'All' },
                  { id: 'STOCKS', label: 'Stocks' },
                  { id: 'CRYPTO', label: 'Crypto' },
                  { id: 'FOREX', label: 'Forex' },
                  { id: 'INDICES', label: 'Indices' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSearchCategory(cat.id)}
                    className={`px-2.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                      searchCategory === cat.id
                        ? 'bg-white text-black'
                        : 'bg-[#181b27] hover:bg-[#2a2e39] text-[#787b86] hover:text-white'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Destination Section Selector */}
              <div className="flex items-center space-x-2 mt-2 text-[11px] text-[#787b86]">
                <span>Add to Section:</span>
                {['STOCKS', 'CRYPTO', 'FOREX', 'INDICES', 'ALTS'].map((grp) => (
                  <button
                    key={grp}
                    type="button"
                    onClick={() => setTargetGroupForAdd(grp)}
                    className={`px-2 py-0.5 rounded cursor-pointer font-medium transition-colors ${
                      targetGroupForAdd === grp
                        ? 'bg-[#2962ff] text-white'
                        : 'bg-[#181b27] hover:bg-[#2a2e39] text-[#787b86]'
                    }`}
                  >
                    {grp}
                  </button>
                ))}
              </div>
            </div>

            {/* Results List */}
            <div className="max-h-80 min-h-48 overflow-y-auto divide-y divide-[#2a2e39]/50 p-1">
              {isSearching ? (
                <div className="py-12 text-center text-xs text-[#787b86]">
                  Searching global tickers...
                </div>
              ) : filteredSearchResults.length === 0 ? (
                <div className="py-12 text-center text-xs text-[#787b86]">
                  {searchModalQuery.trim()
                    ? 'No matching instruments found. Try another keyword.'
                    : 'Type a ticker or asset name above to search across all markets.'}
                </div>
              ) : (
                filteredSearchResults.map((res) => {
                  const badge = getBadgeInfo(res.symbol);
                  return (
                    <div
                      key={res.symbol}
                      onClick={() => handleAddSymbolFromModal(res)}
                      className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#2a2e39] transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <span
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 ${badge.bg}`}
                        >
                          {badge.text}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-white text-xs truncate">
                            {res.symbol}
                          </span>
                          <span className="text-[11px] text-[#787b86] truncate">
                            {res.name}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        {res.exchange && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#131722] text-[#787b86] border border-[#2a2e39]">
                            {res.exchange}
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#2962ff]/20 text-[#2962ff] font-semibold">
                          {res.type || 'EQUITY'}
                        </span>
                        <button className="px-2.5 py-1 rounded bg-[#2962ff] hover:bg-[#1e54e4] text-white text-xs font-semibold cursor-pointer">
                          + Add
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-[#2a2e39] bg-[#181b27] text-xs text-[#787b86]">
              <span>Powered by Yahoo Finance multi-market quotes</span>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-3 py-1 rounded bg-[#2a2e39] hover:bg-[#363a45] text-white cursor-pointer font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
