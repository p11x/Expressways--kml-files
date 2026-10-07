import { BoundingBox, OSMWayElement } from '../types';

/**
 * Splits a bounding box into a grid of nxn sub-boxes (e.g. 2x2 = 4, 3x3 = 9)
 */
export function splitBoundingBox(bbox: BoundingBox, gridSize: number): BoundingBox[] {
  const { south, west, north, east } = bbox;
  const latStep = (north - south) / gridSize;
  const lonStep = (east - west) / gridSize;

  const tiles: BoundingBox[] = [];

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const tileSouth = south + r * latStep;
      const tileNorth = r === gridSize - 1 ? north : south + (r + 1) * latStep;
      const tileWest = west + c * lonStep;
      const tileEast = c === gridSize - 1 ? east : west + (c + 1) * lonStep;

      tiles.push({
        south: Number(tileSouth.toFixed(4)),
        west: Number(tileWest.toFixed(4)),
        north: Number(tileNorth.toFixed(4)),
        east: Number(tileEast.toFixed(4)),
      });
    }
  }

  return tiles;
}

/**
 * Merges raw OSMWayElements from multiple tiles, deduplicating strictly by way id
 */
export function mergeWayElements(elementsArrays: OSMWayElement[][]): OSMWayElement[] {
  const seenIds = new Set<number>();
  const merged: OSMWayElement[] = [];

  for (const arr of elementsArrays) {
    for (const el of arr) {
      if (!seenIds.has(el.id)) {
        seenIds.add(el.id);
        merged.push(el);
      }
    }
  }

  return merged;
}
