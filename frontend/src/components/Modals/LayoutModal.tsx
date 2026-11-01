import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSyncStore } from '../../store/syncStore';
import { transport } from '../../transport/client';
import type { LayoutMetadata } from '../../transport/client';
import {
  X,
  Search,
  Star,
  Plus,
  Trash2,
  Pencil,
  Copy,
  ArrowUpDown,
  Check,
} from 'lucide-react';

export const LayoutModal: React.FC = () => {
  const {
    isLayoutModalOpen,
    closeLayoutModal,
    layoutId,
    layoutName,
    loadLayoutById,
    createNewLayout,
    cloneCurrentLayout,
    renameCurrentLayout,
  } = useSyncStore();

  const [savedLayouts, setSavedLayouts] = useState<LayoutMetadata[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'favorites' | 'recent' | 'az'>('favorites');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Sub-modal state for Create / Copy / Rename
  const [subModalMode, setSubModalMode] = useState<'none' | 'new' | 'copy' | 'rename'>('none');
  const [targetLayout, setTargetLayout] = useState<LayoutMetadata | null>(null);
  const [modalInputText, setModalInputText] = useState<string>('');

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load layouts from SQLite backend
  const fetchLayouts = useCallback(async () => {
    try {
      setIsLoading(true);
      const list = await transport.getLayouts();
      setSavedLayouts(list);
    } catch (err) {
      console.warn('Failed to load layouts:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLayoutModalOpen) {
      fetchLayouts();
      setSearchQuery('');
      setSubModalMode('none');
      setSuccessMsg(null);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isLayoutModalOpen, fetchLayouts]);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isLayoutModalOpen) {
        if (subModalMode !== 'none') {
          setSubModalMode('none');
        } else {
          closeLayoutModal();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLayoutModalOpen, subModalMode, closeLayoutModal]);

  // Filter and sort layouts
  const displayedLayouts = useMemo(() => {
    let result = [...savedLayouts];

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.symbol.toLowerCase().includes(q) ||
          l.resolution.toLowerCase().includes(q)
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortOrder === 'favorites') {
        if (a.is_favorite !== b.is_favorite) {
          return a.is_favorite ? -1 : 1;
        }
        return (b.timestamp || 0) - (a.timestamp || 0);
      }
      if (sortOrder === 'recent') {
        return (b.timestamp || 0) - (a.timestamp || 0);
      }
      if (sortOrder === 'az') {
        return a.name.localeCompare(b.name);
      }
      return 0;
    });

    return result;
  }, [savedLayouts, searchQuery, sortOrder]);

  // Toggle favorite
  const handleToggleFavorite = async (e: React.MouseEvent, l: LayoutMetadata) => {
    e.stopPropagation();
    try {
      const nextFav = !l.is_favorite;
      await transport.updateLayoutMeta(l.id, { is_favorite: nextFav });
      setSavedLayouts((prev) =>
        prev.map((item) => (item.id === l.id ? { ...item, is_favorite: nextFav } : item))
      );
    } catch (err) {
      console.warn('Failed to toggle favorite:', err);
    }
  };

  // Load layout
  const handleSelectLayout = async (targetId: string, targetName: string) => {
    try {
      await loadLayoutById(targetId, targetName);
      setSuccessMsg(`Loaded "${targetName}"`);
      setTimeout(() => {
        closeLayoutModal();
      }, 200);
    } catch (err) {
      console.error(err);
      alert('Failed to load layout');
    }
  };

  // Delete layout
  const handleDeleteLayout = async (e: React.MouseEvent, targetId: string, targetName: string) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete layout "${targetName}"?`)) return;
    try {
      await transport.deleteLayout(targetId);
      setSavedLayouts((prev) => prev.filter((item) => item.id !== targetId));
      setSuccessMsg(`Deleted "${targetName}"`);
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch (err) {
      console.error(err);
      alert('Failed to delete layout');
    }
  };

  // Submit sub-modal (New / Copy / Rename)
  const handleSubModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = modalInputText.trim();
    if (!cleanName) return;

    try {
      if (subModalMode === 'new') {
        await createNewLayout(cleanName);
        setSuccessMsg(`Created layout "${cleanName}"`);
      } else if (subModalMode === 'copy' && targetLayout) {
        await cloneCurrentLayout(cleanName);
        setSuccessMsg(`Created copy "${cleanName}"`);
      } else if (subModalMode === 'rename' && targetLayout) {
        if (targetLayout.id === layoutId) {
          await renameCurrentLayout(cleanName);
        } else {
          await transport.updateLayoutMeta(targetLayout.id, { name: cleanName });
        }
        setSuccessMsg(`Renamed to "${cleanName}"`);
      }
      setSubModalMode('none');
      setModalInputText('');
      setTargetLayout(null);
      fetchLayouts();
      setTimeout(() => setSuccessMsg(null), 2500);
    } catch (err) {
      console.error(err);
      alert('Failed to process layout request');
    }
  };

  if (!isLayoutModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-100">
      <div
        className="relative w-full max-w-md bg-[#1e222d] border border-[#2a2e39] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-[#d1d4dc] font-sans"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2e39]">
          <h2 className="text-base font-semibold text-white">Layouts</h2>
          <button
            onClick={closeLayoutModal}
            className="p-1 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc] transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Success toast notification */}
        {successMsg && (
          <div className="mx-4 mt-2 px-3 py-1.5 rounded bg-[#089981]/20 border border-[#089981] text-[#089981] text-xs flex items-center space-x-2 animate-in fade-in duration-150">
            <Check size={13} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Search Bar (Pro UI) */}
        <div className="p-4 pb-2">
          <div className="relative flex items-center w-full">
            <Search size={15} className="absolute left-3 text-[#787b86] pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#131722] border border-[#2a2e39] focus:border-[#2962ff] rounded-lg pl-9 pr-8 py-2 text-xs text-white placeholder-[#787b86] outline-none transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 p-0.5 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-white"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Subheader / Table Controls */}
        <div className="flex items-center justify-between px-4 py-1.5 text-[11px] font-semibold text-[#787b86] uppercase tracking-wider">
          <span>Layout Name</span>
          <div className="flex items-center space-x-2">
            {/* Sort Toggle Button */}
            <button
              onClick={() => {
                setSortOrder((prev) =>
                  prev === 'favorites' ? 'recent' : prev === 'recent' ? 'az' : 'favorites'
                );
              }}
              className="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-white transition-colors cursor-pointer"
              title={`Sorting: ${
                sortOrder === 'favorites'
                  ? 'Favorites First'
                  : sortOrder === 'recent'
                  ? 'Most Recent'
                  : 'Alphabetical A-Z'
              }`}
            >
              <ArrowUpDown size={12} />
              <span className="text-[10px] lowercase capitalize font-normal">
                {sortOrder === 'favorites' ? 'Favorites' : sortOrder === 'recent' ? 'Recent' : 'A-Z'}
              </span>
            </button>

            {/* Create New Layout Button */}
            <button
              onClick={() => {
                setTargetLayout(null);
                setModalInputText('Untitled Layout');
                setSubModalMode('new');
              }}
              className="flex items-center space-x-1 px-2 py-0.5 rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white font-medium text-[11px] transition-colors cursor-pointer"
            >
              <Plus size={12} />
              <span>New</span>
            </button>
          </div>
        </div>

        {/* Layouts List */}
        <div className="flex-1 overflow-y-auto px-4 py-1 space-y-1 min-h-[160px] max-h-[50vh]">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-[#787b86]">Loading layouts...</div>
          ) : displayedLayouts.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#787b86]">
              {searchQuery ? 'No layouts match your search.' : 'No saved layouts found.'}
            </div>
          ) : (
            displayedLayouts.map((l) => {
              const isCurrent = l.id === layoutId;
              const formattedDate = l.timestamp
                ? new Date(l.timestamp * 1000).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Recent';

              return (
                <div
                  key={l.id}
                  onClick={() => handleSelectLayout(l.id, l.name)}
                  className={`group relative flex items-center justify-between p-2.5 rounded-lg border transition-all cursor-pointer select-none ${
                    isCurrent
                      ? 'bg-white text-black border-transparent shadow-md'
                      : 'bg-[#181b27]/60 hover:bg-[#2a2e39]/60 border-[#2a2e39] text-[#d1d4dc]'
                  }`}
                >
                  {/* Left: Star + Info */}
                  <div className="flex items-center space-x-3 min-w-0 pr-2">
                    <button
                      type="button"
                      onClick={(e) => handleToggleFavorite(e, l)}
                      className={`p-0.5 rounded transition-colors shrink-0 ${
                        isCurrent
                          ? 'text-gray-400 hover:text-black'
                          : 'text-[#787b86] hover:text-amber-400'
                      }`}
                      title={l.is_favorite ? 'Favorited' : 'Add to Favorites'}
                    >
                      <Star
                        size={15}
                        className={
                          l.is_favorite
                            ? 'text-amber-400 fill-amber-400'
                            : isCurrent
                            ? 'text-gray-400'
                            : 'text-[#787b86]'
                        }
                      />
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`text-xs font-semibold truncate ${
                            isCurrent ? 'text-black' : 'text-white'
                          }`}
                        >
                          {l.name}
                        </span>
                        {isCurrent && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded font-semibold bg-[#2962ff] text-white">
                            Active
                          </span>
                        )}
                      </div>
                      <div
                        className={`text-[11px] truncate mt-0.5 ${
                          isCurrent ? 'text-gray-600' : 'text-[#787b86]'
                        }`}
                      >
                        <span>
                          {l.symbol || 'BINANCE:BTCUSDT'}, {l.resolution || '15m'}
                        </span>
                        <span className="mx-1">·</span>
                        <span>{formattedDate}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Actions on Hover */}
                  <div
                    className="flex items-center space-x-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Rename */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTargetLayout(l);
                        setModalInputText(l.name);
                        setSubModalMode('rename');
                      }}
                      className={`p-1 rounded transition-colors ${
                        isCurrent
                          ? 'hover:bg-black/10 text-gray-700'
                          : 'hover:bg-[#131722] text-[#787b86] hover:text-white'
                      }`}
                      title="Rename Layout"
                    >
                      <Pencil size={13} />
                    </button>

                    {/* Clone */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTargetLayout(l);
                        setModalInputText(`${l.name} (Copy)`);
                        setSubModalMode('copy');
                      }}
                      className={`p-1 rounded transition-colors ${
                        isCurrent
                          ? 'hover:bg-black/10 text-gray-700'
                          : 'hover:bg-[#131722] text-[#787b86] hover:text-white'
                      }`}
                      title="Make a Copy"
                    >
                      <Copy size={13} />
                    </button>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={(e) => handleDeleteLayout(e, l.id, l.name)}
                      className={`p-1 rounded transition-colors ${
                        isCurrent
                          ? 'hover:bg-red-500/20 text-red-600'
                          : 'hover:bg-red-500/20 text-[#787b86] hover:text-[#f23645]'
                      }`}
                      title="Delete Layout"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-[#2a2e39] bg-[#181b27] flex items-center justify-between text-[11px] text-[#787b86]">
          <span>{savedLayouts.length} layout{savedLayouts.length === 1 ? '' : 's'} saved</span>
          <button
            onClick={closeLayoutModal}
            className="px-3 py-1 rounded hover:bg-[#2a2e39] text-[#d1d4dc] hover:text-white transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* Sub-Modal Popover for Create / Copy / Rename */}
        {subModalMode !== 'none' && (
          <div className="absolute inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-100">
            <form
              onSubmit={handleSubModalSubmit}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm bg-[#1e222d] border border-[#2a2e39] rounded-xl shadow-2xl p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">
                  {subModalMode === 'new'
                    ? 'Create New Layout'
                    : subModalMode === 'copy'
                    ? `Clone "${targetLayout?.name || layoutName}"`
                    : `Rename "${targetLayout?.name || layoutName}"`}
                </h3>
                <button
                  type="button"
                  onClick={() => setSubModalMode('none')}
                  className="p-1 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-white"
                >
                  <X size={14} />
                </button>
              </div>

              <input
                type="text"
                autoFocus
                value={modalInputText}
                onChange={(e) => setModalInputText(e.target.value)}
                placeholder="Enter layout name..."
                className="w-full bg-[#131722] border border-[#2a2e39] focus:border-[#2962ff] rounded-lg px-3 py-2 text-xs text-white placeholder-[#787b86] outline-none mb-3"
              />

              <div className="flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setSubModalMode('none')}
                  className="px-3 py-1.5 rounded hover:bg-[#2a2e39] text-xs text-[#787b86] hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!modalInputText.trim()}
                  className="px-4 py-1.5 rounded bg-[#2962ff] hover:bg-[#1e53e5] disabled:opacity-50 text-xs font-semibold text-white transition-colors"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default LayoutModal;
