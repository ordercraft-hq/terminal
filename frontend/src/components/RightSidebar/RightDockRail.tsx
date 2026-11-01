import React from 'react';
import {
  Bookmark,
  Clock,
  Layers,
  Flame,
  Newspaper,
  Calendar,
  Radio,
  Bell,
  HelpCircle,
  Bug,
} from 'lucide-react';
import { useSyncStore } from '../../store/syncStore';
import type { RightSidebarTab } from '../../store/syncStore';

interface DockItem {
  id: NonNullable<RightSidebarTab>;
  label: string;
  icon: React.ReactNode;
  badge?: number | string;
  badgeColor?: string;
  customColor?: string;
}

export const RightDockRail: React.FC = () => {
  const activeTab = useSyncStore((s) => s.activeRightSidebarTab);
  const toggleTab = useSyncStore((s) => s.toggleRightSidebarTab);
  const alertLogs = useSyncStore((s) => s.alertLogs);
  const [providerCount, setProviderCount] = React.useState<number>(3);

  React.useEffect(() => {
    let mounted = true;
    fetch('/api/providers/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (mounted && data && Array.isArray(data.providers)) {
          setProviderCount(data.providers.length);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const dockTopItems: DockItem[] = [
    {
      id: 'watchlist',
      label: 'Watchlist & Details',
      icon: <Bookmark size={18} strokeWidth={1.75} />,
    },
    {
      id: 'alerts',
      label: 'Alerts Manager',
      icon: <Clock size={18} strokeWidth={1.75} />,
    },
    {
      id: 'objectTree',
      label: 'Object Tree & Data Window',
      icon: <Layers size={18} strokeWidth={1.75} />,
    },
  ];

  const dockCenterItems: DockItem[] = [
    {
      id: 'movers',
      label: 'Top Movers & Screener',
      icon: <Flame size={18} strokeWidth={1.75} />,
    },
    {
      id: 'news',
      label: 'Financial News Flow',
      icon: <Newspaper size={18} strokeWidth={1.75} />,
    },
    {
      id: 'calendar',
      label: 'Economic Calendar',
      icon: <Calendar size={18} strokeWidth={1.75} />,
    },
  ];

  const dockLowerItems: DockItem[] = [
    {
      id: 'providers',
      label: 'Data Providers & Streams',
      icon: <Radio size={18} strokeWidth={1.75} />,
      badge: providerCount,
      badgeColor: '#089981', // green active providers
    },
    {
      id: 'notifications',
      label: 'Notifications & Logs',
      icon: <Bell size={18} strokeWidth={1.75} />,
      badge: alertLogs.length > 0 ? alertLogs.length : undefined,
      badgeColor: '#f23645',
    },
  ];

  const dockBottomItems: DockItem[] = [
    {
      id: 'issues',
      label: 'Issues & Community',
      icon: <Bug size={18} strokeWidth={1.75} />,
      customColor: '#f5a623',
    },
    {
      id: 'help',
      label: 'Help & Keybindings',
      icon: <HelpCircle size={18} strokeWidth={1.75} />,
    },
  ];

  const renderItem = (item: DockItem) => {
    const isActive = activeTab === item.id;
    const isCustom = Boolean(item.customColor);

    return (
      <div key={item.id} className="relative group flex items-center justify-center my-0.5">
        <button
          onClick={() => toggleTab(item.id)}
          className={`relative w-9 h-9 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
            isActive
              ? isCustom
                ? 'bg-[#f5a623]/20 text-[#fbbf24] shadow-sm'
                : 'bg-[#2962ff]/15 text-[#2962ff] shadow-sm'
              : isCustom
              ? 'text-[#f5a623] hover:text-[#fbbf24] hover:bg-[#f5a623]/15'
              : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]/60'
          }`}
          aria-label={item.label}
        >
          {/* Active Accent Pill */}
          {isActive && (
            <span
              className={`absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-4.5 rounded-l-full ${
                isCustom ? 'bg-[#f5a623]' : 'bg-[#2962ff]'
              }`}
            />
          )}

          {item.icon}

          {/* Badge */}
          {item.badge !== undefined && (
            <span
              className="absolute top-1 right-1 min-w-[14px] h-[14px] px-1 rounded-full text-[9px] font-mono font-bold text-white flex items-center justify-center leading-none pointer-events-none"
              style={{ backgroundColor: item.badgeColor || '#2962ff' }}
            >
              {item.badge}
            </span>
          )}
        </button>

        {/* Tooltip on Hover */}
        <div className="hidden group-hover:block absolute right-full mr-2.5 top-1/2 -translate-y-1/2 px-2 py-1 bg-[#1e222d] text-[#d1d4dc] text-xs font-medium rounded shadow-xl border border-[#2a2e39] whitespace-nowrap pointer-events-none z-50">
          {item.label}
        </div>
      </div>
    );
  };

  return (
    <aside className="w-11 min-w-[44px] h-full bg-[#131722] border-l border-[#2a2e39] flex flex-col items-center justify-between py-2 select-none z-40">
      {/* Top Group: Watchlist, Alerts, Object Tree, Movers, News, Calendar */}
      <div className="flex flex-col items-center w-full">
        {dockTopItems.map(renderItem)}
        <div className="w-5 h-[1px] bg-[#2a2e39] my-2" />
        {dockCenterItems.map(renderItem)}
      </div>

      {/* Bottom Group: Data Providers, Notifications, Divider, Help */}
      <div className="flex flex-col items-center w-full">
        {dockLowerItems.map(renderItem)}
        <div className="w-5 h-[1px] bg-[#2a2e39] my-2" />
        {dockBottomItems.map(renderItem)}
      </div>
    </aside>
  );
};

