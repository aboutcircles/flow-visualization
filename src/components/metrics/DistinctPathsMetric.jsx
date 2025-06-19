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
import { computeDistinctPathsForVisualization } from '@/lib/flowPathComputation';

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
    if (pathData.transfers.length > 5000) {
      return createMetricResult({
        value: 'Too Large',
        description: 'Graph too large for path analysis',
        details: `${pathData.transfers.length} transfers exceed analysis limit`,
        pathData: [],
        fullPathData: [],
        visualization: null
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
    
    // Determine source and sink
    let sourceAddress, sinkAddress;
    if (onlySourceAddresses.length === 0 && onlySinkAddresses.length === 0) {
      sourceAddress = pathData.transfers[0]?.from.toLowerCase();
      sinkAddress = sourceAddress; 
    } else {
      sourceAddress = onlySourceAddresses[0] || pathData.transfers[0]?.from.toLowerCase();
      sinkAddress = onlySinkAddresses[0] || pathData.transfers[pathData.transfers.length - 1]?.to.toLowerCase();
    }
    
    console.log('Computing paths from', sourceAddress, 'to', sinkAddress);
    
    // Use the new Graphology-based computation
    const distinctPaths = computeDistinctPathsForVisualization(
      pathData.transfers, 
      sourceAddress, 
      sinkAddress
    );
    
    const totalFlow = distinctPaths.reduce((sum, p) => sum + p.totalFlow, 0);
    
    distinctPaths.forEach(p => {
      p.percentage = totalFlow > 0 ? ((p.totalFlow / totalFlow * 100).toFixed(2)) : '0';
    });
    
    const totalPaths = distinctPaths.reduce((sum, p) => sum + p.pathCount, 0);
    
    // Store visualization data
    const visualizationData = {
      distinctPaths: distinctPaths.slice(0, 100),
      sourceAddress,
      sinkAddress,
      totalFlow
    };
    
    return createMetricResult({
      value: distinctPaths.length,
      description: `${distinctPaths.length} distinct flow amounts found`,
      details: `Total paths: ${totalPaths}, Total flow: ${totalFlow.toFixed(2)} CRC`,
      pathData: distinctPaths.slice(0, 100),
      fullPathData: distinctPaths,
      visualization: visualizationData
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
    
    // Check if visualization data exists
    if (!result || !result.visualization || !result.visualization.distinctPaths) {
      return (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg text-center text-gray-500">
          <p>No path data available</p>
        </div>
      );
    }
    
    const { distinctPaths, sourceAddress, sinkAddress } = result.visualization;
    
    const clearAllHighlights = () => {
      // Clear Cytoscape highlights
      if (window.getCyInstance) {
        const cy = window.getCyInstance();
        if (cy) {
          cy.batch(() => {
            cy.elements().removeClass('highlighted path-highlighted path-node');
          });
        }
      }
      
      // Clear Sankey highlights
      if (window._sankeyInstance && window._sankeyRef && window._sankeyRef.current) {
        if (window._sankeyRef.current.clearHighlight) {
          window._sankeyRef.current.clearHighlight();
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
    
    // Transform for chart
    const chartData = distinctPaths
      .map((group, index) => ({
        name: `${group.flow.toFixed(2)} CRC`,
        paths: group.pathCount,
        percentage: parseFloat(group.percentage),
        flow: group.flow,
        transferSets: group.allTransfers,
        index: index
      }));
    
    if (chartData.length === 0) {
      return (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg text-center text-gray-500">
          <p>No distinct paths found</p>
        </div>
      );
    }
    
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
      console.log('Transfers to highlight:', transfersToShow);
      
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
          Top 100 flow amounts by percentage of total flow (click bars to explore paths, click again to cycle):
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