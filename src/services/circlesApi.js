// API service for Circles Network
import { CirclesData, CirclesRpc } from "@circles-sdk/data";
import { Profiles } from "@circles-sdk/profiles";

// Define the API endpoint as a constant for easy updating
export const API_ENDPOINT = 'https://rpc.aboutcircles.com/';

// Initialize SDK clients
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

// Helper function to parse string of addresses into an array
export const parseAddressList = (addressString) => {
  if (!addressString) return [];

  // Split by comma, newline, or space and filter out empty entries
  return addressString
    .split(/[\s,]+/)
    .map(addr => addr.trim())
    .filter(addr => addr && addr.startsWith('0x'));
};

// Convert ETH to Wei
export const ethToWei = (crcAmount) => {
  try {
    if (!crcAmount || isNaN(crcAmount)) return '0';

    // Convert to Wei (multiply by 10^18)
    const [whole, fraction = ''] = crcAmount.toString().split('.');
    const decimals = fraction.padEnd(18, '0');
    const wei = whole + decimals;
    return BigInt(wei).toString();
  } catch (error) {
    console.error('Error converting ETH to Wei:', error);
    return '0';
  }
};

// Function to fetch path data from API using JSON-RPC POST
export const findPath = async (formData) => {
  try {
    // Parse token strings into arrays
    const fromTokensArray = parseAddressList(formData.FromTokens);
    const toTokensArray = parseAddressList(formData.ToTokens);

    // Create the params object for the JSON-RPC request
    const params = {
      Source: formData.From,
      Sink: formData.To,
      TargetFlow: formData.Amount,
    };

    // Only add optional parameters if they have values
    if (fromTokensArray.length > 0) {
      params.FromTokens = fromTokensArray;
    }

    if (toTokensArray.length > 0) {
      params.ToTokens = toTokensArray;
    }

    // WithWrap is a boolean, so always include it
    params.WithWrap = formData.WithWrap;

    // Construct the JSON-RPC request
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

    // Extract the result data
    return responseData.result;
  } catch (err) {
    console.error('Fetch error:', err);
    throw err;
  }
};

// Fetch token info for addresses
export const fetchTokenInfo = async (circlesData, transfers) => {
  if (!transfers || transfers.length === 0) return { wrapped: [], tokenInfo: {} };

  try {
    // Collect unique tokenOwner addresses from transfers
    const tokenOwners = Array.from(
      new Set(transfers.map(t => t.tokenOwner.toLowerCase()))
    );

    // Fetch token info rows via the SDK
    const infoRows = await circlesData.getTokenInfoBatch(tokenOwners);

    // Keep only ERC20 wrapper deployments
    const wrapperTypes = [
      'CrcV2_ERC20WrapperDeployed_Inflationary',
      'CrcV2_ERC20WrapperDeployed_Demurraged'
    ];

    const wrapped = infoRows
      .filter(row => wrapperTypes.includes(row.type))
      .map(row => row.token.toLowerCase());

    const tokenInfoMap = infoRows.reduce((p, c) => {
      p[c.token.toLowerCase()] = c;
      return p;
    }, {});

    return { wrapped, tokenInfo: tokenInfoMap };
  } catch (error) {
    console.error('Error fetching token info:', error);
    return { wrapped: [], tokenInfo: {} };
  }
};

// Fetch profiles by addresses
export const fetchProfiles = async (circlesProfiles, addresses) => {
  if (!addresses || addresses.length === 0) return {};
  
  try {
    const uniqueAddresses = Array.from(new Set(addresses.map(addr => addr.toLowerCase())));
    const batches = [];
    
    for (let i = 0; i < uniqueAddresses.length; i += 50) {
      batches.push(uniqueAddresses.slice(i, i + 50));
    }

    const profilesMap = {};
    for (const batch of batches) {
      const profiles = await circlesProfiles.searchByAddresses(batch, {fetchComplete: true});
      profiles.forEach(profile => {
        profilesMap[profile.address.toLowerCase()] = profile;
      });
    }

    return profilesMap;
  } catch (error) {
    console.error('Error fetching profiles:', error);
    return {};
  }
};

// Fetch token balances
export const fetchTokenBalances = async (addresses) => {
  if (!addresses || addresses.length === 0) return {};
  
  try {
    const uniqueAddresses = Array.from(new Set(addresses.map(addr => addr.toLowerCase())));
    const balancesByAccount = {};

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
        continue;
      }

      const rpcArray = await res.json();
      rpcArray.forEach((rpc) => {
        const account = slice[rpc.id].toLowerCase();
        const map = {};

        rpc.result?.forEach((row) => {
          const tokenKey = row.tokenAddress.toLowerCase();
          map[tokenKey] = {
            crc: Number(row.circles),
            atto: BigInt(row.attoCircles ?? row.attoCrc ?? '0')
          };
        });

        balancesByAccount[account] = map;
      });
    }

    return balancesByAccount;
  } catch (error) {
    console.error('Error fetching token balances:', error);
    return {};
  }
};