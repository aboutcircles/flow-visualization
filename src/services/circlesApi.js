import { CirclesData, CirclesRpc as LegacyCirclesRpc } from "@circles-sdk/data";
import { Profiles } from "@circles-sdk/profiles";
import { CirclesRpc } from "@aboutcircles/sdk-rpc";
import {
  createFlowMatrix,
  getTokenInfoMapFromPath,
  getWrappedTokensFromPath,
  replaceWrappedTokensWithAvatars,
} from "@aboutcircles/sdk-pathfinder";
import { encodeFunctionData, concatHex } from 'viem';
import cacheService from './cacheService';
import { getTestEnvSession, anvilRpc, decodeRevert, isTestEnvConfigured } from './testEnv';

export const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || 'https://rpc.aboutcircles.com/';
export const STAGING_ENDPOINT = import.meta.env.VITE_STAGING_ENDPOINT || 'https://rpc.staging.aboutcircles.com/';

// Positive integer block number from form input, or null (→ live/head).
export const parseBlockNumber = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const fetchTokenBalancesForAddress = async (address) => {
  const res = await fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'circles_getTokenBalances',
      params: [address]
    })
  });

  if (!res.ok) {
    throw new Error(`Token balances request failed with status ${res.status}`);
  }

  const data = await res.json();
  if (data?.error) {
    throw new Error(data.error.message || 'RPC error while fetching token balances');
  }

  return Array.isArray(data?.result) ? data.result : [];
};


export const createCirclesClients = () => {
  const legacyRpc = new LegacyCirclesRpc(API_ENDPOINT);
  const circlesData = new CirclesData(legacyRpc);
  const circlesProfiles = new Profiles(API_ENDPOINT + "profiles/");
  const sdkRpc = new CirclesRpc(API_ENDPOINT);

  return {
    circlesRpc: legacyRpc,
    circlesData,
    circlesProfiles,
    sdkRpc
  };
};

export const parseAddressList = (addressString) => {
  if (!addressString) return [];

  return addressString
    .split(/[\s,]+/)
    .map(addr => addr.trim())
    .filter(addr => addr && addr.startsWith('0x'));
};

const parseJsonArray = (jsonText, fallback = []) => {
  if (!jsonText || !jsonText.trim()) return fallback;
  try {
    const parsed = JSON.parse(jsonText);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const normalizeAddress = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const dedupeAddresses = (addresses) => Array.from(new Set(addresses.map(normalizeAddress).filter(Boolean)));

const toValidUint = (value) => {
  try {
    const parsed = BigInt(value);
    return parsed >= 0n ? parsed : null;
  } catch {
    return null;
  }
};

const stringifyBigInts = (value) => {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(stringifyBigInts);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, stringifyBigInts(nested)])
    );
  }
  return value;
};

export const ethToWei = (crcAmount) => {
  try {
    if (!crcAmount || isNaN(crcAmount)) return '0';

    const [whole, fraction = ''] = crcAmount.toString().split('.');
    const decimals = fraction.padEnd(18, '0').slice(0, 18); // Ensure we don't exceed 18 decimals
    const wei = whole + decimals;
    return BigInt(wei).toString();
  } catch (error) {
    console.error('Error converting ETH to Wei:', error);
    return '0';
  }
};

