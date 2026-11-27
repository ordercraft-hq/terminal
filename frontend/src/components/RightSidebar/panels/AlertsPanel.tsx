import React, { useState, useEffect } from 'react';
import { Bell, Clock, Plus, Trash2, Pause, Play, CheckCircle2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useSyncStore, type AlertItem } from '../../../store/syncStore';

const CONDITION_LABELS: Record<AlertItem['condition'], string> = {
  crossing: 'Crossing',
  crossing_up: 'Crossing Up',
  crossing_down: 'Crossing Down',
  greater_than: 'Greater Than',
  less_than: 'Less Than',
};

export const AlertsPanel: React.FC = () => {
  const {
    alerts,
    alertLogs,
    addAlert,
    removeAlert,
    toggleAlertActive,
    clearAlertLogs,
    activeSymbol,
    activeRightSidebarTab,
  } = useSyncStore(
    useShallow((s) => ({
      alerts: s.alerts,
      alertLogs: s.alertLogs,
      addAlert: s.addAlert,
      removeAlert: s.removeAlert,
      toggleAlertActive: s.toggleAlertActive,
      clearAlertLogs: s.clearAlertLogs,
      activeSymbol: (s.activePaneId && s.panes[s.activePaneId]?.symbol) || s.symbol,
      activeRightSidebarTab: s.activeRightSidebarTab,
    }))
  );

  const [tab, setTab] = useState<'alerts' | 'logs'>(
    activeRightSidebarTab === 'notifications' ? 'logs' : 'alerts'
  );
  const [isCreating, setIsCreating] = useState(false);
  const [symbolInput, setSymbolInput] = useState(activeSymbol);
  const [condition, setCondition] = useState<AlertItem['condition']>('crossing');
  const [priceInput, setPriceInput] = useState('');
  const [messageInput, setMessageInput] = useState('');

  useEffect(() => {
    if (activeRightSidebarTab === 'notifications') {
      setTab('logs');
    } else if (activeRightSidebarTab === 'alerts') {
      setTab('alerts');
    }
  }, [activeRightSidebarTab]);

  useEffect(() => {
    if (!isCreating) {
      setSymbolInput(activeSymbol);
    }
  }, [activeSymbol, isCreating]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const targetPrice = parseFloat(priceInput);
    const cleanSym = symbolInput.trim().toUpperCase();
    if (!cleanSym || isNaN(targetPrice)) return;

    addAlert({
      symbol: cleanSym,
      condition,
      targetPrice,
      active: true,
      message: messageInput.trim() || undefined,
    });
    setPriceInput('');
    setMessageInput('');
    setIsCreating(false);
    setTab('alerts');
  };

  return (
    <div className="flex flex-col h-full bg-[#131722] text-[#d1d4dc] select-none text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2e39] bg-[#181b27]">
        <div className="flex items-center space-x-2 font-semibold text-white">
          <Clock size={15} className="text-[#2962ff]" />
          <span>Alerts & Logs</span>
        </div>
        <button
          type="button"
          onClick={() => {
            setSymbolInput(activeSymbol);
            setIsCreating((prev) => !prev);
          }}
          className="flex items-center space-x-1 px-2 py-1 rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white text-[11px] font-medium cursor-pointer transition-colors"
          title="Create Price Alert"
        >
          <Plus size={12} />
          <span>Add</span>
        </button>
      </div>

      {/* Sub-Tabs */}
      <div className="flex border-b border-[#2a2e39] bg-[#181b27]/50">
        <button
          type="button"
          onClick={() => setTab('alerts')}
          className={`flex-1 py-2 text-[11px] font-semibold transition-colors cursor-pointer border-b-2 ${
            tab === 'alerts'
              ? 'border-[#2962ff] text-white bg-[#1e222d]/50'
              : 'border-transparent text-[#787b86] hover:text-[#d1d4dc]'
          }`}
        >
          Alerts ({alerts.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('logs')}
          className={`flex-1 py-2 text-[11px] font-semibold transition-colors cursor-pointer border-b-2 ${
            tab === 'logs'
              ? 'border-[#2962ff] text-white bg-[#1e222d]/50'
              : 'border-transparent text-[#787b86] hover:text-[#d1d4dc]'
          }`}
        >
          Logs ({alertLogs.length})
        </button>
      </div>

      {/* Inline Create Alert Form */}
      {isCreating && (
        <form onSubmit={handleCreate} className="p-3 border-b border-[#2a2e39] bg-[#181b27] space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-[#787b86] mb-1 uppercase font-semibold">Symbol</label>
              <input
                type="text"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value)}
                className="w-full bg-[#131722] border border-[#2a2e39] focus:border-[#2962ff] rounded px-2 py-1 text-xs text-white outline-none font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] text-[#787b86] mb-1 uppercase font-semibold">Condition</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as AlertItem['condition'])}
                className="w-full bg-[#131722] border border-[#2a2e39] focus:border-[#2962ff] rounded px-2 py-1 text-xs text-white outline-none cursor-pointer"
              >
                {Object.entries(CONDITION_LABELS).map(([val, label]) => (
                  <option key={val} value={val} className="bg-[#1e222d]">
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-[#787b86] mb-1 uppercase font-semibold">Target Price</label>
            <input
              type="number"
              step="any"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="e.g. 65000.00"
              className="w-full bg-[#131722] border border-[#2a2e39] focus:border-[#2962ff] rounded px-2 py-1 text-xs text-white outline-none font-mono"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-[10px] text-[#787b86] mb-1 uppercase font-semibold">Note (optional)</label>
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Alert message..."
              className="w-full bg-[#131722] border border-[#2a2e39] focus:border-[#2962ff] rounded px-2 py-1 text-xs text-white outline-none"
            />
          </div>
          <div className="flex items-center justify-end space-x-2 pt-1">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-2.5 py-1 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[#d1d4dc] text-[11px] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!priceInput.trim() || isNaN(parseFloat(priceInput))}
              className="px-3 py-1 rounded bg-[#2962ff] hover:bg-[#1e53e5] disabled:opacity-50 text-white text-[11px] font-semibold cursor-pointer"
            >
              Create Alert
            </button>
          </div>
        </form>
      )}

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {tab === 'alerts' ? (
          alerts.length === 0 ? (
            <div className="py-12 text-center text-[#787b86] flex flex-col items-center space-y-2">
              <Bell size={22} className="opacity-40" />
              <span>No price alerts configured.</span>
              <button
                type="button"
                onClick={() => {
                  setSymbolInput(activeSymbol);
                  setIsCreating(true);
                }}
                className="text-[#2962ff] hover:underline font-medium cursor-pointer"
              >
                + Create alert for {activeSymbol}
              </button>
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className="p-2.5 rounded-lg bg-[#181b27] border border-[#2a2e39] flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-white truncate">{alert.symbol}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase ${
                        alert.active
                          ? 'bg-[#089981]/20 text-[#089981]'
                          : alert.triggeredAt
                          ? 'bg-[#2962ff]/20 text-[#2962ff]'
                          : 'bg-[#2a2e39] text-[#787b86]'
                      }`}
                    >
                      {alert.active ? 'Active' : alert.triggeredAt ? 'Triggered' : 'Paused'}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#787b86] mt-0.5 font-mono">
                    {CONDITION_LABELS[alert.condition]} {alert.targetPrice}
                  </div>
                  {alert.message && (
                    <div className="text-[10px] text-[#d1d4dc] mt-0.5 truncate">{alert.message}</div>
                  )}
                </div>

                <div className="flex items-center space-x-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleAlertActive(alert.id)}
                    className="p-1.5 rounded hover:bg-[#2a2e39] text-[#787b86] hover:text-white cursor-pointer"
                    title={alert.active ? 'Pause alert' : 'Activate alert'}
                  >
                    {alert.active ? <Pause size={12} /> : <Play size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAlert(alert.id)}
                    className="p-1.5 rounded hover:bg-[#f23645]/20 text-[#787b86] hover:text-[#f23645] cursor-pointer"
                    title="Delete alert"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))
          )
        ) : (
          <>
            {alertLogs.length > 0 && (
              <div className="flex justify-end pb-1">
                <button
                  type="button"
                  onClick={clearAlertLogs}
                  className="text-[10px] text-[#787b86] hover:text-white hover:underline cursor-pointer"
                >
                  Clear all logs
                </button>
              </div>
            )}
            {alertLogs.length === 0 ? (
              <div className="py-12 text-center text-[#787b86] flex flex-col items-center space-y-2">
                <CheckCircle2 size={22} className="opacity-40" />
                <span>No triggered alert logs yet.</span>
              </div>
            ) : (
              alertLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-2.5 rounded-lg bg-[#181b27] border border-[#2a2e39] space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white">{log.symbol}</span>
                    <span className="text-[10px] font-mono text-[#787b86]">
                      {new Date(log.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#089981] font-mono">
                    {log.condition} @ {log.triggerPrice}
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
};
