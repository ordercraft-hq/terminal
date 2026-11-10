import React from 'react';
import { Terminal, Trash2, CheckCircle, AlertTriangle, Clock } from 'lucide-react';

interface ConsolePanelProps {
  logs: string[];
  error: string | null;
  executionTimeMs: number | null;
  onClear: () => void;
  onErrorClick?: (line: number) => void;
}

export const ConsolePanel: React.FC<ConsolePanelProps> = ({
  logs,
  error,
  executionTimeMs,
  onClear,
  onErrorClick,
}) => {
  // Parse error line number if present e.g. "indicator.star:12:5: ..."
  const lineMatch = error ? error.match(/[:\s](\d+):(\d+):/) : null;
  const errorLine = lineMatch ? parseInt(lineMatch[1], 10) : null;

  return (
    <div className="flex flex-col h-full bg-[#131722] text-[#d1d4dc] font-mono text-xs select-text">
      {/* Console Sub-header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#171a22] border-b border-[#2a2e39] text-[11px]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[#787b86]">
            <Terminal className="w-3.5 h-3.5" />
            <span>OrderScript Execution Log</span>
          </div>

          {executionTimeMs !== null && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#1e222d] border border-[#2a2e39] text-[#089981]">
              <Clock className="w-3 h-3" />
              <span>{executionTimeMs.toFixed(2)} ms</span>
            </div>
          )}

          {error ? (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-[#f23645]">
              <AlertTriangle className="w-3 h-3" />
              <span>Execution Failed</span>
            </div>
          ) : logs.length > 0 ? (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[#089981]">
              <CheckCircle className="w-3 h-3" />
              <span>Success</span>
            </div>
          ) : null}
        </div>

        <button
          onClick={onClear}
          title="Clear Console"
          className="flex items-center gap-1 px-2 py-1 rounded text-[#787b86] hover:text-white hover:bg-[#2a2e39] transition-colors"
        >
          <Trash2 className="w-3 h-3" />
          <span>Clear</span>
        </button>
      </div>

      {/* Console Body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5 leading-relaxed">
        {logs.length === 0 && !error && (
          <div className="text-[#787b86] italic py-4 text-center">
            Console empty. Run your script to see execution output and performance timing.
          </div>
        )}

        {logs.map((log, idx) => (
          <div key={idx} className="flex items-start gap-2 text-[#d1d4dc]">
            <span className="text-[#787b86] select-none text-[10px] w-6 text-right shrink-0">
              {idx + 1}
            </span>
            <span className="whitespace-pre-wrap break-all">{log}</span>
          </div>
        ))}

        {error && (
          <div
            onClick={() => errorLine && onErrorClick?.(errorLine)}
            className={`p-2.5 rounded bg-red-950/20 border border-red-500/30 text-[#f23645] ${
              errorLine ? 'cursor-pointer hover:bg-red-950/30 transition-colors' : ''
            }`}
          >
            <div className="flex items-center gap-2 font-semibold mb-1">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Runtime / Compilation Error</span>
              {errorLine && (
                <span className="ml-auto text-[10px] bg-red-500/20 px-1.5 py-0.5 rounded">
                  Line {errorLine} (Click to jump)
                </span>
              )}
            </div>
            <pre className="text-[11px] whitespace-pre-wrap break-all text-red-200 mt-1 font-mono">
              {error}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
