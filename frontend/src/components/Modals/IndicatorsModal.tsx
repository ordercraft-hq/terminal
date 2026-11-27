import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useSyncStore } from '../../store/syncStore';
import {
  getAllIndicators,
  fetchCatalog,
  subscribeCatalog,
} from '../../indicators/registry';
import type { IndicatorDefinition, IndicatorType } from '../../indicators/types';
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
  Waves,
  BarChart2,
  Layers,
} from 'lucide-react';

interface IndicatorsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType =
  | 'all'
  | 'trend'
  | 'oscillators'
  | 'volatility'
  | 'volume'
  | 'orderflow'
  | 'favorites'
  | 'active';

const ITEM_HEIGHT = 64;
const EMPTY_INDICATORS: never[] = [];

export const IndicatorsModal: React.FC<IndicatorsModalProps> = ({ isOpen, onClose }) => {
  const activePaneId = useSyncStore((s) => s.activePaneId);
  const activePane = useSyncStore((s) => s.panes[s.activePaneId] || Object.values(s.panes)[0]);
  const activeIndicators = useSyncStore((s) => s.indicators[s.activePaneId] || EMPTY_INDICATORS);

  const {
    favoriteIndicators,
    toggleFavoriteIndicator,
    addIndicatorToPane,
    removeIndicatorFromPane,
    toggleIndicatorVisibility,
    openIndicatorSettings,
  } = useSyncStore(
    useShallow((s) => ({
      favoriteIndicators: s.favoriteIndicators,
      toggleFavoriteIndicator: s.toggleFavoriteIndicator,
      addIndicatorToPane: s.addIndicatorToPane,
      removeIndicatorFromPane: s.removeIndicatorFromPane,
      toggleIndicatorVisibility: s.toggleIndicatorVisibility,
      openIndicatorSettings: s.openIndicatorSettings,
    }))
  );

  const [catalogVersion, setCatalogVersion] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const focusTimerRef = useRef<number | null>(null);
  const addedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
      if (addedTimerRef.current !== null) window.clearTimeout(addedTimerRef.current);
    };
  }, []);

  // Fetch catalog on modal open and subscribe to updates
  useEffect(() => {
    if (isOpen) {
      fetchCatalog();
      const unsub = subscribeCatalog(() => setCatalogVersion((v) => v + 1));
      if (focusTimerRef.current !== null) window.clearTimeout(focusTimerRef.current);
      focusTimerRef.current = window.setTimeout(() => {
        searchInputRef.current?.focus();
        focusTimerRef.current = null;
      }, 50);
      return () => {
        unsub();
        if (focusTimerRef.current !== null) {
          window.clearTimeout(focusTimerRef.current);
          focusTimerRef.current = null;
        }
      };
    } else {
      setSearchQuery('');
      setScrollTop(0);
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

  const allIndicators = useMemo(() => {
    return getAllIndicators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogVersion]);

  const filteredIndicators = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return allIndicators.filter((def) => {
      // 1. Tab filtering
      if (activeTab === 'favorites') {
        if (!favoriteIndicators.includes(def.id) && !favoriteIndicators.includes(def.type)) {
          return false;
        }
      } else if (activeTab === 'trend') {
        if (
          def.catalogCategory !== 'Trend & Overlays' &&
          def.family !== 'Moving Averages' &&
          def.category !== 'overlay'
        ) {
          return false;
        }
      } else if (activeTab === 'oscillators') {
        if (
          def.catalogCategory !== 'Oscillators' &&
          def.family !== 'Momentum Oscillators' &&
          def.family !== 'Price Oscillators'
        ) {
          return false;
        }
      } else if (activeTab === 'volatility') {
        if (
          def.catalogCategory !== 'Volatility & Bands' &&
          def.family !== 'Volatility Bands' &&
          def.family !== 'Bands Channels'
        ) {
          return false;
        }
      } else if (activeTab === 'volume') {
        if (def.catalogCategory !== 'Volume' && def.family !== 'Volume') {
          return false;
        }
      } else if (activeTab === 'orderflow') {
        if (
          def.catalogCategory !== 'Orderflow & Microstructure' &&
          def.family !== 'Microstructure' &&
          def.family !== 'Market Profile'
        ) {
          return false;
        }
      }

      // 2. Search query filter
      if (!q) return true;
      return (
        def.name.toLowerCase().includes(q) ||
        def.shortName.toLowerCase().includes(q) ||
        def.description.toLowerCase().includes(q) ||
        (def.family && def.family.toLowerCase().includes(q)) ||
        def.id.toLowerCase().includes(q)
      );
    });
  }, [allIndicators, searchQuery, activeTab, favoriteIndicators]);

  // Virtual scrolling calculations
  const totalHeight = filteredIndicators.length * ITEM_HEIGHT;
  const viewportHeight = 360;
  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - 3);
  const endIndex = Math.min(
    filteredIndicators.length,
    Math.ceil((scrollTop + viewportHeight) / ITEM_HEIGHT) + 3
  );
  const visibleItems = filteredIndicators.slice(startIndex, endIndex);
  const offsetY = startIndex * ITEM_HEIGHT;

  if (!isOpen) return null;

  const handleAddIndicator = (def: IndicatorDefinition) => {
    addIndicatorToPane(activePaneId, def.id as IndicatorType);
    setRecentlyAddedId(def.id);
    if (addedTimerRef.current !== null) window.clearTimeout(addedTimerRef.current);
    addedTimerRef.current = window.setTimeout(() => {
      setRecentlyAddedId(null);
      addedTimerRef.current = null;
    }, 1200);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs select-none"
      onClick={onClose}
    >
      <div
        className="w-[780px] max-w-[95vw] h-[620px] max-h-[92vh] flex flex-col rounded-xl border border-[#2a2e39] bg-[#1e222d] shadow-2xl overflow-hidden text-[#d1d4dc]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#2a2e39] bg-[#171a22]">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#2962ff]/15 text-[#2962ff]">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white tracking-wide">
                  Indicators & Strategies
                </h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#2a2e39] text-[#787b86]">
                  {allIndicators.length} available
                </span>
              </div>
              <p className="text-xs text-[#787b86] mt-0.5">
                Target chart:{' '}
                <span className="text-[#2962ff] font-medium">{activePane?.symbol || 'Active Chart'}</span>{' '}
                ({activePane?.timeframe || '15m'})
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

        {/* Search Bar & Categorized Tabs */}
        <div className="p-4 border-b border-[#2a2e39] bg-[#191d26] space-y-3">
          <div className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-[#787b86]" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search 500+ indicators (e.g. SMA, HMA, RSI, MACD, Bollinger Bands, CVD, Orderflow...)"
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

          {/* Navigation Category Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-medium scrollbar-none">
            <button
              onClick={() => {
                setActiveTab('all');
                setScrollTop(0);
              }}
              className={`px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                activeTab === 'all'
                  ? 'bg-[#2962ff] text-white shadow-sm'
                  : 'bg-[#2a2e39]/50 text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
              }`}
            >
              All ({allIndicators.length})
            </button>

            <button
              onClick={() => {
                setActiveTab('favorites');
                setScrollTop(0);
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                activeTab === 'favorites'
                  ? 'bg-[#2962ff] text-white shadow-sm'
                  : 'bg-[#2a2e39]/50 text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
              }`}
            >
              <Star className="w-3.5 h-3.5 fill-current text-amber-400" />
              Favorites ({favoriteIndicators.length})
            </button>

            <button
              onClick={() => {
                setActiveTab('trend');
                setScrollTop(0);
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                activeTab === 'trend'
                  ? 'bg-[#2962ff] text-white shadow-sm'
                  : 'bg-[#2a2e39]/50 text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Trend & Overlays
            </button>

            <button
              onClick={() => {
                setActiveTab('oscillators');
                setScrollTop(0);
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                activeTab === 'oscillators'
                  ? 'bg-[#2962ff] text-white shadow-sm'
                  : 'bg-[#2a2e39]/50 text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              Oscillators
            </button>

            <button
              onClick={() => {
                setActiveTab('volatility');
                setScrollTop(0);
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                activeTab === 'volatility'
                  ? 'bg-[#2962ff] text-white shadow-sm'
                  : 'bg-[#2a2e39]/50 text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
              }`}
            >
              <Waves className="w-3.5 h-3.5" />
              Volatility & Bands
            </button>

            <button
              onClick={() => {
                setActiveTab('volume');
                setScrollTop(0);
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                activeTab === 'volume'
                  ? 'bg-[#2962ff] text-white shadow-sm'
                  : 'bg-[#2a2e39]/50 text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              Volume
            </button>

            <button
              onClick={() => {
                setActiveTab('orderflow');
                setScrollTop(0);
              }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                activeTab === 'orderflow'
                  ? 'bg-[#2962ff] text-white shadow-sm'
                  : 'bg-[#2a2e39]/50 text-[#787b86] hover:text-white hover:bg-[#2a2e39]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Orderflow & Microstructure
            </button>

            <button
              onClick={() => {
                setActiveTab('active');
                setScrollTop(0);
              }}
              className={`flex items-center gap-1 ml-auto px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                activeTab === 'active'
                  ? 'bg-[#089981] text-white shadow-sm'
                  : 'bg-[#089981]/20 text-[#089981] hover:bg-[#089981]/30'
              }`}
            >
              Active ({activeIndicators.length})
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-3 py-2 relative"
        >
          {activeTab === 'active' ? (
            // Active Indicators on Pane
            activeIndicators.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-16 text-[#787b86]">
                <Activity className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">No indicators currently added to this chart.</p>
                <p className="text-xs mt-1 text-[#50535e]">
                  Select an indicator from the tabs above to apply it.
                </p>
              </div>
            ) : (
              <div className="py-1 space-y-2">
                {activeIndicators.map((ind) => (
                  <div
                    key={ind.id}
                    className="flex items-center justify-between px-4 py-3 rounded-lg bg-[#171a22] border border-[#2a2e39] hover:border-[#363a45] transition-colors"
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
              <p className="text-xs mt-1 text-[#50535e]">
                Try searching for SMA, HMA, RSI, MACD, Bollinger Bands, or Orderflow
              </p>
            </div>
          ) : (
            // Virtualized List Container
            <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${offsetY}px)`,
                }}
                className="space-y-1"
              >
                {visibleItems.map((def) => {
                  const isFav =
                    favoriteIndicators.includes(def.id) ||
                    favoriteIndicators.includes(def.type);
                  const isAdded = recentlyAddedId === def.id;

                  return (
                    <div
                      key={def.id}
                      style={{ height: `${ITEM_HEIGHT - 4}px` }}
                      className="flex items-center justify-between px-3.5 py-2 hover:bg-[#171a22] rounded-lg transition-colors group cursor-pointer border border-transparent hover:border-[#2a2e39]"
                      onClick={() => handleAddIndicator(def)}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavoriteIndicator(def.id);
                          }}
                          className="mt-1 p-1 rounded hover:bg-[#2a2e39] transition-colors shrink-0"
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

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white group-hover:text-[#2962ff] transition-colors truncate">
                              {def.name}
                            </span>
                            <span
                              className={`text-[10px] uppercase font-bold px-1.5 py-0.2 rounded shrink-0 ${
                                def.category === 'overlay'
                                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/25'
                                  : 'bg-purple-500/15 text-purple-400 border border-purple-500/25'
                              }`}
                            >
                              {def.category}
                            </span>
                            {def.family && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#2a2e39] text-[#787b86] shrink-0">
                                {def.family}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#787b86] mt-0.5 truncate max-w-[540px]">
                            {def.description}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAddIndicator(def);
                        }}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all shrink-0 ml-3 ${
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
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#2a2e39] bg-[#171a22] text-xs text-[#787b86]">
          <span>OrderCraft Indicator Suite (500+ Streaming Indicators)</span>
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
