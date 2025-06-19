/**
 * Extract complete flow paths from the max flow solution
 */
export function computeFlowPaths(transfers, source, sink) {
  if (!transfers || transfers.length === 0) return [];
  
  // Normalize addresses
  source = source.toLowerCase();
  sink = sink.toLowerCase();
  
  console.log(`Finding paths from ${source} to ${sink}`);
  console.log(`Total transfers: ${transfers.length}`);
  
  // First, build the complete flow network
  const flowNetwork = {};
  const edgeFlows = new Map();
  
  transfers.forEach((transfer, index) => {
    const from = transfer.from.toLowerCase();
    const to = transfer.to.toLowerCase();
    const token = transfer.tokenOwner.toLowerCase();
    const flow = Number(transfer.value) / 1e18;
    
    // Create adjacency list
    if (!flowNetwork[from]) {
      flowNetwork[from] = {};
    }
    if (!flowNetwork[from][to]) {
      flowNetwork[from][to] = {};
    }
    if (!flowNetwork[from][to][token]) {
      flowNetwork[from][to][token] = 0;
    }
    
    // Add flow for this edge
    flowNetwork[from][to][token] += flow;
    
    // Store the original transfer
    const edgeKey = `${from}-${to}-${token}`;
    if (!edgeFlows.has(edgeKey)) {
      edgeFlows.set(edgeKey, []);
    }
    edgeFlows.get(edgeKey).push({
      ...transfer,
      index,
      flow
    });
  });
  
  console.log('Flow network built, finding paths...');
  
  // Now find all paths from source to sink by decomposing the flow
  const paths = [];
  const usedFlows = new Map();
  
  // Initialize used flows
  for (const [edgeKey, transfers] of edgeFlows) {
    usedFlows.set(edgeKey, 0);
  }
  
  // Find paths using flow decomposition
  const findPath = () => {
    const parent = {};
    const tokenUsed = {};
    const visited = new Set();
    const queue = [source];
    visited.add(source);
    parent[source] = null;
    
    // BFS to find a path with available flow
    while (queue.length > 0) {
      const current = queue.shift();
      
      if (current === sink) {
        // Found a path, now determine the flow amount
        let pathFlow = Infinity;
        const pathEdges = [];
        
        // Trace back the path
        let node = sink;
        while (parent[node] !== null) {
          const prev = parent[node];
          const token = tokenUsed[node];
          const edgeKey = `${prev}-${node}-${token}`;
          
          pathEdges.unshift({
            from: prev,
            to: node,
            token: token,
            edgeKey: edgeKey
          });
          
          // Find minimum available flow on this path
          const availableFlow = flowNetwork[prev][node][token] - (usedFlows.get(edgeKey) || 0);
          pathFlow = Math.min(pathFlow, availableFlow);
          
          node = prev;
        }
        
        if (pathFlow > 0.000001) { // Threshold to avoid floating point issues
          // Update used flows
          pathEdges.forEach(edge => {
            const currentUsed = usedFlows.get(edge.edgeKey) || 0;
            usedFlows.set(edge.edgeKey, currentUsed + pathFlow);
          });
          
          // Collect transfers for this path
          const pathTransfers = [];
          pathEdges.forEach(edge => {
            const edgeTransfers = edgeFlows.get(edge.edgeKey) || [];
            // Find a transfer that matches this flow amount (approximately)
            const matchingTransfer = edgeTransfers.find(t => 
              Math.abs(t.flow - pathFlow) < 0.000001
            ) || edgeTransfers[0];
            
            if (matchingTransfer) {
              pathTransfers.push(matchingTransfer);
            }
          });
          
          const pathNodes = [source, ...pathEdges.map(e => e.to)];
          
          return {
            nodes: pathNodes,
            flow: pathFlow,
            transfers: pathTransfers,
            edges: pathEdges
          };
        }
        
        return null;
      }
      
      // Explore neighbors
      const neighbors = flowNetwork[current] || {};
      for (const [neighbor, tokens] of Object.entries(neighbors)) {
        if (!visited.has(neighbor)) {
          // Check if there's any available flow to this neighbor
          let hasFlow = false;
          for (const [token, totalFlow] of Object.entries(tokens)) {
            const edgeKey = `${current}-${neighbor}-${token}`;
            const used = usedFlows.get(edgeKey) || 0;
            if (totalFlow - used > 0.000001) {
              hasFlow = true;
              visited.add(neighbor);
              parent[neighbor] = current;
              tokenUsed[neighbor] = token;
              queue.push(neighbor);
              break;
            }
          }
        }
      }
    }
    
    return null;
  };
  
  // Find all paths
  let pathCount = 0;
  while (true) {
    const path = findPath();
    if (!path) break;
    
    paths.push(path);
    pathCount++;
    
    console.log(`Found path ${pathCount}: ${path.nodes.join(' → ')} with flow ${path.flow.toFixed(6)}`);
    
    // Safety limit
    if (pathCount > 1000) {
      console.warn('Reached path limit of 1000');
      break;
    }
  }
  
  // Group remaining transfers that don't form complete paths
  const remainingTransfers = [];
  for (const [edgeKey, transfers] of edgeFlows) {
    const used = usedFlows.get(edgeKey) || 0;
    const [from, to, token] = edgeKey.split('-');
    const totalFlow = flowNetwork[from][to][token];
    const remaining = totalFlow - used;
    
    if (remaining > 0.000001) {
      remainingTransfers.push({
        from,
        to,
        token,
        flow: remaining,
        transfers: transfers.filter(t => t.flow <= remaining)
      });
    }
  }
  
  if (remainingTransfers.length > 0) {
    console.log(`${remainingTransfers.length} transfers don't form complete paths`);
    
    // Group by flow amount
    const remainingByFlow = {};
    remainingTransfers.forEach(rt => {
      const flowKey = rt.flow.toFixed(6);
      if (!remainingByFlow[flowKey]) {
        remainingByFlow[flowKey] = {
          flow: rt.flow,
          transfers: []
        };
      }
      remainingByFlow[flowKey].transfers.push(...rt.transfers);
    });
    
    // Add as partial paths
    Object.values(remainingByFlow).forEach(group => {
      const nodes = new Set();
      group.transfers.forEach(t => {
        nodes.add(t.from.toLowerCase());
        nodes.add(t.to.toLowerCase());
      });
      
      paths.push({
        nodes: Array.from(nodes),
        flow: group.flow,
        transfers: group.transfers,
        isPartial: true
      });
    });
  }
  
  console.log(`Total paths found: ${paths.length}`);
  
  return paths;
}

