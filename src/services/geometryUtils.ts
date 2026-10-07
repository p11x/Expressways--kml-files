import { RoadCategory } from '../types';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EARTH_RADIUS_METERS = 6371000;

export const CATEGORY_PRIORITY: Record<RoadCategory, number> = {
  motorway: 1,
  expressway: 2,
  link: 3,
  construction: 4,
  proposed: 5,
};

/**
 * Calculates distance in meters between two [lon, lat] points using spherical haversine formula
 */
export function haversineDistance(
  coord1: [number, number],
  coord2: [number, number]
): number {
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;

  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * DEG_TO_RAD) *
      Math.cos(lat2 * DEG_TO_RAD) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Fast Euclidean distance in meters for local snapping (valid within small distances)
 */
export function fastDistanceMeters(
  coord1: [number, number],
  coord2: [number, number]
): number {
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;
  const midLatRad = ((lat1 + lat2) / 2) * DEG_TO_RAD;
  const dx = (lon2 - lon1) * Math.cos(midLatRad) * 111319.5;
  const dy = (lat2 - lat1) * 111132.0;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates initial bearing in degrees [0, 360) from coord1 to coord2
 */
export function calculateBearing(
  coord1: [number, number],
  coord2: [number, number]
): number {
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;

  const φ1 = lat1 * DEG_TO_RAD;
  const φ2 = lat2 * DEG_TO_RAD;
  const Δλ = (lon2 - lon1) * DEG_TO_RAD;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (θ * RAD_TO_DEG + 360) % 360;
}

/**
 * Absolute angular difference between two bearings in [0, 180] degrees (ignoring 180° direction inversion if opposite direction)
 */
export function bearingDifference(b1: number, b2: number, allowOpposite = true): number {
  let diff = Math.abs(b1 - b2) % 360;
  if (diff > 180) diff = 360 - diff;
  if (allowOpposite) {
    let oppDiff = Math.abs(diff - 180);
    return Math.min(diff, oppDiff);
  }
  return diff;
}

/**
 * Computes total length of a linestring in kilometers
 */
export function lineLengthKm(coords: [number, number][]): number {
  if (coords.length < 2) return 0;
  let totalMeters = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    totalMeters += fastDistanceMeters(coords[i], coords[i + 1]);
  }
  return totalMeters / 1000;
}

/**
 * Perpendicular distance in meters from point P to line segment AB
 */
export function perpendicularDistanceMeters(
  point: [number, number],
  lineStart: [number, number],
  lineEnd: [number, number]
): number {
  const [px, py] = [point[0], point[1]];
  const [x1, y1] = [lineStart[0], lineStart[1]];
  const [x2, y2] = [lineEnd[0], lineEnd[1]];

  const midLatRad = (py * DEG_TO_RAD);
  const kx = Math.cos(midLatRad) * 111319.5;
  const ky = 111132.0;

  const P_x = px * kx;
  const P_y = py * ky;
  const A_x = x1 * kx;
  const A_y = y1 * ky;
  const B_x = x2 * kx;
  const B_y = y2 * ky;

  const dx = B_x - A_x;
  const dy = B_y - A_y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return Math.hypot(P_x - A_x, P_y - A_y);
  }

  // Projection scalar
  const t = Math.max(0, Math.min(1, ((P_x - A_x) * dx + (P_y - A_y) * dy) / lenSq));
  const projX = A_x + t * dx;
  const projY = A_y + t * dy;

  return Math.hypot(P_x - projX, P_y - projY);
}

/**
 * Douglas-Peucker line simplification in meters
 */
export function simplifyDouglasPeucker(
  points: [number, number][],
  toleranceMeters: number
): [number, number][] {
  if (points.length <= 2 || toleranceMeters <= 0) return points;

  let maxDistance = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = perpendicularDistanceMeters(points[i], points[0], points[end]);
    if (d > maxDistance) {
      maxDistance = d;
      index = i;
    }
  }

  if (maxDistance > toleranceMeters) {
    const left = simplifyDouglasPeucker(points.slice(0, index + 1), toleranceMeters);
    const right = simplifyDouglasPeucker(points.slice(index), toleranceMeters);
    return left.slice(0, -1).concat(right);
  } else {
    return [points[0], points[end]];
  }
}

/**
 * Generates coordinate key rounded to 6 decimals
 */
export function getCoordKey(coord: [number, number]): string {
  return `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`;
}

/**
 * Exact duplicate geometry hash (forward and reverse invariant)
 */
export function getGeometrySignature(coords: [number, number][]): string {
  if (coords.length === 0) return '';
  const forward = coords.map((c) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`).join(';');
  const backward = [...coords].reverse().map((c) => `${c[0].toFixed(6)},${c[1].toFixed(6)}`).join(';');
  return forward < backward ? forward : backward;
}

/**
 * Stitches end-to-end ways together when their endpoints are within snapping tolerance
 */
export function stitchLineStrings(
  lines: [number, number][][],
  toleranceMeters = 3
): [number, number][][] {
  if (lines.length <= 1) return lines;

  // Clone lines array
  const remaining = lines.map((l) => [...l]);
  const result: [number, number][][] = [];

  while (remaining.length > 0) {
    let current = remaining.shift()!;
    let extended = true;

    while (extended) {
      extended = false;
      const head = current[0];
      const tail = current[current.length - 1];

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];
        const cHead = candidate[0];
        const cTail = candidate[candidate.length - 1];

        // Tail -> Candidate Head (Direct append)
        if (fastDistanceMeters(tail, cHead) <= toleranceMeters) {
          current = current.concat(candidate.slice(1));
          remaining.splice(i, 1);
          extended = true;
          break;
        }

        // Tail -> Candidate Tail (Candidate reversed append)
        if (fastDistanceMeters(tail, cTail) <= toleranceMeters) {
          current = current.concat([...candidate].reverse().slice(1));
          remaining.splice(i, 1);
          extended = true;
          break;
        }

        // Head -> Candidate Tail (Candidate prepended)
        if (fastDistanceMeters(head, cTail) <= toleranceMeters) {
          current = candidate.slice(0, -1).concat(current);
          remaining.splice(i, 1);
          extended = true;
          break;
        }

        // Head -> Candidate Head (Candidate reversed prepend)
        if (fastDistanceMeters(head, cHead) <= toleranceMeters) {
          current = [...candidate].reverse().slice(0, -1).concat(current);
          remaining.splice(i, 1);
          extended = true;
          break;
        }
      }
    }

    result.push(current);
  }

  return result;
}

/**
 * Checks if line segment AB roughly overlaps with CD within distance & angle tolerance
 */
export function isSegmentOverlapping(
  p1: [number, number],
  p2: [number, number],
  q1: [number, number],
  q2: [number, number],
  maxDistMeters: number,
  maxAngleDegrees: number
): boolean {
  const midP: [number, number] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const dist = perpendicularDistanceMeters(midP, q1, q2);
  if (dist > maxDistMeters) return false;

  const bearingP = calculateBearing(p1, p2);
  const bearingQ = calculateBearing(q1, q2);
  const angleDiff = bearingDifference(bearingP, bearingQ, true);

  return angleDiff <= maxAngleDegrees;
}
