import React, { useState, useEffect } from 'react';
import { Route } from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell 
} from 'recharts';
import { createMetric, createMetricResult } from './BaseMetric';

// Store current path indices for each flow amount
const pathIndices = new Map();

export default createMetric({
  id: 'distinctPaths',
  name: 'Distinct Flow Paths',
  icon: Route,
  description: 'Analysis of distinct paths from source to sink by flow amount',
  order: 45,
  
  calculate: (pathData) => {
    // Clear path indices when calculating new paths
    pathIndices.clear();
    // Skip path computation for large graphs
    if (pathData.transfers.length > 200) {
      return createMetricResult({
        value: 'Too Large',
        description: 'Graph too large for path analysis',
        details: `${pathData.transfers.length} transfers exceed analysis limit`,
        pathData: [],
        fullPathData: []
      });
    }
    
    // Find source and sink
    const fromSet = new Set();
    const toSet = new Set();
    
    pathData.transfers.forEach(t => {
      fromSet.add(t.from.toLowerCase());
      toSet.add(t.to.toLowerCase());
    });
    
    const onlySourceAddresses = [...fromSet].filter(addr => !toSet.has(addr));
    const onlySinkAddresses = [...toSet].filter(addr => !fromSet.has(addr));
    
    // Determine source and sink to ensure loop-finding is triggered.
    let sourceAddress, sinkAddress;
    if (onlySourceAddresses.length === 0 && onlySinkAddresses.length === 0) {
      // This indicates a purely circular graph.
      sourceAddress = pathData.transfers[0]?.from.toLowerCase();
      // The sink MUST be the same as the source to find loops. This was the bug.
      sinkAddress = sourceAddress; 
    } else {
      // The graph has clear entry and/or exit points.
      sourceAddress = onlySourceAddresses[0] || pathData.transfers[0]?.from.toLowerCase();
      sinkAddress = onlySinkAddresses[0] || pathData.transfers[pathData.transfers.length - 1]?.to.toLowerCase();
    }
    
    // Build adjacency list
    const graph = {};
    pathData.transfers.forEach((transfer, transferIndex) => {
      const from = transfer.from.toLowerCase();
      const to = transfer.to.toLowerCase();
      const flow = Number(transfer.value) / 1e18;
      
      if (!graph[from]) graph[from] = [];
      graph[from].push({ 
        to, 
        flow, 
        originalTransfer: transfer,
        edgeIndex: transferIndex
      });
    });
    
    // Find all paths using DFS
    const paths = [];
    const MAX_PATHS = 1000;
    const MAX_PATH_LENGTH = 20;
    
    if (sourceAddress && sourceAddress === sinkAddress) {
      const findCircularPaths = (startNode) => {
        const dfsCircular = (node, currentPath, minFlow, transfers, visitedEdges = new Set(), visitedNodes = new Set()) => {
          if (paths.length >= MAX_PATHS || currentPath.length > MAX_PATH_LENGTH) return;
          
          if (node === startNode && currentPath.length > 0) {
            paths.push({ path: [...currentPath], flow: minFlow, transfers: [...transfers] });
            return;
          }
          
          if (visitedNodes.has(node) && node !== startNode) return;
          visitedNodes.add(node);
          
          const edges = graph[node] || [];
          for (const edge of edges) {
            const edgeKey = `${node}-${edge.to}-${edge.edgeIndex}`;
            if (visitedEdges.has(edgeKey) || (edge.to === startNode && currentPath.length === 0) || (visitedNodes.has(edge.to) && edge.to !== startNode)) continue;
            
            visitedEdges.add(edgeKey);
            currentPath.push({ from: node, to: edge.to });
            transfers.push(edge.originalTransfer);
            
            dfsCircular(edge.to, currentPath, Math.min(minFlow, edge.flow), transfers, new Set(visitedEdges), new Set(visitedNodes));
            
            currentPath.pop();
            transfers.pop();
            visitedEdges.delete(edgeKey);
          }
          visitedNodes.delete(node);
        };
        dfsCircular(startNode, [], Infinity, [], new Set(), new Set());
      };
      findCircularPaths(sourceAddress);
    } else if (sourceAddress && sinkAddress) {
      const dfs = (node, target, currentPath, minFlow, transfers, visitedEdges = new Set()) => {
        if (paths.length >= MAX_PATHS || currentPath.length > MAX_PATH_LENGTH) return;
        
        if (node === target && currentPath.length > 0) {
          paths.push({ path: [...currentPath], flow: minFlow, transfers: [...transfers] });
          return;
        }
        
        const edges = graph[node] || [];
        for (const edge of edges) {
          const edgeKey = `${node}-${edge.to}-${edge.edgeIndex}`;
          if (!visitedEdges.has(edgeKey)) {
            const isRevisitingNonTarget = currentPath.some(p => p.to === edge.to) && edge.to !== target;
            if (!isRevisitingNonTarget) {
              visitedEdges.add(edgeKey);
              currentPath.push({ from: node, to: edge.to });
              transfers.push(edge.originalTransfer);
              dfs(edge.to, target, currentPath, Math.min(minFlow, edge.flow), transfers, visitedEdges);
              currentPath.pop();
              transfers.pop();
              visitedEdges.delete(edgeKey);
            }
          }
        }
      };
      dfs(sourceAddress, sinkAddress, [], Infinity, [], new Set());
    }
    
    // Post-validation is still a good safety net
    if (sourceAddress === sinkAddress) {
      const validPaths = paths.filter(p => {
        if (p.path.length === 0) return false;
        const firstFrom = p.path[0].from;
        const lastTo = p.path[p.path.length - 1].to;
        return firstFrom === sourceAddress && lastTo === sourceAddress;
      });
      paths.length = 0;
      paths.push(...validPaths);
    }
    
    // Group paths by flow amount
    const pathsByFlow = {};
    paths.forEach(({ path, flow, transfers }) => {
      const flowKey = flow.toFixed(6);
      if (!pathsByFlow[flowKey]) {
        pathsByFlow[flowKey] = { flow: flow, paths: [], transfers: [], totalFlow: 0 };
      }
      pathsByFlow[flowKey].paths.push(path);
      pathsByFlow[flowKey].transfers.push(transfers);
      pathsByFlow[flowKey].totalFlow += flow;
    });
    
    const distinctPaths = Object.values(pathsByFlow)
      .map(group => ({
        flow: group.flow,
        pathCount: group.paths.length,
        totalFlow: group.totalFlow,
        examplePath: group.paths[0],
        allTransfers: group.transfers
      }))
      .sort((a, b) => b.flow - a.flow);
    
    const totalFlow = distinctPaths.reduce((sum, p) => sum + p.totalFlow, 0);
    
    distinctPaths.forEach(p => {
      p.percentage = totalFlow > 0 ? ((p.totalFlow / totalFlow * 100).toFixed(2)) : '0';
    });
    
    const truncatedMessage = paths.length >= MAX_PATHS ? ` (truncated at ${MAX_PATHS} paths)` : '';
    
    return createMetricResult({
      value: distinctPaths.length,
      description: `${distinctPaths.length} distinct flow amounts found`,
      details: `Total paths: ${paths.length}${truncatedMessage}, Total flow: ${totalFlow.toFixed(2)} CRC`,
      pathData: distinctPaths.slice(0, 10),
      fullPathData: distinctPaths
    });
  },
  
  visualize: (pathData, value, details, result) => {
    const [selectedBar, setSelectedBar] = useState(null);
    const [selectedFlowKey, setSelectedFlowKey] = useState(null);
    
    if (value === 'Too Large') {
      return (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg text-center text-gray-500">
          <p>Graph too large for path visualization</p>
          <p className="text-xs mt-1">{details}</p>
        </div>
      );
    }
    
    const clearAllHighlights = () => {
      if (window.getCyInstance) {
        const cy = window.getCyInstance();
        if (cy) {
          cy.batch(() => {
            cy.elements().removeClass('highlighted path-highlighted path-node');
          });
        }
      }
    };

    const handleDeselect = () => {
      setSelectedFlowKey(null);
      setSelectedBar(null);
      pathIndices.clear();
      clearAllHighlights();
    };

    useEffect(() => {
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          handleDeselect();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);
    
    // Re-apply the same corrected logic in the visualize function
    const fromSet = new Set();
    const toSet = new Set();
    pathData.transfers.forEach(t => {
      fromSet.add(t.from.toLowerCase());
      toSet.add(t.to.toLowerCase());
    });
    const onlySourceAddresses = [...fromSet].filter(addr => !toSet.has(addr));
    const onlySinkAddresses = [...toSet].filter(addr => !fromSet.has(addr));
    
    let sourceAddress, sinkAddress;
    if (onlySourceAddresses.length === 0 && onlySinkAddresses.length === 0) {
      sourceAddress = pathData.transfers[0]?.from.toLowerCase();
      sinkAddress = sourceAddress;
    } else {
      sourceAddress = onlySourceAddresses[0] || pathData.transfers[0]?.from.toLowerCase();
      sinkAddress = onlySinkAddresses[0] || pathData.transfers[pathData.transfers.length - 1]?.to.toLowerCase();
    }

    const graph = {};
    pathData.transfers.forEach((transfer, transferIndex) => {
        const from = transfer.from.toLowerCase();
        const to = transfer.to.toLowerCase();
        const flow = Number(transfer.value) / 1e18;
        if (!graph[from]) graph[from] = [];
        graph[from].push({ to, flow, originalTransfer: transfer, edgeIndex: transferIndex });
    });

    const paths = []; // This will be repopulated by the logic below

    if (sourceAddress && sourceAddress === sinkAddress) {
        const findCircularPaths = (startNode) => {
            const dfsCircular = (node, currentPath, minFlow, transfers, visitedEdges = new Set(), visitedNodes = new Set()) => {
                if (currentPath.length > 20) return;
                if (node === startNode && currentPath.length > 0) {
                    paths.push({ path: [...currentPath], flow: minFlow, transfers: [...transfers] });
                    return;
                }
                if (visitedNodes.has(node) && node !== startNode) return;
                visitedNodes.add(node);
                const edges = graph[node] || [];
                for (const edge of edges) {
                    const edgeKey = `${node}-${edge.to}-${edge.edgeIndex}`;
                    if (visitedEdges.has(edgeKey) || (edge.to === startNode && currentPath.length === 0) || (visitedNodes.has(edge.to) && edge.to !== startNode)) continue;
                    visitedEdges.add(edgeKey);
                    currentPath.push({ from: node, to: edge.to });
                    transfers.push(edge.originalTransfer);
                    dfsCircular(edge.to, currentPath, Math.min(minFlow, edge.flow), transfers, new Set(visitedEdges), new Set(visitedNodes));
                    currentPath.pop();
                    transfers.pop();
                    visitedEdges.delete(edgeKey);
                }
                visitedNodes.delete(node);
            };
            dfsCircular(startNode, [], Infinity, [], new Set(), new Set());
        };
        findCircularPaths(sourceAddress);
    } else if (sourceAddress && sinkAddress) {
        const dfs = (node, target, currentPath, minFlow, transfers, visitedEdges = new Set()) => {
            if (node === target && currentPath.length > 0) {
                paths.push({ path: [...currentPath], flow: minFlow, transfers: [...transfers] });
                return;
            }
            const edges = graph[node] || [];
            for (const edge of edges) {
                const edgeKey = `${node}-${edge.to}-${edge.edgeIndex}`;
                if (!visitedEdges.has(edgeKey)) {
                    const isRevisitingNonTarget = currentPath.some(p => p.to === edge.to) && edge.to !== target;
                    if (!isRevisitingNonTarget) {
                        visitedEdges.add(edgeKey);
                        currentPath.push({ from: node, to: edge.to });
                        transfers.push(edge.originalTransfer);
                        dfs(edge.to, target, currentPath, Math.min(minFlow, edge.flow), transfers, visitedEdges);
                        currentPath.pop();
                        transfers.pop();
                        visitedEdges.delete(edgeKey);
                    }
                }
            }
        };
        dfs(sourceAddress, sinkAddress, [], Infinity, [], new Set());
    }
    if (sourceAddress === sinkAddress) {
        const validPaths = paths.filter(p => {
            if (p.path.length === 0) return false;
            const firstFrom = p.path[0].from;
            const lastTo = p.path[p.path.length - 1].to;
            return firstFrom === sourceAddress && lastTo === sourceAddress;
        });
        paths.length = 0;
        paths.push(...validPaths);
    }
    
    const pathsByFlow = {};
    paths.forEach(({ path, flow, transfers }) => {
      const flowKey = flow.toFixed(6);
      if (!pathsByFlow[flowKey]) {
        pathsByFlow[flowKey] = { flow, count: 0, totalFlow: 0, transferSets: [] };
      }
      pathsByFlow[flowKey].count++;
      pathsByFlow[flowKey].totalFlow += flow;
      pathsByFlow[flowKey].transferSets.push(transfers);
    });

    const chartData = Object.values(pathsByFlow)
      .sort((a, b) => b.flow - a.flow)
      .slice(0, 10)
      .map((group, index) => {
        const totalFlow = Object.values(pathsByFlow).reduce((sum, g) => sum + g.totalFlow, 0);
        return {
          name: `${group.flow.toFixed(2)} CRC`,
          paths: group.count,
          percentage: totalFlow > 0 ? parseFloat(((group.totalFlow / totalFlow) * 100).toFixed(2)) : 0,
          flow: group.flow,
          transferSets: group.transferSets,
          index: index
        };
      });
    
    if (chartData.length === 0) return null;
    
    const handleBarClick = (data, index) => {
      if (!data || !data.transferSets || data.transferSets.length === 0) {
        handleDeselect();
        return;
      }

      const flowKey = data.flow.toFixed(6);
      const isSameBar = selectedFlowKey === flowKey && selectedBar === index;
      let nextIndex;

      if (isSameBar) {
        const currentIndex = pathIndices.get(flowKey) || 0;
        if (currentIndex >= data.transferSets.length - 1) {
          handleDeselect();
          return;
        }
        nextIndex = currentIndex + 1;
      } else {
        nextIndex = 0;
      }
      
      clearAllHighlights();

      pathIndices.set(flowKey, nextIndex);
      setSelectedFlowKey(flowKey);
      setSelectedBar(index);

      const transfersToShow = data.transferSets[nextIndex];
      if (typeof window.highlightPath === 'function') {
        window.highlightPath(transfersToShow);
        console.log(`Showing path ${nextIndex + 1} of ${data.transferSets.length} for flow ${data.flow.toFixed(2)} CRC`);
      }
    };

    const ExpandedClickBar = (props) => {
      const { x, y, width, height, index, fill } = props;
      const data = chartData[index];
      const chartHeight = 250;
      
      return (
        <g>
          <rect x={x} y={y} width={width} height={height} fill={fill} />
          <rect
            x={x} y={0} width={width} height={chartHeight}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onClick={() => handleBarClick(data, index)}
            onMouseEnter={(e) => { e.target.style.fill = 'rgba(59, 130, 246, 0.1)'; }}
            onMouseLeave={(e) => { e.target.style.fill = 'transparent'; }}
          />
        </g>
      );
    };
    
    return (
      <div className="mt-4">
        <div className="mb-2 text-sm text-gray-600">
          Top 10 flow amounts by percentage of total flow (click bars to explore paths, click again to cycle):
        </div>
        {selectedFlowKey && (
          <div className="mb-2 text-xs text-blue-600">
            Press ESC to deselect current path
          </div>
        )}
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} fontSize={12} />
            <YAxis />
            <Tooltip 
              content={({ active, payload }) => {
                if (active && payload && payload[0]) {
                  const data = payload[0].payload;
                  const flowKey = data.flow.toFixed(6);
                  const currentIndex = pathIndices.get(flowKey) || 0;
                  const isSelected = selectedFlowKey === flowKey;
                  
                  return (
                    <div className="bg-white p-2 border border-gray-200 rounded shadow-sm">
                      <p className="text-sm font-semibold">{data.name}</p>
                      <p className="text-xs">{`${data.percentage}% of total flow`}</p>
                      <p className="text-xs">{`${data.paths} path${data.paths > 1 ? 's' : ''}`}</p>
                      {isSelected && data.paths > 1 && (
                        <p className="text-xs text-blue-600 font-semibold">
                          Showing Path {currentIndex + 1} of {data.paths}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {isSelected ? 'Click again to cycle or deselect' : 'Click to highlight path'}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar dataKey="percentage" name="% of Total Flow" shape={ExpandedClickBar}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={selectedBar === index ? '#EF4444' : '#3B82F6'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-2 text-xs text-gray-500">
          {sourceAddress === sinkAddress ? (
            <span className="text-amber-600">
              Self-loop detected: Showing circular paths from/to {sourceAddress ? sourceAddress.slice(0,6) : ''}...
            </span>
          ) : (
            'Each bar represents paths with the same flow amount. Click anywhere in the bar column to select.'
          )}
        </div>
      </div>
    );
  },
});