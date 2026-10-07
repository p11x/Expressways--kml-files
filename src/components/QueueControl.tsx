import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Square,
  Clock,
  ShieldCheck,
  Server,
  Activity,
  CheckCircle2,
  Database,
  HelpCircle,
} from 'lucide-react';
import { ServerHealthInfo } from '../types';

interface QueueControlProps {
  isRunning: boolean;
  isPaused: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetryFailed: () => void;
  selectedCount: number;
  processedCount: number; // verified positive results
  emptyCount: number; // 0 raw ways
  failedCount: number; // failed
  cachedCount: number; // loaded from cache
  totalFinishedCount: number;
  countdownSeconds: number;
  countdownReason: string;
  activeServer?: string;
  serverHealthMap: Map<string, ServerHealthInfo>;
  measuredAvgSecondsPerState: number;
  estimatedRemainingSeconds: number;
  refetchEmptyOption: boolean;
  onToggleRefetchEmptyOption: () => void;
}

export const QueueControl: React.FC<QueueControlProps> = ({
  isRunning,
  isPaused,
  onStart,
  onPause,
  onResume,
  onCancel,
  onRetryFailed,
  selectedCount,
  processedCount,
  emptyCount,
  failedCount,
  cachedCount,
  totalFinishedCount,
  countdownSeconds,
  countdownReason,
  activeServer,
  serverHealthMap,
  measuredAvgSecondsPerState,
  estimatedRemainingSeconds,
  refetchEmptyOption,
  onToggleRefetchEmptyOption,
}) => {
  const progressPercent =
    selectedCount > 0 ? Math.min(100, (totalFinishedCount / selectedCount) * 100) : 0;

  const formatEta = (secs: number) => {
    if (secs <= 0) return '—';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-xl space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Execution Actions */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {!isRunning ? (
            <button
              onClick={onStart}
              disabled={selectedCount === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              <span>Fetch Selected ({selectedCount})</span>
            </button>
          ) : isPaused ? (
            <button
              onClick={onResume}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/25 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-slate-950" />
              <span>Resume Execution</span>
            </button>
          ) : (
            <button
              onClick={onPause}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/25 transition-all cursor-pointer"
            >
              <Pause className="w-4 h-4 fill-slate-950" />
              <span>Pause Queue</span>
            </button>
          )}

          {isRunning && (
            <button
              onClick={onCancel}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-sm font-semibold transition-all cursor-pointer"
            >
              <Square className="w-4 h-4 fill-rose-300" />
              <span>Cancel</span>
            </button>
          )}

          {failedCount > 0 && !isRunning && (
            <button
              onClick={onRetryFailed}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 text-sm font-semibold transition-all cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Retry Failed ({failedCount})</span>
            </button>
          )}

          {/* Re-fetch Cached Empty Entries Toggle */}
          {!isRunning && (
            <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 cursor-pointer select-none hover:border-slate-700">
              <input
                type="checkbox"
                checked={refetchEmptyOption}
                onChange={onToggleRefetchEmptyOption}
                className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
              />
              <span>Re-fetch cached empty states</span>
            </label>
          )}
        </div>

        {/* Politeness, Server & ETA Status */}
        <div className="flex flex-wrap items-center gap-3">
          {countdownSeconds > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono animate-pulse">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>
                {countdownReason}: <strong className="text-amber-200">{countdownSeconds.toFixed(1)}s</strong>
              </span>
            </div>
          )}

          {activeServer && isRunning && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-xs font-mono">
              <Server className="w-3.5 h-3.5 text-cyan-400" />
              <span>Trying: {new URL(activeServer).hostname}</span>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>ETA:</span>
            <strong className="text-slate-200 font-mono">
              {isRunning ? formatEta(estimatedRemainingSeconds) : '—'}
            </strong>
            {measuredAvgSecondsPerState > 0 && isRunning && (
              <span className="text-[10px] text-slate-500">
                (~{measuredAvgSecondsPerState.toFixed(1)}s/state measured)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress & Clean Disaggregated Counters */}
      <div className="pt-2 border-t border-slate-800/80">
        <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 mb-1.5 font-medium gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <span>Progress:</span>
            <span className="text-slate-200 font-semibold">
              {totalFinishedCount} of {selectedCount} done
            </span>
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Processed: {processedCount}
            </span>
            {cachedCount > 0 && (
              <span className="text-cyan-400 font-semibold flex items-center gap-1">
                <Database className="w-3.5 h-3.5" /> From Cache: {cachedCount}
              </span>
            )}
            {emptyCount > 0 && (
              <span className="text-slate-400 font-medium">
                Empty (0 lines): {emptyCount}
              </span>
            )}
            {failedCount > 0 && (
              <span className="text-rose-400 font-bold">
                Failed: {failedCount}
              </span>
            )}
          </div>
          <span className="font-mono text-emerald-400 font-bold">
            {progressPercent.toFixed(0)}%
          </span>
        </div>

        <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800 relative">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Server Health Status Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            <strong>Politeness Protocol:</strong> 1 request at a time, &ge;5s spacing, fail-fast failover on connection errors.
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {Array.from(serverHealthMap.entries()).map(([url, h]) => {
            const host = new URL(url).hostname;
            const isDown = h.deprioritizedUntil > Date.now();
            const isDegraded = h.consecutiveFailures > 0 && !isDown;

            let badgeColor = 'bg-slate-800 text-slate-300 border-slate-700';
            if (h.lastStatus === 'healthy') badgeColor = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
            if (isDegraded) badgeColor = 'bg-amber-500/15 text-amber-300 border-amber-500/30';
            if (isDown) badgeColor = 'bg-rose-500/20 text-rose-300 border-rose-500/40';

            return (
              <span
                key={url}
                className={`px-2 py-0.5 rounded text-[10px] font-mono border ${badgeColor}`}
                title={h.lastError || `${host} latency: ${h.lastLatencyMs || '—'}ms`}
              >
                {host}: {isDown ? 'Deprioritised' : isDegraded ? `${h.consecutiveFailures} fail` : h.lastStatus === 'healthy' ? 'OK' : 'Standby'}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
