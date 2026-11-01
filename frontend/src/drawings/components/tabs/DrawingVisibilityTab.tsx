import React from 'react';
import type { UserDrawing, TrendlineOptions } from '../../types';

interface DrawingVisibilityTabProps {
  drawing: UserDrawing;
  onChange: (updates: Partial<UserDrawing>) => void;
}

export const DrawingVisibilityTab: React.FC<DrawingVisibilityTabProps> = ({
  drawing,
  onChange,
}) => {
  const opts = (drawing.options as TrendlineOptions) || {};
  const visibility = opts.visibility || {
    seconds: true,
    minutes: true,
    hours: true,
    days: true,
    weeks: true,
    months: true,
  };

  const handleToggle = (key: keyof typeof visibility) => {
    const nextVis = {
      ...visibility,
      [key]: !visibility[key],
    };
    onChange({
      options: {
        ...opts,
        visibility: nextVis,
      },
    });
  };

  const timeframes: { key: keyof typeof visibility; label: string }[] = [
    { key: 'seconds', label: 'Seconds' },
    { key: 'minutes', label: 'Minutes' },
    { key: 'hours', label: 'Hours' },
    { key: 'days', label: 'Days' },
    { key: 'weeks', label: 'Weeks' },
    { key: 'months', label: 'Months' },
  ];

  return (
    <div className="space-y-3 text-xs text-[#d1d4dc]">
      <div className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-2">
        Timeframe Visibility
      </div>
      <div className="grid grid-cols-2 gap-3">
        {timeframes.map((tf) => (
          <div key={tf.key} className="flex items-center space-x-2">
            <input
              type="checkbox"
              id={`tf-vis-${tf.key}`}
              checked={visibility[tf.key] ?? true}
              onChange={() => handleToggle(tf.key)}
              className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
            />
            <label htmlFor={`tf-vis-${tf.key}`} className="cursor-pointer select-none">
              {tf.label}
            </label>
          </div>
        ))}
      </div>
    </div>
  );
};
