import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSyncStore } from '../../store/syncStore';
import { transport } from '../../transport/client';
import type { LayoutMetadata } from '../../transport/client';
import {
  ChevronDown,
  Save,
  Copy,
  Pencil,
  Plus,
  Star,
  FolderOpen,
  Check,
  Cloud,
  X,
  Loader2,
} from 'lucide-react';

export const WorkspaceLayoutMenu: React.FC = () => {
  const {
    layoutId,
    layoutName,
    layoutAutosave,
    saveCurrentLayout,
    loadLayoutById,
    createNewLayout,
    cloneCurrentLayout,
    renameCurrentLayout,
    toggleLayoutAutosave,
    openLayoutModal,
    symbol,
    timeframe,
    chartType,
    layoutType,
    panes,
    indicators,
    chartSettings,
  } = useSyncStore();

  const [isOpen, setIsOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [recentLayouts, setRecentLayouts] = useState<LayoutMetadata[]>([]);
  const [modalMode, setModalMode] = useState<'none' | 'new' | 'copy' | 'rename'>('none');
  const [inputText, setInputText] = useState('');

  const isSavingLayout = useSyncStore((s) => s.isSavingLayout);
  const lastSavedTimestamp = useSyncStore((s) => s.lastSavedTimestamp);

  const menuRef = useRef<HTMLDivElement>(null);
  const isInitialMount = useRef(true);
  const autosaveTimerRef = useRef<number | null>(null);

  // Fetch recent layouts when dropdown opens
  const fetchRecentLayouts = useCallback(async () => {
    try {
      const list = await transport.getLayouts();
      setRecentLayouts(list.slice(0, 5));
    } catch (err) {
      console.warn('Failed to fetch recent layouts:', err);
    }
  }, []);

  // Synchronize visual save status with global store saves (including Ctrl+S shortcuts)
  useEffect(() => {
    if (isSavingLayout) {
      setSaveStatus('saving');
    }
  }, [isSavingLayout]);

  useEffect(() => {
    if (lastSavedTimestamp) {
      setSaveStatus('saved');
      fetchRecentLayouts();
      const timer = window.setTimeout(() => {
        setSaveStatus('idle');
      }, 2000);
      return () => window.clearTimeout(timer);
    }
  }, [lastSavedTimestamp, fetchRecentLayouts]);

  useEffect(() => {
    if (isOpen) {
      fetchRecentLayouts();
    }
  }, [isOpen, fetchRecentLayouts]);

  // Click outside to close menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setModalMode('none');
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Autosave debounced effect (2.5 seconds after state change)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (!layoutAutosave) return;

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(async () => {
      try {
        setSaveStatus('saving');
        await saveCurrentLayout();
        setSaveStatus('saved');
        window.setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err) {
        console.warn('Autosave error:', err);
        setSaveStatus('idle');
      }
    }, 2500);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [
    layoutAutosave,
    layoutId,
    symbol,
    timeframe,
    chartType,
    layoutType,
    panes,
    indicators,
    chartSettings,
    saveCurrentLayout,
  ]);

  const handleManualSave = async () => {
    try {
      setSaveStatus('saving');
      await saveCurrentLayout();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      fetchRecentLayouts();
    } catch (err) {
      console.error('Failed to save layout:', err);
      setSaveStatus('idle');
    }
  };

  const handleConfirmAction = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputText.trim();
    if (!clean) return;

    try {
      setSaveStatus('saving');
      if (modalMode === 'new') {
        await createNewLayout(clean);
      } else if (modalMode === 'copy') {
        await cloneCurrentLayout(clean);
      } else if (modalMode === 'rename') {
        await renameCurrentLayout(clean);
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      setModalMode('none');
      setInputText('');
      setIsOpen(false);
      fetchRecentLayouts();
    } catch (err) {
      console.error('Layout action error:', err);
      alert('Failed to execute layout action');
      setSaveStatus('idle');
    }
  };

  const handleToggleFavorite = async (e: React.MouseEvent, l: LayoutMetadata) => {
    e.stopPropagation();
    try {
      const nextFav = !l.is_favorite;
      await transport.updateLayoutMeta(l.id, { is_favorite: nextFav });
      setRecentLayouts((prev) =>
        prev.map((item) => (item.id === l.id ? { ...item, is_favorite: nextFav } : item))
      );
    } catch (err) {
      console.warn('Failed to update favorite status:', err);
    }
  };

  return (
    <div ref={menuRef} className="relative select-none">
      {/* Top Bar Trigger Button */}
      <div className="flex flex-col items-start leading-none px-1.5 py-0.5 rounded hover:bg-[#1e222d] transition-colors cursor-pointer group">
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            setModalMode('none');
          }}
          className="flex items-center space-x-1 text-xs font-medium text-[#d1d4dc] group-hover:text-white cursor-pointer"
          title="Chart Layouts Menu"
        >
          <span className="max-w-[110px] truncate">{layoutName}</span>
          <ChevronDown
            size={11}
            className={`text-[#787b86] transition-transform duration-150 ${
              isOpen ? 'rotate-180 text-white' : ''
            }`}
          />
        </button>

        {/* Quick Save indicator / button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleManualSave();
          }}
          disabled={saveStatus === 'saving'}
          className={`text-[10px] font-medium transition-colors mt-0.5 cursor-pointer flex items-center space-x-1 ${
            saveStatus === 'saved'
              ? 'text-[#089981]'
              : saveStatus === 'saving'
              ? 'text-[#2962ff] animate-pulse'
              : 'text-[#2962ff] hover:text-[#5282ff]'
          }`}
          title="Save layout (Ctrl+S)"
        >
          {saveStatus === 'saving' ? (
            <>
              <Loader2 size={9} className="animate-spin inline" />
              <span>Saving...</span>
            </>
          ) : saveStatus === 'saved' ? (
            <>
              <Check size={9} className="inline" />
              <span>Saved</span>
            </>
          ) : (
            <span>Save</span>
          )}
        </button>
      </div>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-[#1e222d] border border-[#2a2e39] rounded-lg shadow-2xl py-1.5 z-50 text-xs text-[#d1d4dc] font-sans backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
          {/* Sub-form for inline modal inputs (New / Copy / Rename) */}
          {modalMode !== 'none' ? (
            <form onSubmit={handleConfirmAction} className="p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-white uppercase tracking-wider">
                  {modalMode === 'new'
                    ? 'Create New Layout'
                    : modalMode === 'copy'
                    ? 'Make A Copy'
                    : 'Rename Layout'}
                </span>
                <button
                  type="button"
                  onClick={() => setModalMode('none')}
                  className="p-0.5 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-white"
                >
                  <X size={13} />
                </button>
              </div>
              <input
                type="text"
                autoFocus
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Enter layout name..."
                className="w-full bg-[#131722] border border-[#2a2e39] focus:border-[#2962ff] rounded px-2.5 py-1.5 text-xs text-[#d1d4dc] outline-none mb-2.5"
              />
              <div className="flex items-center justify-end space-x-1.5">
                <button
                  type="button"
                  onClick={() => setModalMode('none')}
                  className="px-2.5 py-1 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-white text-[11px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="px-3 py-1 rounded bg-[#2962ff] hover:bg-[#1e53e5] disabled:opacity-50 text-white font-medium text-[11px]"
                >
                  Save
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* 1. Save layout */}
              <button
                type="button"
                onClick={() => {
                  handleManualSave();
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#2a2e39] text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center space-x-2">
                  <Save size={14} className="text-[#787b86] group-hover:text-white" />
                  <span className="group-hover:text-white">Save layout</span>
                </div>
                <span className="text-[10px] font-mono text-[#787b86]">Ctrl + S</span>
              </button>

              {/* 2. Autosave switch */}
              <div
                onClick={toggleLayoutAutosave}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#2a2e39] text-left transition-colors cursor-pointer select-none"
              >
                <div className="flex items-center space-x-2">
                  <Cloud size={14} className={layoutAutosave ? 'text-[#2962ff]' : 'text-[#787b86]'} />
                  <span className={layoutAutosave ? 'text-white font-medium' : 'text-[#d1d4dc]'}>
                    Autosave
                  </span>
                </div>
                <div
                  className={`w-8 h-4 rounded-full transition-colors p-0.5 flex items-center ${
                    layoutAutosave ? 'bg-[#2962ff]' : 'bg-[#2a2e39]'
                  }`}
                >
                  <div
                    className={`w-3 h-3 rounded-full bg-white transition-transform duration-150 shadow-sm ${
                      layoutAutosave ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </div>
              </div>

              {/* 3. Make a copy... */}
              <button
                type="button"
                onClick={() => {
                  setInputText(`${layoutName} (Copy)`);
                  setModalMode('copy');
                }}
                className="w-full flex items-center space-x-2 px-3 py-2 hover:bg-[#2a2e39] text-left transition-colors cursor-pointer group"
              >
                <Copy size={14} className="text-[#787b86] group-hover:text-white" />
                <span className="group-hover:text-white">Make a copy...</span>
              </button>

              {/* 4. Rename... */}
              <button
                type="button"
                onClick={() => {
                  setInputText(layoutName);
                  setModalMode('rename');
                }}
                className="w-full flex items-center space-x-2 px-3 py-2 hover:bg-[#2a2e39] text-left transition-colors cursor-pointer group"
              >
                <Pencil size={14} className="text-[#787b86] group-hover:text-white" />
                <span className="group-hover:text-white">Rename...</span>
              </button>

              {/* 5. Create new layout... */}
              <button
                type="button"
                onClick={() => {
                  setInputText('Untitled Layout');
                  setModalMode('new');
                }}
                className="w-full flex items-center space-x-2 px-3 py-2 hover:bg-[#2a2e39] text-left transition-colors cursor-pointer group"
              >
                <Plus size={14} className="text-[#787b86] group-hover:text-[#089981]" />
                <span className="group-hover:text-white">Create new layout...</span>
              </button>

              {/* Divider */}
              <div className="w-full h-[1px] bg-[#2a2e39] my-1" />

              {/* RECENTLY USED */}
              <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase text-[#787b86] tracking-wider">
                Recently Used
              </div>
              <div className="max-h-44 overflow-y-auto space-y-0.5">
                {recentLayouts.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-[#787b86]">No recent layouts</div>
                ) : (
                  recentLayouts.map((l) => {
                    const isCurrent = l.id === layoutId;
                    return (
                      <div
                        key={l.id}
                        onClick={() => {
                          loadLayoutById(l.id, l.name);
                          setIsOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-1.5 transition-colors cursor-pointer ${
                          isCurrent
                            ? 'bg-[#2962ff]/15 text-white'
                            : 'hover:bg-[#2a2e39] text-[#d1d4dc]'
                        }`}
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <span className="text-xs font-medium text-white truncate">{l.name}</span>
                          <span className="text-[10px] text-[#787b86] truncate">
                            {l.symbol}, {l.resolution}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handleToggleFavorite(e, l)}
                          className="p-1 rounded hover:bg-[#2a2e39] text-[#787b86] transition-colors shrink-0"
                          title={l.is_favorite ? 'Favorited' : 'Add to Favorites'}
                        >
                          <Star
                            size={13}
                            className={
                              l.is_favorite
                                ? 'text-amber-400 fill-amber-400'
                                : 'text-[#787b86] hover:text-amber-400'
                            }
                          />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Divider */}
              <div className="w-full h-[1px] bg-[#2a2e39] my-1" />

              {/* Open layout... */}
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  openLayoutModal();
                }}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-[#2a2e39] text-left transition-colors cursor-pointer group"
              >
                <div className="flex items-center space-x-2">
                  <FolderOpen size={14} className="text-[#787b86] group-hover:text-white" />
                  <span className="group-hover:text-white">Open layout...</span>
                </div>
                <span className="text-[10px] font-mono text-[#787b86]">Ctrl + O</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

