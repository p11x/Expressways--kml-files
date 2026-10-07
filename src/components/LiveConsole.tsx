import React, { useRef, useEffect, useState } from 'react';
import { Terminal, Trash2, ArrowDown, ShieldAlert, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { LogEntry } from '../types';

interface LiveConsoleProps {
  logs: LogEntry[];
  onClearLogs: () => void;
}

export const LiveConsole: React.FC<LiveConsoleProps> = ({ logs, onClearLogs }) => {
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl flex flex-col h-72">
      {/* Console Header */}
      <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="font-mono font-bold text-slate-200">
            Overpass Engine &amp; Politeness Stream
          </span>
          <span className="text-slate-500 font-mono text-[10px]">
            ({logs.length} events)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-0"
            />
            <span>Auto-scroll</span>
          </label>

          <button
            onClick={onClearLogs}
            className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Log list */}
      <div className="flex-1 p-3 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-1 bg-slate-950/90 select-text">
        {logs.length === 0 ? (
          <div className="text-slate-600 text-center pt-8">
            Engine idle. Select states and start fetch to observe live network stream and politeness timers.
          </div>
        ) : (
          logs.map((log) => {
            let colorClass = 'text-slate-300';
            let icon = null;

            switch (log.type) {
              case 'success':
                colorClass = 'text-emerald-400';
                icon = <CheckCircle className="w-3 h-3 text-emerald-400 inline shrink-0 mr-1" />;
                break;
              case 'warn':
                colorClass = 'text-amber-400';
                icon = <AlertTriangle className="w-3 h-3 text-amber-400 inline shrink-0 mr-1" />;
                break;
              case 'error':
                colorClass = 'text-rose-400 font-semibold';
                icon = <ShieldAlert className="w-3 h-3 text-rose-400 inline shrink-0 mr-1" />;
                break;
              case 'polite':
                colorClass = 'text-cyan-400';
                icon = <Clock className="w-3 h-3 text-cyan-400 inline shrink-0 mr-1" />;
                break;
              default:
                colorClass = 'text-slate-400';
            }

            return (
              <div key={log.id} className={`flex items-start gap-1.5 ${colorClass}`}>
                <span className="text-slate-600 text-[10px] shrink-0 select-none">
                  [{log.timestamp}]
                </span>
                <span className="break-all flex-1">
                  {icon}
                  {log.message}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