export const findPath = async (formData, sdkRpc) => {
  // Endpoint precedence: block-pinned test-env session > staging toggle > default (head).
  // A pinned session routes RPC (and thus circlesV2_findPath → pathfinder) through the
  // proxy that injects X-Max-Block-Number, so the path resolves against that past block.
  const blockNumber = parseBlockNumber(formData.BlockNumber);
  let rpc;
  if (blockNumber && isTestEnvConfigured()) {
    const session = await getTestEnvSession(blockNumber);
    rpc = new CirclesRpc(session.rpcUrl);
  } else if (formData.UseStaging) {
    rpc = new CirclesRpc(STAGING_ENDPOINT);
  } else {
    rpc = sdkRpc;
  }
  try {
    // Include and exclude can coexist when quick-filter sends both
    const fromTokensArray = formData.IsFromTokensExcluded
      ? [] : parseAddressList(formData.FromTokens);
    const excludedFromTokensArray = parseAddressList(formData.ExcludedFromTokens);
    const toTokensArray = formData.IsToTokensExcluded
      ? [] : parseAddressList(formData.ToTokens);
    const excludedToTokensArray = parseAddressList(formData.ExcludedToTokens);

    const simulatedBalances = parseJsonArray(formData.SimulatedBalances)
      .map((entry) => {
        const holder = normalizeAddress(entry?.holder);
        const token = normalizeAddress(entry?.token);
        const amount = toValidUint(entry?.amount);

        if (!holder || !token || amount === null) return null;
        return {
          holder,
          token,
          amount,
          isWrapped: entry?.isWrapped === true,
          isStatic: entry?.isStatic === true,
        };
      })
      .filter(Boolean);

    const simulatedTrusts = parseJsonArray(formData.SimulatedTrusts)
      .map((entry) => {
        const truster = normalizeAddress(entry?.truster);
        const trustee = normalizeAddress(entry?.trustee);

        if (!truster || !trustee) return null;
        return { truster, trustee };
      })
      .filter(Boolean);

    const simulatedConsentedAvatars = dedupeAddresses(
      parseAddressList(formData.SimulatedConsentedAvatars)
    );

    const params = {
      from: normalizeAddress(formData.From),
      to: normalizeAddress(formData.To),
      targetFlow: BigInt(formData.Amount),
      useWrappedBalances: formData.WithWrap,
      quantizedMode: formData.QuantizedMode === true,
      debugShowIntermediateSteps: formData.DebugShowIntermediateSteps === true,
    };

    if (fromTokensArray.length > 0) params.fromTokens = fromTokensArray;
    if (toTokensArray.length > 0) params.toTokens = toTokensArray;
    if (excludedFromTokensArray.length > 0) params.excludeFromTokens = excludedFromTokensArray;
    if (excludedToTokensArray.length > 0) params.excludeToTokens = excludedToTokensArray;

    // Include MaxTransfers parameter if set
    if (formData.MaxTransfers) {
      params.maxTransfers = Number(formData.MaxTransfers);
    }

    if (simulatedBalances.length > 0) params.simulatedBalances = simulatedBalances;
    if (simulatedTrusts.length > 0) params.simulatedTrusts = simulatedTrusts;
    if (simulatedConsentedAvatars.length > 0) params.simulatedConsentedAvatars = simulatedConsentedAvatars;

    console.log('SDK findPath params:', params);

    const result = await rpc.pathfinder.findPath(params);

    // SDK returns bigints — convert to strings for backward compatibility,
    // including optional debug/simulation payloads.
    return stringifyBigInts(result);
  } catch (err) {
    console.error('SDK findPath error:', err);
    throw err;
  }
};

/**
 * Execute a pathfinder-computed operateFlowMatrix call on the session's Anvil fork of the
 * pinned block and report whether it reverts. Uses eth_call from the flow source (no
 * signature needed on a fork); the fork state matches the block the path was computed at,
 * so a revert means the pathfinder produced a path that would fail on-chain.
 * Returns { success, gasUsed?, revertReason? }.
 */
export const executeFlowMatrixOnFork = async ({ blockNumber, source, hubAddress, calldata }) => {
  const block = parseBlockNumber(blockNumber);
  if (!block) throw new Error('A positive block number is required to execute on the fork.');
  if (!source || !hubAddress || !calldata) throw new Error('Missing source, hub address, or calldata.');

  const session = await getTestEnvSession(block);
  const tx = { from: source, to: hubAddress, data: calldata };

  try {
    await anvilRpc(session.anvilUrl, 'eth_call', [tx, 'latest']);
  } catch (err) {
    // Only a genuine contract revert is a "would-fail-on-chain" signal. Infra failures
    // (network, HTTP, timeout, expired session) are rethrown so the UI shows "couldn't
    // run" rather than a misleading revert that looks like a pathfinder bug.
    if (err?.kind === 'revert') {
      return { success: false, revertReason: decodeRevert(err) };
    }
    throw err;
  }

  // Succeeded — best-effort gas estimate for display (never fail the result on this).
  let gasUsed = null;
  try {
    const gasHex = await anvilRpc(session.anvilUrl, 'eth_estimateGas', [tx]);
    gasUsed = gasHex ? BigInt(gasHex).toString() : null;
  } catch {
    // gas is informational only
  }
  return { success: true, gasUsed };
};

export const processPath = async (rawPath, sourceAddress) => {
  // Re-parse values to bigints for SDK processing
  const pathWithBigInts = {
    maxFlow: BigInt(rawPath.maxFlow),
    transfers: rawPath.transfers.map(t => ({
      ...t,
      value: BigInt(t.value),
    })),
  };

  const tokenInfoMap = await getTokenInfoMapFromPath(sourceAddress, API_ENDPOINT, pathWithBigInts);
  const wrappedTokensInPath = getWrappedTokensFromPath(pathWithBigInts, tokenInfoMap);
  const hasWrappedTokens = Object.keys(wrappedTokensInPath).length > 0;

  let processed = pathWithBigInts;
  if (hasWrappedTokens) {
    processed = replaceWrappedTokensWithAvatars(processed, tokenInfoMap);
  }

  // Convert back to strings for visualization
  return {
    maxFlow: processed.maxFlow.toString(),
    transfers: processed.transfers.map(t => ({
      ...t,
      value: t.value.toString(),
    })),
    _meta: {
      hasWrappedTokens,
      wrappedTokenCount: Object.keys(wrappedTokensInPath).length,
      tokenInfoMap: Object.fromEntries(tokenInfoMap),
    },
  };
};

