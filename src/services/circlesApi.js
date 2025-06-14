import { CirclesData, CirclesRpc } from "@circles-sdk/data";
import { Profiles } from "@circles-sdk/profiles";
import cacheService from './cacheService';

export const API_ENDPOINT = 'https://rpc.aboutcircles.com/';


export const createCirclesClients = () => {
  const circlesRpc = new CirclesRpc(API_ENDPOINT);
  const circlesData = new CirclesData(circlesRpc);
  const circlesProfiles = new Profiles(API_ENDPOINT + "profiles/");
  
  return {
    circlesRpc,
    circlesData,
    circlesProfiles
  };
};

export const parseAddressList = (addressString) => {
  if (!addressString) return [];

  return addressString
    .split(/[\s,]+/)
    .map(addr => addr.trim())
    .filter(addr => addr && addr.startsWith('0x'));
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

export const findPath = async (formData) => {
  try {
    const fromTokensArray = parseAddressList(formData.FromTokens);
    const toTokensArray = parseAddressList(formData.ToTokens);
    const excludedFromTokensArray = parseAddressList(formData.ExcludedFromTokens);
    const excludedToTokensArray = parseAddressList(formData.ExcludedToTokens);

    const params = {
      Source: formData.From,
      Sink: formData.To,
      TargetFlow: formData.Amount,
    };

    if (fromTokensArray.length > 0) {
      params.FromTokens = fromTokensArray;
    }

    if (toTokensArray.length > 0) {
      params.ToTokens = toTokensArray;
    }

    if (excludedFromTokensArray.length > 0) {
      params.ExcludedFromTokens = excludedFromTokensArray;
    }

    if (excludedToTokensArray.length > 0) {
      params.ExcludedToTokens = excludedToTokensArray;
    }

    params.WithWrap = formData.WithWrap;

    const requestBody = {
      jsonrpc: "2.0",
      id: 0,
      method: "circlesV2_findPath",
      params: [params]
    };

    console.log('Sending JSON-RPC request:', requestBody);

    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} ${response.statusText}\n${errorText}`);
    }

    const responseData = await response.json();

    if (responseData.error) {
      throw new Error(`JSON-RPC error: ${responseData.error.message || JSON.stringify(responseData.error)}`);
    }

    return responseData.result;
  } catch (err) {
    console.error('Fetch error:', err);
    throw err;
  }
};

// Optimized version - only fetch what we need
export const fetchTokenInfo = async (circlesData, transfers, useCache = true) => {
  if (!transfers || transfers.length === 0) return { wrapped: [], tokenInfo: {} };

  try {
    const tokenOwners = Array.from(
      new Set(transfers.map(t => t.tokenOwner.toLowerCase()))
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
      const token = transfer.tokenOwner.toLowerCase();
      if (missing.includes(token) && !tokenToAccount[token]) {
        // Use the from address as it should have the token
        tokenToAccount[token] = transfer.from.toLowerCase();
      }
    }

    // Get unique accounts we need to query
    const accountsToQuery = Array.from(new Set(Object.values(tokenToAccount)));
    
    const buildBatch = (batch) => batch.map((addr, idx) => ({
      jsonrpc: '2.0',
      id: idx,
      method: 'circles_getTokenBalances',
      params: [addr]
    }));
    
    // Fetch balances only for necessary accounts
    for (let i = 0; i < accountsToQuery.length; i += 50) {
      const slice = accountsToQuery.slice(i, i + 50);
      try {
        const res = await fetch(API_ENDPOINT, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(buildBatch(slice))
        });
        
        if (!res.ok) {
          console.error('Failed to fetch token info for batch:', slice);
          continue;
        }

        const rpcArray = await res.json();
        rpcArray.forEach((rpc, index) => {
          if (rpc.error) {
            console.error('RPC error:', rpc.error);
            return;
          }
          
          const accountAddr = slice[index];
          
          // Extract token info from balance results
          rpc.result?.forEach((balanceEntry) => {
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
        console.error('Error fetching token info batch:', error);
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
    const uniqueAddresses = Array.from(new Set(addresses.map(addr => addr.toLowerCase())));
    const balancesByAccount = {};
    const tokenInfoMap = {};
    const wrapped = [];
    
    // Get tokens we need info for
    const tokenOwners = new Set(transfers.map(t => t.tokenOwner.toLowerCase()));

    const buildBatch = (batch) => batch.map((addr, idx) => ({
      jsonrpc: '2.0',
      id: idx,
      method: 'circles_getTokenBalances',
      params: [addr]
    }));

    for (let i = 0; i < uniqueAddresses.length; i += 50) {
      const slice = uniqueAddresses.slice(i, i + 50);
      const res = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(buildBatch(slice))
      });
      
      if (!res.ok) {
        console.error('Failed to fetch balances for batch:', slice);
        continue;
      }

      const rpcArray = await res.json();
      rpcArray.forEach((rpc) => {
        if (rpc.error) {
          console.error('RPC error for address:', slice[rpc.id], rpc.error);
          return;
        }
        
        const account = slice[rpc.id].toLowerCase();
        const map = {};

        rpc.result?.forEach((row) => {
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