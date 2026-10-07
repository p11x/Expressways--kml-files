import React, { useState } from 'react';
import {
  X,
  FlaskConical,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Terminal,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import { runAllSelfTests } from '../services/selfTester';
import { TestCaseResult } from '../types';

interface SelfTestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SelfTestModal: React.FC<SelfTestModalProps> = ({ isOpen, onClose }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<TestCaseResult[] | null>(null);

  if (!isOpen) return null;

  const handleRunTests = async () => {
    setIsRunning(true);
    // slight delay for UI feedback
    await new Promise((r) => setTimeout(r, 100));
    try {
      const results = await runAllSelfTests();
      setTestResults(results);
    } catch (err: any) {
      console.error('Test runner failure:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const totalPassed = testResults
    ? testResults.filter((t) => t.passed).length
    : 0;
  const totalCount = testResults ? testResults.length : 0;
  const allPassed = totalCount > 0 && totalPassed === totalCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <FlaskConical className="w-5 h-5 text-purple-400" />
            <div>
              <h2 className="text-base font-bold text-white">
                Engine Self-Test Suite (In-Memory Mock Verification)
              </h2>
              <p className="text-[11px] text-slate-400">
                Verifies parsing, backoff calculations, stitching, overlap trimming, and KML DOM compliance.
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

        {/* Action & Summary Bar */}
        <div className="p-4 bg-slate-950/50 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={handleRunTests}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500 hover:bg-purple-400 text-slate-950 font-bold shadow-lg shadow-purple-500/20 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isRunning ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-slate-950" />
              )}
              <span>{isRunning ? 'Running Tests...' : 'Run All Self-Tests (7)'}</span>
            </button>

            <span className="text-slate-400 text-[11px] flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              Isolated in-memory: Never touches cache or exports
            </span>
          </div>

          {testResults && (
            <div className="flex items-center gap-2 font-mono">
              <span
                className={`px-2.5 py-1 rounded text-xs font-bold ${
                  allPassed
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                }`}
              >
                {totalPassed} / {totalCount} Passed
              </span>
            </div>
          )}
        </div>

        {/* Test Results List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          {!testResults && !isRunning && (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <FlaskConical className="w-10 h-10 text-purple-400/50 mx-auto mb-2" />
              <p className="font-semibold text-slate-300 text-sm">
                Ready to execute self-test cases
              </p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Click &quot;Run All Self-Tests&quot; to test synthetic Overpass payloads, stitching, trimming, and DOMParser validation.
              </p>
            </div>
          )}

          {testResults &&
            testResults.map((test) => (
              <div
                key={test.id}
                className={`p-4 rounded-xl border transition-all ${
                  test.passed
                    ? 'bg-slate-950/70 border-emerald-500/30'
                    : 'bg-rose-950/20 border-rose-500/40'
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    {test.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <h4 className="font-bold text-slate-100 text-sm">{test.title}</h4>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {test.durationMs}ms
                  </span>
                </div>

                {/* Assertions */}
                <div className="space-y-1.5 pl-6 mt-2">
                  {test.assertions.map((a, idx) => (
                    <div
                      key={idx}
                      className="flex items-start justify-between gap-2 text-[11px] bg-slate-900/80 p-2 rounded border border-slate-800"
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            a.passed ? 'bg-emerald-400' : 'bg-rose-400'
                          }`}
                        />
                        <span className="text-slate-200">{a.name}</span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {a.passed ? (
                          <span className="text-emerald-400 font-semibold">PASS</span>
                        ) : (
                          <span className="text-rose-400 font-semibold">
                            FAIL (Got: {a.actual}, Expected: {a.expected})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Execution Logs */}
                {test.logs.length > 0 && (
                  <div className="mt-3 pl-6">
                    <div className="bg-black/40 p-2.5 rounded-lg border border-slate-800/80 font-mono text-[10px] text-slate-400 space-y-0.5">
                      {test.logs.map((log, lIdx) => (
                        <div key={lIdx}>&bull; {log}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