// Optimized version - only fetch what we need
export const fetchTokenInfo = async (circlesData, transfers, useCache = true) => {
  if (!transfers || transfers.length === 0) return { wrapped: [], tokenInfo: {} };

  try {
    const getTransferTokenKey = (transfer) =>
      (transfer.token || transfer.tokenAddress || transfer.tokenOwner || '').toLowerCase();

    const tokenOwners = Array.from(
      new Set(transfers.map(getTransferTokenKey).filter(Boolean))
    );

    console.log('Fetching token info for tokens:', tokenOwners);

    // Check cache first
    let tokenInfoMap = {};
    let wrapped = [];
    let missing = [];
    
    if (useCache) {
      for (const token of tokenOwners) {
        const cached = cacheService.get('tokenInfo', token);
        if (cached) {
          tokenInfoMap[token] = cached;
          if (cached.isWrapped || cached.type?.includes('ERC20Wrapper')) {
            wrapped.push(token);
          }
        } else {
          missing.push(token);
        }
      }
      
      // If all found in cache, return immediately
      if (missing.length === 0) {
        console.log('All token info found in cache');
        return { wrapped, tokenInfo: tokenInfoMap };
      }
    } else {
      missing = tokenOwners;
    }

    console.log('Missing token info for:', missing);

    // For missing tokens, we need to get balance data from just one account that holds each token
    // Create a map of token -> account that holds it
    const tokenToAccount = {};
    for (const transfer of transfers) {
      const token = getTransferTokenKey(transfer);
      if (missing.includes(token) && !tokenToAccount[token]) {
        // Use the from address as it should have the token
        tokenToAccount[token] = transfer.from.toLowerCase();
      }
    }

    // Get unique accounts we need to query
    const accountsToQuery = Array.from(new Set(Object.values(tokenToAccount)));
    
    // Fetch balances only for necessary accounts (unbatched RPC calls)
    for (let i = 0; i < accountsToQuery.length; i += 50) {
      const slice = accountsToQuery.slice(i, i + 50);
      try {
        const responses = await Promise.all(
          slice.map(async (addr) => {
            try {
              const result = await fetchTokenBalancesForAddress(addr);
              return { addr, result };
            } catch (error) {
              console.error('Failed to fetch token info for address:', addr, error);
              return { addr, result: [] };
            }
          })
        );

        responses.forEach(({ result }) => {
          // Extract token info from balance results
          result.forEach((balanceEntry) => {
            const tokenAddr = balanceEntry.tokenAddress.toLowerCase();

            // Only store info for tokens we're looking for
            if (missing.includes(tokenAddr) && !tokenInfoMap[tokenAddr]) {
              const info = {
                token: tokenAddr,
                type: balanceEntry.tokenType,
                isWrapped: balanceEntry.isWrapped,
                version: balanceEntry.version,
                isInflationary: balanceEntry.isInflationary
              };

              tokenInfoMap[tokenAddr] = info;

              // Cache the token info
              if (useCache) {
                const ttl = cacheService.getTTLByType('tokenInfo');
                cacheService.set('tokenInfo', tokenAddr, info, ttl);
              }

              // Check if it's a wrapped token
              if (balanceEntry.isWrapped ||
                  balanceEntry.tokenType?.includes('ERC20Wrapper')) {
                wrapped.push(tokenAddr);
              }
            }
          });
        });
      } catch (error) {
        console.error('Error fetching token info chunk:', error);
      }
    }

    console.log('Wrapped tokens found:', wrapped);
    console.log('Token info map:', tokenInfoMap);

    return { wrapped, tokenInfo: tokenInfoMap };
  } catch (error) {
    console.error('Error fetching token info:', error);
    return { wrapped: [], tokenInfo: {} };
  }
};

