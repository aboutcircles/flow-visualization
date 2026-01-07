import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { fetchTokenInfoByAddress } from '@/services/circlesApi';

/**
 * Combines multiple class names using clsx and tailwind-merge
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Packs coordinates into bytes as required by the operateFlowMatrix function
 * Each coordinate is packed as two bytes (uint16)
 * @param {Array} coordinates - Array of coordinate numbers
 * @returns {string} - Hex string representation of packed bytes
 */
export function packCoordinates(coordinates) {
  // Convert each coordinate to a 2-byte representation
  const bytes = [];
  
  for (const coord of coordinates) {
    // Push high byte and low byte
    bytes.push((coord >> 8) & 0xff); // high byte
    bytes.push(coord & 0xff);        // low byte
  }
  
  // Convert to hex string
  return '0x' + bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Helper to generate all parameters for operateFlowMatrix
 * Based on the TypeScript implementation from the SDK
 * 
 * IMPORTANT: This function handles wrapped tokens properly by resolving
 * the actual token owner address instead of using the wrapper contract address.
 * 
 * For wrapped tokens:
 * - transfer.tokenOwner = wrapper contract address (e.g., 0xWrapperContract)
 * - actual token owner = the avatar who minted the original token
 * 
 * The operateFlowMatrix function on the Hub contract expects the actual
 * token owner in the packed coordinates, NOT the wrapper address.
 * 
 * @param {Object} pathData - The path data from API
 * @param {string} from - Source address
 * @returns {Promise<Object|null>} - Parameters object for operateFlowMatrix
 */
export async function generateFlowMatrixParams(pathData, from) {
  if (!pathData || !from || !pathData.transfers || pathData.transfers.length === 0) {
    return null;
  }
  
  try {
    // Extract the 'to' address
    const to = pathData.transfers.length > 0 
      ? pathData.transfers[pathData.transfers.length - 1].to.toLowerCase()
      : null;
    
    // Normalize from address
    from = from.toLowerCase();
    
    // 1. Collect all unique token addresses from transfers
    const tokenAddresses = [...new Set(
      pathData.transfers.map(t => t.tokenOwner.toLowerCase())
    )];
    
    // 2. Fetch token info for all tokens to check if they're wrapped
    // This is the critical step that resolves wrapped token addresses to actual owners
    console.log('Fetching token info for:', tokenAddresses);
    
    const tokenToOwnerMapping = {};
    
    for (const tokenAddr of tokenAddresses) {
      const info = await fetchTokenInfoByAddress(tokenAddr);
      
      if (info) {
        // Check if it's a wrapped token based on tokenType
        // Wrapped tokens have these types:
        // - CrcV2_ERC20WrapperDeployed_Inflationary
        // - CrcV2_ERC20WrapperDeployed_Demurraged
        const isWrapped = 
          info.tokenType === 'CrcV2_ERC20WrapperDeployed_Inflationary' ||
          info.tokenType === 'CrcV2_ERC20WrapperDeployed_Demurraged';
        
        if (isWrapped && info.tokenOwner) {
          // Use the actual token owner (the avatar who minted the original token)
          tokenToOwnerMapping[tokenAddr] = info.tokenOwner.toLowerCase();
          console.log(`Token ${tokenAddr} is wrapped (${info.tokenType}), actual owner: ${info.tokenOwner}`);
        } else {
          // Not wrapped - the token address IS the owner
          tokenToOwnerMapping[tokenAddr] = tokenAddr;
          console.log(`Token ${tokenAddr} is not wrapped, using same address`);
        }
      } else {
        // Fallback: assume token is its own owner if we can't fetch info
        tokenToOwnerMapping[tokenAddr] = tokenAddr;
        console.warn(`Could not fetch info for token ${tokenAddr}, assuming not wrapped`);
      }
    }
    
    console.log('Final token to owner mapping:', tokenToOwnerMapping);
    
    // 3. Build the vertices list (unique addresses involved in transfers)
    const addressSet = new Set();
    addressSet.add(from);
    if (to) addressSet.add(to);
    
    // Normalize all transfers
    const normalizedTransfers = pathData.transfers.map(t => ({
      from: t.from.toLowerCase(),
      to: t.to.toLowerCase(),
      tokenOwner: t.tokenOwner.toLowerCase(),
      value: t.value
    }));
    
    // Add all addresses from transfers (using actual token owners for wrapped tokens)
    normalizedTransfers.forEach(transfer => {
      addressSet.add(transfer.from);
      addressSet.add(transfer.to);
      // CRITICAL: Use the actual token owner (not wrapper address)
      const actualOwner = tokenToOwnerMapping[transfer.tokenOwner] || transfer.tokenOwner;
      addressSet.add(actualOwner);
    });
    
    console.log('Address set before sorting:', Array.from(addressSet));
    
    // 4. Convert to sorted array (using BigInt sorting like in the TypeScript implementation)
    const flowVertices = Array.from(addressSet).sort((a, b) => {
      // Add '0x' prefix if not present to avoid conversion errors
      const aHex = a.startsWith('0x') ? a : '0x' + a;
      const bHex = b.startsWith('0x') ? b : '0x' + b;
      
      try {
        const bigintA = BigInt(aHex);
        const bigintB = BigInt(bHex);
        return bigintA < bigintB ? -1 : bigintA > bigintB ? 1 : 0;
      } catch (e) {
        // Fallback to string comparison if BigInt conversion fails
        return a.localeCompare(b);
      }
    });
    
    // 5. Create a lookup map for addresses to indices
    const lookup = {};
    flowVertices.forEach((addr, index) => {
      lookup[addr] = index;
    });
    
    // 6. Build flow edges and coordinates
    const flowEdges = [];
    const coordinates = [];
    
    normalizedTransfers.forEach(transfer => {
      // Mark edges that flow to the destination with streamSinkId=1
      const isToSink = to && transfer.to === to;
      
      // Add flow edge
      flowEdges.push({
        streamSinkId: isToSink ? 1 : 0,
        amount: transfer.value
      });
      
      // Add coordinates (token, from, to)
      // CRITICAL: Use ACTUAL token owner for coordinates (not wrapper address)
      const actualTokenOwner = tokenToOwnerMapping[transfer.tokenOwner] || transfer.tokenOwner;
      coordinates.push(
        lookup[actualTokenOwner],
        lookup[transfer.from],
        lookup[transfer.to]
      );
    });
    
    // 7. Ensure at least one terminal edge is marked, as in the TypeScript code
    if (!flowEdges.some(edge => edge.streamSinkId === 1) && flowEdges.length > 0) {
      // Find the last edge where transfer.to matches the 'to' address
      const lastIndex = normalizedTransfers.map(t => t.to).lastIndexOf(to);
      if (lastIndex !== -1) {
        flowEdges[lastIndex].streamSinkId = 1;
      } else {
        // If not found, set the last edge as terminal by default
        flowEdges[flowEdges.length - 1].streamSinkId = 1;
      }
    }
    
    // 8. Create flowEdgeIds array (indices of edges with streamSinkId = 1)
    const flowEdgeIds = flowEdges
      .map((edge, index) => edge.streamSinkId === 1 ? index : -1)
      .filter(index => index !== -1);
    
    // 9. Create stream object
    const stream = {
      sourceCoordinate: lookup[from],
      flowEdgeIds: flowEdgeIds,
      data: "0x" // Empty bytes
    };
    
    // 10. Pack coordinates
    const packedCoordinates = packCoordinates(coordinates);
    
    // Create the final params object
    return {
      _flowVertices: flowVertices,
      _flow: flowEdges,
      _streams: [stream],
      _packedCoordinates: packedCoordinates
    };
  } catch (error) {
    console.error('Error generating operateFlowMatrix params:', error);
    return null;
  }
}