import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  AlertTriangle,
  Layers,
  MapPin,
  Play,
  RotateCcw,
  CheckCircle2,
  ShieldCheck,
  Compass,
  HardDriveDownload,
  Info,
  Activity,
  UploadCloud,
  Code2,
  ShieldAlert,
} from 'lucide-react';
import {
  CATEGORY_COLORS,
  INDIAN_STATES,
  PRE_MARKED_DONE_STATES,
} from './data/indianStates';
import { Navbar } from './components/Navbar';
import { StatePicker } from './components/StatePicker';
import { QueueControl } from './components/QueueControl';
import { MapPreview } from './components/MapPreview';
import { ResultsTable } from './components/ResultsTable';
import { LiveConsole } from './components/LiveConsole';
import { SettingsModal } from './components/SettingsModal';
import { SelfTestModal } from './components/SelfTestModal';
import { ConnectivityModal } from './components/ConnectivityModal';
import { ImportFilesModal } from './components/ImportFilesModal';
import { PythonScriptModal } from './components/PythonScriptModal';
import { idbCache } from './services/indexedDbCache';
import { OverpassClient } from './services/overpassClient';
import { isRunningInIframe } from './services/connectivityTester';
import {
  buildOverpassQuery,
  computeQueryHash,
  DEFAULT_MAIN_QUERY_TEMPLATE,
  DEFAULT_PLANNED_QUERY_TEMPLATE,
  DEFAULT_SERVERS,
} from './services/queryBuilder';
import { processOsmWays } from './services/roadProcessor';
import { mergeWayElements, splitBoundingBox } from './services/tileSplitter';
import {
  LogEntry,
  OSMWayElement,
  ProcessingSettings,
  RoadCategory,
  ServerHealthInfo,
  StateMeta,
  StateQueueItem,
  StitchedRoad,
} from './types';

const SETTINGS_STORAGE_KEY = 'india_roads_settings_v2';
const DONE_STATES_STORAGE_KEY = 'india_roads_done_states_v2';
const DARK_MODE_STORAGE_KEY = 'india_roads_theme_dark_v2';

const defaultSettings: ProcessingSettings = {
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
  maxRetries: 6,
  mainQueryTemplate: DEFAULT_MAIN_QUERY_TEMPLATE,
  plannedQueryTemplate: DEFAULT_PLANNED_QUERY_TEMPLATE,
  servers: [...DEFAULT_SERVERS],
};

