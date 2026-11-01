import React, { useState, useEffect, useMemo } from 'react';
import {
  Newspaper,
  ExternalLink,
  RefreshCw,
  Search,
  X,
  Globe,
} from 'lucide-react';
import { useSyncStore } from '../../../store/syncStore';

interface NewsArticle {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  description: string;
  publishedAt?: number;
}

export const NewsFlowPanel: React.FC = () => {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedMode, setFeedMode] = useState<'full' | 'watchlist'>('full');
  const [customSearch, setCustomSearch] = useState('');

  const watchlists = useSyncStore((s) => s.watchlists);
  const activeWatchlistId = useSyncStore((s) => s.activeWatchlistId);

  // Extract symbols from the active watchlist for the Watchlist news feed
  const activeWatchlistSymbols = useMemo(() => {
    const activeList = watchlists.find((w) => w.id === activeWatchlistId) || watchlists[0];
    if (!activeList || !Array.isArray(activeList.items)) return [];
    return activeList.items
      .map((it) => it.symbol.replace(/^[^:]+:/, '').replace(/[-_]?(USD|USDT)$/i, ''))
      .filter(Boolean)
      .slice(0, 5);
  }, [watchlists, activeWatchlistId]);

  const fetchNews = async (force = false) => {
    if (force) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    const startTime = Date.now();
    try {
      let endpoint = '/api/news';
      const params: string[] = [];

      if (customSearch.trim()) {
        params.push(`q=${encodeURIComponent(customSearch.trim())}`);
      } else if (feedMode === 'watchlist') {
        const query = activeWatchlistSymbols.length > 0
          ? activeWatchlistSymbols.join(' OR ')
          : 'stocks crypto markets';
        params.push(`q=${encodeURIComponent(query)}`);
      }

      if (force) {
        params.push('refresh=true');
        params.push(`_t=${Date.now()}`);
      }

      if (params.length > 0) {
        endpoint += `?${params.join('&')}`;
      }

      const resp = await fetch(endpoint);
      if (resp.ok) {
        const data = await resp.json();
        const rawArticles: NewsArticle[] = data.articles || [];

        // Filter out news older than 5 days and sort strictly by newest first
        const nowMs = Date.now();
        const maxAgeMs = 5 * 24 * 60 * 60 * 1000;

        const sorted = rawArticles
          .filter((a) => {
            const timeMs = a.publishedAt ? a.publishedAt * 1000 : new Date(a.pubDate).getTime();
            return !isNaN(timeMs) && nowMs - timeMs <= maxAgeMs;
          })
          .sort((a, b) => {
            const timeA = a.publishedAt ? a.publishedAt * 1000 : new Date(a.pubDate).getTime();
            const timeB = b.publishedAt ? b.publishedAt * 1000 : new Date(b.pubDate).getTime();
            return timeB - timeA;
          });

        setArticles(sorted.length > 0 ? sorted : rawArticles);
      }
    } catch (err) {
      console.warn('Failed to fetch news from backend:', err);
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
    fetchNews(false);
  }, [feedMode]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchNews(true);
  };

  const getRelativeTime = (dateStr: string, publishedAt?: number) => {
    try {
      const timestamp = publishedAt ? publishedAt * 1000 : new Date(dateStr).getTime();
      const diffMs = Date.now() - timestamp;
      if (isNaN(diffMs) || diffMs < 0) return 'Just now';
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    } catch {
      return '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#131722] text-[#d1d4dc] select-none text-xs">
      {/* 1. Header with Refresh Button */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2e39] bg-[#181b27]">
        <div className="flex items-center space-x-2 font-semibold text-white">
          <Newspaper size={15} className="text-[#2962ff]" />
          <span>Market News Flow</span>
        </div>

        <button
          onClick={() => fetchNews(true)}
          disabled={isRefreshing || loading}
          className="p-1.5 rounded-md hover:bg-[#2a2e39] text-[#787b86] hover:text-white transition-colors cursor-pointer"
          title="Refresh latest market news"
        >
          <RefreshCw
            size={13}
            className={`transition-transform duration-300 ${
              isRefreshing || (loading && articles.length === 0) ? 'animate-spin text-[#2962ff]' : ''
            }`}
          />
        </button>
      </div>

      {/* 2. Feed Mode Filters (Only Full feed & Watchlist) */}
      <div className="p-2 border-b border-[#2a2e39] bg-[#131722]/60 flex items-center justify-between space-x-1.5">
        <div className="flex items-center space-x-1">
          <button
            onClick={() => {
              setCustomSearch('');
              setFeedMode('full');
            }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
              feedMode === 'full' && !customSearch
                ? 'bg-[#2962ff] text-white'
                : 'bg-[#181b27] hover:bg-[#2a2e39] text-[#787b86] hover:text-white'
            }`}
          >
            Full feed
          </button>
          <button
            onClick={() => {
              setCustomSearch('');
              setFeedMode('watchlist');
            }}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
              feedMode === 'watchlist' && !customSearch
                ? 'bg-[#2962ff] text-white'
                : 'bg-[#181b27] hover:bg-[#2a2e39] text-[#787b86] hover:text-white'
            }`}
          >
            Watchlist
          </button>
        </div>
      </div>

      {/* 3. Search Bar */}
      <form onSubmit={handleSearchSubmit} className="px-3 py-1.5 border-b border-[#2a2e39] bg-[#181b27]/40 flex items-center space-x-2">
        <Search size={13} className="text-[#787b86]" />
        <input
          type="text"
          placeholder="Search news by topic or symbol..."
          value={customSearch}
          onChange={(e) => setCustomSearch(e.target.value)}
          className="flex-1 bg-transparent text-xs text-white placeholder-[#787b86] outline-none"
        />
        {customSearch && (
          <button
            type="button"
            onClick={() => {
              setCustomSearch('');
              fetchNews(true);
            }}
            className="text-[#787b86] hover:text-white cursor-pointer"
          >
            <X size={13} />
          </button>
        )}
      </form>

      {/* 4. News Articles List */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#2a2e39]/50 p-2 space-y-2">
        {loading && articles.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#787b86] flex flex-col items-center justify-center space-y-2">
            <RefreshCw size={16} className="animate-spin text-[#2962ff]" />
            <span>Fetching latest market news...</span>
          </div>
        ) : articles.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#787b86]">
            No recent news articles found for this topic.
          </div>
        ) : (
          articles.map((article, idx) => (
            <a
              key={article.link || idx}
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 bg-[#181b27]/60 hover:bg-[#1e222d] border border-[#2a2e39]/50 rounded-lg transition-colors group cursor-pointer"
            >
              <div className="flex items-center justify-between text-[10px] text-[#787b86] mb-1.5">
                <div className="flex items-center space-x-1.5 font-medium text-[#2962ff]">
                  <Globe size={11} />
                  <span>{article.source}</span>
                </div>
                <span>{getRelativeTime(article.pubDate, article.publishedAt)}</span>
              </div>

              <h4 className="font-semibold text-white text-[12px] leading-snug group-hover:text-[#2962ff] transition-colors line-clamp-2 mb-1.5">
                {article.title}
              </h4>

              <p className="text-[11px] text-[#787b86] leading-relaxed line-clamp-2">
                {article.description}
              </p>

              <div className="mt-2 flex items-center justify-end text-[10px] text-[#787b86] group-hover:text-white">
                <span className="flex items-center space-x-1">
                  <span>Read full story</span>
                  <ExternalLink size={11} />
                </span>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
};
