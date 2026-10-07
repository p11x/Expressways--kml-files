import { BoundingBox } from '../types';

export const DEFAULT_MAIN_QUERY_TEMPLATE = `[out:json][timeout:120];
area["ISO3166-2"="{{ISO}}"]->.a;
(
  way["highway"~"^(motorway{{LINK_REGEX}})$"](area.a);
  way["highway"="trunk"]["expressway"="yes"](area.a);
);
out geom;`;

export const DEFAULT_PLANNED_QUERY_TEMPLATE = `[out:json][timeout:120];
area["ISO3166-2"="{{ISO}}"]->.a;
(
  way["highway"="construction"]["construction"="motorway"](area.a);
  way["highway"="construction"]["construction"="trunk"]["expressway"="yes"](area.a);
  way["highway"="proposed"]["proposed"="motorway"](area.a);
  way["highway"="proposed"]["proposed"="trunk"]["expressway"="yes"](area.a);
);
out geom;`;

export const DEFAULT_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export interface QueryBuildOptions {
  iso: string;
  fallbackName?: string;
  useFallbackName?: boolean;
  bbox?: BoundingBox;
  includeLinks?: boolean;
  customTemplate?: string;
  queryType: 'main' | 'planned';
}

/**
 * Generates an Overpass QL query string with area ISO or fallback name and optional bounding box
 */
export function buildOverpassQuery(options: QueryBuildOptions): string {
  const {
    iso,
    fallbackName,
    useFallbackName,
    bbox,
    includeLinks = true,
    customTemplate,
    queryType,
  } = options;

  let template =
    customTemplate ||
    (queryType === 'main'
      ? DEFAULT_MAIN_QUERY_TEMPLATE
      : DEFAULT_PLANNED_QUERY_TEMPLATE);

  const linkRegex = includeLinks ? '|motorway_link' : '';
  template = template.replace(/\{\{LINK_REGEX\}\}/g, linkRegex);

  // If using fallback name query or standard ISO
  let areaClause = `area["ISO3166-2"="${iso}"]->.a;`;
  if (useFallbackName && fallbackName) {
    areaClause = `area["name:en"="${fallbackName}"]["boundary"="administrative"]["admin_level"="4"]->.a;`;
  }

  // Replace area definition
  template = template.replace(/area\["ISO3166-2"="\{\{ISO\}\}"\]->\.a;/g, areaClause);
  template = template.replace(/\{\{ISO\}\}/g, iso);

  // If bounding box filter is active (tile splitting)
  if (bbox) {
    const bboxStr = `(${bbox.south.toFixed(4)},${bbox.west.toFixed(4)},${bbox.north.toFixed(4)},${bbox.east.toFixed(4)})`;
    // Inject bbox constraint into each way query
    template = template.replace(/\(area\.a\);/g, `(area.a)${bboxStr};`);
  }

  return template.trim();
}

/**
 * Computes a lightweight fast hash for caching
 */
export function computeQueryHash(queryStr: string): string {
  let hash = 0;
  for (let i = 0; i < queryStr.length; i++) {
    const char = queryStr.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
