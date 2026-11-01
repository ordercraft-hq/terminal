import React from 'react';
import { Clock, ArrowLeftRight } from 'lucide-react';

export const AlertsPanel: React.FC = () => {
  return (
    <div className="flex flex-col h-full bg-[#131722] text-[#d1d4dc] select-none text-xs">
      {/* Drawer Header */}
      <div className="flex items-center space-x-2 px-3 py-2.5 border-b border-[#2a2e39] bg-[#181b27] font-semibold text-white">
        <Clock size={15} className="text-[#2962ff]" />
        <span>Alerts</span>
      </div>

      {/* Centered Coming Soon Badge matching user reference */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-[#192236] border border-[#2962ff]/40 flex items-center justify-center shadow-lg shadow-[#2962ff]/5 mb-3 transition-transform hover:scale-105">
          <ArrowLeftRight size={28} className="text-[#2962ff]" strokeWidth={2.2} />
        </div>
        <span className="text-white font-semibold text-sm tracking-wide">
          Coming Soon
        </span>
      </div>
    </div>
  );
};
