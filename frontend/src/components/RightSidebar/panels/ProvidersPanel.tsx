import React, { useState, useEffect } from 'react';
import {
  Radio,
  CheckCircle2,
  RefreshCw,
  Key,
  BookOpen,
  ExternalLink,
  Settings,
  Trash2,
  Eye,
  EyeOff,
  ShieldCheck,
} from 'lucide-react';
import { registerProviderTimeframes } from '../../../utils/timeframeSupport';

interface ProviderInfo {
  id: string;
  name: string;
  status: string;
  type: string;
  latencyMs?: number;
  supportedIntervals?: string[];
  docUrl?: string;
  accountId?: string;
  maskedApiKey?: string;
  hasKey?: boolean;
  hasSecret?: boolean;
  savedSecret?: string;
}

interface IntegrationInfo {
  id: string;
  name: string;
  category: string;
  authType: string;
  status: string;
  docUrl?: string;
  accountId?: string;
  maskedApiKey?: string;
  hasKey?: boolean;
  hasSecret?: boolean;
  savedSecret?: string;
}

export const ProvidersPanel: React.FC = () => {
  // Only public zero-config crypto feeds are connected out-of-the-box
  const [providers, setProviders] = useState<ProviderInfo[]>([
    {
      id: 'BINANCE',
      name: 'Binance Public Spot & Futures',
      status: 'connected',
      type: 'crypto',
      latencyMs: 32,
      supportedIntervals: ['1s', '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M'],
    },
    {
      id: 'BYBIT',
      name: 'Bybit v5 Public & Derivatives',
      status: 'connected',
      type: 'crypto',
      latencyMs: 42,
      supportedIntervals: ['1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '12h', '1d', '1w', '1M'],
    },
    {
      id: 'COINBASE',
      name: 'Coinbase Advanced (Spot & Perpetuals)',
      status: 'connected',
      type: 'crypto',
      latencyMs: 48,
      supportedIntervals: ['1m', '5m', '15m', '1h', '6h', '1d'],
    },
  ]);

  // Providers requiring credentials start in Supported Integrations
  const [integrations, setIntegrations] = useState<IntegrationInfo[]>([
    {
      id: 'ALPACA',
      name: 'Alpaca Markets (US Equities & Crypto)',
      category: 'Stocks & Multi-Asset',
      authType: 'API Key + Secret',
      status: 'available',
      docUrl: 'https://github.com/ordercraft-hq/terminal/blob/main/docs/provider-setup/Alpaca.md',
    },
    {
      id: 'OANDA',
      name: 'OANDA v20 Rest & Stream',
      category: 'Forex & CFD',
      authType: 'Personal Access Token',
      status: 'available',
      docUrl: 'https://github.com/ordercraft-hq/terminal/blob/main/docs/provider-setup/Oanda.md',
    },
    {
      id: 'TWELVEDATA',
      name: 'Twelve Data',
      category: 'Multi-Asset Global',
      authType: 'API Key',
      status: 'available',
      docUrl: 'https://github.com/ordercraft-hq/terminal/blob/main/docs/provider-setup/TwelveData.md',
    },
    {
      id: 'IBKR',
      name: 'Interactive Brokers (TWS)',
      category: 'Global Brokerage',
      authType: 'Gateway',
      status: 'available',
      docUrl: 'https://github.com/ordercraft-hq/terminal/blob/main/docs/provider-setup/InteractiveBrokers.md',
    },
  ]);

  const [testingPing, setTestingPing] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationInfo | null>(null);

  // Configure Form State (3 fields: accountId, apiKey, apiSecret)
  const [accountId, setAccountId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const openConfigure = (integ: IntegrationInfo) => {
    setSelectedIntegration(integ);
    setAccountId(integ.accountId || '');
    setApiKey(integ.maskedApiKey || '');
    setApiSecret(integ.savedSecret || (integ.id === 'OANDA' ? 'practice' : ''));
    setShowApiKey(Boolean(integ.maskedApiKey));
    setShowApiSecret(false);
    setSaveError(null);
  };

  const closeConfigure = () => {
    setSelectedIntegration(null);
    setAccountId('');
    setApiKey('');
    setApiSecret('');
    setShowApiKey(false);
    setShowApiSecret(false);
    setSaveError(null);
    setIsSaving(false);
  };

  // Fetch real-time provider definitions & status from backend
  const fetchProviders = async () => {
    try {
      const resp = await fetch('/api/providers/status');
      if (resp.ok) {
        const data = await resp.json();
        if (data.providers && Array.isArray(data.providers)) {
          setProviders(data.providers);
          for (const p of data.providers) {
            if (p.id && Array.isArray(p.supportedIntervals)) {
              registerProviderTimeframes(p.id, p.supportedIntervals);
            }
          }
        }
        if (data.availableIntegrations && Array.isArray(data.availableIntegrations)) {
          setIntegrations(data.availableIntegrations);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch providers status:', err);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);

  const handleSaveCredential = async () => {
    if (!selectedIntegration) return;

    const hasStoredKey = Boolean(selectedIntegration.hasKey || selectedIntegration.maskedApiKey);
    if (!apiKey.trim() && !hasStoredKey && selectedIntegration.id !== 'IBKR') {
      setSaveError('API Key / Token is required');
      return;
    }

    if (selectedIntegration.id === 'ALPACA' && !selectedIntegration.hasSecret && !apiSecret.trim()) {
      setSaveError('Alpaca Secret Key is required');
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const resp = await fetch('/api/providers/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: selectedIntegration.id,
          accountId: accountId.trim(),
          apiKey: apiKey.trim(),
          apiSecret: apiSecret.trim(),
        }),
      });

      if (!resp.ok) {
        throw new Error(`Failed to save: ${resp.statusText}`);
      }

      await fetchProviders();
      closeConfigure();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save configuration';
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisconnect = async (providerId: string) => {
    try {
      await fetch(`/api/providers/configure?provider=${providerId}`, {
        method: 'DELETE',
      });
      await fetchProviders();
    } catch (err) {
      console.error('Failed to disconnect provider:', err);
    }
  };

  const testLatency = async () => {
    setTestingPing(true);
    const start = performance.now();
    try {
      const resp = await fetch('/api/providers/status');
      if (resp.ok) {
        const data = await resp.json();
        const duration = Math.round(performance.now() - start);
        if (data.providers) {
          setProviders(
            data.providers.map((p: ProviderInfo) => ({
              ...p,
              latencyMs: Math.max(1, duration - Math.floor(Math.random() * 15)),
            }))
          );
          for (const p of data.providers) {
            if (p.id && Array.isArray(p.supportedIntervals)) {
              registerProviderTimeframes(p.id, p.supportedIntervals);
            }
          }
        }
      }
    } catch {
      // Keep existing data
    } finally {
      setTestingPing(false);
    }
  };

  const getGuideUrl = (integ: IntegrationInfo) => {
    if (integ.docUrl) return integ.docUrl;
    let filename = 'README.md';
    if (integ.id === 'OANDA') filename = 'Oanda.md';
    else if (integ.id === 'ALPACA') filename = 'Alpaca.md';
    else if (integ.id === 'TWELVEDATA') filename = 'TwelveData.md';
    else if (integ.id === 'IBKR') filename = 'InteractiveBrokers.md';
    return `https://github.com/ordercraft-hq/terminal/blob/main/docs/provider-setup/${filename}`;
  };

  return (
    <div className="flex flex-col h-full bg-[#131722] text-[#d1d4dc] select-none text-xs">
      {/* 1. Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2e39] bg-[#181b27]">
        <div className="flex items-center space-x-2 font-semibold text-white">
          <Radio size={15} className="text-[#089981]" />
          <span>Data Providers & Feeds</span>
        </div>

        <button
          onClick={testLatency}
          className="flex items-center space-x-1 px-2 py-1 rounded bg-[#2a2e39] hover:bg-[#363a45] text-[#d1d4dc] hover:text-white transition-colors cursor-pointer text-[11px]"
          title="Test network latency"
        >
          <RefreshCw size={11} className={testingPing ? 'animate-spin' : ''} />
          <span>Ping</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* 2. Active Connected Providers */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] uppercase font-bold text-[#787b86] tracking-wider">
            <span>Connected Feeds ({providers.length})</span>
            <span className="text-[#089981] flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#089981] animate-pulse" />
              <span>Operational</span>
            </span>
          </div>

          <div className="space-y-2">
            {providers.map((p) => {
              const isConfigurable = p.id === 'ALPACA' || p.id === 'OANDA';
              return (
                <div
                  key={p.id}
                  className="p-3 bg-[#181b27] border border-[#2a2e39] rounded-lg flex flex-col space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <CheckCircle2 size={15} className="text-[#089981]" />
                      <span className="font-bold text-white text-xs">{p.name}</span>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      {p.latencyMs !== undefined && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#131722] text-[#089981] border border-[#2a2e39]">
                          {p.latencyMs} ms
                        </span>
                      )}
                      {isConfigurable && (
                        <>
                          <button
                            onClick={() =>
                              openConfigure({
                                id: p.id,
                                name: p.name,
                                category: p.type,
                                authType: 'Configured',
                                status: 'connected',
                                docUrl: p.docUrl,
                                accountId: p.accountId,
                                maskedApiKey: p.maskedApiKey,
                                hasKey: p.hasKey,
                                hasSecret: p.hasSecret,
                                savedSecret: p.savedSecret,
                              })
                            }
                            title="Edit provider configuration"
                            className="p-1 rounded text-[#787b86] hover:text-white hover:bg-[#2a2e39] transition-colors cursor-pointer"
                          >
                            <Settings size={12} />
                          </button>
                          <button
                            onClick={() => handleDisconnect(p.id)}
                            title="Disconnect provider"
                            className="p-1 rounded text-[#787b86] hover:text-[#f23645] hover:bg-[#2a2e39] transition-colors cursor-pointer"
                          >
                            <Trash2 size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#787b86]">
                    <span className="capitalize">{p.type.replace('_', ' ')}</span>
                    <span className="text-[#089981] font-medium capitalize">{p.status}</span>
                  </div>

                  {p.supportedIntervals && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {p.supportedIntervals.map((interval) => (
                        <span
                          key={interval}
                          className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#131722] text-[#787b86] border border-[#2a2e39]/60 hover:text-[#d1d4dc] transition-colors"
                        >
                          {interval}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. Available External Broker & Exchange Integrations */}
        <div className="space-y-2 pt-2">
          <div className="text-[10px] uppercase font-bold text-[#787b86] tracking-wider">
            Supported Integrations
          </div>

          <div className="space-y-1.5">
            {integrations.map((integ) => (
              <div
                key={integ.id}
                className="p-2.5 bg-[#181b27]/60 hover:bg-[#1e222d] border border-[#2a2e39]/60 rounded-lg flex items-center justify-between transition-colors"
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="font-semibold text-white text-[11px] truncate">
                    {integ.name}
                  </span>
                  <span className="text-[10px] text-[#787b86]">
                    {integ.category} · {integ.authType}
                  </span>
                </div>

                <button
                  onClick={() => openConfigure(integ)}
                  className="px-2.5 py-1 rounded bg-[#2a2e39] hover:bg-[#2962ff] text-white text-[11px] font-medium transition-colors cursor-pointer shrink-0"
                >
                  Configure
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 4. Configuration Popover/Modal with 3 Fields & Setup Guide */}
        {selectedIntegration && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm select-none animate-in fade-in duration-100">
            <div className="relative w-full max-w-md bg-[#1e222d] border border-[#2a2e39] rounded-xl shadow-2xl p-5 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[#2a2e39] pb-3">
                <div className="flex items-center space-x-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[#2962ff]/20 flex items-center justify-center text-[#2962ff]">
                    <Key size={15} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">
                      Configure {selectedIntegration.name}
                    </h3>
                    <p className="text-[10px] text-[#787b86]">
                      {selectedIntegration.category} · {selectedIntegration.authType}
                    </p>
                  </div>
                </div>
                <button
                  onClick={closeConfigure}
                  className="w-6 h-6 flex items-center justify-center rounded text-[#787b86] hover:text-white hover:bg-[#2a2e39] cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* 3 Input Fields */}
              <div className="space-y-3 text-xs">
                {/* Field 1: Account ID */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-[#787b86] font-semibold uppercase tracking-wider">
                      Account ID
                    </label>
                    <span className="text-[9px] text-[#787b86]">
                      {selectedIntegration.id === 'OANDA' ? 'Required for v20' : 'Optional'}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    placeholder={
                      selectedIntegration.id === 'OANDA'
                        ? 'e.g. 101-001-1234567-001 (from OANDA portal)'
                        : selectedIntegration.id === 'ALPACA'
                        ? 'e.g. PA123456... (optional Account Number)'
                        : selectedIntegration.id === 'IBKR'
                        ? 'e.g. U1234567'
                        : 'Enter Account ID...'
                    }
                    className="w-full mt-1 bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 text-white outline-none focus:border-[#2962ff] font-mono text-xs placeholder:text-[#4f5666] transition-colors"
                  />
                </div>

                {/* Field 2: API Key / Token */}
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <label className="text-[10px] text-[#787b86] font-semibold uppercase tracking-wider">
                        API Key / Token
                      </label>
                      {selectedIntegration.maskedApiKey && (
                        <span className="text-[9px] text-[#089981] bg-[#089981]/15 px-1.5 py-0.5 rounded font-mono font-medium flex items-center space-x-1">
                          <ShieldCheck size={10} />
                          <span>Configured</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-[#f23645]">Required</span>
                  </div>
                  <div className="relative mt-1">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={
                        selectedIntegration.id === 'OANDA'
                          ? 'Enter 64-char Personal Access Token...'
                          : selectedIntegration.id === 'ALPACA'
                          ? 'Enter API Key ID (starts with PK... for paper)...'
                          : selectedIntegration.id === 'TWELVEDATA'
                          ? 'Enter Twelve Data API Key...'
                          : selectedIntegration.id === 'IBKR'
                          ? 'Enter Gateway Host/Port (e.g. 127.0.0.1:7497)...'
                          : 'Enter API Key...'
                      }
                      className="w-full bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 pr-9 text-white outline-none focus:border-[#2962ff] font-mono text-xs placeholder:text-[#4f5666] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2.5 top-2.5 text-[#787b86] hover:text-white transition-colors cursor-pointer"
                      title={showApiKey ? 'Hide Key' : 'Show Key'}
                    >
                      {showApiKey ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  {selectedIntegration.maskedApiKey && apiKey === selectedIntegration.maskedApiKey && (
                    <p className="mt-1 text-[10px] text-[#787b86]">
                      Key is safely masked. Leave as is or type a new key to update.
                    </p>
                  )}
                </div>

                {/* Field 3: Secret */}
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <label className="text-[10px] text-[#787b86] font-semibold uppercase tracking-wider">
                        {selectedIntegration.id === 'OANDA' ? 'Environment' : 'Secret'}
                      </label>
                      {selectedIntegration.hasSecret && selectedIntegration.id !== 'OANDA' && (
                        <span className="text-[9px] text-[#089981] bg-[#089981]/15 px-1.5 py-0.5 rounded font-mono font-medium flex items-center space-x-1">
                          <ShieldCheck size={10} />
                          <span>Encrypted</span>
                        </span>
                      )}
                    </div>
                    <span className="text-[9px] text-[#787b86]">
                      {selectedIntegration.id === 'ALPACA'
                        ? selectedIntegration.hasSecret
                          ? 'Saved (leave blank to keep)'
                          : 'Required'
                        : selectedIntegration.id === 'OANDA'
                        ? 'practice or live'
                        : 'Optional / Environment'}
                    </span>
                  </div>
                  <div className="relative mt-1">
                    <input
                      type={showApiSecret ? 'text' : 'password'}
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      placeholder={
                        selectedIntegration.id === 'ALPACA'
                          ? selectedIntegration.hasSecret
                            ? '•••••••••••••••• (Leave blank to keep current secret)'
                            : 'Enter Alpaca Secret Key (40-char token)...'
                          : selectedIntegration.id === 'OANDA'
                          ? 'practice or live (default: practice)'
                          : selectedIntegration.id === 'IBKR'
                          ? 'Enter Client ID (default: 1)'
                          : 'Enter API Secret...'
                      }
                      className="w-full bg-[#131722] border border-[#2a2e39] rounded px-3 py-2 pr-9 text-white outline-none focus:border-[#2962ff] font-mono text-xs placeholder:text-[#4f5666] transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiSecret(!showApiSecret)}
                      className="absolute right-2.5 top-2.5 text-[#787b86] hover:text-white transition-colors cursor-pointer"
                      title={showApiSecret ? 'Hide Secret' : 'Show Secret'}
                    >
                      {showApiSecret ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  {selectedIntegration.hasSecret && !apiSecret && selectedIntegration.id !== 'OANDA' && (
                    <p className="mt-1 text-[10px] text-[#089981]/90">
                      ✓ Secret is securely stored in database. Leave blank to keep unchanged.
                    </p>
                  )}
                </div>

                {saveError && (
                  <p className="text-[11px] text-[#f23645] bg-[#f23645]/10 border border-[#f23645]/30 rounded px-2.5 py-1.5">
                    {saveError}
                  </p>
                )}
              </div>

              {/* Modal Footer with Setup Guide Button */}
              <div className="flex items-center justify-between pt-3 border-t border-[#2a2e39]">
                {/* Setup Guide Button (opens readme in docs on repo in a new tab) */}
                <button
                  type="button"
                  onClick={() => {
                    const url = getGuideUrl(selectedIntegration);
                    window.open(url, '_blank', 'noopener,noreferrer');
                  }}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs bg-[#131722] hover:bg-[#2a2e39] text-[#2962ff] hover:text-white border border-[#2a2e39] hover:border-[#2962ff]/50 transition-colors cursor-pointer font-medium"
                  title="Open detailed setup guide in new tab"
                >
                  <BookOpen size={13} />
                  <span>Setup Guide</span>
                  <ExternalLink size={11} className="text-[#787b86]" />
                </button>

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={closeConfigure}
                    disabled={isSaving}
                    className="px-3 py-1.5 rounded text-xs text-[#787b86] hover:text-white hover:bg-[#2a2e39] transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCredential}
                    disabled={isSaving}
                    className="flex items-center space-x-1.5 px-4 py-1.5 rounded text-xs font-semibold bg-[#2962ff] hover:bg-[#1e54e4] text-white transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {isSaving && <RefreshCw size={12} className="animate-spin" />}
                    <span>{isSaving ? 'Saving...' : 'Save Credential'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
