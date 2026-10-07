import { OSMWayElement, OverpassResponse, ServerHealthInfo } from '../types';

export interface OverpassClientOptions {
  servers: string[];
  politenessDelayMs: number;
  maxRetries: number;
  requestTimeoutSeconds: number;
  onLog?: (
    type: 'info' | 'success' | 'warn' | 'error' | 'polite',
    message: string,
    server?: string
  ) => void;
  onCountdown?: (secondsRemaining: number, reason: string) => void;
  onServerHealthUpdate?: (health: Map<string, ServerHealthInfo>) => void;
  onThreeConsecutiveFailures?: () => void;
}

export interface QueryResult {
  elements: OSMWayElement[];
  serverUsed: string;
  isTimedOut: boolean;
  rawText?: string;
}

export class OverpassClient {
  private servers: string[];
  private politenessDelayMs: number;
  private maxRetries: number;
  private requestTimeoutSeconds: number;
  private onLog?: (
    type: 'info' | 'success' | 'warn' | 'error' | 'polite',
    message: string,
    server?: string
  ) => void;
  private onCountdown?: (secondsRemaining: number, reason: string) => void;
  private onServerHealthUpdate?: (health: Map<string, ServerHealthInfo>) => void;
  private onThreeConsecutiveFailures?: () => void;

  private currentServerIndex = 0;
  private lastRequestEndTime = 0;
  private abortController: AbortController | null = null;
  private isPaused = false;
  private isCancelled = false;
  private pauseResolver: (() => void) | null = null;

  // Server health tracking
  private serverHealthMap: Map<string, ServerHealthInfo> = new Map();
  private globalConsecutiveNetworkFailures = 0;

  constructor(options: OverpassClientOptions) {
    this.servers =
      options.servers.length > 0
        ? options.servers
        : [
            'https://overpass-api.de/api/interpreter',
            'https://overpass.kumi.systems/api/interpreter',
            'https://overpass.private.coffee/api/interpreter',
          ];
    this.politenessDelayMs = Math.max(1000, options.politenessDelayMs || 5000);
    this.maxRetries = Math.max(1, options.maxRetries || 6);
    this.requestTimeoutSeconds = Math.max(30, options.requestTimeoutSeconds || 120);
    this.onLog = options.onLog;
    this.onCountdown = options.onCountdown;
    this.onServerHealthUpdate = options.onServerHealthUpdate;
    this.onThreeConsecutiveFailures = options.onThreeConsecutiveFailures;

    this.initServerHealth();
  }

  private initServerHealth() {
    for (const srv of this.servers) {
      if (!this.serverHealthMap.has(srv)) {
        this.serverHealthMap.set(srv, {
          url: srv,
          consecutiveFailures: 0,
          deprioritizedUntil: 0,
          lastStatus: 'untested',
        });
      }
    }
  }

  public updateConfig(
    servers: string[],
    politenessDelayMs: number,
    maxRetries: number,
    timeoutSecs: number
  ) {
    if (servers.length > 0) {
      this.servers = servers;
      this.initServerHealth();
    }
    this.politenessDelayMs = politenessDelayMs;
    this.maxRetries = maxRetries;
    this.requestTimeoutSeconds = timeoutSecs;
  }

  public getServerHealthMap(): Map<string, ServerHealthInfo> {
    return new Map(this.serverHealthMap);
  }

  private recordServerSuccess(serverUrl: string, latencyMs: number) {
    const health = this.serverHealthMap.get(serverUrl) || {
      url: serverUrl,
      consecutiveFailures: 0,
      deprioritizedUntil: 0,
    };
    health.consecutiveFailures = 0;
    health.deprioritizedUntil = 0;
    health.lastStatus = 'healthy';
    health.lastLatencyMs = latencyMs;
    health.lastTestedAt = Date.now();
    delete health.lastError;
    this.serverHealthMap.set(serverUrl, health);
    this.globalConsecutiveNetworkFailures = 0;

    if (this.onServerHealthUpdate) {
      this.onServerHealthUpdate(new Map(this.serverHealthMap));
    }
  }

  private recordServerFailure(
    serverUrl: string,
    errorClass: string,
    errorMessage: string
  ) {
    const health = this.serverHealthMap.get(serverUrl) || {
      url: serverUrl,
      consecutiveFailures: 0,
      deprioritizedUntil: 0,
    };
    health.consecutiveFailures++;
    health.lastTestedAt = Date.now();
    health.lastError = `${errorClass}: ${errorMessage.slice(0, 100)}`;

    // Deprioritise server for 10 minutes after 3 consecutive failures
    if (health.consecutiveFailures >= 3) {
      health.deprioritizedUntil = Date.now() + 10 * 60 * 1000; // 10 minutes
      health.lastStatus = 'down';
      this.log(
        'warn',
        `Server ${new URL(serverUrl).hostname} failed 3 consecutive times. Deprioritised for 10 minutes.`,
        serverUrl
      );
    } else {
      health.lastStatus = 'degraded';
    }

    this.serverHealthMap.set(serverUrl, health);
    this.globalConsecutiveNetworkFailures++;

    if (this.onServerHealthUpdate) {
      this.onServerHealthUpdate(new Map(this.serverHealthMap));
    }

    if (
      this.globalConsecutiveNetworkFailures >= 3 &&
      this.onThreeConsecutiveFailures
    ) {
      this.onThreeConsecutiveFailures();
    }
  }

