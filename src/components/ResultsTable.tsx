import React, { useState } from 'react';
import {
  Download,
  FileArchive,
  FileSpreadsheet,
  FileCode,
  Globe,
  HelpCircle,
  CheckCircle,
  AlertCircle,
  HardDriveDownload,
  Info,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { INDIAN_STATES } from '../data/indianStates';
import { evaluateLimits } from '../services/limitsPlanner';
import {
  createAllStatesZipBlob,
  createCombinedKmzBlob,
  createKmzBlob,
  generateCsvSummary,
  StateExportItem,
  triggerBlobDownload,
} from '../services/packager';
import { generateGeoJson } from '../services/kmlBuilder';
import { StateQueueItem, StitchedRoad } from '../types';

interface ResultsTableProps {
  queueMap: Map<string, StateQueueItem>;
  onClearAllResults: () => void;
}

export const ResultsTable: React.FC<ResultsTableProps> = ({
  queueMap,
  onClearAllResults,
}) => {
  const [isPackaging, setIsPackaging] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  // Compile list of completed or processed items
  const stateMetaMap = new Map(INDIAN_STATES.map((s) => [s.code, s]));

  const completedItems: StateExportItem[] = [];
  queueMap.forEach((item, code) => {
    if (item.data && item.data.length > 0) {
      const meta = stateMetaMap.get(code);
      completedItems.push({
        stateCode: code,
        stateName: meta?.name || code,
        roads: item.data,
        rawWaysCount: item.rawWaysCount,
        serverUsed: item.serverUsed,
        durationMs: item.durationMs,
        status: item.status,
        date: new Date().toISOString().split('T')[0],
      });
    }
  });

  // Calculate totals
  let totalRoads = 0;
  let totalKm = 0;
  let totalVertices = 0;
  let totalRawWays = 0;

  for (const item of completedItems) {
    totalRoads += item.roads.length;
    totalRawWays += item.rawWaysCount;
    for (const r of item.roads) {
      totalKm += r.lengthKm;
      totalVertices += r.vertexCount;
    }
  }

  // Handle single state KMZ download
  const downloadStateKmz = async (item: StateExportItem) => {
    try {
      const blob = await createKmzBlob(
        item.roads,
        `${item.stateName} Motorways & Expressways`,
        item.stateName
      );
      const safeName = item.stateName.replace(/[^a-zA-Z0-9_-]/g, '_');
      triggerBlobDownload(blob, `${item.stateCode}_${safeName}_roads.kmz`);
    } catch (err: any) {
      console.error('Error exporting KMZ:', err);
    }
  };

  // Handle single state GeoJSON download
  const downloadStateGeoJson = (item: StateExportItem) => {
    try {
      const geoJsonStr = generateGeoJson(item.roads, item.stateName);
      const blob = new Blob([geoJsonStr], { type: 'application/geo+json' });
      const safeName = item.stateName.replace(/[^a-zA-Z0-9_-]/g, '_');
      triggerBlobDownload(blob, `${item.stateCode}_${safeName}_roads.geojson`);
    } catch (err: any) {
      console.error('Error exporting GeoJSON:', err);
    }
  };

  // Handle Master ZIP download
  const handleDownloadAllZip = async () => {
    if (completedItems.length === 0) return;
    setIsPackaging(true);
    try {
      const blob = await createAllStatesZipBlob(completedItems);
      triggerBlobDownload(blob, `India_Roads_KMZ_Export_${new Date().toISOString().split('T')[0]}.zip`);
    } catch (err: any) {
      console.error('Error packaging all states zip:', err);
    } finally {
      setIsPackaging(false);
    }
  };

  // Handle Combined KMZ download
  const handleDownloadCombinedKmz = async () => {
    if (completedItems.length === 0) return;
    setIsPackaging(true);
    try {
      const blob = await createCombinedKmzBlob(completedItems);
      triggerBlobDownload(blob, `India_Motorways_Combined_${new Date().toISOString().split('T')[0]}.kmz`);
    } catch (err: any) {
      console.error('Error creating combined KMZ:', err);
    } finally {
      setIsPackaging(false);
    }
  };

  // Handle CSV Summary export
  const handleDownloadCsv = () => {
    if (completedItems.length === 0) return;
    const csvStr = generateCsvSummary(completedItems);
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    triggerBlobDownload(blob, `India_Roads_Export_Summary_${new Date().toISOString().split('T')[0]}.csv`);
  };

  if (completedItems.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center shadow-xl">
        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-3">
          <Layers className="w-6 h-6 text-slate-500" />
        </div>
        <h3 className="text-base font-bold text-slate-200">No Exportable Results Yet</h3>
        <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
          Select states in the State Picker above and run the query engine. As states complete, their Google Earth-ready KMZ files and summaries will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl space-y-4 p-4 sm:p-5">
      {/* Header & Global Export Buttons */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <HardDriveDownload className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-white">
              Export Ready KMZ &amp; GeoJSON Files ({completedItems.length} States)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Total: <strong className="text-slate-200">{totalRoads}</strong> roads ({totalRawWays} raw OSM ways) &bull;{' '}
            <strong className="text-emerald-400">{totalKm.toFixed(1)} km</strong> &bull;{' '}
            <strong className="text-cyan-400">{totalVertices.toLocaleString()}</strong> vertices
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleDownloadAllZip}
            disabled={isPackaging}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <FileArchive className="w-4 h-4 fill-slate-950" />
            <span>{isPackaging ? 'Packaging...' : 'Download All (ZIP)'}</span>
          </button>

          <button
            onClick={handleDownloadCombinedKmz}
            disabled={isPackaging}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-colors cursor-pointer"
          >
            <Globe className="w-4 h-4 text-cyan-400" />
            <span>Combined KMZ</span>
          </button>

          <button
            onClick={handleDownloadCsv}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-amber-400" />
            <span>CSV Summary</span>
          </button>

          <button
            onClick={() => setShowInstructions((p) => !p)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium transition-colors cursor-pointer"
          >
            <HelpCircle className="w-4 h-4 text-indigo-400" />
            <span>Google Earth Guide</span>
            {showInstructions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Collapsible Google Earth Import Guide */}
      {showInstructions && (
        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs text-slate-300 space-y-3">
          <div className="flex items-center gap-2 text-indigo-300 font-bold">
            <Globe className="w-4 h-4" />
            <span>How to Import into Google Earth (Pro &amp; Web)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
              <h4 className="font-semibold text-white mb-1.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400" /> Google Earth Pro (Desktop)
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-slate-400 text-[11px]">
                <li>Launch Google Earth Pro.</li>
                <li>Go to <strong>File &gt; Open...</strong> (or press Ctrl+O / Cmd+O).</li>
                <li>Select the exported <code className="text-emerald-300">.kmz</code> or <code className="text-emerald-300">doc.kml</code> file.</li>
                <li>The roads will appear under <strong>Temporary Places</strong> with distinct folders &amp; color-coded lines.</li>
                <li>Right-click on the folder to save permanently into &quot;My Places&quot;.</li>
              </ol>
            </div>

            <div className="bg-slate-900 p-3 rounded-lg border border-slate-800">
              <h4 className="font-semibold text-white mb-1.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" /> Google Earth Web (earth.google.com)
              </h4>
              <ol className="list-decimal list-inside space-y-1 text-slate-400 text-[11px]">
                <li>Open <strong>earth.google.com</strong> in your browser.</li>
                <li>Click on <strong>Projects</strong> (sidebar bookmark icon).</li>
                <li>Click <strong>New Project &gt; Import KML file from computer</strong>.</li>
                <li>Upload your <code className="text-cyan-300">.kmz</code> file.</li>
                <li>Note: Google Earth Web limits projects to ~20,000 features for smooth rendering.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Results Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="bg-slate-950/80 text-slate-400 uppercase text-[11px] tracking-wider border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-3">State / UT</th>
              <th className="py-2.5 px-3">ISO Code</th>
              <th className="py-2.5 px-3 text-right">Raw Ways</th>
              <th className="py-2.5 px-3 text-right">Merged Roads</th>
              <th className="py-2.5 px-3 text-right">Total Vertices</th>
              <th className="py-2.5 px-3 text-right">Total Length</th>
              <th className="py-2.5 px-3 text-center">GE Limit Health</th>
              <th className="py-2.5 px-3 text-center">Server</th>
              <th className="py-2.5 px-3 text-right">Export</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {completedItems.map((item) => {
              const limits = evaluateLimits(item.roads, item.stateCode);
              let totalStateKm = 0;
              for (const r of item.roads) totalStateKm += r.lengthKm;

              return (
                <tr key={item.stateCode} className="hover:bg-slate-800/40 transition-colors">
                  {/* State Name */}
                  <td className="py-2.5 px-3 font-semibold text-slate-100">
                    {item.stateName}
                  </td>

                  {/* ISO Code */}
                  <td className="py-2.5 px-3">
                    <code className="font-mono text-emerald-300">{item.stateCode}</code>
                  </td>

                  {/* Raw Ways */}
                  <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                    {item.rawWaysCount}
                  </td>

                  {/* Merged Roads */}
                  <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-200">
                    {item.roads.length}
                  </td>

                  {/* Total Vertices */}
                  <td className="py-2.5 px-3 text-right font-mono text-slate-300">
                    {limits.vertexCount.toLocaleString()}
                  </td>

                  {/* Total Length */}
                  <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-400">
                    {totalStateKm.toFixed(1)} km
                  </td>

                  {/* Limit Health */}
                  <td className="py-2.5 px-3 text-center">
                    {!limits.exceedsFeatureLimit && !limits.exceedsVertexLimit ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                        <CheckCircle className="w-3 h-3" /> Safe (&lt;9k)
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30"
                        title={`Exceeds threshold. Split into ${limits.recommendedPartCount} parts for Google Earth Web`}
                      >
                        <AlertCircle className="w-3 h-3" /> {limits.recommendedPartCount} Parts Rec.
                      </span>
                    )}
                  </td>

                  {/* Server */}
                  <td className="py-2.5 px-3 text-center text-[10px] font-mono text-slate-400">
                    {item.serverUsed ? new URL(item.serverUsed).hostname : 'Cached'}
                  </td>

                  {/* Download Actions */}
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => downloadStateKmz(item)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-semibold transition-colors cursor-pointer"
                        title="Download Google Earth KMZ"
                      >
                        <Download className="w-3 h-3" />
                        <span>KMZ</span>
                      </button>

                      <button
                        onClick={() => downloadStateGeoJson(item)}
                        className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                        title="Download GeoJSON format"
                      >
                        <FileCode className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
