import React, { useRef, useEffect, useState, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import * as echarts from 'echarts';
import { usePerformance } from '@/contexts/PerformanceContext';
import { Button } from '@/components/ui/button';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Move,
  Filter,
  Layers,
  X
} from 'lucide-react';
import * as SliderPrimitive from '@radix-ui/react-slider';

const SankeyVisualization = forwardRef(({ 
  pathData,
  formData,
  wrappedTokens,
  nodeProfiles,
  tokenOwnerProfiles,
  balancesByAccount,
  minCapacity,
  maxCapacity,
  onTransactionSelect,
  selectedTransactionId
}, ref) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const isInitializingRef = useRef(false);
  const { config } = usePerformance();
  const [flowThreshold, setFlowThreshold] = useState(0);
  const [renderingStrategy, setRenderingStrategy] = useState('standard');
  const [showAggregated, setShowAggregated] = useState(false);
  const [zoom, setZoom] = useState({ scale: 1, translateX: 0, translateY: 0 });
  const [highlightedPath, setHighlightedPath] = useState(null);

  // Calculate max flow for conditional check
  const maxFlow = useMemo(() => {
    if (!pathData?.transfers) return 0;
    return Math.max(...pathData.transfers.map(t => Number(t.value) / 1e18));
  }, [pathData]);

  // Generate consistent color for each token
  const getTokenColor = useCallback((tokenOwner) => {
    // Use a hash function to generate consistent colors
    let hash = 0;
    for (let i = 0; i < tokenOwner.length; i++) {
      hash = tokenOwner.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 70%, 50%)`;
  }, []);

  // Clear highlight function
  const clearHighlight = useCallback(() => {
    setHighlightedPath(null);
  }, []);

  // Enhanced highlightPath that updates local state (same pattern as graph)
  const highlightPath = useCallback((transfers) => {
    console.log('SankeyVisualization: highlightPath called with:', transfers);
    setHighlightedPath(transfers);
  }, []);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    chartInstance,
    highlightPath,
    clearHighlight
  }));

  // Determine rendering strategy based on graph size
  const determineRenderingStrategy = useCallback((nodeCount, edgeCount) => {
    if (nodeCount > 500 || edgeCount > 2000) {
      return 'aggregated';
    } else if (nodeCount > 200 || edgeCount > 1000) {
      return 'compact';
    } else if (nodeCount > 50 || edgeCount > 200) {
      return 'medium';
    }
    return 'standard';
  }, []);

  // Initialize and update chart when data or highlights change
  useEffect(() => {
    if (!chartRef.current || !pathData) return;
    
    // Skip if already initializing
    if (isInitializingRef.current) return;
    
    isInitializingRef.current = true;

    // Initialize ECharts instance if needed
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, null, {
        renderer: 'canvas',
        width: 'auto',
        height: 'auto'
      });
      
      // Store instance globally
      window._sankeyInstance = chartInstance.current;
      window._sankeyRef = ref;
    }

    // Determine strategy
    const nodeCount = new Set(pathData.transfers.map(t => [t.from.toLowerCase(), t.to.toLowerCase()]).flat()).size;
    const edgeCount = pathData.transfers.length;
    const strategy = determineRenderingStrategy(nodeCount, edgeCount);
    setRenderingStrategy(strategy);

    // Transform data
    const transfers = pathData.transfers.map(t => ({
      ...t,
      from: t.from.toLowerCase(),
      to: t.to.toLowerCase(),
      tokenOwner: t.tokenOwner.toLowerCase()
    }));

    // Filter by capacity range
    const filteredTransfers = transfers.filter(t => {
      const flowValue = Number(t.value) / 1e18;
      return flowValue >= minCapacity && flowValue <= maxCapacity;
    });

    if (filteredTransfers.length === 0) {
      chartInstance.current.clear();
      isInitializingRef.current = false;
      return;
    }

    // Build nodes and determine highlighting
    const allNodes = new Set();
    const highlightedNodes = new Set();
    const highlightedEdges = new Set();
    
    filteredTransfers.forEach(transfer => {
      allNodes.add(transfer.from);
      allNodes.add(transfer.to);
    });

    // Check which transfers and nodes should be highlighted
    if (highlightedPath && highlightedPath.length > 0) {
      highlightedPath.forEach(highlightTransfer => {
        const from = highlightTransfer.from.toLowerCase();
        const to = highlightTransfer.to.toLowerCase();
        const token = highlightTransfer.tokenOwner.toLowerCase();
        
        highlightedNodes.add(from);
        highlightedNodes.add(to);
        
        // Create edge key for matching
        const edgeKey = `${from}-${to}-${token}`;
        highlightedEdges.add(edgeKey);
      });
    }

    // Determine source and sink
    const fromSet = new Set();
    const toSet = new Set();
    
    filteredTransfers.forEach(t => {
      fromSet.add(t.from);
      toSet.add(t.to);
    });

    const onlySourceAddresses = [...fromSet].filter(addr => !toSet.has(addr));
    const onlySinkAddresses = [...toSet].filter(addr => !fromSet.has(addr));

    let sourceAddress, sinkAddress;
    
    if (formData?.From && formData?.To) {
      sourceAddress = formData.From.toLowerCase();
      sinkAddress = formData.To.toLowerCase();
    } else {
      sourceAddress = onlySourceAddresses[0] || filteredTransfers[0]?.from;
      sinkAddress = onlySinkAddresses[0] || filteredTransfers[filteredTransfers.length - 1]?.to;
    }

    // Check for self-transfer case
    const isSelfTransfer = sourceAddress === sinkAddress;
    const virtualSinkAddress = isSelfTransfer ? `${sinkAddress}_virtual_sink` : null;

    // Create nodes
    const nodes = Array.from(allNodes).map(addr => {
      let color = '#CBD5E1';
      
      // For self-transfer, source gets yellow color
      if (isSelfTransfer && addr === sourceAddress) {
        color = highlightedNodes.has(addr) ? '#FDE047' : '#e0f63b';
      } else if (!isSelfTransfer) {
        // Normal case (source != sink)
        if (addr === sourceAddress) {
          color = highlightedNodes.has(addr) ? '#60A5FA' : '#3B82F6';
        } else if (addr === sinkAddress) {
          color = highlightedNodes.has(addr) ? '#F87171' : '#EF4444';
        } else if (highlightedNodes.has(addr)) {
          color = '#E5E7EB';
        }
      }
      
      return {
        name: addr,
        realAddress: addr,
        itemStyle: { 
          color,
          borderColor: highlightedNodes.has(addr) ? '#DC2626' : undefined,
          borderWidth: highlightedNodes.has(addr) ? 3 : 0
        }
      };
    });

    // Add virtual sink node if needed
    if (isSelfTransfer && virtualSinkAddress) {
      const isVirtualSinkHighlighted = highlightedNodes.has(sinkAddress);
      nodes.push({
        name: virtualSinkAddress,
        realAddress: sinkAddress, // Store the real address for tooltips and interactions
        itemStyle: {
          color: isVirtualSinkHighlighted ? '#FDE047' : '#e0f63b', // Same yellow as source
          borderColor: isVirtualSinkHighlighted ? '#DC2626' : undefined,
          borderWidth: isVirtualSinkHighlighted ? 3 : 0
        }
      });
    }

    // Create links
    const links = filteredTransfers.map((transfer, index) => {
      const flowValue = Number(transfer.value) / 1e18;
      const isWrapped = wrappedTokens.includes(transfer.tokenOwner);
      
      // For self-transfer, redirect links to virtual sink
      let targetAddress = transfer.to;
      if (isSelfTransfer && transfer.to === sinkAddress) {
        targetAddress = virtualSinkAddress;
      }
      
      const edgeKey = `${transfer.from}-${transfer.to}-${transfer.tokenOwner}`;
      const isHighlighted = highlightedEdges.has(edgeKey);
      
      return {
        source: transfer.from,
        target: targetAddress,
        value: flowValue,
        tokenOwner: transfer.tokenOwner,
        transferIndex: index,
        originalTransfer: transfer,
        lineStyle: {
          color: isHighlighted ? '#DC2626' : getTokenColor(transfer.tokenOwner),
          opacity: highlightedPath ? (isHighlighted ? 0.9 : 0.1) : 0.6,
          type: isWrapped ? 'dashed' : 'solid',
          width: isHighlighted ? 3 : undefined
        }
      };
    });

    // Dynamic parameters based on strategy
    let nodeGap, nodeWidth, fontSize, layoutIterations, showLabels;
    
    switch (strategy) {
      case 'aggregated':
        nodeGap = 10;
        nodeWidth = 20;
        fontSize = 9;
        layoutIterations = 32;
        showLabels = true;
        break;
      case 'compact':
        nodeGap = 0.5;
        nodeWidth = 5;
        fontSize = 6;
        layoutIterations = 8;
        showLabels = false;
        break;
      case 'medium':
        nodeGap = 2;
        nodeWidth = 10;
        fontSize = 7;
        layoutIterations = 16;
        showLabels = true;
        break;
      default:
        nodeGap = 5;
        nodeWidth = 15;
        fontSize = 9;
        layoutIterations = 32;
        showLabels = true;
    }

    // Prepare node labels
    const nodesWithLabels = nodes.map(node => {
      const profile = nodeProfiles[node.realAddress];
      let label = profile?.name || 
                 (node.realAddress.startsWith('0x') 
                   ? `${node.realAddress.slice(0, 6)}...${node.realAddress.slice(-4)}`
                   : node.realAddress);
      
      // For virtual sink, use the same label as the source
      if (node.name === virtualSinkAddress) {
        const sourceProfile = nodeProfiles[sourceAddress];
        label = sourceProfile?.name || 
               (sourceAddress.startsWith('0x') 
                 ? `${sourceAddress.slice(0, 6)}...${sourceAddress.slice(-4)}`
                 : sourceAddress);
      }
      
      return {
        ...node,
        label: {
          show: showLabels && config.rendering.features.nodeLabels,
          formatter: label,
          fontSize: fontSize
        }
      };
    });

    const option = {
      animation: true,
      animationDuration: 300,
      tooltip: {
        trigger: 'item',
        triggerOn: 'mousemove',
        confine: true,
        formatter: function(params) {
          if (params.dataType === 'node') {
            // Use realAddress for tooltips
            const addr = params.data.realAddress;
            const profile = nodeProfiles[addr];
            const balanceMap = balancesByAccount[addr] || {};
            const totalCrc = Object.values(balanceMap).reduce((sum, e) => sum + (e.crc || 0), 0);
            
            let tooltipHtml = '';
            if (profile?.name) {
              tooltipHtml += `<strong>${profile.name}</strong><br/>`;
            }
            tooltipHtml += `Address: ${addr}<br/>`;
            
            if (totalCrc > 0) {
              tooltipHtml += `Total balance: ${totalCrc.toFixed(6)} CRC`;
            }
            
            // Add self-transfer indicator if applicable
            if (isSelfTransfer && (params.data.name === sourceAddress || params.data.name === virtualSinkAddress)) {
              tooltipHtml += '<br/><em>(Self-Transfer Node)</em>';
            }
            
            return tooltipHtml;
          } else if (params.dataType === 'edge') {
            const link = params.data;
            let tooltipHtml = `<strong>Flow: ${link.value.toFixed(6)} CRC</strong><br/>`;
            
            if (link.tokenOwner) {
              const tokenProfile = tokenOwnerProfiles[link.tokenOwner];
              const tokenName = tokenProfile?.name || link.tokenOwner.slice(0, 8) + '...';
              tooltipHtml += `Token: ${tokenName}<br/>`;
            }
            
            return tooltipHtml;
          }
        }
      },
      series: [
        {
          type: 'sankey',
          layoutIterations: layoutIterations,
          data: nodesWithLabels,
          links: links,
          orient: 'horizontal',
          left: 20,
          right: 20,
          top: 60,
          bottom: 20,
          nodeWidth: nodeWidth,
          nodeGap: nodeGap,
          nodeAlign: 'justify',
          draggable: true,
          emphasis: {
            focus: 'adjacency'
          },
          lineStyle: {
            curveness: 0.5
          }
        }
      ]
    };

    chartInstance.current.setOption(option, true);

    // Handle click events
    chartInstance.current.off('click');
    chartInstance.current.on('click', 'series.sankey.edge', function(params) {
      const link = params.data;
      if (link.originalTransfer) {
        const transfer = link.originalTransfer;
        const transactionId = `${transfer.from}-${transfer.to}-${transfer.tokenOwner}`;
        onTransactionSelect(transactionId);
      }
    });

    isInitializingRef.current = false;

  }, [pathData, formData, highlightedPath, minCapacity, maxCapacity, wrappedTokens, nodeProfiles, tokenOwnerProfiles, balancesByAccount, config.rendering.features, getTokenColor, onTransactionSelect, determineRenderingStrategy, ref]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (chartInstance.current) {
        chartInstance.current.resize();
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
      if (window._sankeyInstance) {
        window._sankeyInstance = null;
      }
      if (window._sankeyRef) {
        window._sankeyRef = null;
      }
    };
  }, []);

  // Handle zoom and pan
  useEffect(() => {
    if (!chartRef.current) return;

    let isPanning = false;
    let startX = 0;
    let startY = 0;

    const handleWheel = (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(0.5, Math.min(5, zoom.scale * delta));
      
      const rect = chartRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const scaleDiff = newScale / zoom.scale;
      const newTranslateX = x - (x - zoom.translateX) * scaleDiff;
      const newTranslateY = y - (y - zoom.translateY) * scaleDiff;
      
      setZoom({
        scale: newScale,
        translateX: newTranslateX,
        translateY: newTranslateY
      });
    };

    const handleMouseDown = (e) => {
      if (e.button === 0 && !e.target.closest('path')) {
        isPanning = true;
        startX = e.clientX - zoom.translateX;
        startY = e.clientY - zoom.translateY;
        e.preventDefault();
      }
    };

    const handleMouseMove = (e) => {
      if (isPanning) {
        setZoom(prev => ({
          ...prev,
          translateX: e.clientX - startX,
          translateY: e.clientY - startY
        }));
      }
    };

    const handleMouseUp = () => {
      isPanning = false;
    };

    const element = chartRef.current;
    element.addEventListener('wheel', handleWheel, { passive: false });
    element.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      element.removeEventListener('wheel', handleWheel);
      element.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [zoom]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    setZoom(prev => ({
      ...prev,
      scale: Math.min(5, prev.scale * 1.2)
    }));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom(prev => ({
      ...prev,
      scale: Math.max(0.5, prev.scale * 0.8)
    }));
  }, []);

  const fit = useCallback(() => {
    setZoom({ scale: 1, translateX: 0, translateY: 0 });
    if (chartInstance.current) {
      chartInstance.current.resize();
    }
  }, []);

  const center = useCallback(() => {
    setZoom(prev => ({ ...prev, translateX: 0, translateY: 0 }));
  }, []);

  // Handle escape key to clear highlight
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && highlightedPath) {
        clearHighlight();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [highlightedPath, clearHighlight]);

  return (
    <div className="relative w-full h-full overflow-hidden" data-viz-mode="sankey">
      {/* Chart container with zoom transform */}
      <div 
        ref={chartRef}
        className="w-full h-full"
        style={{
          transform: `translate(${zoom.translateX}px, ${zoom.translateY}px) scale(${zoom.scale})`,
          transformOrigin: '0 0',
          transition: 'none',
          cursor: 'grab'
        }}
      />

      {/* Controls */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
        {/* Zoom Controls */}
        <div className="flex items-center gap-2 bg-white rounded-lg shadow-sm p-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={zoomIn}
            title="Zoom In (+)"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={zoomOut}
            title="Zoom Out (-)"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={fit}
            title="Fit to Screen (F)"
          >
            <Maximize className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={center}
            title="Center (C)"
          >
            <Move className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Highlight indicator */}
      {highlightedPath && (
        <div className="absolute top-4 right-4 z-20 bg-white rounded-lg shadow-sm p-2">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 bg-red-600 rounded-full"></div>
            <span>Path highlighted</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearHighlight}
              className="p-1 h-auto"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {highlightedPath.length} transfer{highlightedPath.length > 1 ? 's' : ''} • ESC to clear
          </div>
        </div>
      )}
    </div>
  );
});

SankeyVisualization.displayName = 'SankeyVisualization';

export default SankeyVisualization;