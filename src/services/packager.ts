import JSZip from 'jszip';
import { INDIAN_STATES } from '../data/indianStates';
import { StitchedRoad } from '../types';
import { generateGeoJson, generateKml } from './kmlBuilder';

export interface StateExportItem {
  stateCode: string;
  stateName: string;
  roads: StitchedRoad[];
  rawWaysCount: number;
  serverUsed?: string;
  durationMs?: number;
  status: string;
  date: string;
}

/**
 * Creates a .kmz file (ZIP containing doc.kml) as Blob
 */
export async function createKmzBlob(
  roads: StitchedRoad[],
  title: string,
  stateName?: string
): Promise<Blob> {
  const kmlContent = generateKml(roads, title, stateName);
  const zip = new JSZip();
  zip.file('doc.kml', kmlContent);
  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

/**
 * Creates a combined .kmz containing all completed states
 */
export async function createCombinedKmzBlob(
  items: StateExportItem[],
  title = 'India Motorways & Expressways (All States)'
): Promise<Blob> {
  // Combine all roads into a single multi-state KML or combined state folders
  const allRoads: StitchedRoad[] = [];
  const seenRoadIds = new Set<string>();

  for (const item of items) {
    for (const r of item.roads) {
      if (!seenRoadIds.has(r.id)) {
        seenRoadIds.add(r.id);
        allRoads.push(r);
      }
    }
  }

  const kmlContent = generateKml(allRoads, title, 'India');
  const zip = new JSZip();
  zip.file('doc.kml', kmlContent);
  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

/**
 * Creates a master ZIP containing individual state .kmz files and summary CSV
 */
export async function createAllStatesZipBlob(
  items: StateExportItem[]
): Promise<Blob> {
  const masterZip = new JSZip();

  // Add individual KMZ per state
  for (const item of items) {
    if (item.roads.length > 0) {
      const kmlContent = generateKml(
        item.roads,
        `${item.stateName} Roads`,
        item.stateName
      );
      const stateZip = new JSZip();
      stateZip.file('doc.kml', kmlContent);
      const kmzData = await stateZip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 },
      });

      const safeName = item.stateName.replace(/[^a-zA-Z0-9_-]/g, '_');
      masterZip.file(`${item.stateCode}_${safeName}_roads.kmz`, kmzData);
    }
  }

  // Add Summary CSV
  const csvContent = generateCsvSummary(items);
  masterZip.file('india_roads_export_summary.csv', csvContent);

  // Add README
  const readme = `# India Roads → KMZ Overpass Export
Downloaded on: ${new Date().toISOString()}
Total States Included: ${items.length}
Data Source: OpenStreetMap contributors (ODbL)

## How to use:
- In Google Earth Pro: File -> Open -> Select .kmz file
- In Google Earth Web: Projects -> New Project -> Import KML file from computer
- Google Earth works best under 10,000 features per file and ~20,000 features per project.
`;
  masterZip.file('README.txt', readme);

  return await masterZip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/**
 * Generates CSV Summary text
 */
export function generateCsvSummary(items: StateExportItem[]): string {
  const headers = [
    'State Code',
    'State Name',
    'Status',
    'Raw Ways Received',
    'Roads (Merged)',
    'Total Vertices',
    'Total Length (km)',
    'Motorways (km)',
    'Expressways (km)',
    'Links (km)',
    'Under Construction (km)',
    'Proposed (km)',
    'Server Used',
    'Duration (s)',
    'Export Date',
  ];

  const rows = items.map((item) => {
    let totalKm = 0;
    let totalVerts = 0;
    const catKm: Record<string, number> = {
      motorway: 0,
      expressway: 0,
      link: 0,
      construction: 0,
      proposed: 0,
    };

    for (const r of item.roads) {
      totalKm += r.lengthKm;
      totalVerts += r.vertexCount;
      if (catKm[r.category] !== undefined) {
        catKm[r.category] += r.lengthKm;
      }
    }

    return [
      `"${item.stateCode}"`,
      `"${item.stateName}"`,
      `"${item.status}"`,
      item.rawWaysCount,
      item.roads.length,
      totalVerts,
      totalKm.toFixed(2),
      catKm.motorway.toFixed(2),
      catKm.expressway.toFixed(2),
      catKm.link.toFixed(2),
      catKm.construction.toFixed(2),
      catKm.proposed.toFixed(2),
      `"${item.serverUsed || 'N/A'}"`,
      item.durationMs ? (item.durationMs / 1000).toFixed(1) : '0',
      `"${item.date}"`,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Utility to trigger browser file download
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 500);
}
