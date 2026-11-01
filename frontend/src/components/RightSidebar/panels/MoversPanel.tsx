import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Flame,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  BarChart2,
  ChevronDown,
  Check,
  Layers,
  Coins,
  Building2,
  Globe2,
} from 'lucide-react';

interface MoverItem {
  symbol: string;
  name?: string;
  lastPrice: number;
  change: number;
  changePct: number;
  high?: number;
  low?: number;
  volumeQuote: number;
}

interface CategoryInfo {
  id: string;
  name: string;
  description?: string;
  group: string;
}

interface MoversResponse {
  gainers: MoverItem[];
  losers: MoverItem[];
  volume: MoverItem[];
}

const DEFAULT_CATEGORIES: CategoryInfo[] = [
  {
    id: 'day_movers',
    name: 'US Market Movers',
    description: 'Live US equities day gainers, losers, and most actives',
    group: 'Market Overview',
  },
  {
    id: 'all_cryptocurrencies_us',
    name: 'Crypto Universe',
    description: 'Cryptocurrencies ranked live by market activity',
    group: 'Crypto',
  },
  {
    id: 'growth_technology_stocks',
    name: 'Technology & High Growth',
    description: 'Top technology and high-growth equities',
    group: 'Equities & Sectors',
  },
  {
    id: 'undervalued_growth_stocks',
    name: 'Undervalued Growth',
    description: 'Equities with strong earnings growth at low valuation multiples',
    group: 'Equities & Sectors',
  },
  {
    id: 'undervalued_large_caps',
    name: 'Undervalued Large Caps',
    description: 'High-capitalization blue chips with low valuation multiples',
    group: 'Equities & Sectors',
  },
  {
    id: 'aggressive_small_caps',
    name: 'Aggressive Small Caps',
    description: 'High-momentum, high-volatility small-cap equities',
    group: 'Equities & Sectors',
  },
  {
    id: 'small_cap_gainers',
    name: 'Small Caps Momentum',
    description: 'Small cap companies with strong trading momentum',
    group: 'Equities & Sectors',
  },
  {
    id: 'most_shorted_stocks',
    name: 'Most Shorted Equities',
    description: 'Equities with high short interest and squeeze activity',
    group: 'Equities & Sectors',
  },
  {
    id: 'top_etfs_us',
    name: 'Top US ETFs',
    description: 'Top performing exchange-traded funds in the US',
    group: 'ETFs & Funds',
  },
  {
    id: 'technology_etfs',
    name: 'Technology ETFs',
    description: 'Technology and innovation focused exchange-traded funds',
    group: 'ETFs & Funds',
  },
  {
    id: 'top_mutual_funds',
    name: 'Top Mutual Funds',
    description: 'Top performing mutual funds by return and rating',
    group: 'ETFs & Funds',
  },
  {
    id: 'high_yield_bond',
    name: 'High Yield Bonds',
    description: 'High yield corporate and fixed-income bond funds',
    group: 'ETFs & Funds',
  },
];

