/**
 * Decompose a set of transfers into source→sink routes using flow decomposition.
 *
 * Each route is a complete path from source to sink. A single original transfer
 * may be split across multiple routes (partial flow). Routes are sorted by flow
 * descending (largest first).
 *
 * @param {Array} transfers - Array of { from, to, tokenOwner, value }
 * @param {string} source - Source address (lowercase)
 * @param {string} sink - Sink address (lowercase)
 * @returns {Array} routes - Array of { id, flow, flowNum, edges: [{ from, to, tokenOwner, flow, originalTransferIdx }] }
 */
export function decomposeFlow(transfers, source, sink) {
  // Build edge list with remaining capacity (BigInt for precision)
  const edges = transfers.map((t, i) => ({
    from: t.from.toLowerCase(),
    to: t.to.toLowerCase(),
    tokenOwner: t.tokenOwner,
    capacity: BigInt(t.value),
    originalIdx: i,
  }));

  const routes = [];
  let routeId = 0;

  while (true) {
    // Build adjacency from edges with remaining capacity
    const adj = new Map();
    for (const e of edges) {
      if (e.capacity <= 0n) continue;
      if (!adj.has(e.from)) adj.set(e.from, []);
      adj.get(e.from).push(e);
    }

    // DFS to find a path from source to sink
    const path = dfsPath(adj, source, sink);
    if (!path || path.length === 0) break;

    // Flow = min capacity along the path
    const flow = path.reduce(
      (min, e) => (e.capacity < min ? e.capacity : min),
      path[0].capacity
    );

    // Subtract flow from each edge on the path
    for (const e of path) {
      e.capacity -= flow;
    }

    routes.push({
      id: routeId++,
      flow: flow.toString(),
      flowNum: Number(flow) / 1e18,
      edges: path.map(e => ({
        from: e.from,
        to: e.to,
        tokenOwner: e.tokenOwner,
        flow: flow.toString(),
        originalTransferIdx: e.originalIdx,
      })),
    });
  }

  // Sort by flow descending (largest routes first)
  routes.sort((a, b) => b.flowNum - a.flowNum);
  // Re-assign IDs after sort
  routes.forEach((r, i) => { r.id = i; });

  return routes;
}

function dfsPath(adj, source, sink) {
  if (source === sink) return null;

  const visited = new Set();
  const path = [];

  function dfs(node) {
    if (node === sink) return true;
    visited.add(node);
    for (const edge of adj.get(node) || []) {
      if (edge.capacity <= 0n) continue;
      if (visited.has(edge.to)) continue;
      path.push(edge);
      if (dfs(edge.to)) return true;
      path.pop();
    }
    return false;
  }

  return dfs(source) ? [...path] : null;
}

/**
 * Given selected routes, reconstruct transfers with adjusted values.
 * If a transfer is used by multiple selected routes, its value = sum of flows.
 *
 * @param {Array} routes - All routes from decomposeFlow
 * @param {Set} selectedRouteIds - Set of route IDs to include
 * @param {Array} originalTransfers - Original transfer array
 * @returns {{ transfers: Array, maxFlow: string }}
 */
export function transfersFromRoutes(routes, selectedRouteIds, originalTransfers) {
  // Accumulate flow per original transfer index
  const flowByIdx = new Map();

  for (const route of routes) {
    if (!selectedRouteIds.has(route.id)) continue;
    for (const edge of route.edges) {
      const prev = flowByIdx.get(edge.originalTransferIdx) || 0n;
      flowByIdx.set(edge.originalTransferIdx, prev + BigInt(edge.flow));
    }
  }

  // Build adjusted transfers (only those with flow > 0)
  const transfers = [];
  for (const [idx, flow] of flowByIdx.entries()) {
    if (flow <= 0n) continue;
    transfers.push({
      ...originalTransfers[idx],
      value: flow.toString(),
    });
  }

  // maxFlow = sum of selected routes' flows
  let maxFlow = 0n;
  for (const route of routes) {
    if (selectedRouteIds.has(route.id)) {
      maxFlow += BigInt(route.flow);
    }
  }

  return { transfers, maxFlow: maxFlow.toString() };
}
