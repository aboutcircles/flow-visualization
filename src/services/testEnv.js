// Thin client for the Circles test environment session API.
//
// A session pins a block: the test-env proxies inject `X-Max-Block-Number` server-side,
// so pointing the SDK's CirclesRpc at the session's `/rpc` proxy makes pathfinding (and
// the RPC reads it drives) resolve against that block. The `/anvil` proxy is a real
// Gnosis fork at the same block for on-chain execution.
//
// Configure with VITE_TEST_ENV_URL (defaults to staging). CORS defaults to "*" on the
// test-env, but a locked-down deployment must allow this app's origin.

export const TEST_ENV_URL = (
  import.meta.env.VITE_TEST_ENV_URL || 'https://rpc.staging.aboutcircles.com/test-env'
).replace(/\/+$/, '');

export const isTestEnvConfigured = () => Boolean(TEST_ENV_URL);

const sessionBase = (sessionId) => `${TEST_ENV_URL}/api/v1/session/${sessionId}`;

// One session per block number — the test-env enforces a global 10-session cap, so we
// must not spin up a fresh session per request. Cached by the promise so concurrent
// callers (findPath + execute-on-fork) share the same in-flight creation.
const sessionCache = new Map();

const createSession = async (blockNumber) => {
  const res = await fetch(`${TEST_ENV_URL}/api/v1/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      blockNumber: Number(blockNumber),
      features: ['rpc', 'anvil'],
      ttl: '30m',
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`test-env session create failed (${res.status})${text ? `: ${text}` : ''}`);
  }

  const data = await res.json();
  const sessionId = data?.sessionId || data?.SessionId;
  if (!sessionId) {
    throw new Error('test-env session response missing sessionId');
  }

  const base = sessionBase(sessionId);
  return {
    sessionId,
    blockNumber: Number(blockNumber),
    rpcUrl: `${base}/rpc`,
    pathfinderUrl: `${base}/pathfinder`,
    anvilUrl: `${base}/anvil`,
    accounts: data?.anvil?.accounts || [],
  };
};

/**
 * Get (or lazily create) a cached test-env session pinned to `blockNumber`.
 * Returns { sessionId, blockNumber, rpcUrl, pathfinderUrl, anvilUrl, accounts }.
 */
export const getTestEnvSession = (blockNumber) => {
  const key = String(blockNumber);
  let entry = sessionCache.get(key);
  if (!entry) {
    entry = createSession(blockNumber);
    // Drop failed creations so a later attempt can retry instead of caching the rejection.
    entry.catch(() => {
      if (sessionCache.get(key) === entry) sessionCache.delete(key);
    });
    sessionCache.set(key, entry);
  }
  return entry;
};

/**
 * POST a single JSON-RPC call to a session's Anvil fork. Throws on a JSON-RPC error,
 * attaching `.data` (revert bytes, if any) and `.code` for the caller to decode.
 */
export const anvilRpc = async (anvilUrl, method, params) => {
  const res = await fetch(anvilUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const data = await res.json().catch(() => ({}));
  if (data?.error) {
    const err = new Error(data.error.message || 'anvil JSON-RPC error');
    err.data = data.error.data;
    err.code = data.error.code;
    throw err;
  }
  return data?.result;
};

// Known Circles/OZ error selectors → human labels, so a fork revert reads clearly.
// (Mirrors the plugin's AnvilExecutionHelper.KnownErrorSelectors.)
const KNOWN_ERROR_SELECTORS = {
  '0x5e418dba': 'CirclesHubFlowEdgeIsNotPermitted',
  '0xc14c0700': 'CirclesAvatarMustBeRegistered',
  '0x03dee4c5': 'ERC1155InsufficientBalance',
  '0x57f447ce': 'ERC1155InvalidReceiver',
  '0x659c8c43': 'AmountExceedsCollateralLimit',
};

/**
 * Decode a revert into a short human label. Prefers a known selector match on the
 * revert bytes, falls back to the raw JSON-RPC message.
 */
export const decodeRevert = (err) => {
  const raw = typeof err?.data === 'string' ? err.data : null;
  if (raw && raw.length >= 10) {
    const selector = raw.slice(0, 10).toLowerCase();
    if (KNOWN_ERROR_SELECTORS[selector]) {
      return `${KNOWN_ERROR_SELECTORS[selector]} (${selector})`;
    }
    return `reverted (${selector})`;
  }
  return err?.message || 'reverted';
};
