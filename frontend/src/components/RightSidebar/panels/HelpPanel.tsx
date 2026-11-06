import React from 'react';
import {
  HelpCircle,
  Keyboard,
  Code,
  GitBranch,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  Sparkles,
  Download,
} from 'lucide-react';
import { APP_VERSION, REPO_HOMEPAGE_URL } from '../../../version';
import { useSyncStore } from '../../../store/syncStore';

export { APP_VERSION, REPO_HOMEPAGE_URL };

export const HelpPanel: React.FC = () => {
  const updateCheckResult = useSyncStore((s) => s.updateCheckResult);
  const isCheckingUpdate = useSyncStore((s) => s.isCheckingUpdate);
  const checkForUpdates = useSyncStore((s) => s.checkForUpdates);

  const shortcuts = [
    { key: 'Ctrl + K', desc: 'Open Command Palette' },
    { key: 'Alt + F', desc: 'Toggle Fullscreen Mode' },
    { key: 'Delete / Backspace', desc: 'Delete Selected Drawing' },
    { key: 'Ctrl + Drag', desc: 'Clone / Duplicate Drawing' },
    { key: 'Shift + Drag', desc: 'Snap Line to 45° Degrees' },
    { key: 'Alt + T', desc: 'Select Trendline Tool' },
    { key: 'Alt + H', desc: 'Select Horizontal Line' },
    { key: 'Alt + R', desc: 'Select Rectangle Tool' },
    { key: 'Alt + F', desc: 'Select Fib Retracement' },
    { key: 'Alt + Shift + →', desc: 'Scroll to Most Recent Bar' },
    { key: 'Ctrl + Shift + S', desc: 'Save Workspace Layout' },
  ];

  return (
    <div className="flex flex-col h-full bg-[#131722] text-[#d1d4dc] select-none text-xs">
      <div className="flex items-center space-x-2 px-3 py-2 border-b border-[#2a2e39] bg-[#181b27] font-semibold text-white">
        <HelpCircle size={15} className="text-[#2962ff]" />
        <span>Help & Shortcuts</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Shortcuts Section */}
        <div className="space-y-2">
          <div className="flex items-center space-x-1.5 text-[10px] uppercase font-bold text-[#787b86] tracking-wider">
            <Keyboard size={13} />
            <span>Keyboard Shortcuts</span>
          </div>

          <div className="divide-y divide-[#2a2e39]/50 border border-[#2a2e39] rounded-lg bg-[#181b27] overflow-hidden">
            {shortcuts.map((s, idx) => (
              <div key={idx} className="flex items-center justify-between px-3 py-2 hover:bg-[#1e222d] transition-colors">
                <span className="text-[#d1d4dc] text-[11px]">{s.desc}</span>
                <kbd className="px-1.5 py-0.5 rounded bg-[#131722] border border-[#2a2e39] text-[#2962ff] font-mono text-[10px] font-bold shadow-sm">
                  {s.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Workstation Info */}
        <div className="p-3 bg-[#181b27] border border-[#2a2e39] rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-white font-bold text-xs">
              <Code size={14} className="text-[#089981]" />
              <span>ORDERCRAFT Terminal</span>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-[#2962ff]/15 text-[#2962ff] font-mono text-[10px] font-semibold border border-[#2962ff]/30">
              {updateCheckResult.currentVersion || APP_VERSION}
            </span>
          </div>
          <p className="text-[#787b86] text-[11px] leading-relaxed">
            100% open-source financial workstation built with Go, React, TypeScript, and lightweight-charts v5.
          </p>

          <div className="pt-2 border-t border-[#2a2e39]/60 text-[10px] text-[#787b86] leading-relaxed">
            Chart rendering powered by{' '}
            <a
              href="https://www.tradingview.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#2962ff] hover:underline font-medium"
            >
              TradingView Lightweight Charts™
            </a>{' '}
            (Apache-2.0, Copyright © 2025 TradingView, Inc.).
          </div>

          <a
            href={REPO_HOMEPAGE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center space-x-2 w-full px-3 py-2 rounded-md bg-[#131722] hover:bg-[#2a2e39] text-[#d1d4dc] hover:text-white border border-[#2a2e39] hover:border-[#2962ff]/50 transition-colors font-medium text-xs cursor-pointer shadow-sm group"
          >
            <GitBranch size={13} className="text-[#2962ff] group-hover:text-[#2962ff] transition-colors" />
            <span>Repository Homepage</span>
            <ExternalLink size={12} className="text-[#787b86] group-hover:text-[#d1d4dc] transition-colors" />
          </a>

          {/* Update Checker Section below Repository Homepage */}
          <div className="pt-2 border-t border-[#2a2e39]/60">
            {isCheckingUpdate ? (
              <div className="flex items-center justify-center space-x-2 w-full py-2 px-3 rounded-md bg-[#131722] border border-[#2a2e39] text-[#787b86] text-[11px]">
                <RefreshCw size={12} className="animate-spin text-[#2962ff]" />
                <span>Checking for updates...</span>
              </div>
            ) : updateCheckResult.status === 'update_available' ? (
              <div className="p-2.5 rounded-md bg-[#2962ff]/10 border border-[#2962ff]/30 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-white">
                  <div className="flex items-center space-x-1.5 text-[#2962ff]">
                    <Sparkles size={13} />
                    <span>Update Available</span>
                  </div>
                  <span className="font-mono text-[10px] bg-[#2962ff]/20 text-[#2962ff] px-1.5 py-0.5 rounded border border-[#2962ff]/40 font-bold">
                    {updateCheckResult.currentVersion} → {updateCheckResult.latestVersion}
                  </span>
                </div>
                <a
                  href={updateCheckResult.releaseUrl || `${REPO_HOMEPAGE_URL}/releases/latest`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center space-x-2 w-full py-1.5 px-3 rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white font-medium text-xs transition-colors shadow-sm cursor-pointer group"
                >
                  <Download size={13} />
                  <span>Download {updateCheckResult.latestVersion}</span>
                  <ExternalLink size={12} className="opacity-80 group-hover:opacity-100" />
                </a>
              </div>
            ) : updateCheckResult.status === 'latest' ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-md bg-[#131722] border border-[#2a2e39] text-[11px]">
                <div className="flex items-center space-x-1.5 text-[#089981]">
                  <CheckCircle2 size={13} />
                  <span className="font-medium">No Updates (Latest)</span>
                </div>
                <button
                  onClick={() => checkForUpdates(true)}
                  className="text-[#787b86] hover:text-[#d1d4dc] flex items-center space-x-1 hover:underline cursor-pointer"
                  title="Check for updates again"
                >
                  <RefreshCw size={11} />
                  <span>Check</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between px-3 py-2 rounded-md bg-[#131722] border border-[#2a2e39] text-[11px] text-[#787b86]">
                <span>Check for latest version</span>
                <button
                  onClick={() => checkForUpdates(true)}
                  className="text-[#2962ff] hover:underline cursor-pointer flex items-center space-x-1 font-medium"
                >
                  <RefreshCw size={11} />
                  <span>Check</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
