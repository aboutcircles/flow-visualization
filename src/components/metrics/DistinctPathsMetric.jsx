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
    
    // Identify source and sink nodes properly
    const onlySourceAddresses = [...fromSet].filter(addr => !toSet.has(addr));
    const onlySinkAddresses = [...toSet].filter(addr => !fromSet.has(addr));
    
    // Determine source and sink
    let sourceAddress, sinkAddress;
    if (onlySourceAddresses.length === 0 && onlySinkAddresses.length === 0) {
      // Circular flow - all addresses appear as both source and sink
      sourceAddress = pathData.transfers[0]?.from.toLowerCase();
      sinkAddress = pathData.transfers[pathData.transfers.length - 1]?.to.toLowerCase();
    } else {
      sourceAddress = onlySourceAddresses[0] || pathData.transfers[0]?.from.toLowerCase();
      sinkAddress = onlySinkAddresses[0] || pathData.transfers[pathData.transfers.length - 1]?.to.toLowerCase();
    }
    
    // Build adjacency list with flow amounts and original transfer data
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
        edgeIndex: transferIndex // Add edge index for unique identification
      });
    });
    
    // Find all paths using DFS with edge tracking
    const paths = [];
    const MAX_PATHS = 1000; // Limit to prevent memory issues
    const MAX_PATH_LENGTH = 20; // Limit path length
    
    if (sourceAddress === sinkAddress) {
      // Special handling for self-loops: find circular paths that complete the loop
      const findCircularPaths = (startNode) => {
        const dfsCircular = (node, currentPath, minFlow, transfers, visitedEdges = new Set(), visitedNodes = new Set()) => {
          if (paths.length >= MAX_PATHS) return;
          if (currentPath.length > MAX_PATH_LENGTH) return;
          
          // Check if we've returned to the start node to complete the loop
          if (node === startNode && currentPath.length > 0) {
            // Verify this is a complete circular path
            const pathStart = currentPath[0].from;
            const pathEnd = currentPath[currentPath.length - 1].to;
            
            if (pathStart === startNode && pathEnd === startNode) {
              // Verify the path is continuous (each edge connects properly)
              let isValid = true;
              for (let i = 0; i < currentPath.length - 1; i++) {
                if (currentPath[i].to !== currentPath[i + 1].from) {
                  isValid = false;
                  break;
                }
              }
              
              if (isValid) {
                paths.push({
                  path: [...currentPath],
                  flow: minFlow,
                  transfers: [...transfers]
                });
              }
            }
            return;
          }
          
          // Don't revisit nodes except when completing the loop
          if (visitedNodes.has(node) && node !== startNode) return;
          visitedNodes.add(node);
          
          const edges = graph[node] || [];
          for (const edge of edges) {
            const edgeKey = `${node}-${edge.to}-${edge.edgeIndex}`;
            
            // Skip if we've already used this exact edge
            if (visitedEdges.has(edgeKey)) continue;
            
            // Allow returning to start node only if we have traversed some path
            if (edge.to === startNode && currentPath.length === 0) continue;
            
            // Don't visit already visited nodes unless it's to complete the loop
            if (visitedNodes.has(edge.to) && edge.to !== startNode) continue;
            
            // Mark edge as visited
            visitedEdges.add(edgeKey);
            
            // Add to path
            currentPath.push({ from: node, to: edge.to });
            transfers.push(edge.originalTransfer);
            
            // Continue DFS
            dfsCircular(edge.to, currentPath, Math.min(minFlow, edge.flow), transfers, new Set(visitedEdges), new Set(visitedNodes));
            
            // Backtrack
            currentPath.pop();
            transfers.pop();
            visitedEdges.delete(edgeKey);
          }
          
          visitedNodes.delete(node);
        };
        
        dfsCircular(startNode, [], Infinity, [], new Set(), new Set());
      };
      
      findCircularPaths(sourceAddress);
    } else {
      // Normal path finding for different source and sink
      const dfs = (node, target, currentPath, minFlow, transfers, visitedEdges = new Set()) => {
        if (paths.length >= MAX_PATHS) return;
        if (currentPath.length > MAX_PATH_LENGTH) return;
        
        if (node === target && currentPath.length > 0) {
          paths.push({
            path: [...currentPath],
            flow: minFlow,
            transfers: [...transfers]
          });
          return;
        }
        
        const edges = graph[node] || [];
        for (const edge of edges) {
          const edgeKey = `${node}-${edge.to}-${edge.edgeIndex}`;
          
          if (!visitedEdges.has(edgeKey)) {
            // Avoid revisiting nodes except for the target
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
    
    // Validate circular paths if source === sink
    if (sourceAddress === sinkAddress) {
      const validPaths = paths.filter(p => {
        // Ensure the path forms a complete loop
        if (p.path.length === 0) return false;
        const firstFrom = p.path[0].from;
        const lastTo = p.path[p.path.length - 1].to;
        return firstFrom === sourceAddress && lastTo === sourceAddress;
      });
      
      // Replace paths with only valid circular paths
      paths.length = 0;
      paths.push(...validPaths);
    }
    
    // Group paths by flow amount
    const pathsByFlow = {};
    paths.forEach(({ path, flow, transfers }) => {
      const flowKey = flow.toFixed(6);
      if (!pathsByFlow[flowKey]) {
        pathsByFlow[flowKey] = {
          flow: flow,
          paths: [],
          transfers: [], // Store all transfer sets for this flow amount
          totalFlow: 0
        };
      }
      pathsByFlow[flowKey].paths.push(path);
      pathsByFlow[flowKey].transfers.push(transfers);
      pathsByFlow[flowKey].totalFlow += flow;
    });
    
    // Convert to array and sort by flow
    const distinctPaths = Object.values(pathsByFlow)
      .map(group => ({
        flow: group.flow,
        pathCount: group.paths.length,
        totalFlow: group.totalFlow,
        examplePath: group.paths[0], // Keep one example path
        allTransfers: group.transfers // Keep all transfer sets for this flow amount
      }))
      .sort((a, b) => b.flow - a.flow);
    
    // Calculate total flow
    const totalFlow = distinctPaths.reduce((sum, p) => sum + p.totalFlow, 0);
    
    // Add percentage to each path group
    distinctPaths.forEach(p => {
      p.percentage = totalFlow > 0 ? ((p.totalFlow / totalFlow * 100).toFixed(2)) : '0';
    });
    
    const truncatedMessage = paths.length >= MAX_PATHS 
      ? ` (truncated at ${MAX_PATHS} paths)` 
      : '';
    
    return createMetricResult({
      value: distinctPaths.length,
      description: `${distinctPaths.length} distinct flow amounts found`,
      details: `Total paths: ${paths.length}${truncatedMessage}, Total flow: ${totalFlow.toFixed(2)} CRC`,
      pathData: distinctPaths.slice(0, 10), // Keep top 10 for visualization
      fullPathData: distinctPaths // Keep all data
    });
  },
  
  // RECOMMENDATION: For future improvement, consider passing the `result.fullPathData`
  // from the `calculate` function into this component. This avoids recalculating all
  // paths, which is more efficient and prevents logic inconsistencies like the one fixed here.
  visualize: (pathData, value, details, result) => {
    const [selectedBar, setSelectedBar] = useState(null);
    const [selectedFlowKey, setSelectedFlowKey] = useState(null);
    
    // Handle "Too Large" case
    if (value === 'Too Large') {
      return (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg text-center text-gray-500">
          <p>Graph too large for path visualization</p>
          <p className="text-xs mt-1">{details}</p>
        </div>
      );
    }
    
    // Add keyboard support
    useEffect(() => {
      const handleKeyDown = (e) => {
        if (e.key === 'Escape' && selectedFlowKey) {
          // Deselect on Escape
          handleDeselect();
        }
      };
      
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedFlowKey]);
    
    // Deselect function
    const handleDeselect = () => {
      setSelectedFlowKey(null);
      setSelectedBar(null);
      
      // Clear graph highlights
      if (window.getCyInstance) {
        const cy = window.getCyInstance();
        if (cy) {
          cy.batch(() => {
            cy.elements().removeClass('highlighted path-highlighted path-node');
          });
        }
      }
    };
    
    // Recalculate paths for visualization
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
      sinkAddress = pathData.transfers[pathData.transfers.length - 1]?.to.toLowerCase();
    } else {
      sourceAddress = onlySourceAddresses[0] || pathData.transfers[0]?.from.toLowerCase();
      sinkAddress = onlySinkAddresses[0] || pathData.transfers[pathData.transfers.length - 1]?.to.toLowerCase();
    }
    
    // Build graph with transfer info
    const graph = {};
    pathData.transfers.forEach((transfer, transferIndex) => {
      const from = transfer.from.toLowerCase();
      const to = transfer.to.toLowerCase();
      const flow = Number(transfer.value) / 1e18;
      
      if (!graph[from]) graph[from] = [];
      graph[from].push({ to, flow, originalTransfer: transfer, edgeIndex: transferIndex });
    });
    
    // Find paths with transfers
    const paths = [];
    
    if (sourceAddress === sinkAddress) {
      // For self-loops, find circular paths
      const findCircularPaths = (startNode) => {
        const dfsCircular = (node, currentPath, minFlow, transfers, visitedEdges = new Set(), visitedNodes = new Set()) => {
          if (currentPath.length > 20) return; // Max path length
          
          // Found a circular path back to start
          if (node === startNode && currentPath.length > 0) {
            // Verify complete loop
            const pathStart = currentPath[0].from;
            const pathEnd = currentPath[currentPath.length - 1].to;
            
            if (pathStart === startNode && pathEnd === startNode) {
              // Verify the path is continuous
              let isValid = true;
              for (let i = 0; i < currentPath.length - 1; i++) {
                if (currentPath[i].to !== currentPath[i + 1].from) {
                  isValid = false;
                  break;
                }
              }
              
              if (isValid) {
                paths.push({ 
                  path: [...currentPath], 
                  flow: minFlow,
                  transfers: [...transfers]
                });
              }
            }
            return;
          }
          
          // Don't revisit nodes except when completing the loop
          if (visitedNodes.has(node) && node !== startNode) return;
          visitedNodes.add(node);
          
          const edges = graph[node] || [];
          for (const edge of edges) {
            const edgeKey = `${node}-${edge.to}-${edge.edgeIndex}`;
            
            if (visitedEdges.has(edgeKey)) continue;
            if (edge.to === startNode && currentPath.length === 0) continue;
            if (visitedNodes.has(edge.to) && edge.to !== startNode) continue;
            
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
    } else {
      // Normal path finding
      const dfs = (node, target, currentPath, minFlow, transfers, visitedEdges = new Set()) => {
        if (node === target && currentPath.length > 0) {
          paths.push({ 
            path: [...currentPath], 
            flow: minFlow,
            transfers: [...transfers]
          });
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
    
   // This ensures only complete, valid loops are processed for visualization.
    if (sourceAddress === sinkAddress) {
      const validPaths = paths.filter(p => {
        if (p.path.length === 0) return false;
        const firstFrom = p.path[0].from;
        const lastTo = p.path[p.path.length - 1].to;
        return firstFrom === sourceAddress && lastTo === sourceAddress;
      });
      
      // Replace the paths array with only the valid, filtered paths.
      paths.length = 0;
      paths.push(...validPaths);
    }

    // Group by flow with transfer info
    const pathsByFlow = {};
    paths.forEach(({ path, flow, transfers }) => {
      const flowKey = flow.toFixed(6);
      if (!pathsByFlow[flowKey]) {
        pathsByFlow[flowKey] = { 
          flow, 
          count: 0, 
          totalFlow: 0,
          transferSets: [] // Store transfer sets for each path
        };
      }
      pathsByFlow[flowKey].count++;
      pathsByFlow[flowKey].totalFlow += flow;
      pathsByFlow[flowKey].transferSets.push(transfers);
    });
    
    // Prepare chart data
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
          transferSets: group.transferSets, // Keep transfer sets for clicking
          index: index
        };
      });
    
    if (chartData.length === 0) return null;
    
    // Enhanced bar click handler with toggle support
    const handleBarClick = (data, index) => {
      if (data && data.transferSets && data.transferSets.length > 0) {
        const flowKey = data.flow.toFixed(6);
        
        // Check if this bar is currently selected
        if (selectedFlowKey === flowKey && selectedBar === index) {
          // Get current path index
          let currentIndex = pathIndices.get(flowKey) || 0;
          
          // If we've cycled through all paths, deselect
          if (currentIndex === data.transferSets.length - 1) {
            handleDeselect();
            pathIndices.delete(flowKey);
            return;
          }
          
          // Otherwise, advance to next path
          currentIndex = (currentIndex + 1) % data.transferSets.length;
          pathIndices.set(flowKey, currentIndex);
          
          const transfers = data.transferSets[currentIndex];
          if (typeof window.highlightPath === 'function') {
            window.highlightPath(transfers);
            console.log(`Showing path ${currentIndex + 1} of ${data.transferSets.length} for flow ${data.flow.toFixed(2)} CRC`);
          }
        } else {
          // Selecting a new bar or reselecting after deselection
          const currentIndex = 0;
          pathIndices.set(flowKey, currentIndex);
          setSelectedFlowKey(flowKey);
          setSelectedBar(index);
          
          const transfers = data.transferSets[currentIndex];
          if (typeof window.highlightPath === 'function') {
            window.highlightPath(transfers);
            console.log(`Showing path 1 of ${data.transferSets.length} for flow ${data.flow.toFixed(2)} CRC`);
          }
        }
      }
    };
    
    // Custom bar shape for expanded click area
    const ExpandedClickBar = (props) => {
      const { x, y, width, height, index, fill } = props;
      const data = chartData[index];
      const chartHeight = 250;
      
      return (
        <g>
          {/* Visible bar */}
          <rect
            x={x}
            y={y}
            width={width}
            height={height}
            fill={fill}
          />
          {/* Invisible expanded click area */}
          <rect
            x={x}
            y={0}
            width={width}
            height={chartHeight}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onClick={() => handleBarClick(data, index)}
            onMouseEnter={(e) => {
              e.target.style.fill = 'rgba(59, 130, 246, 0.1)';
            }}
            onMouseLeave={(e) => {
              e.target.style.fill = 'transparent';
            }}
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
            <XAxis 
              dataKey="name" 
              angle={-45} 
              textAnchor="end" 
              height={80}
              fontSize={12}
            />
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
                          Path {currentIndex + 1} of {data.paths}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        {isSelected ? 'Click to cycle paths' : 'Click to highlight path'}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Bar 
              dataKey="percentage" 
              name="% of Total Flow"
              shape={ExpandedClickBar}
            >
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={selectedBar === index ? '#EF4444' : '#3B82F6'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-2 text-xs text-gray-500">
          {sourceAddress === sinkAddress ? (
            <span className="text-amber-600">
              Self-loop detected: Showing circular paths from/to {sourceAddress.slice(0,6)}...
            </span>
          ) : (
            'Each bar represents paths with the same flow amount. Click anywhere in the bar column to select.'
          )}
        </div>
      </div>
    );
  },
});