  /**
   * Gets the next active prioritized server, avoiding deprioritized ones if healthy alternatives exist
   */
  private getNextServerUrl(): string {
    const now = Date.now();
    const available = this.servers.filter((srv) => {
      const h = this.serverHealthMap.get(srv);
      return !h || h.deprioritizedUntil <= now;
    });

    const pool = available.length > 0 ? available : this.servers;
    const serverUrl = pool[this.currentServerIndex % pool.length];
    return serverUrl;
  }

  private advanceServer() {
    this.currentServerIndex = (this.currentServerIndex + 1) % this.servers.length;
  }

  public pause() {
    this.isPaused = true;
    this.log('warn', 'Queue paused by user.');
  }

  public resume() {
    this.isPaused = false;
    if (this.pauseResolver) {
      this.pauseResolver();
      this.pauseResolver = null;
    }
    this.log('info', 'Queue resumed.');
  }

  public cancel() {
    this.isCancelled = true;
    this.isPaused = false;
    if (this.pauseResolver) {
      this.pauseResolver();
      this.pauseResolver = null;
    }
    if (this.abortController) {
      this.abortController.abort();
    }
    this.log('warn', 'Execution cancelled by user.');
  }

  public resetCancel() {
    this.isCancelled = false;
    this.isPaused = false;
  }

  private log(
    type: 'info' | 'success' | 'warn' | 'error' | 'polite',
    message: string,
    server?: string
  ) {
    if (this.onLog) {
      this.onLog(type, message, server);
    }
  }

  private async sleepWithCountdown(ms: number, reason: string): Promise<void> {
    const startTime = Date.now();
    const interval = 200;

    while (Date.now() - startTime < ms) {
      if (this.isCancelled) throw new Error('Operation cancelled by user');
      while (this.isPaused) {
        if (this.isCancelled) throw new Error('Operation cancelled by user');
        await new Promise<void>((resolve) => {
          this.pauseResolver = resolve;
        });
      }

      const remaining = Math.max(0, (ms - (Date.now() - startTime)) / 1000);
      if (this.onCountdown) {
        this.onCountdown(Number(remaining.toFixed(1)), reason);
      }
      await new Promise((r) => setTimeout(r, interval));
    }

    if (this.onCountdown) {
      this.onCountdown(0, '');
    }
  }

  /**
   * Executes a single Overpass query with fail-fast failover, exact simple POST format,
   * exponential backoff only after full server rounds or 429/504, and response inspection.
   */
  public async executeQuery(
    queryStr: string,
    stateLabel: string
  ): Promise<QueryResult> {
    if (this.isCancelled) throw new Error('Operation cancelled');

    let totalAttempts = 0;
    let consecutiveTimeouts = 0;
    let serverCycleCount = 0;
    const serverPoolSize = this.servers.length;

    while (totalAttempts <= this.maxRetries) {
      if (this.isCancelled) throw new Error('Operation cancelled');

      // Check pause
      while (this.isPaused) {
        if (this.isCancelled) throw new Error('Operation cancelled');
        await new Promise<void>((resolve) => {
          this.pauseResolver = resolve;
        });
      }

      // Enforce Politeness: strictly 1 request at a time, min 5 seconds between consecutive requests
      const timeSinceLast = Date.now() - this.lastRequestEndTime;
      if (timeSinceLast < this.politenessDelayMs && this.lastRequestEndTime > 0) {
        const waitMs = this.politenessDelayMs - timeSinceLast;
        this.log(
          'polite',
          `Politeness delay: waiting ${(waitMs / 1000).toFixed(1)}s before next query to protect public servers...`
        );
        await this.sleepWithCountdown(waitMs, 'Politeness interval');
      }

      const serverUrl = this.getNextServerUrl();
      const serverHostname = new URL(serverUrl).hostname;
      const attemptNum = totalAttempts + 1;

      this.log(
        'info',
        `[${stateLabel}] Sending query (Attempt ${attemptNum}/${this.maxRetries + 1}) to ${serverHostname}...`,
        serverUrl
      );

      // Section 1: AbortController timeout of (query timeout + 30 s)
      const timeoutMs = (this.requestTimeoutSeconds + 30) * 1000;
      this.abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        if (this.abortController) {
          this.abortController.abort();
        }
      }, timeoutMs);

