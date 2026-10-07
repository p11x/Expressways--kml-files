export type RoadCategory =
  | 'motorway'
  | 'expressway'
  | 'link'
  | 'construction'
  | 'proposed';

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface StateMeta {
  code: string; // e.g. "IN-MH"
  iso: string; // e.g. "IN-MH"
  name: string; // e.g. "Maharashtra"
  isUT: boolean;
  zone: 'North' | 'South' | 'East' | 'West' | 'Central' | 'Northeast' | 'Islands';
  altCodes?: string[]; // e.g. ['IN-TS'] for Telangana
  fallbackName?: string; // e.g. "Telangana"
  bbox: BoundingBox;
}

export interface OSMWayPoint {
  lat: number;
  lon: number;
}

export interface OSMWayElement {
  type: 'way';
  id: number;
  geometry?: OSMWayPoint[];
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  version?: number;
  generator?: string;
  elements?: OSMWayElement[];
  remark?: string;
}

export interface ProcessedRoadSegment {
  id: number;
  ref: string;
  name: string;
  category: RoadCategory;
  points: [number, number][]; // [lon, lat]
  tags: Record<string, string>;
  lengthKm: number;
  stateCode: string;
}

export interface StitchedRoad {
  id: string; // synthesized or primary osm id
  ref: string;
  name: string;
  category: RoadCategory;
  geometries: [number, number][][]; // array of linestrings [[lon, lat], ...]
  tags: Record<string, string>;
  originalWayIds: number[];
  lengthKm: number;
  vertexCount: number;
  stateCode: string;
}

export type StateProcessStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'retrying'
  | 'splitting'
  | 'done'
  | 'empty'
  | 'failed'
  | 'cached';

export interface StateQueueItem {
  stateCode: string;
  status: StateProcessStatus;
  statusMessage?: string;
  attempt?: number;
  maxAttempts?: number;
  currentServer?: string;
  tilesCount?: number;
  currentTile?: number;
  rawWaysCount: number;
  processedRoadsCount: number;
  vertexCount: number;
  totalLengthKm: number;
  isCached: boolean;
  cacheAgeMs?: number;
  serverUsed?: string;
  startTime?: number;
  endTime?: number;
  durationMs?: number;
  errorMessage?: string;
  errorClass?: 'AbortError' | 'TypeError' | 'HttpError' | 'ParseError';
  data?: StitchedRoad[];
  rawElements?: OSMWayElement[];
}

export interface ProcessingSettings {
  includePlanned: boolean;
  includeLinks: boolean;
  mergeSegments: boolean;
  mergeToleranceMeters: number;
  trimOverlaps: boolean;
  overlapDistanceMeters: number;
  overlapAngleDegrees: number;
  dedupeExactGeometries: boolean;
  simplificationToleranceMeters: number;
  requestTimeoutSeconds: number;
  politenessDelayMs: number;
  maxRetries: number;
  mainQueryTemplate: string;
  plannedQueryTemplate: string;
  servers: string[];
}

export interface LogEntry {
  id: string;
  timestamp: string;
  stateCode?: string;
  type: 'info' | 'success' | 'warn' | 'error' | 'polite';
  message: string;
  server?: string;
}

export interface LimitsReport {
  stateCode: string;
  featureCount: number;
  vertexCount: number;
  exceedsFeatureLimit: boolean;
  exceedsVertexLimit: boolean;
  recommendedPartCount: number;
  estimatedGeProjects: number;
}

export interface TestCaseResult {
  id: string;
  title: string;
  passed: boolean;
  durationMs: number;
  assertions: {
    name: string;
    passed: boolean;
    expected: string;
    actual: string;
  }[];
  logs: string[];
}

export interface ServerHealthInfo {
  url: string;
  consecutiveFailures: number;
  deprioritizedUntil: number; // timestamp in ms
  lastStatus?: 'healthy' | 'degraded' | 'down' | 'untested';
  lastLatencyMs?: number;
  lastTestedAt?: number;
  lastError?: string;
}

export interface ConnectivityTestResult {
  server: string;
  statusTest: {
    status: 'ok' | 'cors_blocked' | 'network_blocked' | 'http_error';
    httpStatus?: number;
    latencyMs: number;
    errorName?: string;
    errorMessage?: string;
  };
  queryTest: {
    status: 'ok' | 'cors_blocked' | 'network_blocked' | 'http_error';
    httpStatus?: number;
    latencyMs: number;
    errorName?: string;
    errorMessage?: string;
  };
}
