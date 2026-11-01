import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  RefreshCw,
  Signal,
} from 'lucide-react';
import { useSyncStore } from '../../../store/syncStore';
import { getTimezoneOffsetSeconds } from '../../ChartPane/ChartPane';

interface CalendarEvent {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast: string;
  previous: string;
  actual?: string;
}

const STORAGE_KEY = 'ordercraft_economic_calendar_prefs';

export const EconomicCalendarPanel: React.FC = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Active chart timezone
  const activePaneId = useSyncStore((s) => s.activePaneId);
  const panes = useSyncStore((s) => s.panes);
  const globalTimezone = useSyncStore((s) => s.timezone);
  const activeTimezone = panes[activePaneId]?.timezone || globalTimezone || 'UTC-4';
  const tzOffsetSec = useMemo(() => getTimezoneOffsetSeconds(activeTimezone), [activeTimezone]);

  // Restore user choices (impact & currency) from localStorage
  const [selectedImpact, setSelectedImpact] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.impact) return parsed.impact;
      }
    } catch {}
    return 'all';
  });

  const [selectedCountry, setSelectedCountry] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.currency) return parsed.currency;
      }
    } catch {}
    return 'all';
  });

  // Persist user choices whenever impact or currency changes
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          impact: selectedImpact,
          currency: selectedCountry,
        })
      );
    } catch {}
  }, [selectedImpact, selectedCountry]);

  // Fetch calendar events
  const fetchEvents = async (force = false) => {
    if (force) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    const startTime = Date.now();
    try {
      const url = `/api/calendar${force ? '?refresh=true&_t=' + Date.now() : ''}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        setEvents(data.events || []);
      }
    } catch (err) {
      console.warn('Failed to fetch calendar from backend:', err);
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
    fetchEvents(false);
  }, []);

  // Convert an event date to a shifted Date object whose UTC methods return wall-clock time in active chart timezone
  const getZonedDate = (dateStr: string) => {
    const utcMs = new Date(dateStr).getTime();
    return new Date(utcMs + tzOffsetSec * 1000);
  };

  // Format event time (e.g. "14:30") in the active chart's timezone
  const formatEventTime = (dateStr: string) => {
    const d = getZonedDate(dateStr);
    const h = String(d.getUTCHours()).padStart(2, '0');
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  };

  // Format event date header (e.g. "Thursday, October 29") in the active chart's timezone
  const formatEventDateHeader = (dateStr: string) => {
    const d = getZonedDate(dateStr);
    const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const weekday = weekdayNames[d.getUTCDay()];
    const month = monthNames[d.getUTCMonth()];
    const day = d.getUTCDate();
    return `${weekday}, ${month} ${day}`;
  };

  // Compute weekdays for the current trading week in active chart timezone.
  // Forex & economic calendars operate on a Sunday-to-Saturday schedule (Asian open on Sunday through US close on Friday).
  const weekDays = useMemo(() => {
    const nowUtcMs = Date.now() + tzOffsetSec * 1000;
    const zonedNow = new Date(nowUtcMs);

    const todayYear = zonedNow.getUTCFullYear();
    const todayMonth = zonedNow.getUTCMonth();
    const todayDate = zonedNow.getUTCDate();
    const todayDow = zonedNow.getUTCDay(); // 0 is Sun, 1 is Mon, ..., 6 is Sat

    // Sunday is day 0; anchor to Sunday midnight UTC
    const todayMidnightUtc = Date.UTC(todayYear, todayMonth, todayDate);
    const diffToSunday = -todayDow;
    const sundayMidnightUtc = todayMidnightUtc + diffToSunday * 86400000;

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const days: {
      label: string;
      dateNum: number;
      year: number;
      month: number;
      isToday: boolean;
      count: number;
    }[] = [];

    // Check if Saturday has any events
    let hasSaturdayEvents = false;
    for (const ev of events) {
      const evZoned = getZonedDate(ev.date);
      if (evZoned.getUTCDay() === 6) {
        hasSaturdayEvents = true;
        break;
      }
    }

    const numDays = hasSaturdayEvents || todayDow === 6 ? 7 : 6;

    for (let i = 0; i < numDays; i++) {
      const d = new Date(sundayMidnightUtc + i * 86400000);
      const year = d.getUTCFullYear();
      const month = d.getUTCMonth();
      const dateNum = d.getUTCDate();
      const isToday = year === todayYear && month === todayMonth && dateNum === todayDate;

      days.push({
        label: dayNames[i],
        dateNum,
        year,
        month,
        isToday,
        count: 0,
      });
    }

    // Count events per day in active chart timezone
    for (const ev of events) {
      const evZoned = getZonedDate(ev.date);
      const evYear = evZoned.getUTCFullYear();
      const evMonth = evZoned.getUTCMonth();
      const evDate = evZoned.getUTCDate();

      for (const d of days) {
        if (evYear === d.year && evMonth === d.month && evDate === d.dateNum) {
          d.count++;
        }
      }
    }

    return days;
  }, [events, tzOffsetSec]);

  // Default to today's events if today has events; otherwise default to All Week (null)
  const defaultDayIndex = useMemo(() => {
    const todayIdx = weekDays.findIndex((d) => d.isToday);
    if (todayIdx !== -1 && weekDays[todayIdx].count > 0) {
      return todayIdx;
    }
    return null;
  }, [weekDays]);

  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null);

  // Set default selection once weekDays are initialized
  useEffect(() => {
    if (selectedDayIndex === null && weekDays.length > 0 && defaultDayIndex !== null) {
      setSelectedDayIndex(defaultDayIndex);
    }
  }, [defaultDayIndex]);

  // Filter events by impact, currency, and selected day
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      // 1. Impact filter
      if (selectedImpact !== 'all') {
        if (ev.impact.toLowerCase() !== selectedImpact.toLowerCase()) return false;
      }

      // 2. Currency filter
      if (selectedCountry !== 'all') {
        if (ev.country.toUpperCase() !== selectedCountry.toUpperCase()) return false;
      }

      // 3. Day filter (in active chart timezone)
      if (selectedDayIndex !== null && weekDays[selectedDayIndex]) {
        const targetDay = weekDays[selectedDayIndex];
        const evZoned = getZonedDate(ev.date);
        if (
          evZoned.getUTCFullYear() !== targetDay.year ||
          evZoned.getUTCMonth() !== targetDay.month ||
          evZoned.getUTCDate() !== targetDay.dateNum
        ) {
          return false;
        }
      }

      return true;
    });
  }, [events, selectedImpact, selectedCountry, selectedDayIndex, weekDays, tzOffsetSec]);

  // Group filtered events by date string in active chart timezone
  const groupedEvents = useMemo(() => {
    const groups: Record<string, CalendarEvent[]> = {};
    for (const ev of filteredEvents) {
      const dateKey = formatEventDateHeader(ev.date);
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(ev);
    }
    return groups;
  }, [filteredEvents, tzOffsetSec]);

  const getImpactTextColor = (impact: string) => {
    const imp = impact.toLowerCase();
    if (imp === 'high') return 'text-[#f23645]';
    if (imp === 'medium') return 'text-[#ff9800]';
    if (imp === 'low') return 'text-[#787b86]';
    return 'text-[#a855f7]';
  };

  const getSignalColor = (impact: string) => {
    const imp = impact.toLowerCase();
    if (imp === 'high') return 'text-[#f23645]';
    if (imp === 'medium') return 'text-[#ff9800]';
    if (imp === 'low') return 'text-[#787b86]';
    return 'text-[#a855f7]';
  };

  return (
    <div className="flex flex-col h-full bg-[#131722] text-[#d1d4dc] select-none text-xs">
      {/* 1. Header with Timezone Indicator & Refresh */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2e39] bg-[#181b27]">
        <div className="flex items-center space-x-2 font-semibold text-white">
          <CalendarIcon size={15} className="text-[#2962ff]" />
          <span>Economic Calendar</span>
        </div>

        <div className="flex items-center space-x-1.5">
          <span
            className="text-[10px] font-mono text-[#787b86] bg-[#131722] px-1.5 py-0.5 rounded border border-[#2a2e39]"
            title={`Displaying event times in active chart timezone (${activeTimezone})`}
          >
            {activeTimezone}
          </span>
          <button
            onClick={() => fetchEvents(true)}
            disabled={isRefreshing || loading}
            className="p-1.5 rounded-md hover:bg-[#2a2e39] text-[#787b86] hover:text-white transition-colors cursor-pointer"
            title="Refresh calendar"
          >
            <RefreshCw
              size={13}
              className={`transition-transform duration-300 ${
                isRefreshing || (loading && events.length === 0) ? 'animate-spin text-[#2962ff]' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* 2. Horizontal Daily Overview Cards (Defaults to Today's Events) */}
      <div className="p-2 border-b border-[#2a2e39] bg-[#131722]/60 overflow-x-auto flex space-x-1.5 scrollbar-thin">
        {/* All Week Card */}
        <button
          onClick={() => setSelectedDayIndex(null)}
          className={`flex-1 min-w-[56px] p-2 rounded-lg border text-left transition-all cursor-pointer flex-shrink-0 ${
            selectedDayIndex === null
              ? 'bg-[#2962ff]/20 border-[#2962ff] text-white ring-1 ring-[#2962ff]/40'
              : 'bg-[#181b27] border-[#2a2e39]/60 hover:border-[#2a2e39] text-[#787b86]'
          }`}
          title="Show all events for the entire week"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white text-[11px] leading-tight">
              All Week
            </span>
          </div>
          <div className="text-[10px] mt-1 text-[#787b86] font-mono leading-tight">
            Events <span className="text-[#2962ff] font-bold">{events.length}</span>
          </div>
        </button>

        {weekDays.map((day, idx) => {
          const isSelected = selectedDayIndex === idx;
          return (
            <button
              key={idx}
              onClick={() => setSelectedDayIndex(isSelected ? null : idx)}
              className={`flex-1 min-w-[56px] p-2 rounded-lg border text-left transition-all cursor-pointer ${
                isSelected
                  ? 'bg-[#2962ff]/20 border-[#2962ff] text-white ring-1 ring-[#2962ff]/40'
                  : 'bg-[#181b27] border-[#2a2e39]/60 hover:border-[#2a2e39] text-[#787b86]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white text-[11px] leading-tight">
                  {day.label} {day.dateNum}
                </span>
                {day.isToday && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2962ff] inline-block" title="Today" />
                )}
              </div>
              <div className="text-[10px] mt-1 text-[#787b86] font-mono leading-tight">
                Events <span className="text-[#2962ff] font-bold">{day.count}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* 3. Category & Filter Pills (Persisted to localStorage) */}
      <div className="px-3 py-2 border-b border-[#2a2e39] bg-[#181b27]/40 flex items-center justify-between">
        <div className="flex items-center space-x-1.5 overflow-x-auto">
          {[
            { id: 'all', label: 'All' },
            { id: 'high', label: 'High Impact' },
            { id: 'medium', label: 'Medium' },
            { id: 'low', label: 'Low' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedImpact(cat.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                selectedImpact === cat.id
                  ? 'bg-white text-black font-semibold'
                  : 'bg-[#1e222d] hover:bg-[#2a2e39] text-[#787b86] hover:text-[#d1d4dc]'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Currency Filter Dropdown */}
        <select
          value={selectedCountry}
          onChange={(e) => setSelectedCountry(e.target.value)}
          className="bg-[#1e222d] border border-[#2a2e39] text-[#d1d4dc] rounded px-1.5 py-0.5 text-[10px] outline-none cursor-pointer"
        >
          <option value="all">ALL FX</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="GBP">GBP</option>
          <option value="JPY">JPY</option>
          <option value="CAD">CAD</option>
          <option value="AUD">AUD</option>
          <option value="NZD">NZD</option>
          <option value="CHF">CHF</option>
        </select>
      </div>

      {/* 4. Grouped Calendar Events List with New Requested Layout */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#2a2e39]/40 p-2 space-y-3">
        {loading && events.length === 0 ? (
          <div className="py-12 text-center text-xs text-[#787b86] flex flex-col items-center justify-center space-y-2">
            <RefreshCw size={16} className="animate-spin text-[#2962ff]" />
            <span>Loading economic calendar...</span>
          </div>
        ) : Object.keys(groupedEvents).length === 0 ? (
          <div className="py-12 text-center text-xs text-[#787b86] flex flex-col items-center justify-center space-y-2">
            <span>No economic events match your filter.</span>
            {selectedDayIndex !== null && (
              <button
                onClick={() => setSelectedDayIndex(null)}
                className="text-[11px] text-[#2962ff] hover:underline cursor-pointer font-medium"
              >
                View all week's events ({events.length})
              </button>
            )}
          </div>
        ) : (
          Object.entries(groupedEvents).map(([dateLabel, items]) => (
            <div key={dateLabel} className="space-y-1.5">
              {/* Date Header in Active Chart Timezone */}
              <div className="px-2.5 py-1 text-[11px] font-bold text-white tracking-wide bg-[#181b27]/80 rounded flex items-center justify-between">
                <span>{dateLabel}</span>
                <span className="text-[10px] font-mono text-[#787b86] font-normal">
                  {items.length} {items.length === 1 ? 'event' : 'events'}
                </span>
              </div>

              {/* Event Cards (New Layout: Top Left Time, Beside it Event Name, Bottom Left A/F/P, Top Right Impact with Symbol, Bottom Right Currency) */}
              <div className="space-y-1.5">
                {items.map((ev, i) => {
                  const evTime = formatEventTime(ev.date);

                  return (
                    <div
                      key={i}
                      className="p-2.5 bg-[#181b27]/50 hover:bg-[#1e222d] border border-[#2a2e39]/50 hover:border-[#2a2e39] transition-all rounded-lg flex flex-col space-y-2 group"
                    >
                      {/* Top Row: [Time (Bigger)] [Event Name Headline] ... [Impact with Symbol] */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-2 min-w-0 flex-1">
                          {/* Time aspect: Bigger font, font-mono */}
                          <span className="font-mono font-bold text-[12px] text-white px-1.5 py-0.5 rounded bg-[#131722] border border-[#2a2e39] shrink-0">
                            {evTime}
                          </span>

                          {/* Event Name as Headline */}
                          <span
                            className="font-bold text-[12px] text-white leading-tight truncate group-hover:text-[#2962ff] transition-colors"
                            title={ev.title}
                          >
                            {ev.title}
                          </span>
                        </div>

                        {/* Top Right: Impact with Symbol */}
                        <div className="flex items-center space-x-1 shrink-0 pl-1">
                          <Signal size={12} className={getSignalColor(ev.impact)} />
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wider ${getImpactTextColor(
                              ev.impact
                            )}`}
                          >
                            {ev.impact}
                          </span>
                        </div>
                      </div>

                      {/* Bottom Row: [A:, F:, P:] ... [Currency Shifted to Bottom Right] */}
                      <div className="flex items-center justify-between pt-0.5">
                        {/* Bottom Left: A:, F:, P: */}
                        <div className="flex items-center space-x-3 text-[10px] font-mono text-[#787b86]">
                          <div>
                            <span className="text-[#787b86]">A: </span>
                            <span
                              className={`font-semibold ${
                                ev.actual ? 'text-white' : 'text-[#787b86]'
                              }`}
                            >
                              {ev.actual || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[#787b86]">F: </span>
                            <span className="text-[#d1d4dc]">{ev.forecast || '—'}</span>
                          </div>
                          <div>
                            <span className="text-[#787b86]">P: </span>
                            <span className="text-[#d1d4dc]">{ev.previous || '—'}</span>
                          </div>
                        </div>

                        {/* Bottom Right: Currency */}
                        <span className="font-mono font-bold text-[11px] text-[#2962ff] bg-[#2962ff]/10 border border-[#2962ff]/20 px-1.5 py-0.5 rounded leading-none shrink-0">
                          {ev.country}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
