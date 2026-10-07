import React, { useState, useRef } from 'react';
import {
  X,
  UploadCloud,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  Layers,
  MapPin,
} from 'lucide-react';
import { INDIAN_STATES } from '../data/indianStates';
import { parseImportedRoadFile } from '../services/fileImporter';
import { OSMWayElement, StateMeta } from '../types';

interface ImportFilesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (
    stateCode: string,
    elements: OSMWayElement[],
    sourceFormat: string
  ) => void;
}

export const ImportFilesModal: React.FC<ImportFilesModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess,
}) => {
  const [selectedStateCode, setSelectedStateCode] = useState<string>('IN-AR');
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleProcessFile = async (file: File) => {
    setImporting(true);
    setStatusMessage(null);

    try {
      const text = await file.text();
      const result = await parseImportedRoadFile(text, file.name);

      if (result.elements.length === 0) {
        throw new Error('No valid road ways or line geometries found in the uploaded file.');
      }

      // Detect state code from filename if possible
      let matchedCode = selectedStateCode;
      const lowerName = file.name.toLowerCase();
      for (const st of INDIAN_STATES) {
        if (
          lowerName.includes(st.code.toLowerCase()) ||
          lowerName.includes(st.name.toLowerCase().replace(/\s+/g, '_')) ||
          lowerName.includes(st.name.toLowerCase())
        ) {
          matchedCode = st.code;
          setSelectedStateCode(st.code);
          break;
        }
      }

      onImportSuccess(matchedCode, result.elements, result.sourceFormat);
      setStatusMessage({
        type: 'success',
        text: `Successfully imported ${result.elements.length} OSM ways into ${matchedCode}!`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Failed to import file: ${err.message}`,
      });
    } finally {
      setImporting(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleProcessFile(e.target.files[0]);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80">
          <div className="flex items-center gap-2.5">
            <UploadCloud className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-base font-bold text-white">
                Import Overpass JSON, GeoJSON, or KML
              </h2>
              <p className="text-[11px] text-slate-400">
                Fallback for offline/restricted environments. Drop files exported from Overpass Turbo.
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

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          {/* Target State Selector */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-emerald-400" />
              <span>Assign to State / UT:</span>
            </label>
            <select
              value={selectedStateCode}
              onChange={(e) => setSelectedStateCode(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 font-medium focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {INDIAN_STATES.map((st) => (
                <option key={st.code} value={st.code}>
                  {st.name} ({st.code}) {st.isUT ? '[UT]' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Drag and Drop Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-emerald-400 bg-emerald-500/10'
                : 'border-slate-700 hover:border-slate-500 bg-slate-950/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.geojson,.kml,.xml"
              onChange={handleFileSelect}
              className="hidden"
            />
            <FolderOpen className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <p className="font-semibold text-slate-200">
              {importing ? 'Parsing and processing file...' : 'Drop file here or click to browse'}
            </p>
            <p className="text-slate-500 text-[11px] mt-1">
              Supports Overpass JSON export (<code className="text-slate-400">.json</code>), GeoJSON (<code className="text-slate-400">.geojson</code>), or KML (<code className="text-slate-400">.kml</code>)
            </p>
          </div>

          {/* Status Message */}
          {statusMessage && (
            <div
              className={`p-3 rounded-lg flex items-center gap-2 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Instructions Box */}
          <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-[11px] text-slate-400 space-y-1.5">
            <h4 className="font-semibold text-slate-200">How to get files from Overpass Turbo:</h4>
            <ol className="list-decimal list-inside space-y-1 text-slate-400">
              <li>Visit <a href="https://overpass-turbo.eu" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">overpass-turbo.eu</a> in a new tab.</li>
              <li>Paste the query (from Settings) and zoom to the state.</li>
              <li>Click <strong>Export &gt; Data &gt; as raw OSM data (JSON)</strong> or <strong>GeoJSON</strong>.</li>
              <li>Drag the downloaded file into the box above.</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
