import React, { useState } from 'react';
import {
  X,
  RotateCcw,
  Sliders,
  Server,
  Code2,
  Database,
  Trash2,
  Plus,
  ShieldCheck,
  Check,
  Eraser,
} from 'lucide-react';
import {
  DEFAULT_MAIN_QUERY_TEMPLATE,
  DEFAULT_PLANNED_QUERY_TEMPLATE,
  DEFAULT_SERVERS,
} from '../services/queryBuilder';
import { ProcessingSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ProcessingSettings;
  onSaveSettings: (newSettings: ProcessingSettings) => void;
  onClearCache: () => Promise<void>;
  onClearEmptyCache: () => Promise<number>;
  cachedCount: number;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
  onClearCache,
  onClearEmptyCache,
  cachedCount,
}) => {
  const [localSettings, setLocalSettings] = useState<ProcessingSettings>({ ...settings });
  const [newServerInput, setNewServerInput] = useState('');
  const [clearingCache, setClearingCache] = useState(false);
  const [clearingEmpty, setClearingEmpty] = useState(false);
  const [activeTab, setActiveTab] = useState<'queries' | 'pipeline' | 'servers' | 'cache'>('queries');

  if (!isOpen) return null;

  const handleResetQueries = () => {
    setLocalSettings((prev) => ({
      ...prev,
      mainQueryTemplate: DEFAULT_MAIN_QUERY_TEMPLATE,
      plannedQueryTemplate: DEFAULT_PLANNED_QUERY_TEMPLATE,
    }));
  };

  const handleAddServer = () => {
    if (!newServerInput.trim()) return;
    try {
      new URL(newServerInput.trim());
      setLocalSettings((prev) => ({
        ...prev,
        servers: [...prev.servers, newServerInput.trim()],
      }));
      setNewServerInput('');
    } catch {
      alert('Please enter a valid URL (e.g. https://overpass-api.de/api/interpreter)');
    }
  };

  const handleRemoveServer = (index: number) => {
    setLocalSettings((prev) => ({
      ...prev,
      servers: prev.servers.filter((_, i) => i !== index),
    }));
  };

  const handleSaveAndClose = () => {
    onSaveSettings(localSettings);
    onClose();
  };

  const handleClearCacheClick = async () => {
    if (confirm('Are you sure you want to clear all cached Overpass responses from IndexedDB?')) {
      setClearingCache(true);
      await onClearCache();
      setClearingCache(false);
    }
  };

  const handleClearEmptyClick = async () => {
    setClearingEmpty(true);
    const count = await onClearEmptyCache();
    setClearingEmpty(false);
    alert(`Cleared ${count} empty cache entries.`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">
              Exporter Settings &amp; Query Tuning
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('queries')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'queries'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Code2 className="w-4 h-4" />
            <span>Overpass Queries</span>
          </button>
          <button
            onClick={() => setActiveTab('pipeline')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'pipeline'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Processing Pipeline</span>
          </button>
          <button
            onClick={() => setActiveTab('servers')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'servers'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Servers &amp; Politeness</span>
          </button>
          <button
            onClick={() => setActiveTab('cache')}
            className={`py-3 px-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'cache'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>IndexedDB Cache</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 text-xs text-slate-300">
          {/* TAB 1: Overpass Queries */}
          {activeTab === 'queries' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-white text-sm">Overpass QL Templates</h3>
                  <p className="text-slate-400 text-[11px]">
                    Two light queries are executed per state. Use <code className="text-emerald-300">{'{{ISO}}'}</code> and <code className="text-emerald-300">{'{{LINK_REGEX}}'}</code> placeholders.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetQueries}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-medium transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset to Default</span>
                </button>
              </div>

              {/* Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={localSettings.includeLinks}
                    onChange={(e) =>
                      setLocalSettings((p) => ({ ...p, includeLinks: e.target.checked }))
                    }
                    className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
                  />
                  <div>
                    <span className="font-semibold text-slate-200">Include Link / Ramp Class</span>
                    <p className="text-[10px] text-slate-400">highway=motorway_link</p>
                  </div>
                </label>

                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={localSettings.includePlanned}
                    onChange={(e) =>
                      setLocalSettings((p) => ({ ...p, includePlanned: e.target.checked }))
                    }
                    className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
                  />
                  <div>
                    <span className="font-semibold text-slate-200">Include PLANNED Query</span>
                    <p className="text-[10px] text-slate-400">Under construction &amp; proposed expressways</p>
                  </div>
                </label>
              </div>

              {/* Main Query Editor */}
              <div>
                <label className="block font-semibold text-slate-200 mb-1">
                  Query A: MAIN (Motorways &amp; Trunk Expressways)
                </label>
                <textarea
                  rows={6}
                  value={localSettings.mainQueryTemplate}
                  onChange={(e) =>
                    setLocalSettings((p) => ({ ...p, mainQueryTemplate: e.target.value }))
                  }
                  className="w-full font-mono text-[11px] p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* Planned Query Editor */}
              {localSettings.includePlanned && (
                <div>
                  <label className="block font-semibold text-slate-200 mb-1">
                    Query B: PLANNED (Under Construction &amp; Proposed)
                  </label>
                  <textarea
                    rows={6}
                    value={localSettings.plannedQueryTemplate}
                    onChange={(e) =>
                      setLocalSettings((p) => ({
                        ...p,
                        plannedQueryTemplate: e.target.value,
                      }))
                    }
                    className="w-full font-mono text-[11px] p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-200 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Processing Pipeline */}
          {activeTab === 'pipeline' && (
            <div className="space-y-5">
              <div>
                <h3 className="font-bold text-white text-sm">Processing &amp; Simplification Pipeline</h3>
                <p className="text-slate-400 text-[11px]">
                  Configures road segment merging, overlap removal, and Douglas-Peucker simplification for Google Earth optimization.
                </p>
              </div>

              {/* Merge Segments */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="font-semibold text-slate-100">
                      Merge segments into whole roads
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Stitches end-to-end ways with matching category and ref/name into single Placemarks (reduces Google Earth feature count).
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSettings.mergeSegments}
                    onChange={(e) =>
                      setLocalSettings((p) => ({ ...p, mergeSegments: e.target.checked }))
                    }
                    className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
                  />
                </label>

                {localSettings.mergeSegments && (
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-400">Endpoint Snapping Tolerance</span>
                      <strong className="text-emerald-400 font-mono">
                        {localSettings.mergeToleranceMeters} meters
                      </strong>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={15}
                      step={1}
                      value={localSettings.mergeToleranceMeters}
                      onChange={(e) =>
                        setLocalSettings((p) => ({
                          ...p,
                          mergeToleranceMeters: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-emerald-500"
                    />
                  </div>
                )}
              </div>

              {/* Trim Overlaps */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="font-semibold text-slate-100">
                      Trim overlapping lines
                    </span>
                    <p className="text-[11px] text-slate-400">
                      When lines of different classes lie on top of each other, keeps higher priority (Motorway &gt; Expressway &gt; Link &gt; Under construction &gt; Proposed).
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSettings.trimOverlaps}
                    onChange={(e) =>
                      setLocalSettings((p) => ({ ...p, trimOverlaps: e.target.checked }))
                    }
                    className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
                  />
                </label>

                {localSettings.trimOverlaps && (
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">Max Distance</span>
                        <strong className="text-emerald-400 font-mono">
                          {localSettings.overlapDistanceMeters} m
                        </strong>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={20}
                        value={localSettings.overlapDistanceMeters}
                        onChange={(e) =>
                          setLocalSettings((p) => ({
                            ...p,
                            overlapDistanceMeters: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-emerald-500"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">Max Angle Diff</span>
                        <strong className="text-emerald-400 font-mono">
                          {localSettings.overlapAngleDegrees}&deg;
                        </strong>
                      </div>
                      <input
                        type="range"
                        min={5}
                        max={45}
                        value={localSettings.overlapAngleDegrees}
                        onChange={(e) =>
                          setLocalSettings((p) => ({
                            ...p,
                            overlapAngleDegrees: Number(e.target.value),
                          }))
                        }
                        className="w-full accent-emerald-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Duplicate Geometry Removal */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="font-semibold text-slate-100">
                      Remove exact duplicate geometries
                    </span>
                    <p className="text-[11px] text-slate-400">
                      Drops duplicated way paths with identical coordinates forward or reverse.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localSettings.dedupeExactGeometries}
                    onChange={(e) =>
                      setLocalSettings((p) => ({
                        ...p,
                        dedupeExactGeometries: e.target.checked,
                      }))
                    }
                    className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
                  />
                </label>
              </div>

              {/* Simplification */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-slate-100">
                    Douglas-Peucker Simplification
                  </span>
                  <strong className="text-emerald-400 font-mono">
                    {localSettings.simplificationToleranceMeters === 0
                      ? '0 m (Off / Raw Precision)'
                      : `${localSettings.simplificationToleranceMeters} meters`}
                  </strong>
                </div>
                <input
                  type="range"
                  min={0}
                  max={25}
                  step={1}
                  value={localSettings.simplificationToleranceMeters}
                  onChange={(e) =>
                    setLocalSettings((p) => ({
                      ...p,
                      simplificationToleranceMeters: Number(e.target.value),
                    }))
                  }
                  className="w-full accent-emerald-500"
                />
              </div>
            </div>
          )}

          {/* TAB 3: Servers & Politeness */}
          {activeTab === 'servers' && (
            <div className="space-y-5">
              <div>
                <h3 className="font-bold text-white text-sm">Overpass Servers &amp; Politeness Protocol</h3>
                <p className="text-slate-400 text-[11px]">
                  Automatic server rotation on failure, strictly 1 request at a time, and exponential backoff.
                </p>
              </div>

              {/* Server List */}
              <div className="space-y-2">
                <label className="block font-semibold text-slate-200">
                  Overpass Endpoint Rotation List ({localSettings.servers.length})
                </label>
                <div className="space-y-1.5">
                  {localSettings.servers.map((srv, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500 text-[10px] w-4">#{idx + 1}</span>
                        <span className="text-slate-200">{srv}</span>
                      </div>
                      {localSettings.servers.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveServer(idx)}
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add Server Input */}
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="url"
                    placeholder="https://your-custom-overpass-server.org/api/interpreter"
                    value={newServerInput}
                    onChange={(e) => setNewServerInput(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddServer}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>

              {/* Politeness Delays */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Politeness Delay (Min Spacing)
                  </label>
                  <div className="font-mono text-emerald-400 font-bold text-sm">
                    {(localSettings.politenessDelayMs / 1000).toFixed(1)}s
                  </div>
                  <input
                    type="range"
                    min={2000}
                    max={15000}
                    step={500}
                    value={localSettings.politenessDelayMs}
                    onChange={(e) =>
                      setLocalSettings((p) => ({
                        ...p,
                        politenessDelayMs: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-emerald-500 mt-2"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Query Timeout
                  </label>
                  <div className="font-mono text-cyan-400 font-bold text-sm">
                    {localSettings.requestTimeoutSeconds}s
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={240}
                    step={10}
                    value={localSettings.requestTimeoutSeconds}
                    onChange={(e) =>
                      setLocalSettings((p) => ({
                        ...p,
                        requestTimeoutSeconds: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-cyan-500 mt-2"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Max Retries / Failovers
                  </label>
                  <div className="font-mono text-amber-400 font-bold text-sm">
                    {localSettings.maxRetries} attempts
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={8}
                    step={1}
                    value={localSettings.maxRetries}
                    onChange={(e) =>
                      setLocalSettings((p) => ({
                        ...p,
                        maxRetries: Number(e.target.value),
                      }))
                    }
                    className="w-full accent-amber-500 mt-2"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Cache Management */}
          {activeTab === 'cache' && (
            <div className="space-y-4">
              <div>
                <h3 className="font-bold text-white text-sm">IndexedDB Local Cache</h3>
                <p className="text-slate-400 text-[11px]">
                  Validated Overpass responses are saved client-side in IndexedDB. Only successful queries are stored.
                </p>
              </div>

              <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 space-y-4">
                <div>
                  <div className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Database className="w-4 h-4 text-cyan-400" />
                    <span>Cache Storage Status</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Currently storing <strong className="text-cyan-300">{cachedCount}</strong> cached state responses. Empty entries (0 ways) expire automatically after 24 hours.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={handleClearEmptyClick}
                    disabled={clearingEmpty || cachedCount === 0}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <Eraser className="w-4 h-4" />
                    <span>{clearingEmpty ? 'Clearing...' : 'Clear Empty Entries (0 ways)'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleClearCacheClick}
                    disabled={clearingCache || cachedCount === 0}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-semibold text-xs transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>{clearingCache ? 'Clearing...' : 'Clear Entire Cache'}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-slate-400 hover:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            onClick={handleSaveAndClose}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-lg shadow-emerald-500/20 transition-colors cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>Apply Settings</span>
          </button>
        </div>
      </div>
    </div>
  );
};