/**
 * Computes distinct paths for visualization
 */
export function computeDistinctPathsForVisualization(transfers, source, sink) {
  const paths = computeFlowPaths(transfers, source, sink);
  
  if (paths.length === 0) {
    console.log('No valid paths found!');
    return [];
  }
  
  // Group paths by flow amount
  const pathsByFlow = {};
  
  paths.forEach(path => {
    const flowKey = path.flow.toFixed(6);
    
    if (!pathsByFlow[flowKey]) {
      pathsByFlow[flowKey] = {
        flow: path.flow,
        paths: [],
        transfers: [],
        totalFlow: 0,
        pathCount: 0,
        isPartial: path.isPartial || false
      };
    }
    
    pathsByFlow[flowKey].paths.push(path.nodes);
    pathsByFlow[flowKey].transfers.push(path.transfers);
    pathsByFlow[flowKey].totalFlow += path.flow;
    pathsByFlow[flowKey].pathCount += 1;
  });
  
  console.log('Paths by flow:');
  let totalFlow = 0;
  Object.entries(pathsByFlow).forEach(([flow, data]) => {
    console.log(`Flow ${flow} CRC: ${data.pathCount} paths`);
    totalFlow += data.totalFlow;
  });
  console.log(`Total flow: ${totalFlow.toFixed(6)} CRC`);
  
  // Calculate expected total
  const expectedTotal = transfers.reduce((sum, t) => sum + Number(t.value) / 1e18, 0);
  console.log(`Expected total: ${expectedTotal.toFixed(6)} CRC`);
  console.log(`Coverage: ${((totalFlow / expectedTotal) * 100).toFixed(2)}%`);
  
  // Convert to array format
  return Object.values(pathsByFlow)
    .sort((a, b) => b.flow - a.flow)
    .map(group => ({
      flow: group.flow,
      pathCount: group.pathCount,
      totalFlow: group.totalFlow,
      examplePath: group.paths[0],
      allTransfers: group.transfers,
      isPartial: group.isPartial || false
    }));
}