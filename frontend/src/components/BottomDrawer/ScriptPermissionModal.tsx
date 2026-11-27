import React, { useState, useEffect } from 'react';
import { ShieldAlert, Globe, Cpu, Check, X } from 'lucide-react';

interface ScriptPermissionModalProps {
  isOpen: boolean;
  requestedPermissions: string[];
  onGrant: (granted: string[]) => void;
  onDeny: () => void;
}

export const ScriptPermissionModal: React.FC<ScriptPermissionModalProps> = ({
  isOpen,
  requestedPermissions,
  onGrant,
  onDeny,
}) => {
  const [selected, setSelected] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const p of requestedPermissions) {
      initial[p] = true;
    }
    return initial;
  });

  useEffect(() => {
    if (!isOpen) return;
    const next: Record<string, boolean> = {};
    for (const p of requestedPermissions) {
      next[p] = true;
    }
    setSelected(next);
  }, [isOpen, requestedPermissions]);

  if (!isOpen) return null;

  const handleToggle = (perm: string) => {
    setSelected((prev) => ({ ...prev, [perm]: !prev[perm] }));
  };

  const handleConfirm = () => {
    const granted = Object.keys(selected).filter((k) => selected[k]);
    onGrant(granted);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg bg-[#1e222d] border border-[#2a2e39] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#171a22] border-b border-[#2a2e39]">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Capability Authorization</h3>
              <p className="text-xs text-[#787b86]">This script requests external sandbox permissions</p>
            </div>
          </div>
          <button
            onClick={onDeny}
            className="p-1.5 rounded text-[#787b86] hover:text-white hover:bg-[#2a2e39] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          <p className="text-xs text-[#d1d4dc] leading-relaxed">
            OrderScript executes inside a hermetic sandbox. The following capabilities require explicit user grant before the script can access network endpoints or local services:
          </p>

          <div className="space-y-2 max-h-56 overflow-y-auto">
            {requestedPermissions.map((perm) => {
              const isNetwork = perm.startsWith('network:');
              const isIpc = perm.startsWith('ipc:');
              const isChecked = selected[perm] ?? false;

              return (
                <label
                  key={perm}
                  className={`flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                    isChecked
                      ? 'bg-[#2962ff]/10 border-[#2962ff]/40 text-white'
                      : 'bg-[#131722] border-[#2a2e39] text-[#787b86] hover:border-[#363a45]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggle(perm)}
                    className="mt-0.5 rounded border-[#363a45] bg-[#131722] text-[#2962ff] focus:ring-0 w-4 h-4"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isNetwork ? (
                        <Globe className="w-3.5 h-3.5 text-[#2962ff]" />
                      ) : isIpc ? (
                        <Cpu className="w-3.5 h-3.5 text-purple-400" />
                      ) : (
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                      )}
                      <span className="text-xs font-mono font-medium truncate">{perm}</span>
                    </div>
                    <p className="text-[11px] text-[#787b86] mt-0.5">
                      {isNetwork
                        ? 'Allow outbound HTTP GET queries to target host'
                        : isIpc
                        ? 'Allow local inter-process model communication'
                        : 'Elevated runtime capability'}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 bg-[#171a22] border-t border-[#2a2e39]">
          <button
            onClick={onDeny}
            className="px-3.5 py-1.5 rounded text-xs font-medium text-[#d1d4dc] hover:bg-[#2a2e39] transition-colors"
          >
            Deny & Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-[#2962ff] hover:bg-[#1e53e5] text-xs font-medium text-white transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            Grant Selected
          </button>
        </div>
      </div>
    </div>
  );
};
