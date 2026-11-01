import React from 'react';
import { Bug, MessagesSquare, Headphones, ExternalLink, GitPullRequest } from 'lucide-react';

export const GITHUB_ISSUES_URL = 'https://github.com/ordercraft-hq/terminal/issues';
export const GITHUB_DISCUSSIONS_URL = 'https://github.com/ordercraft-hq/terminal/discussions';
export const DISCORD_INVITE_URL = ''; // Left empty per user specification

export const IssuesPanel: React.FC = () => {
  return (
    <div className="flex flex-col h-full bg-[#131722] text-[#d1d4dc] select-none text-xs">
      {/* Header */}
      <div className="flex items-center space-x-2 px-3 py-2 border-b border-[#2a2e39] bg-[#181b27] font-semibold text-white">
        <Bug size={15} className="text-[#f5a623]" />
        <span>Issues & Community</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3.5">
        {/* Intro */}
        <div className="p-3 bg-[#181b27] border border-[#2a2e39] rounded-lg">
          <p className="text-[#787b86] text-[11px] leading-relaxed">
            Report bugs, request new charting tools, or connect directly with the Ordercraft developer and trading community.
          </p>
        </div>

        {/* 1st Card: GitHub Issues */}
        <div className="p-3.5 bg-[#181b27] border border-[#2a2e39] hover:border-[#f5a623]/50 rounded-lg space-y-2.5 transition-colors group">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-md bg-[#f5a623]/15 border border-[#f5a623]/30 flex items-center justify-center text-[#f5a623]">
                <Bug size={15} />
              </div>
              <span className="text-white font-bold text-xs">GitHub Issues</span>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-[#f5a623]/15 text-[#f5a623] font-semibold text-[10px] border border-[#f5a623]/30">
              Bug Reports
            </span>
          </div>
          <p className="text-[#787b86] text-[11px] leading-relaxed">
            Submit bug reports, runtime crash logs, or technical feature requests directly to the project issue tracker.
          </p>
          <a
            href={GITHUB_ISSUES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center space-x-2 w-full px-3 py-2 rounded-md bg-[#131722] hover:bg-[#f5a623]/15 text-[#d1d4dc] hover:text-[#fbbf24] border border-[#2a2e39] hover:border-[#f5a623]/50 transition-colors font-medium text-xs cursor-pointer shadow-sm group-hover:border-[#f5a623]/40"
          >
            <GitPullRequest size={13} className="text-[#f5a623]" />
            <span>Open GitHub Issues</span>
            <ExternalLink size={12} className="text-[#787b86] group-hover:text-[#fbbf24] transition-colors" />
          </a>
        </div>

        {/* 2nd Card: GitHub Discussions */}
        <div className="p-3.5 bg-[#181b27] border border-[#2a2e39] hover:border-[#2962ff]/50 rounded-lg space-y-2.5 transition-colors group">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-md bg-[#2962ff]/15 border border-[#2962ff]/30 flex items-center justify-center text-[#2962ff]">
                <MessagesSquare size={15} />
              </div>
              <span className="text-white font-bold text-xs">GitHub Discussions</span>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-[#2962ff]/15 text-[#2962ff] font-semibold text-[10px] border border-[#2962ff]/30">
              Q&A & Ideas
            </span>
          </div>
          <p className="text-[#787b86] text-[11px] leading-relaxed">
            Discuss trading algorithms, share custom OrderScript indicator ideas, ask questions, and propose enhancements.
          </p>
          <a
            href={GITHUB_DISCUSSIONS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center space-x-2 w-full px-3 py-2 rounded-md bg-[#131722] hover:bg-[#2962ff]/15 text-[#d1d4dc] hover:text-white border border-[#2a2e39] hover:border-[#2962ff]/50 transition-colors font-medium text-xs cursor-pointer shadow-sm group-hover:border-[#2962ff]/40"
          >
            <MessagesSquare size={13} className="text-[#2962ff]" />
            <span>Join Discussions</span>
            <ExternalLink size={12} className="text-[#787b86] group-hover:text-white transition-colors" />
          </a>
        </div>

        {/* 3rd Card: Discord Server */}
        <div className="p-3.5 bg-[#181b27] border border-[#2a2e39] hover:border-[#5865f2]/40 rounded-lg space-y-2.5 transition-colors group">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-7 h-7 rounded-md bg-[#5865f2]/15 border border-[#5865f2]/30 flex items-center justify-center text-[#7983f5]">
                <Headphones size={15} />
              </div>
              <span className="text-white font-bold text-xs">Discord Server</span>
            </div>
            <span className="px-1.5 py-0.5 rounded bg-[#5865f2]/15 text-[#7983f5] font-semibold text-[10px] border border-[#5865f2]/30">
              Community Chat
            </span>
          </div>
          <p className="text-[#787b86] text-[11px] leading-relaxed">
            Real-time chat with the Ordercraft trading community and core contributors. Live market discussions and stream sessions.
          </p>
          <a
            href={DISCORD_INVITE_URL || '#'}
            onClick={(e) => {
              if (!DISCORD_INVITE_URL) {
                e.preventDefault();
              }
            }}
            aria-disabled={!DISCORD_INVITE_URL}
            className={`flex items-center justify-center space-x-2 w-full px-3 py-2 rounded-md border transition-colors font-medium text-xs shadow-sm ${
              DISCORD_INVITE_URL
                ? 'bg-[#131722] hover:bg-[#5865f2]/15 text-[#d1d4dc] hover:text-white border-[#2a2e39] hover:border-[#5865f2]/50 cursor-pointer'
                : 'bg-[#131722]/50 text-[#787b86] border-[#2a2e39] cursor-not-allowed opacity-80'
            }`}
          >
            <Headphones size={13} className={DISCORD_INVITE_URL ? 'text-[#7983f5]' : 'text-[#787b86]'} />
            <span>{DISCORD_INVITE_URL ? 'Join Discord Server' : 'Join Discord Server (Invite Pending)'}</span>
            {DISCORD_INVITE_URL && <ExternalLink size={12} className="text-[#787b86]" />}
          </a>
        </div>
      </div>
    </div>
  );
};