      const requestStartTime = Date.now();

      try {
        // Section 1: Exact request format for Simple CORS (no custom headers, no Accept, no JSON headers)
        const postBody = `data=${encodeURIComponent(queryStr)}`;

        const response = await fetch(serverUrl, {
          method: 'POST',
          mode: 'cors',
          credentials: 'omit',
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          },
          body: postBody,
          signal: this.abortController.signal,
        });

        clearTimeout(timeoutId);
        this.lastRequestEndTime = Date.now();
        const latencyMs = Date.now() - requestStartTime;
        const durationSec = (latencyMs / 1000).toFixed(1);

        // Check HTTP 429 / 504 / 502 / 503
        if (
          response.status === 429 ||
          response.status === 504 ||
          response.status === 502 ||
          response.status === 503
        ) {
          const retryAfter = response.headers.get('Retry-After');
          let backoffSec = retryAfter
            ? parseInt(retryAfter, 10)
            : 20 * Math.pow(2, serverCycleCount);
          if (isNaN(backoffSec) || backoffSec <= 0) {
            backoffSec = 20 * Math.pow(2, serverCycleCount);
          }
          backoffSec = Math.min(backoffSec, 300);

          const errorText = await response.text().catch(() => '');
          this.recordServerFailure(
            serverUrl,
            'HttpError',
            `HTTP ${response.status} (${errorText.slice(0, 150)})`
          );

          this.log(
            'warn',
            `[${stateLabel}] HTTP ${response.status} from ${serverHostname}: ${errorText.slice(0, 150) || response.statusText}. Backing off for ${backoffSec}s and rotating server...`,
            serverUrl
          );

          this.advanceServer();
          totalAttempts++;
          serverCycleCount++;

          if (totalAttempts > this.maxRetries) {
            throw new Error(
              `Exceeded max retries after HTTP ${response.status} from ${serverUrl}`
            );
          }
          await this.sleepWithCountdown(
            backoffSec * 1000,
            `HTTP ${response.status} backoff`
          );
          continue;
        }

        // Other HTTP Non-OK Errors (4xx, 5xx)
        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          const errorPreview = errorText.slice(0, 200) || response.statusText;
          this.recordServerFailure(
            serverUrl,
            'HttpError',
            `HTTP ${response.status}: ${errorPreview}`
          );

          this.log(
            'warn',
            `[${stateLabel}] HTTP ${response.status} from ${serverHostname}: "${errorPreview}". Switching server immediately...`,
            serverUrl
          );

          this.advanceServer();
          totalAttempts++;