// Optimized to fetch token info along with balances
export const fetchTokenBalancesWithInfo = async (addresses, transfers) => {
  if (!addresses || addresses.length === 0) return { balances: {}, tokenInfo: {}, wrapped: [] };
  
  try {
    const getTransferTokenKey = (transfer) =>
      (transfer.token || transfer.tokenAddress || transfer.tokenOwner || '').toLowerCase();

    const uniqueAddresses = Array.from(new Set(addresses.map(addr => addr.toLowerCase())));
    const balancesByAccount = {};
    const tokenInfoMap = {};
    const wrapped = [];
    
    // Get tokens we need info for
    const tokenOwners = new Set(transfers.map(getTransferTokenKey).filter(Boolean));

    for (let i = 0; i < uniqueAddresses.length; i += 50) {
      const slice = uniqueAddresses.slice(i, i + 50);
      const responses = await Promise.all(
        slice.map(async (address) => {
          try {
            const result = await fetchTokenBalancesForAddress(address);
            return { address, result };
          } catch (error) {
            console.error('Failed to fetch balances for address:', address, error);
            return { address, result: [] };
          }
        })
      );

      responses.forEach(({ address, result }) => {
        const account = address.toLowerCase();
        const map = {};

        result.forEach((row) => {
          const tokenKey = row.tokenAddress.toLowerCase();
          map[tokenKey] = {
            crc: Number(row.circles || 0),
            atto: BigInt(row.attoCircles || row.attoCrc || '0')
          };
          
          // Extract token info if we need it
          if (tokenOwners.has(tokenKey) && !tokenInfoMap[tokenKey]) {
            const info = {
              token: tokenKey,
              type: row.tokenType,
              isWrapped: row.isWrapped,
              version: row.version,
              isInflationary: row.isInflationary
            };
            
            tokenInfoMap[tokenKey] = info;
            
            if (row.isWrapped || row.tokenType?.includes('ERC20Wrapper')) {
              wrapped.push(tokenKey);
            }
          }
        });

        balancesByAccount[account] = map;
      });
    }

    return { balances: balancesByAccount, tokenInfo: tokenInfoMap, wrapped };
  } catch (error) {
    console.error('Error fetching token balances:', error);
    return { balances: {}, tokenInfo: {}, wrapped: [] };
  }
};

export const fetchProfiles = async (circlesProfiles, addresses, useCache = true) => {
  if (!addresses || addresses.length === 0) return {};
  
  try {
    const uniqueAddresses = Array.from(new Set(addresses.map(addr => addr.toLowerCase())));
    
    let toFetch = uniqueAddresses;
    let cachedProfiles = {};
    
    if (useCache) {
      const { results, missing } = cacheService.getBatch('profile', uniqueAddresses);
      cachedProfiles = results;
      toFetch = missing;
    }
    
    const profilesMap = { ...cachedProfiles };
    
    if (toFetch.length > 0) {
      const batches = [];
      for (let i = 0; i < toFetch.length; i += 50) {
        batches.push(toFetch.slice(i, i + 50));
      }

      for (const batch of batches) {
        const profiles = await circlesProfiles.searchByAddresses(batch, {fetchComplete: true});
        
        const batchMap = {};
        profiles.forEach(profile => {
          const addr = profile.address.toLowerCase();
          profilesMap[addr] = profile;
          batchMap[addr] = profile;
        });
        
        // Cache the batch results
        if (useCache) {
          const ttl = cacheService.getTTLByType('profile');
          cacheService.setBatch('profile', batchMap, ttl);
        }
      }
    }

    return profilesMap;
  } catch (error) {
    console.error('Error fetching profiles:', error);
    return {};
  }
};

export const fetchTokenBalances = fetchTokenBalancesWithInfo;

export const fetchAddressTokenBalances = async (address, useCache = true) => {
  if (!address) return [];

  const normalizedAddress = address.toLowerCase();
  const cacheKey = normalizedAddress;

  if (useCache) {
    const cached = cacheService.get('sourceBalances', cacheKey);
    if (cached) return cached;
  }

  try {
    const rows = await fetchTokenBalancesForAddress(normalizedAddress);

    if (useCache) {
      const ttl = cacheService.getTTLByType('tokenInfo');
      cacheService.set('sourceBalances', cacheKey, rows, ttl);
    }

    return rows;
  } catch (error) {
    console.error('Error fetching source token balances:', error);
    throw error;
  }
};

export const fetchSinkTrustAvatars = async (sinkAddress, sdkRpc) => {
  if (!sinkAddress || !sdkRpc?.trust?.getTrusts) return [];

  try {
    const trustRelations = await sdkRpc.trust.getTrusts(sinkAddress);
    const seen = new Set();

    return trustRelations
      .map((relation) => ({
        tokenAddress: relation?.objectAvatar?.toLowerCase?.() || '',
        tokenOwner: relation?.objectAvatar?.toLowerCase?.() || '',
        relation: relation?.relation || 'trusts',
        timestamp: relation?.timestamp || null,
      }))
      .filter((row) => {
        if (!row.tokenAddress || seen.has(row.tokenAddress)) return false;
        seen.add(row.tokenAddress);
        return true;
      });
  } catch (error) {
    console.error('Error fetching sink trust avatars:', error);
    throw error;
  }
};

