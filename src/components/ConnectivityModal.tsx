import React, { useState, useEffect } from 'react';
import {
  X,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Globe,
  ShieldAlert,
  Server,
  Code2,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { isRunningInIframe, runAllConnectivityTests } from '../services/connectivityTester';
import { ConnectivityTestResult, ServerHealthInfo } from '../types';

interface ConnectivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  servers: string[];
  serverHealthMap: Map<string, ServerHealthInfo>;
  onOpenImportFiles?: () => void;
  onOpenPythonScript?: () => void;
}

export const ConnectivityModal: React.FC<ConnectivityModalProps> = ({
  isOpen,
  onClose,
  servers,
  serverHealthMap,
  onOpenImportFiles,
  onOpenPythonScript,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<ConnectivityTestResult[] | null>(null);
  const inIframe = isRunningInIframe();

  const handleRunTests = async () => {
    setIsRunning(true);
    try {
      const res = await runAllConnectivityTests(servers);
      setResults(res);
    } catch (err: any) {
      console.error('Connectivity test failure:', err);
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    if (isOpen && !results && !isRunning) {
      handleRunTests();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-base font-bold text-white">
                Overpass Network &amp; CORS Diagnostics
              </h2>
              <p className="text-[11px] text-slate-400">
                Tests /api/status endpoint reachability and simple CORS POST query execution across configured servers.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Iframe / Sandbox Notice if running inside iframe */}
        {inIframe && (
          <div className="bg-amber-950/40 border-b border-amber-500/30 p-3.5 px-5 text-xs text-amber-200 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="text-amber-100 font-semibold block">
                Sandboxed / Iframe Environment Detected
              </strong>
              <p className="text-amber-300/90 text-[11px] leading-relaxed">
                Some embedded web environments restrict outbound cross-origin network fetch requests. If public Overpass servers fail with <code className="bg-amber-900/50 px-1 py-0.5 rounded text-amber-100">Failed to fetch (TypeError)</code>, you can use the built-in <strong>Import Files</strong> tab or download the standalone <strong>Python Export Script</strong> to fetch data natively with 100% reliability.
              </p>
              <div className="flex items-center gap-3 pt-1">
                {onOpenImportFiles && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenImportFiles();
                    }}
                    className="text-xs font-bold text-amber-100 underline hover:text-white"
                  >
                    Open File Importer &rarr;
                  </button>
                )}
                {onOpenPythonScript && (
                  <button
                    onClick={() => {
                      onClose();
                      onOpenPythonScript();
                    }}
                    className="text-xs font-bold text-amber-100 underline hover:text-white"
                  >
                    Get Python Downloader &rarr;
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div className="p-4 bg-slate-950/40 border-b border-slate-800 flex items-center justify-between gap-3 text-xs">
          <button
            onClick={handleRunTests}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold shadow-lg shadow-cyan-500/20 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {isRunning ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Activity className="w-4 h-4" />
            )}
            <span>{isRunning ? 'Probing Servers...' : 'Re-test Connectivity'}</span>
          </button>

          <span className="text-slate-400 text-[11px]">
            Probes GET /status (cors + no-cors) and POST node(1) tiny query
          </span>
        </div>

        {/* Results Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          {isRunning && !results && (
            <div className="text-center py-12 text-slate-400">
              <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-3" />
              <p className="font-semibold text-slate-200">Testing connection to Overpass servers...</p>
            </div>
          )}

          {results && (
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Server</th>
                    <th className="py-2.5 px-3 text-center">Status Endpoint</th>
                    <th className="py-2.5 px-3 text-center">Tiny Query (POST)</th>
                    <th className="py-2.5 px-3 text-right">Latency</th>
                    <th className="py-2.5 px-3">Diagnostic Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 text-xs">
                  {results.map((res) => {
                    const health = serverHealthMap.get(res.server);
                    const hostname = new URL(res.server).hostname;
                    const statusOk = res.statusTest.status === 'ok';
                    const queryOk = res.queryTest.status === 'ok';

                    return (
                      <tr key={res.server} className="hover:bg-slate-800/30 transition-colors">
                        {/* Server Hostname */}
                        <td className="py-3 px-3">
                          <div className="font-mono font-semibold text-slate-100 flex items-center gap-1.5">
                            <Server className="w-3.5 h-3.5 text-cyan-400" />
                            <span>{hostname}</span>
                          </div>
                          {health && health.deprioritizedUntil > Date.now() && (
                            <span className="text-[10px] text-amber-400">
                              (Deprioritised: {Math.ceil((health.deprioritizedUntil - Date.now()) / 60000)}m remaining)
                            </span>
                          )}
                        </td>

                        {/* Status Test */}
                        <td className="py-3 px-3 text-center">
                          {statusOk ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3" /> 200 OK
                            </span>
                          ) : res.statusTest.status === 'cors_blocked' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                              <AlertTriangle className="w-3 h-3" /> CORS Blocked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                              <XCircle className="w-3 h-3" /> Blocked
                            </span>
                          )}
                        </td>

                        {/* Tiny Query Test */}
                        <td className="py-3 px-3 text-center">
                          {queryOk ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                              <CheckCircle2 className="w-3 h-3" /> Passed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30">
                              <XCircle className="w-3 h-3" /> Failed
                            </span>
                          )}
                        </td>

                        {/* Latency */}
                        <td className="py-3 px-3 text-right font-mono text-slate-300">
                          {queryOk ? `${res.queryTest.latencyMs}ms` : statusOk ? `${res.statusTest.latencyMs}ms` : '—'}
                        </td>

                        {/* Diagnostic Summary */}
                        <td className="py-3 px-3 text-slate-300 text-[11px]">
                          {statusOk && queryOk ? (
                            <span className="text-emerald-400 font-medium">Fully operational</span>
                          ) : res.statusTest.status === 'cors_blocked' ? (
                            <span className="text-amber-300">
                              Server reachable, but origin blocked by CORS header.
                            </span>
                          ) : (
                            <span className="text-rose-300">
                              {res.queryTest.errorMessage || res.statusTest.errorMessage || 'Network error'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            Close Diagnostics
          </button>
        </div>
      </div>
    </div>
  );
};
