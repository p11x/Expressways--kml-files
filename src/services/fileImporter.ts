import { OSMWayElement, OSMWayPoint } from '../types';

export interface ImportParseResult {
  stateCode?: string;
  elements: OSMWayElement[];
  sourceFormat: 'overpass_json' | 'geojson' | 'kml';
  message: string;
}

/**
 * Parses uploaded raw Overpass JSON, Overpass Turbo GeoJSON, or KML
 */
export async function parseImportedRoadFile(
  fileText: string,
  filename: string
): Promise<ImportParseResult> {
  const trimmed = fileText.trim();

  // 1. Try parsing as JSON (Overpass JSON or GeoJSON)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(trimmed);

      // Check if it's Overpass JSON (has elements array)
      if (json && Array.isArray(json.elements)) {
        const wayElements: OSMWayElement[] = json.elements.filter(
          (el: any) => el.type === 'way' && Array.isArray(el.geometry) && el.geometry.length >= 2
        );

        return {
          elements: wayElements,
          sourceFormat: 'overpass_json',
          message: `Parsed ${wayElements.length} OSM ways from Overpass JSON`,
        };
      }

      // Check if it's GeoJSON FeatureCollection
      if (json && (json.type === 'FeatureCollection' || Array.isArray(json.features))) {
        const features = json.features || [];
        const elements: OSMWayElement[] = [];

        let syntheticId = 1000000;
        for (const feat of features) {
          const geom = feat.geometry;
          if (!geom) continue;

          const tags = feat.properties || {};
          const wayId = typeof feat.id === 'number' ? feat.id : tags.osm_id || tags['@id'] || syntheticId++;

          if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
            const points: OSMWayPoint[] = geom.coordinates.map((c: any) => ({
              lon: Number(c[0]),
              lat: Number(c[1]),
            }));

            if (points.length >= 2) {
              elements.push({
                type: 'way',
                id: Number(wayId),
                geometry: points,
                tags,
              });
            }
          } else if (geom.type === 'MultiLineString' && Array.isArray(geom.coordinates)) {
            for (const line of geom.coordinates) {
              const points: OSMWayPoint[] = line.map((c: any) => ({
                lon: Number(c[0]),
                lat: Number(c[1]),
              }));
              if (points.length >= 2) {
                elements.push({
                  type: 'way',
                  id: Number(syntheticId++),
                  geometry: points,
                  tags,
                });
              }
            }
          }
        }

        return {
          elements,
          sourceFormat: 'geojson',
          message: `Parsed ${elements.length} road features from GeoJSON`,
        };
      }
    } catch {
      // Continue to KML parser
    }
  }

  // 2. Try parsing as KML (XML)
  if (trimmed.includes('<kml') || trimmed.includes('<Document>') || trimmed.includes('<Placemark>')) {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(trimmed, 'application/xml');
      const placemarks = xmlDoc.querySelectorAll('Placemark');
      const elements: OSMWayElement[] = [];
      let syntheticId = 2000000;

      placemarks.forEach((pm) => {
        const name = pm.querySelector('name')?.textContent || '';
        const tags: Record<string, string> = { name };

        // Parse ExtendedData if present
        const dataNodes = pm.querySelectorAll('ExtendedData > Data, ExtendedData > SimpleData');
        dataNodes.forEach((dn) => {
          const key = dn.getAttribute('name');
          const val = dn.querySelector('value')?.textContent || dn.textContent || '';
          if (key && val) tags[key] = val;
        });

        // Parse LineString coordinates
        const coordNodes = pm.querySelectorAll('LineString > coordinates');
        coordNodes.forEach((cn) => {
          const coordText = cn.textContent || '';
          const tuples = coordText.trim().split(/\s+/);
          const points: OSMWayPoint[] = [];

          for (const tup of tuples) {
            const parts = tup.split(',');
            if (parts.length >= 2) {
              const lon = parseFloat(parts[0]);
              const lat = parseFloat(parts[1]);
              if (!isNaN(lon) && !isNaN(lat)) {
                points.push({ lon, lat });
              }
            }
          }

          if (points.length >= 2) {
            elements.push({
              type: 'way',
              id: tags.osm_id ? parseInt(tags.osm_id, 10) : syntheticId++,
              geometry: points,
              tags: {
                highway: tags.category || tags.highway || 'motorway',
                ...tags,
              },
            });
          }
        });
      });

      if (elements.length > 0) {
        return {
          elements,
          sourceFormat: 'kml',
          message: `Parsed ${elements.length} road segments from KML file`,
        };
      }
    } catch (err: any) {
      throw new Error(`Failed to parse KML: ${err.message}`);
    }
  }

  throw new Error('Unsupported file format. Please upload a valid Overpass JSON, GeoJSON, or KML file.');
}
