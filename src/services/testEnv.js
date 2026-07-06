import { decodeAbiParameters } from 'viem';

// Thin client for the Circles test environment session API.
//
// A session pins a block: the test-env proxies inject `X-Max-Block-Number` server-side,
// so pointing the SDK's CirclesRpc at the session's `/rpc` proxy makes pathfinding (and
// the RPC reads it drives) resolve against that block. The `/anvil` proxy is a real
// Gnosis fork at the same block for on-chain execution.
//
// Configure with VITE_TEST_ENV_URL (defaults to staging). CORS defaults to "*" on the
// test-env, but a locked-down deployment must allow this app's origin.

// No default on purpose: time-travel is OFF unless VITE_TEST_ENV_URL is explicitly set.
// This keeps the feature disabled on the public GitHub Pages build (which sets no env),
// so anonymous visitors can't create test-env sessions and exhaust the global session cap.
// Internal/local builds opt in via .env.local (see .env.example).
export const TEST_ENV_URL = (import.meta.env.VITE_TEST_ENV_URL || '').replace(/\/+$/, '');

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

// A genuine EVM revert (vs an infra/transport error) carries revert bytes in `data`, a
// "revert" message, or the standard revert code 3. Everything else — HTTP 5xx, timeouts,
// -32603/-32000 internal errors, expired sessions, network failures — is infra and must
// NOT be presented to the user as a contract revert.
const isRevertError = (error) => {
  const hasRevertData =
    typeof error?.data === 'string' && error.data.startsWith('0x') && error.data.length > 2;
  const msg = (error?.message || '').toLowerCase();
  return hasRevertData || msg.includes('revert') || error?.code === 3;
};

/**
 * POST a single JSON-RPC call to a session's Anvil fork. Throws on any failure, tagging the
 * error `.kind`: 'revert' for a genuine contract revert (carries `.data`/`.code`), else
 * 'infra' (network / HTTP / non-JSON / timeout / missing result) so callers never mistake
 * an infra failure for an on-chain revert.
 */
export const anvilRpc = async (anvilUrl, method, params) => {
  let res;
  try {
    res = await fetch(anvilUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
  } catch (netErr) {
    const e = new Error(`could not reach the fork: ${netErr?.message || netErr}`);
    e.kind = 'infra';
    throw e;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const e = new Error(`fork proxy returned HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`);
    e.kind = 'infra';
    throw e;
  }

  let data;
  try {
    data = await res.json();
  } catch {
    const e = new Error('fork returned a non-JSON response');
    e.kind = 'infra';
    throw e;
  }

  if (data?.error) {
    const err = new Error(data.error.message || 'anvil JSON-RPC error');
    err.data = data.error.data;
    err.code = data.error.code;
    err.kind = isRevertError(data.error) ? 'revert' : 'infra';
    throw err;
  }
  if (data.result === undefined) {
    const e = new Error('fork returned no result');
    e.kind = 'infra';
    throw e;
  }
  return data.result;
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
    // Standard Error(string) — decode the human-readable reason (e.g. a Safe "GS0xx" code).
    if (selector === '0x08c379a0') {
      try {
        const [message] = decodeAbiParameters([{ type: 'string' }], `0x${raw.slice(10)}`);
        if (message) return `"${message}"`;
      } catch {
        // fall through to the raw selector
      }
    }
    return `reverted (${selector})`;
  }
  return err?.message || 'reverted';
};
