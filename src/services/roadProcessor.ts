import {
  OSMWayElement,
  ProcessedRoadSegment,
  ProcessingSettings,
  RoadCategory,
  StitchedRoad,
} from '../types';
import {
  CATEGORY_PRIORITY,
  fastDistanceMeters,
  getGeometrySignature,
  isSegmentOverlapping,
  lineLengthKm,
  simplifyDouglasPeucker,
  stitchLineStrings,
} from './geometryUtils';

export interface ProcessResult {
  stitchedRoads: StitchedRoad[];
  rawCount: number;
  validCount: number;
  stitchedCount: number;
  totalVertices: number;
  totalLengthKm: number;
  removedDuplicatesCount: number;
  removedOverlapsCount: number;
  removedOverlapsGeometries: [number, number][][];
}

/**
 * Classifies an OSM way element based on its tags
 */
export function classifyWay(tags?: Record<string, string>): RoadCategory | null {
  if (!tags) return null;

  const highway = tags.highway;
  const expressway = tags.expressway;
  const construction = tags.construction;
  const proposed = tags.proposed;

  if (highway === 'motorway') return 'motorway';
  if (highway === 'motorway_link') return 'link';
  if (highway === 'trunk' && (expressway === 'yes' || tags.motorroad === 'yes')) {
    return 'expressway';
  }
  if (highway === 'expressway') return 'expressway';

  if (highway === 'construction') {
    if (construction === 'motorway') return 'construction';
    if (construction === 'trunk' && expressway === 'yes') return 'construction';
    return 'construction';
  }

  if (highway === 'proposed') {
    if (proposed === 'motorway') return 'proposed';
    if (proposed === 'trunk' && expressway === 'yes') return 'proposed';
    return 'proposed';
  }

  return null;
}

/**
 * Filters, validates and processes raw OSM way elements into structured roads
 */