          // Check if full round of all servers completed
          if (totalAttempts % serverPoolSize === 0) {
            serverCycleCount++;
            const backoffSec = 20 * Math.pow(2, serverCycleCount - 1);
            this.log(
              'info',
              `All ${serverPoolSize} configured servers attempted once. Backing off for ${backoffSec}s before next round...`
            );
            await this.sleepWithCountdown(
              backoffSec * 1000,
              `Full round backoff (${serverCycleCount})`
            );
          }
          continue;
        }

        // Response is HTTP 200, inspect body for HTML error pages or Overpass remark errors
        const rawText = await response.text();

        // Check if returned HTML error page (e.g. 504 Gateway Time-out masked as 200)
        if (
          rawText.trim().startsWith('<') ||
          rawText.includes('<!DOCTYPE html>') ||
          rawText.includes('<html>')
        ) {
          const isTimeout =
            rawText.toLowerCase().includes('timeout') ||
            rawText.toLowerCase().includes('timed out');
          if (isTimeout) consecutiveTimeouts++;

          this.recordServerFailure(
            serverUrl,
            'HttpError',
            `HTML Error Response (preview: ${rawText.slice(0, 150)})`
          );

          this.log(
            'warn',
            `[${stateLabel}] Received HTML error response instead of JSON from ${serverHostname}. Switching server immediately.`,
            serverUrl
          );

          this.advanceServer();
          totalAttempts++;

          if (consecutiveTimeouts >= 2) {
            return { elements: [], serverUsed: serverUrl, isTimedOut: true, rawText };
          }

          if (totalAttempts % serverPoolSize === 0) {
            serverCycleCount++;
            const backoffSec = 20 * Math.pow(2, serverCycleCount - 1);
            await this.sleepWithCountdown(
              backoffSec * 1000,
              'Round backoff after HTML error'
            );
          }
          continue;
        }

        // Parse JSON
        let data: OverpassResponse;
        try {
          data = JSON.parse(rawText);
        } catch (jsonErr: any) {
          this.recordServerFailure(
            serverUrl,
            'ParseError',
            `JSON Parse error: ${jsonErr.message}`
          );
          this.log(
            'warn',
            `[${stateLabel}] Failed to parse JSON response (${jsonErr.message}). Switching server immediately.`,
            serverUrl
          );
          this.advanceServer();
          totalAttempts++;

          if (totalAttempts % serverPoolSize === 0) {
            serverCycleCount++;
            const backoffSec = 20 * Math.pow(2, serverCycleCount - 1);
            await this.sleepWithCountdown(
              backoffSec * 1000,
              'Round backoff after parse error'
            );
          }
          continue;
        }

        // Inspect Overpass remark field for runtime errors / timeouts
        if (data.remark) {
          const remarkLower = data.remark.toLowerCase();
          const isTimeout =
            remarkLower.includes('timed out') ||
            remarkLower.includes('timeout') ||
            remarkLower.includes('runtime error');

          if (isTimeout) {
            consecutiveTimeouts++;
            this.recordServerFailure(
              serverUrl,
              'HttpError',
              `Overpass remark timeout/runtime error: ${data.remark}`
            );

            this.log(
              'warn',
              `[${stateLabel}] Overpass returned remark: "${data.remark}". Timeout detected (count: ${consecutiveTimeouts}).`,
              serverUrl
            );

            if (consecutiveTimeouts >= 2) {
              return {
                elements: data.elements || [],
                serverUsed: serverUrl,
                isTimedOut: true,
                rawText,
              };
            }

            this.advanceServer();
            totalAttempts++;
            const backoffSec = 20 * Math.pow(2, serverCycleCount);
            await this.sleepWithCountdown(
              backoffSec * 1000,
              'Overpass Timeout backoff'
            );
            continue;
          }
        }

        // Valid Success!
        const ways = (data.elements || []).filter((el) => el.type === 'way');
        this.recordServerSuccess(serverUrl, latencyMs);

        this.log(
          'success',
          `[${stateLabel}] Received ${ways.length} ways from ${serverHostname} in ${durationSec}s.`,
          serverUrl
        );

        return {
          elements: ways,
          serverUsed: serverUrl,
          isTimedOut: false,
          rawText,
        };
      } catch (err: any) {
        clearTimeout(timeoutId);
        this.lastRequestEndTime = Date.now();

        if (this.isCancelled) {
          throw new Error('Operation cancelled by user');
        }

        const isAbort =
          err.name === 'AbortError' || err.message?.includes('aborted');
        const isTypeError = err.name === 'TypeError';

        if (isAbort) {
          consecutiveTimeouts++;
          this.recordServerFailure(
            serverUrl,
            'AbortError',
            `Client timeout after ${this.requestTimeoutSeconds + 30}s`
          );
          this.log(
            'warn',
            `[${stateLabel}] [AbortError] Request timed out after ${this.requestTimeoutSeconds + 30}s on ${serverHostname}.`,
            serverUrl
          );
        } else if (isTypeError) {
          this.recordServerFailure(
            serverUrl,
            'TypeError',
            `Network/CORS/Blocked (Failed to fetch): ${err.message}`
          );
          // Fail-Fast: Immediate failover on TypeError without waiting!
          this.log(
            'warn',
            `[${stateLabel}] [TypeError] Connection/CORS failed on ${serverHostname} ("${err.message}"). Switching to next server immediately with 0s wait...`,
            serverUrl
          );
        } else {
          this.recordServerFailure(serverUrl, 'HttpError', err.message || 'Unknown error');
          this.log(
            'error',
            `[${stateLabel}] [HttpError] Request error on ${serverHostname}: ${err.message}`,
            serverUrl
          );
        }

        if (consecutiveTimeouts >= 2) {
          return {
            elements: [],
            serverUsed: serverUrl,
            isTimedOut: true,
          };
        }

        // Fail-Fast: rotate to next server
        this.advanceServer();
        totalAttempts++;

        if (totalAttempts > this.maxRetries) {
          throw new Error(
            `Failed after ${this.maxRetries + 1} attempts across all servers. Last error: [${isTypeError ? 'TypeError' : isAbort ? 'AbortError' : 'HttpError'}] ${err.message}`
          );
        }

        // Apply backoff ONLY if full round of all servers completed or on timeouts
        if (isAbort || totalAttempts % serverPoolSize === 0) {
          serverCycleCount++;
          const backoffSec = 20 * Math.pow(2, serverCycleCount - 1);
          this.log(
            'info',
            `Full round of servers completed with errors. Backing off for ${backoffSec}s before next round...`
          );
          await this.sleepWithCountdown(
            backoffSec * 1000,
            `Round backoff (Attempt ${totalAttempts + 1})`
          );
        } else {
          // Immediate retry on next server (0s delay)!
          this.log(
            'info',
            `Fail-fast: trying next server ${new URL(this.getNextServerUrl()).hostname} immediately...`
          );
        }
      }
    }

    throw new Error(`Failed to complete query after ${this.maxRetries} retries.`);
  }
}
