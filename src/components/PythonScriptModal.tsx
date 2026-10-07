import React, { useState } from 'react';
import {
  X,
  Code2,
  Copy,
  Download,
  Check,
  Terminal,
  FileCode,
  ShieldCheck,
} from 'lucide-react';
import { StateMeta } from '../types';
import { generatePythonExportScript } from '../services/pythonScriptGenerator';

interface PythonScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedStates: StateMeta[];
  servers: string[];
  includePlanned: boolean;
  includeLinks: boolean;
  politenessDelayMs: number;
}

export const PythonScriptModal: React.FC<PythonScriptModalProps> = ({
  isOpen,
  onClose,
  selectedStates,
  servers,
  includePlanned,
  includeLinks,
  politenessDelayMs,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const scriptCode = generatePythonExportScript(
    selectedStates,
    servers,
    includePlanned,
    includeLinks,
    Math.round(politenessDelayMs / 1000)
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(scriptCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const handleDownload = () => {
    const blob = new Blob([scriptCode], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'export_india_roads.py';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <Code2 className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-base font-bold text-white">
                Standalone Python Exporter Script
              </h2>
              <p className="text-[11px] text-slate-400">
                Self-contained Python script to download {selectedStates.length} selected states with requests &amp; standard library XML.
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

        {/* Action Toolbar */}
        <div className="p-4 bg-slate-950/50 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold shadow-lg shadow-emerald-500/20 transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Python Script'}</span>
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download export_india_roads.py</span>
            </button>
          </div>

          <span className="text-slate-400 text-[11px] font-mono">
            Python 3.7+ &bull; pip install requests
          </span>
        </div>

        {/* Code View */}
        <div className="flex-1 overflow-y-auto p-4 bg-slate-950 font-mono text-[11px] text-slate-300 leading-relaxed select-text">
          <pre className="whitespace-pre">{scriptCode}</pre>
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
