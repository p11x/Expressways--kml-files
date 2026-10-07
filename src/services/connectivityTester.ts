import { ConnectivityTestResult } from '../types';

export function isRunningInIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top;
  } catch {
    return true;
  }
}

/**
 * Runs connectivity and CORS diagnostics on a single Overpass server
 */
export async function testServerConnectivity(
  serverUrl: string
): Promise<ConnectivityTestResult> {
  const result: ConnectivityTestResult = {
    server: serverUrl,
    statusTest: {
      status: 'http_error',
      latencyMs: 0,
    },
    queryTest: {
      status: 'http_error',
      latencyMs: 0,
    },
  };

  // Derive base URL (strip /api/interpreter if needed)
  let statusUrl = serverUrl;
  if (serverUrl.includes('/interpreter')) {
    statusUrl = serverUrl.replace(/\/interpreter\/?$/, '/status');
  } else {
    try {
      const u = new URL(serverUrl);
      statusUrl = `${u.origin}/api/status`;
    } catch {
      statusUrl = `${serverUrl}/status`;
    }
  }

  // --- Test (a): GET /api/status with CORS ---
  const startStatus = performance.now();
  try {
    const res = await fetch(statusUrl, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
    result.statusTest.latencyMs = Math.round(performance.now() - startStatus);
    result.statusTest.httpStatus = res.status;
    if (res.ok || res.status === 200) {
      result.statusTest.status = 'ok';
    } else {
      result.statusTest.status = 'http_error';
      result.statusTest.errorMessage = `HTTP ${res.status} ${res.statusText}`;
    }
  } catch (err: any) {
    result.statusTest.latencyMs = Math.round(performance.now() - startStatus);
    result.statusTest.errorName = err.name || 'Error';
    result.statusTest.errorMessage = err.message || String(err);

    // Test (c): Probe with no-cors to test reachability vs CORS blocking
    try {
      await fetch(statusUrl, {
        method: 'GET',
        mode: 'no-cors',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
      });
      // no-cors succeeded -> server reachable, but CORS header missing/blocked
      result.statusTest.status = 'cors_blocked';
      result.statusTest.errorMessage =
        'Server is reachable, but CORS is blocked for this origin.';
    } catch (noCorsErr: any) {
      // no-cors also threw -> network level blockage
      result.statusTest.status = 'network_blocked';
      result.statusTest.errorMessage =
        'Request blocked or no connection (check ad blockers, VPN, firewall, iframe sandbox, or offline).';
    }
  }

  // --- Test (b): POST tiny query [out:json][timeout:10];node(1);out; ---
  const tinyQuery = '[out:json][timeout:10];node(1);out;';
  const startQuery = performance.now();

  try {
    const res = await fetch(serverUrl, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: `data=${encodeURIComponent(tinyQuery)}`,
    });

    result.queryTest.latencyMs = Math.round(performance.now() - startQuery);
    result.queryTest.httpStatus = res.status;

    if (res.ok) {
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        if (json && Array.isArray(json.elements)) {
          result.queryTest.status = 'ok';
        } else {
          result.queryTest.status = 'http_error';
          result.queryTest.errorMessage = 'Unexpected response format';
        }
      } catch {
        result.queryTest.status = 'http_error';
        result.queryTest.errorMessage = 'Invalid JSON in tiny query response';
      }
    } else {
      result.queryTest.status = 'http_error';
      result.queryTest.errorMessage = `HTTP ${res.status} ${res.statusText}`;
    }
  } catch (err: any) {
    result.queryTest.latencyMs = Math.round(performance.now() - startQuery);
    result.queryTest.errorName = err.name || 'Error';
    result.queryTest.errorMessage = err.message || String(err);

    if (result.statusTest.status === 'cors_blocked') {
      result.queryTest.status = 'cors_blocked';
      result.queryTest.errorMessage =
        'CORS preflight or origin header rejected by server.';
    } else {
      result.queryTest.status = 'network_blocked';
      result.queryTest.errorMessage =
        'Connection dropped or blocked before response received.';
    }
  }

  return result;
}

/**
 * Runs connectivity test across all configured servers in parallel
 */
export async function runAllConnectivityTests(
  servers: string[]
): Promise<ConnectivityTestResult[]> {
  const promises = servers.map((srv) => testServerConnectivity(srv));
  return await Promise.all(promises);
}