export default function App() {
  // Theme state
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(DARK_MODE_STORAGE_KEY);
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  // Settings state
  const [settings, setSettings] = useState<ProcessingSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (saved) {
        return { ...defaultSettings, ...JSON.parse(saved) };
      }
    } catch {
      // fallback
    }
    return defaultSettings;
  });

  // Marked Done states (persisted in localStorage, pre-marked 14 states)
  const [doneCodes, setDoneCodes] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(DONE_STATES_STORAGE_KEY);
      if (saved) {
        return new Set(JSON.parse(saved));
      }
    } catch {
      // fallback
    }
    return new Set(PRE_MARKED_DONE_STATES);
  });

  // Selected state codes (initially remaining non-done states)
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const state of INDIAN_STATES) {
      if (!PRE_MARKED_DONE_STATES.includes(state.code)) {
        initial.add(state.code);
      }
    }
    return initial;
  });

  // Queue and results state
  const [queueMap, setQueueMap] = useState<Map<string, StateQueueItem>>(new Map());
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [cachedKeys, setCachedKeys] = useState<string[]>([]);
  const [serverHealthMap, setServerHealthMap] = useState<Map<string, ServerHealthInfo>>(new Map());

  // Execution engine state
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [countdownReason, setCountdownReason] = useState('');
  const [activeServer, setActiveServer] = useState<string | undefined>();
  const [activeStateCode, setActiveStateCode] = useState<string | null>(null);
  const [refetchEmptyOption, setRefetchEmptyOption] = useState(false);

  // Measured timing for dynamic ETA
  const [completedDurationsMs, setCompletedDurationsMs] = useState<number[]>([]);

  // Modals
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSelfTestOpen, setIsSelfTestOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [isImportFilesOpen, setIsImportFilesOpen] = useState(false);
  const [isPythonScriptOpen, setIsPythonScriptOpen] = useState(false);

  const inIframe = isRunningInIframe();
  const hasRunInitialDiagnostics = useRef(false);

  // Overpass client ref
  const overpassClientRef = useRef<OverpassClient | null>(null);

  // Helper to append logs
  const addLog = useCallback(
    (
      type: 'info' | 'success' | 'warn' | 'error' | 'polite',
      message: string,
      server?: string,
      stateCode?: string
    ) => {
      const entry: LogEntry = {
        id: `${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        timestamp: new Date().toLocaleTimeString(),
        type,
        message,
        server,
        stateCode,
      };
      setLogs((prev) => [...prev.slice(-400), entry]);
    },
    []
  );

  // Initialize or update Overpass client
  useEffect(() => {
    if (!overpassClientRef.current) {
      overpassClientRef.current = new OverpassClient({
        servers: settings.servers,
        politenessDelayMs: settings.politenessDelayMs,
        maxRetries: settings.maxRetries,
        requestTimeoutSeconds: settings.requestTimeoutSeconds,
        onLog: (type, msg, srv) => {
          if (srv) setActiveServer(srv);
          addLog(type, msg, srv);
        },
        onCountdown: (secs, reason) => {
          setCountdownSeconds(secs);
          setCountdownReason(reason);
        },
        onServerHealthUpdate: (health) => {
          setServerHealthMap(health);
        },
        onThreeConsecutiveFailures: () => {
          addLog('error', '3 consecutive server network failures detected. Opening Connectivity Diagnostics...');
          setIsDiagnosticsOpen(true);
        },
      });
      setServerHealthMap(overpassClientRef.current.getServerHealthMap());
    } else {
      overpassClientRef.current.updateConfig(
        settings.servers,
        settings.politenessDelayMs,
        settings.maxRetries,
        settings.requestTimeoutSeconds
      );
    }
  }, [settings, addLog]);

  // Load cache keys on mount
  useEffect(() => {
    idbCache.getAllKeys().then((keys) => setCachedKeys(keys));
  }, []);

  // Persist Done Codes
  useEffect(() => {
    try {
      localStorage.setItem(
        DONE_STATES_STORAGE_KEY,
        JSON.stringify(Array.from(doneCodes))
      );
    } catch {
      // ignore
    }
  }, [doneCodes]);

  // Persist Settings
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings]);

  // Persist Theme
  useEffect(() => {
    try {
      localStorage.setItem(DARK_MODE_STORAGE_KEY, JSON.stringify(darkMode));
    } catch {
      // ignore
    }
  }, [darkMode]);

  // State selection toggles
  const handleToggleSelect = (code: string) => {
    if (isRunning) return;
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (isRunning) return;
    setSelectedCodes(new Set(INDIAN_STATES.map((s) => s.code)));
  };

  const handleDeselectAll = () => {
    if (isRunning) return;
    setSelectedCodes(new Set());
  };

  const handleSelectRemainingOnly = () => {
    if (isRunning) return;
    const remaining = new Set<string>();
    for (const state of INDIAN_STATES) {
      if (!doneCodes.has(state.code)) {
        remaining.add(state.code);
      }
    }
    setSelectedCodes(remaining);
  };

  const handleToggleDone = (code: string) => {
    setDoneCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  // Cache management handlers
  const handleClearCache = async () => {
    await idbCache.clear();
    setCachedKeys([]);
    addLog('info', 'IndexedDB cache cleared completely.');
  };

  const handleClearEmptyCache = async (): Promise<number> => {
    const deletedCount = await idbCache.clearEmptyEntries();
    const remainingKeys = await idbCache.getAllKeys();
    setCachedKeys(remainingKeys);
    addLog('info', `Cleared ${deletedCount} empty entries from IndexedDB cache.`);
    return deletedCount;
  };

  // Compile all processed roads across all finished states for the map
  const allLoadedRoads = useMemo(() => {
    const roads: StitchedRoad[] = [];
    queueMap.forEach((item) => {
      if (item.data && item.data.length > 0) {
        roads.push(...item.data);
      }
    });
    return roads;
  }, [queueMap]);

  const stateMetaMap = useMemo(
    () => new Map(INDIAN_STATES.map((s) => [s.code, s])),
    []
  );

  const selectedList = useMemo(
    () => Array.from(selectedCodes),
    [selectedCodes]
  );

  // Disaggregated Counters (Section 4)
  let processedCount = 0; // verified positive results
  let emptyCount = 0; // genuine 0 ways
  let failedCount = 0; // failed
  let cachedCount = 0; // loaded from cache
  let totalFinishedCount = 0;

  for (const code of selectedList) {
    const item = queueMap.get(code);
    if (item) {
      if (item.status === 'done') {
        processedCount++;
        totalFinishedCount++;
        if (item.isCached) cachedCount++;
      } else if (item.status === 'cached') {
        processedCount++;
        totalFinishedCount++;
        cachedCount++;
      } else if (item.status === 'empty') {
        emptyCount++;
        totalFinishedCount++;
        if (item.isCached) cachedCount++;
      } else if (item.status === 'failed') {
        failedCount++;
      }
    }
  }

  // Section 6: ETA computed from measured average time per completed state
  const measuredAvgSecondsPerState = useMemo(() => {
    if (completedDurationsMs.length === 0) {
      return settings.politenessDelayMs / 1000 + 4.5;
    }
    const sumMs = completedDurationsMs.reduce((a, b) => a + b, 0);
    return (sumMs / completedDurationsMs.length) / 1000;
  }, [completedDurationsMs, settings.politenessDelayMs]);

  const remainingStatesCount = Math.max(0, selectedList.length - totalFinishedCount - failedCount);
  const estimatedRemainingSeconds = isRunning
    ? Math.round(remainingStatesCount * measuredAvgSecondsPerState)
    : 0;

  // Single State Processor Function with Strict Cache Validation & Fallbacks
  const processSingleState = async (
    state: StateMeta,
    client: OverpassClient,
    forceRefetch = false
  ): Promise<void> => {
    setActiveStateCode(state.code);
    const startTime = Date.now();

    // Update queue item to running
    setQueueMap((prev) => {
      const next = new Map(prev);
      next.set(state.code, {
        stateCode: state.code,
        status: 'running',
        attempt: 1,
        maxAttempts: settings.maxRetries,
        rawWaysCount: 0,
        processedRoadsCount: 0,
        vertexCount: 0,
        totalLengthKm: 0,
        isCached: false,
        startTime,
      });
      return next;
    });

    try {
      // 1. Build Query A (MAIN) & Query B (PLANNED)
      const queryMain = buildOverpassQuery({
        iso: state.iso,
        includeLinks: settings.includeLinks,
        customTemplate: settings.mainQueryTemplate,
        queryType: 'main',
      });

      const queryPlanned = settings.includePlanned
        ? buildOverpassQuery({
            iso: state.iso,
            customTemplate: settings.plannedQueryTemplate,
            queryType: 'planned',
          })
        : '';

      const queryHash = computeQueryHash(queryMain + (queryPlanned || ''));
      const cacheKey = `${state.code}_${queryHash}`;

      // 2. Check Cache (Unless forced refetch or refetchEmpty option enabled for 0-element entries)
      if (!forceRefetch) {
        const cached = await idbCache.get(cacheKey);

        if (cached && Array.isArray(cached.elements)) {
          const isZeroWays = cached.elements.length === 0;

          if (isZeroWays && refetchEmptyOption) {
            addLog('info', `[${state.name}] Cached as empty, but "Re-fetch empty" is enabled. Running live query...`);
          } else {
            const cacheAge = Date.now() - cached.timestamp;
            const processResult = processOsmWays(cached.elements, state.code, settings);
            const isDone = processResult.stitchedRoads.length > 0;

            addLog(
              'info',
              `[${state.name}] Loaded from IndexedDB cache (${cached.elements.length} raw ways, age: ${Math.round(cacheAge / 60000)}m).`,
              cached.server
            );

            setQueueMap((prev) => {
              const next = new Map(prev);
              next.set(state.code, {
                stateCode: state.code,
                status: isDone ? 'done' : 'empty',
                rawWaysCount: cached.elements.length,
                processedRoadsCount: processResult.stitchedRoads.length,
                vertexCount: processResult.totalVertices,
                totalLengthKm: processResult.totalLengthKm,
                isCached: true,
                cacheAgeMs: cacheAge,
                serverUsed: cached.server,
                startTime,
                endTime: Date.now(),
                durationMs: Date.now() - startTime,
                data: processResult.stitchedRoads,
                rawElements: cached.elements,
              });
              return next;
            });
            return;
          }
        }
      }

      // 3. Execute MAIN query
      let rawElements: OSMWayElement[] = [];
      let serverUsed = '';

      const mainResult = await client.executeQuery(queryMain, `${state.name} [Main]`);
      rawElements = [...mainResult.elements];
      serverUsed = mainResult.serverUsed;

      // Check if timed out (trigger big-state tile splitting)
      if (mainResult.isTimedOut) {
        addLog('warn', `[${state.name}] Timed out twice. Splitting state bounding box into 2x2 grid (4 tiles)...`);

        setQueueMap((prev) => {
          const next = new Map(prev);
          const current = next.get(state.code)!;
          next.set(state.code, {
            ...current,
            status: 'splitting',
            tilesCount: 4,
          });
          return next;
        });

        const tiles = splitBoundingBox(state.bbox, 2);
        const tileElements: OSMWayElement[][] = [];

        for (let tIdx = 0; tIdx < tiles.length; tIdx++) {
          const tile = tiles[tIdx];
          addLog('info', `[${state.name}] Querying tile ${tIdx + 1}/${tiles.length}...`);

          const tileQuery = buildOverpassQuery({
            iso: state.iso,
            bbox: tile,
            includeLinks: settings.includeLinks,
            customTemplate: settings.mainQueryTemplate,
            queryType: 'main',
          });

          const tileRes = await client.executeQuery(
            tileQuery,
            `${state.name} [Tile ${tIdx + 1}/4]`
          );
          tileElements.push(tileRes.elements);
        }

        rawElements = mergeWayElements(tileElements);
      }

      // 4. If result is empty, test fallback alternative ISO codes or name:en query
      if (rawElements.length === 0) {
        const fallbacksToTry = [...(state.altCodes || [])];

        for (const altIso of fallbacksToTry) {
          addLog('info', `[${state.name}] Primary code ${state.iso} returned 0 ways. Trying alternative code ${altIso}...`);
          const altQuery = buildOverpassQuery({
            iso: altIso,
            includeLinks: settings.includeLinks,
            customTemplate: settings.mainQueryTemplate,
            queryType: 'main',
          });

          const altResult = await client.executeQuery(altQuery, `${state.name} [Alt ${altIso}]`);
          if (altResult.elements.length > 0) {
            rawElements = altResult.elements;
            serverUsed = altResult.serverUsed;
            addLog('success', `[${state.name}] Alternative code ${altIso} succeeded with ${rawElements.length} ways!`);
            break;
          }
        }

        // If still empty, try fallback by English admin_level=4 name
        if (rawElements.length === 0 && state.fallbackName) {
          addLog('info', `[${state.name}] Trying fallback query by admin_level 4 name:en="${state.fallbackName}"...`);
          const nameQuery = buildOverpassQuery({
            iso: state.iso,
            fallbackName: state.fallbackName,
            useFallbackName: true,
            includeLinks: settings.includeLinks,
            customTemplate: settings.mainQueryTemplate,
            queryType: 'main',
          });

          const nameResult = await client.executeQuery(
            nameQuery,
            `${state.name} [Name Fallback]`
          );
          if (nameResult.elements.length > 0) {
            rawElements = nameResult.elements;
            serverUsed = nameResult.serverUsed;
            addLog('success', `[${state.name}] Name fallback succeeded with ${rawElements.length} ways!`);
          }
        }
      }

      // 5. Execute PLANNED query if enabled
      if (settings.includePlanned && queryPlanned) {
        try {
          const plannedResult = await client.executeQuery(
            queryPlanned,
            `${state.name} [Planned]`
          );
          if (plannedResult.elements.length > 0) {
            rawElements = mergeWayElements([rawElements, plannedResult.elements]);
          }
        } catch (planErr: any) {
          addLog('warn', `[${state.name}] Planned query error: ${planErr.message}. Continuing with Main results.`);
        }
      }

      // 6. Section 4: Cache ONLY validated successes (HTTP 200, valid JSON, no error remark)
      await idbCache.setValidated({
        key: cacheKey,
        stateCode: state.code,
        queryHash,
        elements: rawElements,
        server: serverUsed,
      });
      setCachedKeys((prev) => (prev.includes(cacheKey) ? prev : [...prev, cacheKey]));

      // 7. Process Road Segments
      const processResult = processOsmWays(rawElements, state.code, settings);

      const endTime = Date.now();
      const durationMs = endTime - startTime;

      // Track duration for rolling ETA
      setCompletedDurationsMs((prev) => [...prev, durationMs]);

      if (processResult.stitchedRoads.length === 0) {
        addLog(
          'warn',
          `[${state.name}] 0 lines (this state may have none tagged, or the area code is not used in OSM).`
        );
      } else {
        addLog(
          'success',
          `[${state.name}] Finished: ${processResult.stitchedRoads.length} roads (${processResult.totalLengthKm.toFixed(1)} km, ${processResult.totalVertices} vertices) in ${(durationMs / 1000).toFixed(1)}s.`
        );
      }

      setQueueMap((prev) => {
        const next = new Map(prev);
        next.set(state.code, {
          stateCode: state.code,
          status: processResult.stitchedRoads.length > 0 ? 'done' : 'empty',
          rawWaysCount: rawElements.length,
          processedRoadsCount: processResult.stitchedRoads.length,
          vertexCount: processResult.totalVertices,
          totalLengthKm: processResult.totalLengthKm,
          isCached: false,
          serverUsed,
          startTime,
          endTime,
          durationMs,
          data: processResult.stitchedRoads,
          rawElements,
        });
        return next;
      });
    } catch (err: any) {
      const endTime = Date.now();
      const isTypeError = err.name === 'TypeError';
      const isAbort = err.name === 'AbortError' || err.message?.includes('aborted');

      addLog('error', `[${state.name}] Failed: ${err.message}`, undefined, state.code);

      setQueueMap((prev) => {
        const next = new Map(prev);
        next.set(state.code, {
          stateCode: state.code,
          status: 'failed',
          errorMessage: err.message,
          errorClass: isTypeError ? 'TypeError' : isAbort ? 'AbortError' : 'HttpError',
          rawWaysCount: 0,
          processedRoadsCount: 0,
          vertexCount: 0,
          totalLengthKm: 0,
          isCached: false,
          startTime,
          endTime,
          durationMs: endTime - startTime,
        });
        return next;
      });
    }
  };

  // Queue Executor Loop
  const runQueue = async (statesToProcess: StateMeta[], forceRefetch = false) => {
    if (!overpassClientRef.current) return;
    const client = overpassClientRef.current;
    client.resetCancel();

    // Section 3: Automatically run connectivity test before first queue start
    if (!hasRunInitialDiagnostics.current) {
      hasRunInitialDiagnostics.current = true;
      addLog('info', 'Performing quick pre-flight server connectivity check...');
      try {
        const { runAllConnectivityTests } = await import('./services/connectivityTester');
        await runAllConnectivityTests(settings.servers);
      } catch {
        // ignore
      }
    }

    setIsRunning(true);
    setIsPaused(false);
    setCompletedDurationsMs([]);
    addLog('info', `Starting queue execution for ${statesToProcess.length} state(s)...`);

    for (let i = 0; i < statesToProcess.length; i++) {
      const state = statesToProcess[i];
      try {
        await processSingleState(state, client, forceRefetch);
      } catch (err: any) {
        if (err.message?.includes('cancelled')) {
          addLog('warn', 'Queue execution stopped by user cancellation.');
          break;
        }
      }
    }

    setIsRunning(false);
    setIsPaused(false);
    setActiveStateCode(null);
    setCountdownSeconds(0);
    addLog('success', 'Queue execution cycle complete.');
  };

  // Start handler
  const handleStart = () => {
    const statesToProcess: StateMeta[] = [];
    for (const code of selectedList) {
      const meta = stateMetaMap.get(code);
      if (meta) statesToProcess.push(meta);
    }
    runQueue(statesToProcess);
  };

  // Single State Re-fetch
  const handleRefetchState = (code: string) => {
    const meta = stateMetaMap.get(code);
    if (!meta || isRunning) return;
    runQueue([meta], true);
  };

  // Pause / Resume / Cancel handlers
  const handlePause = () => {
    if (overpassClientRef.current) {
      overpassClientRef.current.pause();
      setIsPaused(true);
    }
  };

  const handleResume = () => {
    if (overpassClientRef.current) {
      overpassClientRef.current.resume();
      setIsPaused(false);
    }
  };

  const handleCancel = () => {
    if (overpassClientRef.current) {
      overpassClientRef.current.cancel();
      setIsRunning(false);
      setIsPaused(false);
      setActiveStateCode(null);
      setCountdownSeconds(0);
    }
  };

  const handleRetryFailed = () => {
    const failedStates: StateMeta[] = [];
    queueMap.forEach((item, code) => {
      if (item.status === 'failed') {
        const meta = stateMetaMap.get(code);
        if (meta) failedStates.push(meta);
      }
    });

    if (failedStates.length > 0) {
      runQueue(failedStates, true);
    }
  };

  const handleClearAllResults = () => {
    setQueueMap(new Map());
  };

  // Handle Manual File Import (Fallback 5a)
  const handleImportSuccess = (
    stateCode: string,
    elements: OSMWayElement[],
    sourceFormat: string
  ) => {
    const meta = stateMetaMap.get(stateCode);
    const processResult = processOsmWays(elements, stateCode, settings);

    addLog(
      'success',
      `Imported ${elements.length} ways for ${meta?.name || stateCode} from ${sourceFormat} (${processResult.stitchedRoads.length} roads).`
    );

    setQueueMap((prev) => {
      const next = new Map(prev);
      next.set(stateCode, {
        stateCode,
        status: processResult.stitchedRoads.length > 0 ? 'done' : 'empty',
        rawWaysCount: elements.length,
        processedRoadsCount: processResult.stitchedRoads.length,
        vertexCount: processResult.totalVertices,
        totalLengthKm: processResult.totalLengthKm,
        isCached: false,
        serverUsed: `Import (${sourceFormat})`,
        startTime: Date.now(),
        endTime: Date.now(),
        durationMs: 0,
        data: processResult.stitchedRoads,
        rawElements: elements,
      });
      return next;
    });
  };

  // Selected StateMeta objects for Python Script generator
  const selectedStateMetas = useMemo(() => {
    return selectedList
      .map((code) => stateMetaMap.get(code))
      .filter((s): s is StateMeta => Boolean(s));
  }, [selectedList, stateMetaMap]);

  return (
    <div className={`min-h-screen ${darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-900 text-slate-100'}`}>
      {/* Navbar */}
      <Navbar
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((p) => !p)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenSelfTest={() => setIsSelfTestOpen(true)}
        onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
        onOpenImportFiles={() => setIsImportFilesOpen(true)}
        onOpenPythonScript={() => setIsPythonScriptOpen(true)}
        cachedCount={cachedKeys.length}
        totalCompleted={totalFinishedCount}
      />

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Iframe Restricted Notice if applicable */}
        {inIframe && (
          <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-3.5 px-5 text-xs text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <strong className="text-amber-100 font-semibold">
                  Iframe Sandbox Detected:
                </strong>{' '}
                If live Overpass servers return CORS or network block errors, use the <strong>Import Files</strong> tab or download the standalone <strong>Python Script</strong>.
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsDiagnosticsOpen(true)}
                className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 font-semibold cursor-pointer"
              >
                Test Connectivity
              </button>
              <button
                onClick={() => setIsImportFilesOpen(true)}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium cursor-pointer"
              >
                Import Files
              </button>
            </div>
          </div>
        )}

        {/* Polite Fair Use Banner */}
        <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-emerald-300">
                Polite Public Overpass Exporter &bull; Real OSM Data Only
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Simple CORS POST requests, strictly 1 request at a time, min 5s spacing, fail-fast immediate server failover, and verified caching.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setIsDiagnosticsOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-colors cursor-pointer"
            >
              Diagnostics
            </button>
            <button
              onClick={() => setIsSelfTestOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-xs font-semibold transition-colors cursor-pointer"
            >
              Run Mock Tests (8)
            </button>
          </div>
        </div>

        {/* State Picker (1) */}
        <StatePicker
          selectedCodes={selectedCodes}
          onToggleSelect={handleToggleSelect}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onSelectRemainingOnly={handleSelectRemainingOnly}
          doneCodes={doneCodes}
          onToggleDone={handleToggleDone}
          queueMap={queueMap}
          disabled={isRunning}
          onRefetchState={handleRefetchState}
        />

        {/* Queue Controls & Politeness Progress (2) */}
        <QueueControl
          isRunning={isRunning}
          isPaused={isPaused}
          onStart={handleStart}
          onPause={handlePause}
          onResume={handleResume}
          onCancel={handleCancel}
          onRetryFailed={handleRetryFailed}
          selectedCount={selectedList.length}
          processedCount={processedCount}
          emptyCount={emptyCount}
          failedCount={failedCount}
          cachedCount={cachedCount}
          totalFinishedCount={totalFinishedCount}
          countdownSeconds={countdownSeconds}
          countdownReason={countdownReason}
          activeServer={activeServer}
          serverHealthMap={serverHealthMap}
          measuredAvgSecondsPerState={measuredAvgSecondsPerState}
          estimatedRemainingSeconds={estimatedRemainingSeconds}
          refetchEmptyOption={refetchEmptyOption}
          onToggleRefetchEmptyOption={() => setRefetchEmptyOption((p) => !p)}
        />

        {/* 2-Column Split: Canvas Map Preview & Live Console Stream */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7">
            <MapPreview
              roads={allLoadedRoads}
              removedOverlapGeometries={[]}
            />
          </div>

          <div className="lg:col-span-5">
            <LiveConsole logs={logs} onClearLogs={() => setLogs([])} />
          </div>
        </div>

        {/* Results Table & KMZ Packaging (3) */}
        <ResultsTable
          queueMap={queueMap}
          onClearAllResults={handleClearAllResults}
        />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950 mt-12 py-6 text-center text-xs text-slate-500 space-y-1">
        <p>
          Data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">OpenStreetMap contributors</a> under the Open Database License (ODbL).
        </p>
        <p className="text-[11px] text-slate-600">
          Overpass API provided by openstreetmap.de, kumi.systems &amp; private.coffee. Strictly polite querying.
        </p>
      </footer>

      {/* Modals */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={(newSettings) => setSettings(newSettings)}
        onClearCache={handleClearCache}
        onClearEmptyCache={handleClearEmptyCache}
        cachedCount={cachedKeys.length}
      />

      <SelfTestModal
        isOpen={isSelfTestOpen}
        onClose={() => setIsSelfTestOpen(false)}
      />

      <ConnectivityModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        servers={settings.servers}
        serverHealthMap={serverHealthMap}
        onOpenImportFiles={() => setIsImportFilesOpen(true)}
        onOpenPythonScript={() => setIsPythonScriptOpen(true)}
      />

      <ImportFilesModal
        isOpen={isImportFilesOpen}
        onClose={() => setIsImportFilesOpen(false)}
        onImportSuccess={handleImportSuccess}
      />

      <PythonScriptModal
        isOpen={isPythonScriptOpen}
        onClose={() => setIsPythonScriptOpen(false)}
        selectedStates={selectedStateMetas}
        servers={settings.servers}
        includePlanned={settings.includePlanned}
        includeLinks={settings.includeLinks}
        politenessDelayMs={settings.politenessDelayMs}
      />
    </div>
  );
}
