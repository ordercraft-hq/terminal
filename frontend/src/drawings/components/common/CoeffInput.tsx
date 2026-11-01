import React, { useState, useEffect, useRef } from 'react';

interface CoeffInputProps {
  value: number;
  onChange: (val: number) => void;
  disabled?: boolean;
  className?: string;
  step?: number;
}

export const CoeffInput: React.FC<CoeffInputProps> = ({
  value,
  onChange,
  disabled = false,
  className = '',
  step = 0.1,
}) => {
  const [localText, setLocalText] = useState<string>(() => String(value));
  const isFocusedRef = useRef(false);

  // Sync external value updates only when the user is not actively editing
  useEffect(() => {
    if (!isFocusedRef.current) {
      setLocalText(String(value));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setLocalText(text);

    // If it's a valid finite number, immediately propagate live update to chart
    const parsed = parseFloat(text);
    if (!isNaN(parsed) && isFinite(parsed)) {
      onChange(parsed);
    }
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    const parsed = parseFloat(localText);
    if (isNaN(parsed) || !isFinite(parsed)) {
      // Revert to current prop value if invalid
      setLocalText(String(value));
      onChange(value);
    } else {
      // Normalize cleanly
      setLocalText(String(parsed));
      onChange(parsed);
    }
  };

  const handleFocus = () => {
    isFocusedRef.current = true;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const current = parseFloat(localText);
      const base = isNaN(current) ? value : current;
      const next = Math.round((base + step) * 1000) / 1000;
      setLocalText(String(next));
      onChange(next);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const current = parseFloat(localText);
      const base = isNaN(current) ? value : current;
      const next = Math.round((base - step) * 1000) / 1000;
      setLocalText(String(next));
      onChange(next);
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={localText}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onKeyUp={(e) => e.stopPropagation()}
      disabled={disabled}
      autoComplete="off"
      spellCheck={false}
      className={`bg-[#131722] border border-[#363a45] rounded px-1.5 py-0.5 text-xs text-[#d1d4dc] font-mono outline-none ${
        disabled
          ? 'opacity-80 cursor-default'
          : 'hover:border-[#787b86] focus:border-[#2962ff]'
      } ${className}`}
    />
  );
};
