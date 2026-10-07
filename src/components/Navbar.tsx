import React from 'react';
import {
  Layers,
  Settings,
  FlaskConical,
  Sun,
  Moon,
  ShieldCheck,
  Database,
  ExternalLink,
  Activity,
  UploadCloud,
  Code2,
} from 'lucide-react';

interface NavbarProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenSettings: () => void;
  onOpenSelfTest: () => void;
  onOpenDiagnostics: () => void;
  onOpenImportFiles: () => void;
  onOpenPythonScript: () => void;
  cachedCount: number;
  totalCompleted: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  darkMode,
  onToggleDarkMode,
  onOpenSettings,
  onOpenSelfTest,
  onOpenDiagnostics,
  onOpenImportFiles,
  onOpenPythonScript,
  cachedCount,
  totalCompleted,
}) => {
  return (
    <header className="border-b border-slate-700/60 bg-slate-900/90 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 text-slate-950 font-black text-lg">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
                India Roads <span className="text-emerald-400 font-mono text-sm">→</span> KMZ Exporter
              </h1>
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                Overpass QL
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden md:block">
              OSM Motorways &amp; Expressways for Google Earth Pro &amp; Web
            </p>
          </div>
        </div>

        {/* Badges & Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2.5">
          {/* Connectivity / Diagnostics Button */}
          <button
            onClick={onOpenDiagnostics}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 transition-all cursor-pointer"
            title="Run Overpass network reachability & CORS probe"
          >
            <Activity className="w-4 h-4 text-cyan-400" />
            <span className="hidden md:inline">Diagnostics</span>
          </button>

          {/* Import Files Fallback Button */}
          <button
            onClick={onOpenImportFiles}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer"
            title="Import raw Overpass JSON, GeoJSON, or KML files"
          >
            <UploadCloud className="w-4 h-4 text-emerald-400" />
            <span className="hidden md:inline">Import</span>
          </button>

          {/* Python Script Generator Button */}
          <button
            onClick={onOpenPythonScript}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all cursor-pointer"
            title="Generate standalone Python script"
          >
            <Code2 className="w-4 h-4 text-amber-400" />
            <span className="hidden md:inline">Python</span>
          </button>

          {/* Self-Test button */}
          <button
            onClick={onOpenSelfTest}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 transition-all cursor-pointer"
            title="Run isolated in-memory test suite"
          >
            <FlaskConical className="w-4 h-4 text-purple-400" />
            <span className="hidden sm:inline">Self-Test</span>
          </button>

          {/* Settings button */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700/80 text-slate-200 border border-slate-700 transition-all cursor-pointer"
            title="Query templates, Overpass servers & Algorithm tuning"
          >
            <Settings className="w-4 h-4 text-slate-300" />
            <span className="hidden sm:inline">Settings</span>
          </button>

          {/* Dark / Light Toggle */}
          <button
            onClick={onToggleDarkMode}
            className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 border border-slate-700/60 transition-colors cursor-pointer"
            title={darkMode ? 'Switch to Light theme' : 'Switch to Dark theme'}
            aria-label="Toggle theme"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};