export const MoversPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'gainers' | 'losers' | 'volume'>('gainers');
  const [selectedCategory, setSelectedCategory] = useState<string>('day_movers');
  const [categories, setCategories] = useState<CategoryInfo[]>(DEFAULT_CATEGORIES);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const [data, setData] = useState<MoversResponse>({ gainers: [], losers: [], volume: [] });
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close category picker on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsCategoryOpen(false);
      }
    };
    if (isCategoryOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isCategoryOpen]);

  // Fetch movers by category with optional force-refresh
  const fetchMovers = async (cat = selectedCategory, force = false) => {
    if (force) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    const startTime = Date.now();
    try {
      const url = `/api/movers?category=${encodeURIComponent(cat)}${
        force ? '&refresh=true&_t=' + Date.now() : ''
      }`;
      const resp = await fetch(url);
      if (resp.ok) {
        const json = await resp.json();
        setData({
          gainers: json.gainers || [],
          losers: json.losers || [],
          volume: json.volume || [],
        });
        if (Array.isArray(json.categories) && json.categories.length > 0) {
          setCategories(json.categories);
        }
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.warn('Failed to fetch movers:', err);
    } finally {
      const elapsed = Date.now() - startTime;
      const minSpinDelay = force ? Math.max(0, 450 - elapsed) : 0;
      setTimeout(() => {
        setLoading(false);
        setIsRefreshing(false);
      }, minSpinDelay);
    }
  };

  useEffect(() => {
    fetchMovers(selectedCategory, false);
  }, [selectedCategory]);

  const activeCategoryInfo = useMemo(() => {
    return categories.find((c) => c.id === selectedCategory) || categories[0];
  }, [categories, selectedCategory]);

  const groupedCategories = useMemo(() => {
    const groups: Record<string, CategoryInfo[]> = {};
    categories.forEach((cat) => {
      if (!groups[cat.group]) groups[cat.group] = [];
      groups[cat.group].push(cat);
    });
    return groups;
  }, [categories]);

  const currentList = data[activeTab] || [];

  const formatVolume = (vol: number) => {
    if (vol >= 1e9) return `$${(vol / 1e9).toFixed(2)}B`;
    if (vol >= 1e6) return `$${(vol / 1e6).toFixed(1)}M`;
    if (vol >= 1e3) return `$${(vol / 1e3).toFixed(0)}K`;
    return `$${vol.toFixed(0)}`;
  };

  const formatPrice = (price: number) => {
    if (price > 1000) {
      return price.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
    }
    if (price > 1) return price.toFixed(2);
    if (price > 0.0001) return price.toFixed(4);
    return price.toFixed(6);
  };

  const getGroupIcon = (group: string) => {
    switch (group) {
      case 'Market Overview':
        return <TrendingUp size={12} className="text-[#3b82f6]" />;
      case 'Crypto':
        return <Coins size={12} className="text-[#f59e0b]" />;
      case 'Equities & Sectors':
        return <Building2 size={12} className="text-[#10b981]" />;
      case 'ETFs & Funds':
        return <Globe2 size={12} className="text-[#a855f7]" />;
      default:
        return <Layers size={12} className="text-[#787b86]" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#131722] text-[#d1d4dc] select-none text-xs">
      {/* 1. Header with Reliable Working Refresh Button */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2e39] bg-[#181b27]">
        <div className="flex items-center space-x-2 font-semibold text-white">
          <Flame size={15} className="text-[#2962ff]" />
          <span>Top Movers & Screener</span>
        </div>

        <div className="flex items-center space-x-1">
          {lastUpdated && (
            <span className="text-[10px] text-[#787b86] font-mono mr-1">
              {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            onClick={() => fetchMovers(selectedCategory, true)}
            disabled={isRefreshing || loading}
            className="p-1.5 rounded-md hover:bg-[#2a2e39] text-[#787b86] hover:text-white transition-colors cursor-pointer"
            title="Refresh live market movers (Bypasses cache)"
          >
            <RefreshCw
              size={13}
              className={`transition-transform duration-300 ${
                isRefreshing || (loading && currentList.length === 0) ? 'animate-spin text-[#2962ff]' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* 2. Category / Sector Selector Dropdown */}
      <div className="p-2 border-b border-[#2a2e39] bg-[#141824] relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsCategoryOpen(!isCategoryOpen)}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md bg-[#181b27] border border-[#2a2e39] hover:border-[#2962ff] text-white text-xs font-medium transition-colors cursor-pointer"
        >
          <div className="flex items-center space-x-2 truncate">
            {getGroupIcon(activeCategoryInfo.group)}
            <span className="font-semibold text-white truncate">{activeCategoryInfo.name}</span>
          </div>
          <ChevronDown
            size={14}
            className={`text-[#787b86] shrink-0 transition-transform ${isCategoryOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {isCategoryOpen && (
          <div className="absolute top-full left-2 right-2 mt-1 bg-[#181b27] border border-[#2a2e39] rounded-lg shadow-2xl z-50 max-h-64 overflow-y-auto divide-y divide-[#2a2e39]/50">
            {Object.entries(groupedCategories).map(([groupName, items]) => (
              <div key={groupName} className="p-1">
                <div className="px-2 py-1 text-[10px] text-[#787b86] uppercase font-bold flex items-center space-x-1.5">
                  {getGroupIcon(groupName)}
                  <span>{groupName}</span>
                </div>
                {items.map((cat) => {
                  const isSelected = cat.id === selectedCategory;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(cat.id);
                        setIsCategoryOpen(false);
                      }}
                      className={`w-full px-2 py-1.5 rounded flex items-center justify-between text-left transition-colors cursor-pointer text-xs ${
                        isSelected
                          ? 'bg-[#2962ff]/20 text-white font-medium'
                          : 'hover:bg-[#2a2e39]/50 text-[#d1d4dc]'
                      }`}
                    >
                      <span className="truncate">{cat.name}</span>
                      {isSelected && <Check size={13} className="text-[#2962ff] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Segmented Mode Control (Gainers / Losers / Volume) */}
      <div className="p-2 border-b border-[#2a2e39] bg-[#131722]/60">
        <div className="flex bg-[#181b27] p-0.5 rounded-lg border border-[#2a2e39]">
          <button
            onClick={() => setActiveTab('gainers')}
            className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center space-x-1 ${
              activeTab === 'gainers'
                ? 'bg-[#089981]/20 text-[#089981] shadow-sm'
                : 'text-[#787b86] hover:text-[#d1d4dc]'
            }`}
          >
            <TrendingUp size={12} />
            <span>Gainers</span>
          </button>
          <button
            onClick={() => setActiveTab('losers')}
            className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center space-x-1 ${
              activeTab === 'losers'
                ? 'bg-[#f23645]/20 text-[#f23645] shadow-sm'
                : 'text-[#787b86] hover:text-[#d1d4dc]'
            }`}
          >
            <TrendingDown size={12} />
            <span>Losers</span>
          </button>
          <button
            onClick={() => setActiveTab('volume')}
            className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center space-x-1 ${
              activeTab === 'volume'
                ? 'bg-[#2962ff]/20 text-[#2962ff] shadow-sm'
                : 'text-[#787b86] hover:text-[#d1d4dc]'
            }`}
          >
            <BarChart2 size={12} />
            <span>Volume</span>
          </button>
        </div>
      </div>

      {/* 4. Table Column Headers */}
      <div className="grid grid-cols-12 px-3 py-1.5 border-b border-[#2a2e39] text-[10px] font-medium text-[#787b86] uppercase tracking-wider bg-[#131722]">
        <div className="col-span-5 text-left">Symbol</div>
        <div className="col-span-3 text-right">Price</div>
        <div className="col-span-2 text-right">24h%</div>
        <div className="col-span-2 text-right">Vol</div>
      </div>

      {/* 5. Movers List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#2a2e39]/30">
        {loading && currentList.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#787b86] flex flex-col items-center justify-center space-y-2">
            <RefreshCw size={16} className="animate-spin text-[#2962ff]" />
            <span>Screening {activeCategoryInfo.name}...</span>
          </div>
        ) : currentList.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#787b86]">
            No mover data available for this market.
          </div>
        ) : (
          currentList.map((item) => {
            const isSelected = item.symbol === selectedSymbol;
            const isPositive = item.changePct >= 0;

            return (
              <div
                key={item.symbol}
                onClick={() => setSelectedSymbol(item.symbol)}
                className={`grid grid-cols-12 items-center px-3 py-2 cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-[#2962ff]/15 text-white font-medium'
                    : 'hover:bg-[#1e222d] text-[#d1d4dc]'
                }`}
              >
                {/* Symbol + Name */}
                <div className="col-span-5 flex flex-col min-w-0 pr-1">
                  <span className="font-semibold text-[11px] truncate tracking-tight text-white">
                    {item.symbol}
                  </span>
                  {item.name && (
                    <span className="text-[9px] text-[#787b86] truncate">
                      {item.name}
                    </span>
                  )}
                </div>

                {/* Price */}
                <div className="col-span-3 text-right font-mono text-[11px]">
                  {formatPrice(item.lastPrice)}
                </div>

                {/* 24h Change % */}
                <div
                  className={`col-span-2 text-right font-mono font-medium text-[10px] ${
                    isPositive ? 'text-[#089981]' : 'text-[#f23645]'
                  }`}
                >
                  {isPositive ? '+' : ''}
                  {item.changePct.toFixed(2)}%
                </div>

                {/* Volume */}
                <div className="col-span-2 text-right font-mono text-[10px] text-[#787b86]">
                  {formatVolume(item.volumeQuote)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