const HUB_ABI_MIN = [
  {
    type: 'function',
    name: 'operateFlowMatrix',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_flowVertices', type: 'address[]' },
      {
        name: '_flow',
        type: 'tuple[]',
        components: [
          { name: 'streamSinkId', type: 'uint16' },
          { name: 'amount', type: 'uint192' },
        ]
      },
      {
        name: '_streams',
        type: 'tuple[]',
        components: [
          { name: 'sourceCoordinate', type: 'uint16' },
          { name: 'flowEdgeIds', type: 'uint16[]' },
          { name: 'data', type: 'bytes' },
        ]
      },
      { name: '_packedCoordinates', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'wrap',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_avatar', type: 'address' },
      { name: '_amount', type: 'uint256' },
      { name: '_type', type: 'uint8' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setApprovalForAll',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
];

const WRAPPER_ABI_MIN = [
  {
    type: 'function',
    name: 'unwrap',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_amount', type: 'uint256' }],
    outputs: [],
  },
];

const SAFE_ABI_MIN = [
  {
    type: 'function',
    name: 'execTransaction',
    stateMutability: 'payable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'operation', type: 'uint8' },
      { name: 'safeTxGas', type: 'uint256' },
      { name: 'baseGas', type: 'uint256' },
      { name: 'gasPrice', type: 'uint256' },
      { name: 'gasToken', type: 'address' },
      { name: 'refundReceiver', type: 'address' },
      { name: 'signatures', type: 'bytes' },
    ],
    outputs: [{ name: 'success', type: 'bool' }],
  },
];

const MULTISEND_ABI_MIN = [
  {
    type: 'function',
    name: 'multiSend',
    stateMutability: 'payable',
    inputs: [{ name: 'transactions', type: 'bytes' }],
    outputs: [],
  },
];

const getTokenType = (info) => (info?.tokenType || info?.type || '');

const isWrapperInfo = (info) => {
  if (!info) return false;
  const tokenType = getTokenType(info);
  return !!(info.isWrapped || tokenType.startsWith('CrcV2_ERC20WrapperDeployed') || tokenType.includes('ERC20Wrapper'));
};

const isStaticWrapperInfo = (info) => {
  if (!isWrapperInfo(info)) return false;
  const tokenType = getTokenType(info);
  return info.isInflationary === true || tokenType.includes('Inflationary');
};

const isDemurragedWrapperInfo = (info) => {
  if (!isWrapperInfo(info)) return false;
  return !isStaticWrapperInfo(info);
};

const getTransferTokenCandidates = (transfer) => {
  const candidates = [transfer?.tokenOwner, transfer?.token, transfer?.tokenAddress]
    .map((value) => (typeof value === 'string' ? value.toLowerCase() : ''))
    .filter(Boolean);
  return Array.from(new Set(candidates));
};

const toHex32 = (value) => value.toString(16).padStart(64, '0');

const asHexData = (value) => {
  if (!value) return '0x';
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) {
    return `0x${Array.from(value).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  }
  return '0x';
};

const encodeMultiSendTransactions = (calls) => {
  const chunks = calls.map((call) => {
    const to = call.to.toLowerCase().replace(/^0x/, '').padStart(40, '0');
    const data = (call.data || '0x').replace(/^0x/, '');
    const operation = '00';
    const value = toHex32(0n);
    const dataLength = toHex32(BigInt(data.length / 2));
    return `${operation}${to}${value}${dataLength}${data}`;
  });
  return `0x${chunks.join('')}`;
};

const buildPreValidatedSignature = (owner) => {
  const normalized = owner?.toLowerCase();
  const ownerWord = `0x${(normalized || '').replace(/^0x/, '').padStart(64, '0')}`;
  return concatHex([
    ownerWord,
    '0x0000000000000000000000000000000000000000000000000000000000000000',
    '0x01'
  ]);
};

const hexByteLength = (hex) => {
  if (!hex || typeof hex !== 'string') return 0;
  const normalized = hex.startsWith('0x') ? hex.slice(2) : hex;
  return Math.floor(normalized.length / 2);
};

const getCallLabel = (call, hubAddress) => {
  const to = (call?.to || '').toLowerCase();
  const data = (call?.data || '').toLowerCase();
  const selector = data.slice(0, 10);

  if (to === (hubAddress || '').toLowerCase()) {
    if (selector === '0xa9059cbb') return 'erc20.transfer';
    if (selector === '0xe985e9c5') return 'setApprovalForAll';
    if (selector === '0x3748f953') return 'operateFlowMatrix';
    if (selector === '0xea598cb0') return 'wrap';
  }

  if (selector === '0xde0e9a3e') return 'unwrap';
  return 'unknown';
};

export const buildSafeFlowMatrixSimulationTx = async ({
  pathData,
  sender,
  receiver,
  signer,
  hubAddress,
  multisendAddress = '0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761',
  rpcUrl = API_ENDPOINT,
}) => {
  if (!pathData?.transfers?.length) throw new Error('No transfers available to simulate.');
  if (!sender || !receiver) throw new Error('Sender and receiver are required for simulation.');
  if (!signer) throw new Error('Connected signer address is required for simulation.');

  const source = sender.toLowerCase();
  const sink = receiver.toLowerCase();
  const normalizedSigner = signer.toLowerCase();
  if (!hubAddress) throw new Error('Hub contract address is required for simulation.');
  const hub = hubAddress.toLowerCase();
  const logLines = [];
  const log = (line = '') => {
    logLines.push(line);
  };

  log(`Simulation context: sender/safe=${source}, receiver=${sink}, signer=${normalizedSigner}`);

  const pathWithBigInts = {
    maxFlow: BigInt(pathData.maxFlow),
    transfers: pathData.transfers.map((transfer) => ({
      ...transfer,
      from: transfer.from.toLowerCase(),
      to: transfer.to.toLowerCase(),
      tokenOwner: (transfer.tokenOwner || transfer.token || transfer.tokenAddress || '').toLowerCase(),
      token: (transfer.token || '').toLowerCase(),
      tokenAddress: (transfer.tokenAddress || '').toLowerCase(),
      value: BigInt(transfer.value),
    })),
  };

  const tokenInfoMap = await getTokenInfoMapFromPath(source, rpcUrl, pathWithBigInts);
  log(`The path contains ${pathWithBigInts.transfers.length} transfers with a total flow of (demurraged: ${pathWithBigInts.maxFlow}) over ${tokenInfoMap.size} different token owners.`);

  const resolveTokenInfo = (transfer) => {
    const candidates = getTransferTokenCandidates(transfer);
    for (const key of candidates) {
      const info = tokenInfoMap.get(key);
      if (info) return { info, key };
    }
    return { info: undefined, key: undefined };
  };

  const senderEdges = pathWithBigInts.transfers.filter((transfer) => transfer.from === source);
  const wrappedSenderEdges = senderEdges
    .map((transfer) => ({
      transfer,
      ...resolveTokenInfo(transfer),
    }))
    .filter(({ info }) => isWrapperInfo(info));
  log(`The path contains ${wrappedSenderEdges.length} wrapped edges originating from the sender.`);

  if (wrappedSenderEdges.length === 0 && senderEdges.length > 0) {
    const diagnostics = senderEdges
      .slice(0, 8)
      .map((transfer) => {
        const candidates = getTransferTokenCandidates(transfer);
        const resolvedType = candidates
          .map((key) => `${key}:${getTokenType(tokenInfoMap.get(key)) || 'unknown'}`)
          .join(', ');
        return `    - token candidates [${candidates.join(', ')}] => ${resolvedType || 'no candidates'}`;
      });
    log('  Sender edge diagnostics (first 8):');
    diagnostics.forEach((line) => log(line));
  }

  const staticByWrapper = {};
  const demurragedByWrapper = {};

  wrappedSenderEdges.forEach(({ transfer, info, key }) => {
    const wrapperKey = (key || transfer.tokenOwner || '').toLowerCase();
    if (!wrapperKey) return;
    if (isStaticWrapperInfo(info)) {
      staticByWrapper[wrapperKey] = (staticByWrapper[wrapperKey] || 0n) + transfer.value;
    }
    if (isDemurragedWrapperInfo(info)) {
      demurragedByWrapper[wrapperKey] = (demurragedByWrapper[wrapperKey] || 0n) + transfer.value;
    }
  });

  const staticEntries = Object.entries(staticByWrapper);
  const demurragedEntries = Object.entries(demurragedByWrapper);
  log(`  - Of which ${staticEntries.length} use static wrapped tokens:`);
  staticEntries.forEach(([wrapper, total]) => {
    log(`    - ${wrapper} (demurraged: ${total})`);
  });
  log(`  - Of which ${demurragedEntries.length} use demurraged wrapped tokens:`);
  demurragedEntries.forEach(([wrapper, total]) => {
    log(`    - ${wrapper} (demurraged: ${total})`);
  });
  log();

  const unwrapCalls = [];
  const wrapCalls = [];
  const staticWrapperBalances = {};
  const staticWrapperDiagnostics = {};
  const demurragedWrapperDiagnostics = {};

  Object.entries(staticByWrapper).forEach(([wrapper, amount]) => {
    staticWrapperDiagnostics[wrapper] = {
      wrapper,
      pathDemurraged: amount,
      staticBalanceUnwrapped: 0n,
      demurragedBalanceUnwrapped: 0n,
      demurragedSpent: 0n,
      demurragedRemainingToWrap: 0n,
      unwrapCallPlanned: false,
      wrapCallPlanned: false,
      tokenOwner: tokenInfoMap.get(wrapper)?.tokenOwner?.toLowerCase?.() || null,
    };
  });

  Object.entries(demurragedByWrapper).forEach(([wrapper, amount]) => {
    demurragedWrapperDiagnostics[wrapper] = {
      wrapper,
      pathDemurraged: amount,
      demurragedUnwrapAmount: amount,
      unwrapCallPlanned: amount > 0n,
      tokenOwner: tokenInfoMap.get(wrapper)?.tokenOwner?.toLowerCase?.() || null,
    };
  });

  const senderBalances = await fetchAddressTokenBalances(source, false);
  if (staticEntries.length > 0) {
    log(`The path uses ${staticEntries.length} different static tokens which must be unwrapped completely before they can be used in a flow matrix transfer.`);
    log('  Getting all balances of the sender for static wrapped tokens...');
  }
  senderBalances.forEach((row) => {
    const tokenAddress = row?.tokenAddress?.toLowerCase?.();
    if (!tokenAddress || !staticByWrapper[tokenAddress]) return;
    const staticUnits = BigInt(row?.staticAttoCircles || row?.attoStaticCircles || '0');
    const demurragedUnits = BigInt(row?.attoCircles || '0');
    staticWrapperBalances[tokenAddress] = {
      static: staticUnits,
      demurraged: demurragedUnits,
    };
    if (staticWrapperDiagnostics[tokenAddress]) {
      staticWrapperDiagnostics[tokenAddress].staticBalanceUnwrapped = staticUnits;
      staticWrapperDiagnostics[tokenAddress].demurragedBalanceUnwrapped = demurragedUnits;
    }
    log(`    - ${tokenAddress} (static: ${staticUnits}, demurraged: ${demurragedUnits})`);
    if (staticUnits > 0n) {
      log(`      > Unwrapping full amount of static wrapped token: ${tokenAddress} (static: ${staticUnits})`);
      unwrapCalls.push({
        to: tokenAddress,
        data: encodeFunctionData({ abi: WRAPPER_ABI_MIN, functionName: 'unwrap', args: [staticUnits] }),
      });
      if (staticWrapperDiagnostics[tokenAddress]) {
        staticWrapperDiagnostics[tokenAddress].unwrapCallPlanned = true;
      }
    }
  });

  for (const [wrapper] of staticEntries) {
    if (!staticWrapperBalances[wrapper]) {
      log(`  WARNING: No balance found for static wrapper ${wrapper} — unwrap cannot be planned. Simulation will likely revert.`);
    }
  }

  Object.entries(demurragedByWrapper).forEach(([wrapper, amount]) => {
    if (amount <= 0n) return;
    log(`  > Unwrapping precise amount of demurraged wrapped token: ${wrapper} (demurraged: ${amount})`);
    unwrapCalls.push({
      to: wrapper,
      data: encodeFunctionData({ abi: WRAPPER_ABI_MIN, functionName: 'unwrap', args: [amount] }),
    });
    if (demurragedWrapperDiagnostics[wrapper]) {
      demurragedWrapperDiagnostics[wrapper].unwrapCallPlanned = true;
    }
  });
  log();
  log('Replacing wrapped token owners in the path with their real token owners...');

  const staticSpent = {};
  const rewrittenTransfers = pathWithBigInts.transfers.map((transfer) => {
    const { info, key } = resolveTokenInfo(transfer);
    if (!isWrapperInfo(info)) return transfer;
    log(` - Replacing wrapped token owner in transfer (from: ${transfer.from}, to: ${transfer.to}, tokenOwner: ${transfer.tokenOwner}) with real token owner: ${info.tokenOwner}`);
    if (isStaticWrapperInfo(info)) {
      const wrapperKey = (key || transfer.tokenOwner || '').toLowerCase();
      staticSpent[wrapperKey] = (staticSpent[wrapperKey] || 0n) + transfer.value;
    }
    return {
      ...transfer,
      tokenOwner: (info.tokenOwner || transfer.tokenOwner).toLowerCase(),
    };
  });

  Object.entries(staticWrapperBalances).forEach(([wrapperToken, unwrappedTotal]) => {
    const spent = staticSpent[wrapperToken] || 0n;
    const unwrappedTotalDemurraged = unwrappedTotal.demurraged || 0n;
    const remaining = unwrappedTotalDemurraged > spent ? unwrappedTotalDemurraged - spent : 0n;
    if (staticWrapperDiagnostics[wrapperToken]) {
      staticWrapperDiagnostics[wrapperToken].demurragedSpent = spent;
      staticWrapperDiagnostics[wrapperToken].demurragedRemainingToWrap = remaining;
    }
    log(`  - ${wrapperToken}: spent (demurraged: ${spent}), remaining to re-wrap (demurraged: ${remaining})`);
    if (remaining <= 0n) return;

    const realTokenOwner = tokenInfoMap.get(wrapperToken)?.tokenOwner;
    if (!realTokenOwner) return;

    wrapCalls.push({
      to: hub,
      data: encodeFunctionData({
        abi: HUB_ABI_MIN,
        functionName: 'wrap',
        args: [realTokenOwner.toLowerCase(), remaining, 1],
      }),
    });
    if (staticWrapperDiagnostics[wrapperToken]) {
      staticWrapperDiagnostics[wrapperToken].wrapCallPlanned = true;
      staticWrapperDiagnostics[wrapperToken].tokenOwner = realTokenOwner.toLowerCase();
    }
  });

  const flowMatrix = createFlowMatrix(source, sink, BigInt(pathWithBigInts.maxFlow), rewrittenTransfers);
  log();
  log(`Flow matrix created with ${flowMatrix.flowVertices.length} vertices and ${flowMatrix.flowEdges.length} edges.`);

  const operateFlowMatrixCall = {
    to: hub,
    data: encodeFunctionData({
      abi: HUB_ABI_MIN,
      functionName: 'operateFlowMatrix',
      args: [
        flowMatrix.flowVertices,
        flowMatrix.flowEdges.map((edge) => ({ streamSinkId: edge.streamSinkId, amount: BigInt(edge.amount) })),
        flowMatrix.streams.map((stream) => ({
          sourceCoordinate: stream.sourceCoordinate,
          flowEdgeIds: stream.flowEdgeIds,
          data: asHexData(stream.data),
        })),
        flowMatrix.packedCoordinates,
      ],
    }),
  };

  const selfApprovalCall = {
    to: hub,
    data: encodeFunctionData({
      abi: HUB_ABI_MIN,
      functionName: 'setApprovalForAll',
      args: [source, true],
    }),
  };

  const calls = [selfApprovalCall, ...unwrapCalls, operateFlowMatrixCall, ...wrapCalls];
  log(`Planned sub-calls: ${calls.length} (self-approval: 1, unwrap: ${unwrapCalls.length}, operateFlowMatrix: 1, re-wrap: ${wrapCalls.length}).`);
  log('Order: self-approval → unwrap(s) → operateFlowMatrix → re-wrap(s)');
  const packedCalls = encodeMultiSendTransactions(calls);
  const multiSendCallData = encodeFunctionData({
    abi: MULTISEND_ABI_MIN,
    functionName: 'multiSend',
    args: [packedCalls],
  });

  const signature = buildPreValidatedSignature(signer);
  const signatureBytes = hexByteLength(signature);
  if (signatureBytes !== 65) {
    throw new Error(`Invalid prevalidated Safe signature length: expected 65 bytes, got ${signatureBytes}.`);
  }

  const safeCalldata = encodeFunctionData({
    abi: SAFE_ABI_MIN,
    functionName: 'execTransaction',
    args: [
      multisendAddress,
      0n,
      multiSendCallData,
      1,
      0n,
      0n,
      0n,
      '0x0000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000',
      signature,
    ],
  });

  const callTimeline = calls.map((call, index) => ({
    index,
    to: call.to,
    label: getCallLabel(call, hub),
    selector: (call.data || '').slice(0, 10),
    dataLengthBytes: Math.max(0, ((call.data || '0x').length - 2) / 2),
  }));

  const staticWrapperRows = Object.values(staticWrapperDiagnostics)
    .sort((a, b) => a.wrapper.localeCompare(b.wrapper));
  const demurragedWrapperRows = Object.values(demurragedWrapperDiagnostics)
    .sort((a, b) => a.wrapper.localeCompare(b.wrapper));

  const wrappedEdgesByType = {
    static: wrappedSenderEdges.filter(({ info }) => isStaticWrapperInfo(info)).length,
    demurraged: wrappedSenderEdges.filter(({ info }) => isDemurragedWrapperInfo(info)).length,
  };

  const unwrapByType = {
    static: staticEntries.length,
    demurraged: demurragedEntries.length,
  };

  return {
    safeAddress: source,
    gasFrom: normalizedSigner,
    safeCalldata,
    flowMatrix,
    summary: {
      wrappedEdgesFromSender: wrappedSenderEdges.length,
      wrappedEdgesByType,
      unwrapCalls: unwrapCalls.length,
      unwrapByType,
      wrapCalls: wrapCalls.length,
      calls: calls.length,
      signatureBytes,
      rewrittenTransfers: rewrittenTransfers.length,
    },
    diagnostics: {
      staticWrappers: staticWrapperRows,
      demurragedWrappers: demurragedWrapperRows,
      callTimeline,
      callOrderDescription: 'self-approval → unwrap(s) → operateFlowMatrix → re-wrap(s)',
    },
    simulationLog: logLines.join('\n'),
  };
};