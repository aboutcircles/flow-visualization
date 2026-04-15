/**
 * Test Environment session management for historical pathfinding.
 *
 * Creates and manages sessions against the Circles test environment,
 * which proxies RPC calls with X-Max-Block-Number for block-filtered queries.
 *
 * Note: Post-pathfinding enrichment (token info, profiles, balances) still
 * uses production endpoints — historical path data is correct, but displayed
 * metadata reflects current state. This is a known v1 limitation.
 */

import { DEFAULT_TEST_ENV_URL } from './circlesApi';

let activeSession = null;

/**
 * Creates a test-env session at the given block number.
 * Reuses existing session if same block and not expired.
 */
export async function getOrCreateSession(testEnvUrl, blockNumber) {
  const baseUrl = resolveBaseUrl(testEnvUrl);
  const numBlock = Number(blockNumber);

  // Reuse if same block and not expired
  if (activeSession
    && activeSession.baseUrl === baseUrl
    && activeSession.blockNumber === numBlock
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
      blockNumber: numBlock,
      features: ['db', 'rpc'],
      ttl: '30m'
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create test-env session: ${response.status} — ${error}`);
  }

  const session = await response.json();

  if (!session.sessionId) {
    throw new Error('Server returned session without sessionId');
  }

  // Explicitly construct — don't spread unknown server fields
  activeSession = {
    sessionId: session.sessionId,
    baseUrl,
    blockNumber: numBlock,
    expiresAt: new Date(session.expiresAt),
    rpcProxyUrl: `${baseUrl}/api/v1/session/${session.sessionId}/rpc`,
    status: session.status,
  };

  return activeSession;
}

/**
 * Destroys the active session.
 */
export async function destroySession() {
  if (!activeSession) return;

  const { baseUrl, sessionId } = activeSession;
  activeSession = null;

  try {
    await fetch(`${baseUrl}/api/v1/session/${sessionId}`, { method: 'DELETE' });
  } catch {
    // Ignore cleanup errors — session will expire via TTL
  }
}

/**
 * Gets the active session info (or null if expired/missing).
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
  const baseUrl = resolveBaseUrl(testEnvUrl);
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
  const baseUrl = resolveBaseUrl(testEnvUrl);
  const response = await fetch(`${baseUrl}/api/v1/blocks/current`);
  if (!response.ok) throw new Error('Failed to get latest block');
  const data = await response.json();
  return data?.blockNumber;
}

/**
 * Gets the health status of the test-env.
 */
export async function getTestEnvHealth(testEnvUrl) {
  const baseUrl = resolveBaseUrl(testEnvUrl);
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function resolveBaseUrl(testEnvUrl) {
  return (testEnvUrl || DEFAULT_TEST_ENV_URL).replace(/\/$/, '');
}
