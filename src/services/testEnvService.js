/**
 * Test Environment session management for historical pathfinding.
 *
 * Creates and manages sessions against the Circles test environment,
 * which proxies RPC calls with X-Max-Block-Number for block-filtered queries.
 */

const DEFAULT_TEST_ENV_URL = 'https://staging.circlesubi.network/test-env';

let activeSession = null;
let sessionTimer = null;

/**
 * Creates a test-env session at the given block number.
 * Reuses existing session if same block and not expired.
 */
export async function getOrCreateSession(testEnvUrl, blockNumber) {
  const baseUrl = (testEnvUrl || DEFAULT_TEST_ENV_URL).replace(/\/$/, '');

  // Reuse if same block and not expired
  if (activeSession
    && activeSession.baseUrl === baseUrl
    && activeSession.blockNumber === blockNumber
    && activeSession.expiresAt > new Date()) {
    return activeSession;
  }

  // Clean up old session
  if (activeSession) {
    await destroySession().catch(() => {});
  }

  const response = await fetch(`${baseUrl}/api/v1/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blockNumber: Number(blockNumber),
      features: ['db', 'rpc'],
      ttl: '30m'
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create test-env session: ${response.status} — ${error}`);
  }

  const session = await response.json();

  activeSession = {
    ...session,
    baseUrl,
    blockNumber: Number(blockNumber),
    expiresAt: new Date(session.expiresAt),
    rpcProxyUrl: `${baseUrl}/api/v1/session/${session.sessionId}/rpc`
  };

  return activeSession;
}

/**
 * Sends a JSON-RPC request through the test-env RPC proxy.
 * The proxy adds X-Max-Block-Number header automatically.
 */
export async function sendRpcRequest(method, params) {
  if (!activeSession) {
    throw new Error('No active test-env session');
  }

  const response = await fetch(activeSession.rpcProxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Test-env RPC error: ${response.status} — ${error}`);
  }

  return response.json();
}

/**
 * Destroys the active session.
 */
export async function destroySession() {
  if (!activeSession) return;

  const { baseUrl, sessionId } = activeSession;
  activeSession = null;

  if (sessionTimer) {
    clearInterval(sessionTimer);
    sessionTimer = null;
  }

  try {
    await fetch(`${baseUrl}/api/v1/session/${sessionId}`, { method: 'DELETE' });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Gets the active session info (or null).
 */
export function getActiveSession() {
  if (activeSession && activeSession.expiresAt <= new Date()) {
    activeSession = null;
  }
  return activeSession;
}

/**
 * Checks if a block number exists in the test-env database.
 */
export async function checkBlockExists(testEnvUrl, blockNumber) {
  const baseUrl = (testEnvUrl || DEFAULT_TEST_ENV_URL).replace(/\/$/, '');
  try {
    const response = await fetch(`${baseUrl}/api/v1/blocks/${blockNumber}/exists`);
    if (!response.ok) return false;
    const data = await response.json();
    return data?.exists === true;
  } catch {
    return false;
  }
}

/**
 * Gets the latest indexed block from the test-env.
 */
export async function getLatestBlock(testEnvUrl) {
  const baseUrl = (testEnvUrl || DEFAULT_TEST_ENV_URL).replace(/\/$/, '');
  const response = await fetch(`${baseUrl}/api/v1/blocks/current`);
  if (!response.ok) throw new Error('Failed to get latest block');
  const data = await response.json();
  return data?.blockNumber;
}

/**
 * Gets the health status of the test-env.
 */
export async function getTestEnvHealth(testEnvUrl) {
  const baseUrl = (testEnvUrl || DEFAULT_TEST_ENV_URL).replace(/\/$/, '');
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}
