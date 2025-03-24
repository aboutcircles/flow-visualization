import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

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
 * @param {Object} pathData - The path data from API
 * @param {string} from - Source address
 * @returns {Object} - Parameters object for operateFlowMatrix
 */
export function generateFlowMatrixParams(pathData, from) {
  if (!pathData || !from || !pathData.transfers || pathData.transfers.length === 0) return null;
  
  try {
    // Extract the 'to' address
    const to = pathData.transfers.length > 0 
      ? pathData.transfers[pathData.transfers.length - 1].to.toLowerCase()
      : null;
    
    // Normalize from address
    from = from.toLowerCase();
    
    // 1. Build the vertices list (unique addresses involved in transfers)
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
    
    // Add all addresses from transfers
    normalizedTransfers.forEach(transfer => {
      addressSet.add(transfer.from);
      addressSet.add(transfer.to);
      addressSet.add(transfer.tokenOwner);
    });
    
    // Convert to sorted array (using BigInt sorting like in the TypeScript implementation)
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
    
    // 2. Create a lookup map for addresses to indices
    const lookup = {};
    flowVertices.forEach((addr, index) => {
      lookup[addr] = index;
    });
    
    // 3. Build flow edges and coordinates
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
      coordinates.push(
        lookup[transfer.tokenOwner],
        lookup[transfer.from],
        lookup[transfer.to]
      );
    });
    
    // Ensure at least one terminal edge is marked, as in the TypeScript code
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
    
    // 4. Create flowEdgeIds array (indices of edges with streamSinkId = 1)
    const flowEdgeIds = flowEdges
      .map((edge, index) => edge.streamSinkId === 1 ? index : -1)
      .filter(index => index !== -1);
    
    // 5. Create stream object
    const stream = {
      sourceCoordinate: lookup[from],
      flowEdgeIds: flowEdgeIds,
      data: "0x" // Empty bytes
    };
    
    // 6. Pack coordinates
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