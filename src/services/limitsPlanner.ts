import { LimitsReport, StitchedRoad } from '../types';

export const GOOGLE_EARTH_MAX_FEATURES_PER_FILE = 9000; // Safe threshold under 10k
export const GOOGLE_EARTH_MAX_VERTICES_PER_FILE = 240000; // Safe threshold under 250k
export const GOOGLE_EARTH_MAX_FEATURES_PER_PROJECT = 20000;

/**
 * Evaluates roads against Google Earth limits and provides splitting recommendations
 */
export function evaluateLimits(
  roads: StitchedRoad[],
  stateCode: string
): LimitsReport {
  let featureCount = roads.length;
  let vertexCount = 0;

  for (const r of roads) {
    vertexCount += r.vertexCount;
  }

  const exceedsFeatureLimit = featureCount > GOOGLE_EARTH_MAX_FEATURES_PER_FILE;
  const exceedsVertexLimit = vertexCount > GOOGLE_EARTH_MAX_VERTICES_PER_FILE;

  const partCountByFeatures = Math.ceil(
    featureCount / GOOGLE_EARTH_MAX_FEATURES_PER_FILE
  );
  const partCountByVertices = Math.ceil(
    vertexCount / GOOGLE_EARTH_MAX_VERTICES_PER_FILE
  );
  const recommendedPartCount = Math.max(
    1,
    partCountByFeatures,
    partCountByVertices
  );

  const estimatedGeProjects = Math.max(
    1,
    Math.ceil(featureCount / GOOGLE_EARTH_MAX_FEATURES_PER_PROJECT)
  );

  return {
    stateCode,
    featureCount,
    vertexCount,
    exceedsFeatureLimit,
    exceedsVertexLimit,
    recommendedPartCount,
    estimatedGeProjects,
  };
}

/**
 * Splits road list into chunks satisfying Google Earth limits
 */
export function chunkRoadsForLimits(
  roads: StitchedRoad[],
  maxFeatures = GOOGLE_EARTH_MAX_FEATURES_PER_FILE,
  maxVertices = GOOGLE_EARTH_MAX_VERTICES_PER_FILE
): StitchedRoad[][] {
  const chunks: StitchedRoad[][] = [];
  let currentChunk: StitchedRoad[] = [];
  let currentFeatures = 0;
  let currentVertices = 0;

  for (const road of roads) {
    if (
      currentFeatures + 1 > maxFeatures ||
      currentVertices + road.vertexCount > maxVertices
    ) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentFeatures = 0;
        currentVertices = 0;
      }
    }

    currentChunk.push(road);
    currentFeatures++;
    currentVertices += road.vertexCount;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks.length > 0 ? chunks : [[]];
}
