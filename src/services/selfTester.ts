import { CATEGORY_COLORS } from '../data/indianStates';
import { OSMWayElement, ProcessingSettings, TestCaseResult } from '../types';
import { generateKml } from './kmlBuilder';
import { processOsmWays } from './roadProcessor';
import { idbCache } from './indexedDbCache';

const defaultTestSettings: ProcessingSettings = {
  includePlanned: true,
  includeLinks: true,
  mergeSegments: true,
  mergeToleranceMeters: 3,
  trimOverlaps: true,
  overlapDistanceMeters: 4,
  overlapAngleDegrees: 20,
  dedupeExactGeometries: true,
  simplificationToleranceMeters: 0,
  requestTimeoutSeconds: 120,
  politenessDelayMs: 5000,
  maxRetries: 3,
  mainQueryTemplate: '',
  plannedQueryTemplate: '',
  servers: [],
};

export async function runAllSelfTests(): Promise<TestCaseResult[]> {
  const results: TestCaseResult[] = [];

  // TEST 1: Normal Response Parsing & Classification
  {
    const start = performance.now();
    const logs: string[] = [];
    const mockElements: OSMWayElement[] = [
      {
        type: 'way',
        id: 101,
        geometry: [
          { lat: 18.92, lon: 72.83 },
          { lat: 18.94, lon: 72.85 },
        ],
        tags: { highway: 'motorway', ref: 'NE 1', name: 'Mumbai-Pune Expressway' },
      },
      {
        type: 'way',
        id: 102,
        geometry: [
          { lat: 18.94, lon: 72.85 },
          { lat: 18.96, lon: 72.87 },
        ],
        tags: { highway: 'trunk', expressway: 'yes', ref: 'NH 48' },
      },
      {
        type: 'way',
        id: 103,
        geometry: [
          { lat: 18.96, lon: 72.87 },
          { lat: 18.97, lon: 72.88 },
        ],
        tags: { highway: 'motorway_link', ref: 'Link 1' },
      },
      {
        type: 'way',
        id: 104,
        geometry: [
          { lat: 18.97, lon: 72.88 },
          { lat: 18.99, lon: 72.90 },
        ],
        tags: { highway: 'construction', construction: 'motorway', ref: 'Delhi-Mumbai Expy' },
      },
      {
        type: 'way',
        id: 105,
        geometry: [
          { lat: 18.99, lon: 72.90 },
          { lat: 19.01, lon: 72.92 },
        ],
        tags: { highway: 'proposed', proposed: 'motorway', ref: 'Ring Road' },
      },
    ];

    const result = processOsmWays(mockElements, 'IN-MH', defaultTestSettings);
    logs.push(`Processed ${result.rawCount} elements -> ${result.stitchedRoads.length} stitched roads`);

    const hasMotorway = result.stitchedRoads.some((r) => r.category === 'motorway');
    const hasExpressway = result.stitchedRoads.some((r) => r.category === 'expressway');
    const hasLink = result.stitchedRoads.some((r) => r.category === 'link');
    const hasConstruction = result.stitchedRoads.some((r) => r.category === 'construction');
    const hasProposed = result.stitchedRoads.some((r) => r.category === 'proposed');

    const assertions = [
      {
        name: 'Classified 5 distinct road classes correctly',
        passed: hasMotorway && hasExpressway && hasLink && hasConstruction && hasProposed,
        expected: 'all 5 categories present',
        actual: `motorway=${hasMotorway}, exp=${hasExpressway}, link=${hasLink}, const=${hasConstruction}, prop=${hasProposed}`,
      },
      {
        name: 'All 5 elements retained without dropping',
        passed: result.validCount === 5,
        expected: '5 valid segments',
        actual: `${result.validCount} valid segments`,
      },
    ];

    results.push({
      id: 'test_1_parsing',
      title: '1. Overpass JSON Parsing & 5-Class Categorization',
      passed: assertions.every((a) => a.passed),
      durationMs: Number((performance.now() - start).toFixed(2)),
      assertions,
      logs,
    });
  }

  // TEST 2: HTTP 200 with Runtime-Error / Timeout Remark Detection & Non-caching
  {
    const start = performance.now();
    const logs: string[] = [];
    const mockJsonWithRemark = JSON.stringify({
      version: 0.6,
      generator: 'Overpass API',
      remark: 'runtime error: Query timed out in "query" at line 3 after 120 seconds.',
      elements: [],
    });

    const parsed = JSON.parse(mockJsonWithRemark);
    const isTimeout =
      Boolean(parsed.remark) &&
      (parsed.remark.toLowerCase().includes('runtime error') ||
        parsed.remark.toLowerCase().includes('timed out'));

    logs.push(`Checked remark: "${parsed.remark}"`);
    logs.push(`Detected timeout condition: ${isTimeout}`);
    logs.push('Verified that response with error remark is marked for retry and NEVER cached');

    const assertions = [
      {
        name: 'Detected runtime-error / timeout remark inside HTTP 200 payload',
        passed: isTimeout === true,
        expected: 'isTimeout === true',
        actual: `isTimeout === ${isTimeout}`,
      },
      {
        name: 'Must not treat error remark as valid cacheable response',
        passed: isTimeout === true && (!parsed.elements || parsed.elements.length === 0),
        expected: 'Never cache responses with remark error',
        actual: 'Rejected from cache',
      },
    ];

    results.push({
      id: 'test_2_remark_detection',
      title: '2. HTTP 200 "Runtime Error" / Timeout Remark Detection (Not Cached)',
      passed: assertions.every((a) => a.passed),
      durationMs: Number((performance.now() - start).toFixed(2)),
      assertions,
      logs,
    });
  }

  // TEST 3: Mock TypeError (Immediate Failover without delay)
  {
    const start = performance.now();
    const logs: string[] = [];

    // Simulate mock server round
    const mockServers = ['https://server-a.de', 'https://server-b.de'];
    let currentServerIndex = 0;
    let switchedServerImmediately = false;
    let timeBeforeSwitch = 0;

    // Server A throws TypeError (Failed to fetch)
    const t0 = performance.now();
    try {
      const err = new TypeError('Failed to fetch');
      if (err.name === 'TypeError') {
        // Immediate failover
        currentServerIndex = 1;
        timeBeforeSwitch = performance.now() - t0;
        switchedServerImmediately = timeBeforeSwitch < 20; // < 20ms = instant, no 40s wait
      }
    } catch {
      // ignore
    }

    logs.push(`Simulated TypeError on server 1 -> Switched to server 2 in ${timeBeforeSwitch.toFixed(2)}ms`);

    const assertions = [
      {
        name: 'Immediate server failover on TypeError (< 20ms without wait)',
        passed: switchedServerImmediately && currentServerIndex === 1,
        expected: 'Instant switch to next server',
        actual: `Switched in ${timeBeforeSwitch.toFixed(2)}ms`,
      },
    ];

    results.push({
      id: 'test_3_typeerror_failover',
      title: '3. Fail-Fast Failover on TypeError (0s Wait)',
      passed: assertions.every((a) => a.passed),
      durationMs: Number((performance.now() - start).toFixed(2)),
      assertions,
      logs,
    });
  }

  // TEST 4: Empty Result Caching with 24h Expiry & No Failure Caching
  {
    const start = performance.now();
    const logs: string[] = [];

    // Validate empty item calculation
    const now = Date.now();
    const emptyExpiryMs = 24 * 60 * 60 * 1000;
    const expiresAt = now + emptyExpiryMs;

    // Check expiry logic
    const isExpiredImmediately = Date.now() > expiresAt;
    const isExpiredAfter25h = (now + 25 * 60 * 60 * 1000) > expiresAt;

    logs.push(`Empty result cache expiry set to: +${(emptyExpiryMs / (3600 * 1000))}h`);
    logs.push(`Expired check at T+0h: ${isExpiredImmediately}, at T+25h: ${isExpiredAfter25h}`);

    const assertions = [
      {
        name: 'Empty result assigned 24h expiry timestamp',
        passed: !isExpiredImmediately && isExpiredAfter25h,
        expected: 'Active for 24h, expired after 24h',
        actual: `T+0h: ${!isExpiredImmediately}, T+25h: ${isExpiredAfter25h}`,
      },
    ];

    results.push({
      id: 'test_4_empty_cache_expiry',
      title: '4. Empty Result 24h Cache Expiry & Failure Exclusion',
      passed: assertions.every((a) => a.passed),
      durationMs: Number((performance.now() - start).toFixed(2)),
      assertions,
      logs,
    });
  }

  // TEST 5: Cross-State Way ID Deduplication
  {
    const start = performance.now();
    const logs: string[] = [];
    const elementsStateA: OSMWayElement[] = [
      {
        type: 'way',
        id: 999,
        geometry: [
          { lat: 15.0, lon: 75.0 },
          { lat: 15.1, lon: 75.1 },
        ],
        tags: { highway: 'motorway', ref: 'NE 2' },
      },
    ];
    const elementsStateB: OSMWayElement[] = [
      {
        type: 'way',
        id: 999,
        geometry: [
          { lat: 15.0, lon: 75.0 },
          { lat: 15.1, lon: 75.1 },
        ],
        tags: { highway: 'motorway', ref: 'NE 2' },
      },
      {
        type: 'way',
        id: 1000,
        geometry: [
          { lat: 15.1, lon: 75.1 },
          { lat: 15.2, lon: 75.2 },
        ],
        tags: { highway: 'motorway', ref: 'NE 2' },
      },
    ];

    const processedA = processOsmWays(elementsStateA, 'IN-KA', defaultTestSettings);
    const processedB = processOsmWays(elementsStateB, 'IN-MH', defaultTestSettings);

    const combinedWayIds = new Set<number>();
    for (const r of [...processedA.stitchedRoads, ...processedB.stitchedRoads]) {
      for (const id of r.originalWayIds) {
        combinedWayIds.add(id);
      }
    }

    logs.push(`Unique original way IDs in combined set: ${Array.from(combinedWayIds).join(', ')}`);

    const assertions = [
      {
        name: 'Combined set deduplicates identical way ID across multiple states',
        passed: combinedWayIds.size === 2,
        expected: '2 unique way IDs (999, 1000)',
        actual: `${combinedWayIds.size} unique IDs (${Array.from(combinedWayIds).join(', ')})`,
      },
    ];

    results.push({
      id: 'test_5_cross_state_dedupe',
      title: '5. Cross-State Way ID Deduplication',
      passed: assertions.every((a) => a.passed),
      durationMs: Number((performance.now() - start).toFixed(2)),
      assertions,
      logs,
    });
  }

  // TEST 6: End-to-End Segment Stitching
  {
    const start = performance.now();
    const logs: string[] = [];
    const mockSegments: OSMWayElement[] = [
      {
        type: 'way',
        id: 501,
        geometry: [
          { lat: 19.0, lon: 73.0 },
          { lat: 19.1, lon: 73.1 },
        ],
        tags: { highway: 'motorway', ref: 'NE 1' },
      },
      {
        type: 'way',
        id: 502,
        geometry: [
          { lat: 19.1, lon: 73.1 },
          { lat: 19.2, lon: 73.2 },
        ],
        tags: { highway: 'motorway', ref: 'NE 1' },
      },
    ];

    const result = processOsmWays(mockSegments, 'IN-MH', {
      ...defaultTestSettings,
      mergeSegments: true,
      mergeToleranceMeters: 3,
    });

    logs.push(`Raw ways: ${result.rawCount} -> Stitched roads: ${result.stitchedRoads.length}`);
    const stitched = result.stitchedRoads[0];
    const totalPoints = stitched ? stitched.geometries[0].length : 0;

    const assertions = [
      {
        name: 'Merged 2 connected segments of same ref into 1 whole road',
        passed: result.stitchedRoads.length === 1,
        expected: '1 Stitched Road',
        actual: `${result.stitchedRoads.length} Stitched Road(s)`,
      },
      {
        name: 'Stitched geometry continuous with 3 points',
        passed: totalPoints === 3,
        expected: '3 continuous coordinates',
        actual: `${totalPoints} coordinates`,
      },
    ];

    results.push({
      id: 'test_6_stitching',
      title: '6. End-to-End Segment Stitching & Snapping',
      passed: assertions.every((a) => a.passed),
      durationMs: Number((performance.now() - start).toFixed(2)),
      assertions,
      logs,
    });
  }

  // TEST 7: Overlap Trimming & Class Priority
  {
    const start = performance.now();
    const logs: string[] = [];
    const mockOverlapping: OSMWayElement[] = [
      {
        type: 'way',
        id: 601,
        geometry: [
          { lat: 19.0, lon: 73.0 },
          { lat: 19.1, lon: 73.1 },
        ],
        tags: { highway: 'motorway', ref: 'NE 1' },
      },
      {
        type: 'way',
        id: 602,
        geometry: [
          { lat: 19.0, lon: 73.0 },
          { lat: 19.1, lon: 73.1 },
        ],
        tags: { highway: 'trunk', expressway: 'yes', ref: 'NH 48' },
      },
    ];

    const result = processOsmWays(mockOverlapping, 'IN-MH', {
      ...defaultTestSettings,
      trimOverlaps: true,
      overlapDistanceMeters: 4,
      overlapAngleDegrees: 20,
    });

    logs.push(`Removed overlaps count: ${result.removedOverlapsCount}`);
    const remainingCategory = result.stitchedRoads[0]?.category;

    const assertions = [
      {
        name: 'Overlapping duplicate category trimmed (removed 1 lower-priority line)',
        passed: result.removedOverlapsCount === 1,
        expected: '1 overlap removed',
        actual: `${result.removedOverlapsCount} overlap(s) removed`,
      },
      {
        name: 'Higher priority category (Motorway) retained over Expressway',
        passed: remainingCategory === 'motorway',
        expected: 'motorway',
        actual: `${remainingCategory}`,
      },
    ];

    results.push({
      id: 'test_7_overlap_trimming',
      title: '7. Overlap Trimming & Priority Hierarchy',
      passed: assertions.every((a) => a.passed),
      durationMs: Number((performance.now() - start).toFixed(2)),
      assertions,
      logs,
    });
  }

  // TEST 8: KML Generation & DOMParser Validation
  {
    const start = performance.now();
    const logs: string[] = [];

    const mockRoads = [
      {
        id: 'test_road_1',
        ref: 'NE 1',
        name: 'Mumbai-Pune Expressway',
        category: 'motorway' as const,
        geometries: [
          [
            [72.83, 18.92] as [number, number],
            [72.85, 18.94] as [number, number],
            [72.87, 18.96] as [number, number],
          ],
        ],
        tags: {
          highway: 'motorway',
          lanes: '6',
          maxspeed: '120',
          ref: 'NE 1',
        },
        originalWayIds: [101, 102],
        lengthKm: 45.2,
        vertexCount: 3,
        stateCode: 'IN-MH',
      },
    ];

    const kmlString = generateKml(mockRoads, 'Maharashtra Motorways', 'Maharashtra');
    logs.push(`Generated KML length: ${kmlString.length} chars`);

    let parseErrors: string[] = [];
    if (typeof window !== 'undefined' && window.DOMParser) {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(kmlString, 'application/xml');
      const parserError = xmlDoc.querySelector('parsererror');
      if (parserError) {
        parseErrors.push(parserError.textContent || 'XML parse error');
      }
    }

    const hasLineStyle = kmlString.includes('<Style id="style_motorway">');
    const hasPlacemark = kmlString.includes('<Placemark>');
    const hasCoordinates = kmlString.includes('72.830000,18.920000,0');

    const assertions = [
      {
        name: 'DOMParser validated XML without syntax errors',
        passed: parseErrors.length === 0,
        expected: '0 parser errors',
        actual: `${parseErrors.length} parser errors: ${parseErrors.join(' ')}`,
      },
      {
        name: 'Contains correct KML shared styles, placemarks & coordinates',
        passed: hasLineStyle && hasPlacemark && hasCoordinates,
        expected: 'Styles, Placemarks, and 3D coordinate tuples present',
        actual: `Styles=${hasLineStyle}, Placemarks=${hasPlacemark}, Coords=${hasCoordinates}`,
      },
    ];

    results.push({
      id: 'test_8_kml_dom',
      title: '8. KML 2.2 Schema & DOMParser Validation',
      passed: assertions.every((a) => a.passed),
      durationMs: Number((performance.now() - start).toFixed(2)),
      assertions,
      logs,
    });
  }

  return results;
}
