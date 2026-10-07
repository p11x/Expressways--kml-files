import React, { useState, useMemo } from 'react';
import {
  CheckSquare,
  Square,
  Search,
  CheckCircle2,
  MapPin,
  RefreshCw,
  Info,
  RotateCcw,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { INDIAN_STATES } from '../data/indianStates';
import { StateMeta, StateQueueItem } from '../types';

interface StatePickerProps {
  selectedCodes: Set<string>;
  onToggleSelect: (code: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSelectRemainingOnly: () => void;
  doneCodes: Set<string>;
  onToggleDone: (code: string) => void;
  queueMap: Map<string, StateQueueItem>;
  disabled: boolean;
  onRefetchState: (code: string) => void;
}

function formatAge(ageMs?: number): string {
  if (!ageMs) return '';
  const secs = Math.floor(ageMs / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
}

export const StatePicker: React.FC<StatePickerProps> = ({
  selectedCodes,
  onToggleSelect,
  onSelectAll,
  onDeselectAll,
  onSelectRemainingOnly,
  doneCodes,
  onToggleDone,
  queueMap,
  disabled,
  onRefetchState,
}) => {
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState<string>('All');
  const [typeFilter, setTypeFilter] = useState<'All' | 'States' | 'UTs'>('All');

  const filteredStates = useMemo(() => {
    return INDIAN_STATES.filter((state) => {
      const matchSearch =
        state.name.toLowerCase().includes(search.toLowerCase()) ||
        state.code.toLowerCase().includes(search.toLowerCase()) ||
        (state.altCodes &&
          state.altCodes.some((c) => c.toLowerCase().includes(search.toLowerCase())));

      if (!matchSearch) return false;

      if (zoneFilter !== 'All' && state.zone !== zoneFilter) return false;

      if (typeFilter === 'States' && state.isUT) return false;
      if (typeFilter === 'UTs' && !state.isUT) return false;

      return true;
    });
  }, [search, zoneFilter, typeFilter]);

  const selectedCount = selectedCodes.size;
  const doneCount = doneCodes.size;
  const remainingCount = 36 - doneCount;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
      {/* Header & Batch Selection Toolbar */}
      <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/60">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-emerald-400" />
              <h2 className="text-base font-bold text-white">
                1. Select Indian States &amp; Union Territories (36)
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {selectedCount} selected &bull; {doneCount} marked as already done &bull; {remainingCount} remaining
            </p>
          </div>

          {/* Quick Selection Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onSelectAll}
              disabled={disabled}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-40 transition-colors cursor-pointer"
            >
              Select All (36)
            </button>
            <button
              onClick={onSelectRemainingOnly}
              disabled={disabled}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 disabled:opacity-40 transition-colors cursor-pointer"
              title="Select all states not currently marked as done"
            >
              Select Remaining Only ({remainingCount})
            </button>
            <button
              onClick={onDeselectAll}
              disabled={disabled || selectedCount === 0}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 disabled:opacity-40 transition-colors cursor-pointer"
            >
              Deselect All
            </button>
          </div>
        </div>

        {/* Search & Zone Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by state name or ISO code (e.g. IN-MH)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          <div className="relative">
            <select
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
            >
              <option value="All">All Regions / Zones</option>
              <option value="North">North India</option>
              <option value="South">South India</option>
              <option value="West">West India</option>
              <option value="East">East India</option>
              <option value="Central">Central India</option>
              <option value="Northeast">Northeast India</option>
              <option value="Islands">Island Territories</option>
            </select>
          </div>

          <div className="relative">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors cursor-pointer"
            >
              <option value="All">All Entities (28 States + 8 UTs)</option>
              <option value="States">States Only (28)</option>
              <option value="UTs">Union Territories Only (8)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table of States */}
      <div className="max-h-[460px] overflow-y-auto divide-y divide-slate-800/80">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-slate-950/80 text-slate-400 uppercase text-[11px] tracking-wider sticky top-0 z-10 backdrop-blur-sm">
            <tr>
              <th className="py-2.5 px-4 w-12 text-center">Select</th>
              <th className="py-2.5 px-3">State / UT</th>
              <th className="py-2.5 px-3 w-28">ISO 3166-2</th>
              <th className="py-2.5 px-3 hidden md:table-cell">Region</th>
              <th className="py-2.5 px-3 hidden sm:table-cell">Fallback Codes / Fallback Name</th>
              <th className="py-2.5 px-3 text-center w-36">Marked as Done</th>
              <th className="py-2.5 px-3 text-right w-44">Status &amp; Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {filteredStates.map((state) => {
              const isSelected = selectedCodes.has(state.code);
              const isDone = doneCodes.has(state.code);
              const queueItem = queueMap.get(state.code);

              let statusBadge = (
                <span className="text-slate-500 text-[11px] font-mono">Idle</span>
              );

              if (queueItem) {
                switch (queueItem.status) {
                  case 'running':
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold animate-pulse">
                        <RefreshCw className="w-3 h-3 animate-spin" /> Querying
                      </span>
                    );
                    break;
                  case 'retrying':
                    statusBadge = (
                      <span className="text-amber-400 font-semibold">
                        Retry #{queueItem.attempt}
                      </span>
                    );
                    break;
                  case 'splitting':
                    statusBadge = (
                      <span className="text-purple-400 font-semibold">
                        {queueItem.tilesCount} Tiles
                      </span>
                    );
                    break;
                  case 'done':
                    statusBadge = (
                      <span className="text-emerald-400 font-semibold flex items-center justify-end gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {queueItem.rawWaysCount} ways
                      </span>
                    );
                    break;
                  case 'cached':
                    statusBadge = (
                      <span className="text-cyan-400 font-semibold flex items-center justify-end gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {queueItem.rawWaysCount} ways (cached)
                      </span>
                    );
                    break;
                  case 'empty':
                    statusBadge = (
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="text-slate-400 font-medium">
                          {queueItem.isCached
                            ? `empty (cached${queueItem.cacheAgeMs ? `, ${formatAge(queueItem.cacheAgeMs)}` : ''})`
                            : '0 lines'}
                        </span>
                        <button
                          type="button"
                          onClick={() => onRefetchState(state.code)}
                          disabled={disabled}
                          className="p-1 text-slate-400 hover:text-amber-300 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                          title="Re-fetch this empty state from live Overpass servers"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      </div>
                    );
                    break;
                  case 'failed':
                    statusBadge = (
                      <div className="flex items-center justify-end gap-1.5">
                        <span
                          className="text-rose-400 font-semibold cursor-help"
                          title={queueItem.errorMessage}
                        >
                          Failed
                        </span>
                        <button
                          type="button"
                          onClick={() => onRefetchState(state.code)}
                          disabled={disabled}
                          className="p-1 text-rose-400 hover:text-rose-200 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                          title="Retry fetching this state"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      </div>
                    );
                    break;
                  case 'queued':
                    statusBadge = (
                      <span className="text-amber-300 font-medium">Queued</span>
                    );
                    break;
                }
              }

              return (
                <tr
                  key={state.code}
                  className={`hover:bg-slate-800/40 transition-colors ${
                    isSelected ? 'bg-emerald-500/[0.04]' : ''
                  }`}
                >
                  {/* Select Checkbox */}
                  <td className="py-2.5 px-4 text-center">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onToggleSelect(state.code)}
                      className="text-slate-400 hover:text-emerald-400 disabled:opacity-50 cursor-pointer"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </td>

                  {/* State Name */}
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                      <span>{state.name}</span>
                      {state.isUT && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                          UT
                        </span>
                      )}
                    </div>
                  </td>

                  {/* ISO Code */}
                  <td className="py-2.5 px-3">
                    <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 border border-slate-700">
                      {state.code}
                    </code>
                  </td>

                  {/* Region Zone */}
                  <td className="py-2.5 px-3 hidden md:table-cell text-slate-400">
                    {state.zone}
                  </td>

                  {/* Alternative Fallback Codes */}
                  <td className="py-2.5 px-3 hidden sm:table-cell text-slate-400">
                    {state.altCodes && state.altCodes.length > 0 ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[11px] text-slate-400">Alts:</span>
                        {state.altCodes.map((alt) => (
                          <code
                            key={alt}
                            className="font-mono text-[10px] px-1 py-0.2 rounded bg-slate-800 text-amber-300 border border-slate-700"
                          >
                            {alt}
                          </code>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-500">name:en fallback</span>
                    )}
                  </td>

                  {/* Mark as Done Toggle */}
                  <td className="py-2.5 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => onToggleDone(state.code)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                        isDone
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25'
                          : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 text-slate-300'
                      }`}
                      title={
                        isDone
                          ? 'State marked as already processed (persisted)'
                          : 'Click to mark state as already completed'
                      }
                    >
                      {isDone ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Done</span>
                        </>
                      ) : (
                        <span>Mark Done</span>
                      )}
                    </button>
                  </td>

                  {/* Status & Re-fetch */}
                  <td className="py-2.5 px-3 text-right">{statusBadge}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="p-3 bg-slate-950/60 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-cyan-400" />
          <span>
            Empty results (<code className="text-slate-300">0 lines</code>) are cached for 24h only and can be re-fetched at any time with the circular reload icon.
          </span>
        </div>
      </div>
    </div>
  );
};