export function processOsmWays(
  elements: OSMWayElement[],
  stateCode: string,
  settings: ProcessingSettings
): ProcessResult {
  const rawCount = elements.length;
  let removedDuplicatesCount = 0;
  let removedOverlapsCount = 0;
  const removedOverlapsGeometries: [number, number][][] = [];

  // 1. Keep ways with geometry >= 2 points; drop invalid/NaN coordinates
  const validSegments: ProcessedRoadSegment[] = [];
  const seenWayIds = new Set<number>();
  const seenGeometries = new Set<string>();

  for (const el of elements) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;

    // Dedupe by way ID
    if (seenWayIds.has(el.id)) continue;
    seenWayIds.add(el.id);

    const category = classifyWay(el.tags);
    if (!category) continue;

    // Category filters
    if (!settings.includeLinks && category === 'link') continue;
    if (
      !settings.includePlanned &&
      (category === 'construction' || category === 'proposed')
    ) {
      continue;
    }

    // Clean coordinates: [lon, lat], filter out NaN
    const points: [number, number][] = [];
    for (const pt of el.geometry) {
      if (
        typeof pt.lon === 'number' &&
        typeof pt.lat === 'number' &&
        !isNaN(pt.lon) &&
        !isNaN(pt.lat) &&
        pt.lat >= -90 &&
        pt.lat <= 90 &&
        pt.lon >= -180 &&
        pt.lon <= 180
      ) {
        points.push([pt.lon, pt.lat]);
      }
    }

    if (points.length < 2) continue;

    // Exact duplicate geometry removal if enabled
    if (settings.dedupeExactGeometries) {
      const sig = getGeometrySignature(points);
      if (seenGeometries.has(sig)) {
        removedDuplicatesCount++;
        continue;
      }
      seenGeometries.add(sig);
    }

    const tags = el.tags || {};
    const ref = tags.ref || '';
    const name = tags.name || tags['name:en'] || '';
    const lengthKm = lineLengthKm(points);

    validSegments.push({
      id: el.id,
      ref,
      name,
      category,
      points,
      tags,
      lengthKm,
      stateCode,
    });
  }

  // 2. Trim overlapping lines if enabled
  let filteredSegments = validSegments;
  if (settings.trimOverlaps && validSegments.length > 1) {
    const keepFlags = new Array(validSegments.length).fill(true);

    // Group segments spatially / check pairwise
    for (let i = 0; i < validSegments.length; i++) {
      if (!keepFlags[i]) continue;
      const segA = validSegments[i];

      for (let j = i + 1; j < validSegments.length; j++) {
        if (!keepFlags[j]) continue;
        const segB = validSegments[j];

        if (segA.category === segB.category) continue;

        const priorityA = CATEGORY_PRIORITY[segA.category];
        const priorityB = CATEGORY_PRIORITY[segB.category];

        // Check if endpoints or midpoints are very close
        const distStart = fastDistanceMeters(segA.points[0], segB.points[0]);
        const distEnd = fastDistanceMeters(
          segA.points[segA.points.length - 1],
          segB.points[segB.points.length - 1]
        );

        if (distStart <= 50 || distEnd <= 50) {
          // Check overlap
          const overlaps = isSegmentOverlapping(
            segA.points[0],
            segA.points[segA.points.length - 1],
            segB.points[0],
            segB.points[segB.points.length - 1],
            settings.overlapDistanceMeters,
            settings.overlapAngleDegrees
          );

          if (overlaps) {
            if (priorityA < priorityB) {
              // segA has higher priority (lower number), drop segB
              keepFlags[j] = false;
              removedOverlapsCount++;
              removedOverlapsGeometries.push(segB.points);
            } else if (priorityB < priorityA) {
              // segB has higher priority, drop segA
              keepFlags[i] = false;
              removedOverlapsCount++;
              removedOverlapsGeometries.push(segA.points);
              break;
            }
          }
        }
      }
    }

    filteredSegments = validSegments.filter((_, idx) => keepFlags[idx]);
  }

  // 3. Merge segments into whole roads
  const stitchedRoads: StitchedRoad[] = [];

  if (settings.mergeSegments) {
    // Group by category and (ref || name || 'unnamed_way_id')
    const groups = new Map<string, ProcessedRoadSegment[]>();

    for (const seg of filteredSegments) {
      const roadKey = `${seg.category}__${seg.ref || seg.name || `way_${seg.id}`}`;
      if (!groups.has(roadKey)) {
        groups.set(roadKey, []);
      }
      groups.get(roadKey)!.push(seg);
    }

    for (const [groupKey, segments] of groups.entries()) {
      const first = segments[0];
      const category = first.category;
      const ref = first.ref;
      const name = first.name;

      // Merge tags (combining non-empty tags)
      const mergedTags: Record<string, string> = {};
      const wayIds: number[] = [];

      for (const seg of segments) {
        wayIds.push(seg.id);
        Object.assign(mergedTags, seg.tags);
      }

      const rawLines = segments.map((s) => s.points);
      const stitchedLines = stitchLineStrings(
        rawLines,
        settings.mergeToleranceMeters
      );

      // Simplify coordinates if tolerance > 0
      const finalLines =
        settings.simplificationToleranceMeters > 0
          ? stitchedLines.map((line) =>
              simplifyDouglasPeucker(
                line,
                settings.simplificationToleranceMeters
              )
            )
          : stitchedLines;

      let roadLength = 0;
      let vertexCount = 0;
      for (const line of finalLines) {
        roadLength += lineLengthKm(line);
        vertexCount += line.length;
      }

      stitchedRoads.push({
        id: `road_${groupKey}_${wayIds[0]}`,
        ref,
        name,
        category,
        geometries: finalLines,
        tags: mergedTags,
        originalWayIds: wayIds,
        lengthKm: roadLength,
        vertexCount,
        stateCode,
      });
    }
  } else {
    // No merging: each way is a separate stitched road with 1 geometry
    for (const seg of filteredSegments) {
      const simplified =
        settings.simplificationToleranceMeters > 0
          ? simplifyDouglasPeucker(
              seg.points,
              settings.simplificationToleranceMeters
            )
          : seg.points;

      stitchedRoads.push({
        id: `way_${seg.id}`,
        ref: seg.ref,
        name: seg.name,
        category: seg.category,
        geometries: [simplified],
        tags: seg.tags,
        originalWayIds: [seg.id],
        lengthKm: seg.lengthKm,
        vertexCount: simplified.length,
        stateCode,
      });
    }
  }

  // Calculate totals
  let totalVertices = 0;
  let totalLengthKm = 0;
  for (const r of stitchedRoads) {
    totalVertices += r.vertexCount;
    totalLengthKm += r.lengthKm;
  }

  return {
    stitchedRoads,
    rawCount,
    validCount: filteredSegments.length,
    stitchedCount: stitchedRoads.length,
    totalVertices,
    totalLengthKm,
    removedDuplicatesCount,
    removedOverlapsCount,
    removedOverlapsGeometries,
  };
}
