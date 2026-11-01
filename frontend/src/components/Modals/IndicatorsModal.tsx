import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useSyncStore } from '../../store/syncStore';
import { INDICATOR_REGISTRY, ALL_INDICATOR_TYPES } from '../../indicators/registry';
import type { IndicatorType } from '../../indicators/types';
import {
  Search,
  X,
  Star,
  Activity,
  TrendingUp,
  Sliders,
  Check,
  Eye,
  EyeOff,
  Settings,
  Trash2,
} from 'lucide-react';

interface IndicatorsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'all' | 'overlay' | 'subpane' | 'favorites' | 'active';

export const IndicatorsModal: React.FC<IndicatorsModalProps> = ({ isOpen, onClose }) => {
  const activePaneId = useSyncStore((s) => s.activePaneId);
  const panes = useSyncStore((s) => s.panes);
  const activePane = panes[activePaneId] || Object.values(panes)[0];
  const indicatorsMap = useSyncStore((s) => s.indicators);
  const activeIndicators = indicatorsMap[activePaneId] || [];

  const favoriteIndicators = useSyncStore((s) => s.favoriteIndicators);
  const toggleFavoriteIndicator = useSyncStore((s) => s.toggleFavoriteIndicator);
  const addIndicatorToPane = useSyncStore((s) => s.addIndicatorToPane);
  const removeIndicatorFromPane = useSyncStore((s) => s.removeIndicatorFromPane);
  const toggleIndicatorVisibility = useSyncStore((s) => s.toggleIndicatorVisibility);
  const openIndicatorSettings = useSyncStore((s) => s.openIndicatorSettings);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const filteredIndicators = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return ALL_INDICATOR_TYPES.filter((type) => {
      const def = INDICATOR_REGISTRY[type];
      if (!def) return false;

      // Filter by tab
      if (activeTab === 'overlay' && def.category !== 'overlay') return false;
      if (activeTab === 'subpane' && def.category !== 'subpane') return false;
      if (activeTab === 'favorites' && !favoriteIndicators.includes(type)) return false;

      // Filter by search
      if (!q) return true;
      return (
        def.name.toLowerCase().includes(q) ||
        def.shortName.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q) ||
        type.toLowerCase().includes(q)
      );
    });
  }, [searchQuery, activeTab, favoriteIndicators]);

  if (!isOpen) return null;

  const handleAddIndicator = (type: IndicatorType) => {
    addIndicatorToPane(activePaneId, type);
    setRecentlyAddedId(type);
    setTimeout(() => {
      setRecentlyAddedId(null);
    }, 1200);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs select-none"
      onClick={onClose}
    >
      <div
        className="w-[740px] max-w-[95vw] h-[580px] max-h-[90vh] flex flex-col rounded-xl border border-[#2a2e39] bg-[#1e222d] shadow-2xl overflow-hidden text-[#d1d4dc]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2e39] bg-[#171a22]">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#2962ff]/15 text-[#2962ff]">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white tracking-wide">Indicators & Strategies</h2>
              <p className="text-xs text-[#787b86]">
                Target chart: <span className="text-[#2962ff] font-medium">{activePane?.symbol || 'Active Chart'}</span> ({activePane?.timeframe || '15m'})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#787b86] hover:text-white hover:bg-[#2a2e39] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b border-[#2a2e39] bg-[#191d26]">
          <div className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-[#787b86]" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search indicators (e.g. SMA, RSI, MACD, Bollinger Bands...)"
              className="w-full pl-9 pr-8 py-2 rounded-lg bg-[#131722] border border-[#2a2e39] text-sm text-white placeholder-[#787b86] focus:outline-none focus:border-[#2962ff] transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 text-[#787b86] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1.5 mt-3">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'all'
                  ? 'bg-[#2962ff] text-white shadow-sm'
                  : 'bg-[#2a2e39]/50 text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
              }`}
            >
              All ({ALL_INDICATOR_TYPES.length})
            </button>
            <button
              onClick={() => setActiveTab('overlay')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'overlay'
                  ? 'bg-[#2962ff] text-white shadow-sm'
                  : 'bg-[#2a2e39]/50 text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Overlays & Trend
            </button>
            <button
              onClick={() => setActiveTab('subpane')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'subpane'
                  ? 'bg-[#2962ff] text-white shadow-sm'
                  : 'bg-[#2a2e39]/50 text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Oscillators
            </button>
            <button
              onClick={() => setActiveTab('favorites')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'favorites'
                  ? 'bg-[#2962ff] text-white shadow-sm'
                  : 'bg-[#2a2e39]/50 text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
              }`}
            >
              <Star className="w-3.5 h-3.5 fill-current text-amber-400" />
              Favorites ({favoriteIndicators.length})
            </button>
            <button
              onClick={() => setActiveTab('active')}
              className={`flex items-center gap-1 ml-auto px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'active'
                  ? 'bg-[#089981] text-white shadow-sm'
                  : 'bg-[#089981]/20 text-[#089981] hover:bg-[#089981]/30'
              }`}
            >
              Active on Chart ({activeIndicators.length})
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#2a2e39]/60 px-2 py-1">
          {activeTab === 'active' ? (
            // Active Indicators View
            activeIndicators.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-16 text-[#787b86]">
                <Activity className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">No indicators currently added to this chart.</p>
                <p className="text-xs mt-1 text-[#50535e]">Select an indicator from the tabs above to apply it.</p>
              </div>
            ) : (
              <div className="py-2 space-y-1.5">
                {activeIndicators.map((ind) => (
                  <div
                    key={ind.id}
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-[#171a22] border border-[#2a2e39] hover:border-[#363a45] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            Object.values(ind.styles)[0]?.color || '#2962ff',
                        }}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">{ind.name}</span>
                          <span
                            className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                              ind.category === 'overlay'
                                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                : 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                            }`}
                          >
                            {ind.category}
                          </span>
                        </div>
                        <p className="text-xs text-[#787b86] font-mono mt-0.5">
                          {Object.entries(ind.inputs)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(', ')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => toggleIndicatorVisibility(activePaneId, ind.id)}
                        className={`p-1.5 rounded-md hover:bg-[#2a2e39] transition-colors ${
                          ind.visible ? 'text-[#787b86] hover:text-white' : 'text-red-400'
                        }`}
                        title={ind.visible ? 'Hide indicator' : 'Show indicator'}
                      >
                        {ind.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => openIndicatorSettings(activePaneId, ind.id)}
                        className="p-1.5 rounded-md text-[#787b86] hover:text-white hover:bg-[#2a2e39] transition-colors"
                        title="Indicator settings"
                      >
                        <Settings className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => removeIndicatorFromPane(activePaneId, ind.id)}
                        className="p-1.5 rounded-md text-[#787b86] hover:text-[#f23645] hover:bg-[#f23645]/15 transition-colors"
                        title="Remove from chart"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : filteredIndicators.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16 text-[#787b86]">
              <Search className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm">No indicators match "{searchQuery}"</p>
              <p className="text-xs mt-1 text-[#50535e]">Try searching for SMA, EMA, RSI, MACD, or Bollinger</p>
            </div>
          ) : (
            filteredIndicators.map((type) => {
              const def = INDICATOR_REGISTRY[type];
              const isFav = favoriteIndicators.includes(type);
              const isAdded = recentlyAddedId === type;

              return (
                <div
                  key={type}
                  className="flex items-center justify-between px-3.5 py-3 hover:bg-[#171a22] rounded-lg transition-colors group cursor-pointer"
                  onClick={() => handleAddIndicator(type)}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavoriteIndicator(type);
                      }}
                      className="mt-0.5 p-1 rounded hover:bg-[#2a2e39] transition-colors"
                      title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                    >
                      <Star
                        className={`w-4 h-4 ${
                          isFav
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-[#434651] group-hover:text-[#787b86]'
                        }`}
                      />
                    </button>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white group-hover:text-[#2962ff] transition-colors">
                          {def.name}
                        </span>
                        <span
                          className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                            def.category === 'overlay'
                              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/25'
                              : 'bg-purple-500/15 text-purple-400 border border-purple-500/25'
                          }`}
                        >
                          {def.category}
                        </span>
                      </div>
                      <p className="text-xs text-[#787b86] mt-0.5 max-w-[500px]">
                        {def.description}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAddIndicator(type);
                    }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      isAdded
                        ? 'bg-[#089981] text-white shadow-sm'
                        : 'bg-[#2a2e39] text-[#d1d4dc] group-hover:bg-[#2962ff] group-hover:text-white'
                    }`}
                  >
                    {isAdded ? (
                      <span className="flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Added
                      </span>
                    ) : (
                      '+ Add'
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#2a2e39] bg-[#171a22] text-xs text-[#787b86]">
          <span>Standard Indicators (MIT / Apache-2.0)</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#2a2e39] text-white hover:bg-[#363a45] transition-colors font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
