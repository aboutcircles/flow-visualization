import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import * as echarts from 'echarts';
import { usePerformance } from '@/contexts/PerformanceContext';
import { Button } from '@/components/ui/button';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Move,
  Filter,
  Layers
} from 'lucide-react';
import * as SliderPrimitive from '@radix-ui/react-slider';

const SankeyVisualization = ({ 
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
}) => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const { config } = usePerformance();
  const [flowThreshold, setFlowThreshold] = useState(0);
  const [renderingStrategy, setRenderingStrategy] = useState('standard');
  const [showAggregated, setShowAggregated] = useState(false);
  const [zoom, setZoom] = useState({ scale: 1, translateX: 0, translateY: 0 });

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

  // Transform path data to Sankey format with token splitting
  const transformToSankeyData = useCallback((pathData, formData, strategy) => {
    if (!pathData || !pathData.transfers || pathData.transfers.length === 0) {
      return { nodes: [], links: [], strategy: 'standard' };
    }

    // Normalize addresses
    const transfers = pathData.transfers.map(t => ({
      ...t,
      from: t.from.toLowerCase(),
      to: t.to.toLowerCase(),
      tokenOwner: t.tokenOwner.toLowerCase()
    }));

    // Filter by capacity range only
    const filteredTransfers = transfers.filter(t => {
      const flowValue = Number(t.value) / 1e18;
      return flowValue >= minCapacity && flowValue <= maxCapacity;
    });

    if (filteredTransfers.length === 0) {
      return { nodes: [], links: [], strategy };
    }

    // Determine source and sink
    const fromSet = new Set();
    const toSet = new Set();
    
    filteredTransfers.forEach(t => {
      fromSet.add(t.from);
      toSet.add(t.to);
    });

    // Find addresses that only appear as source or only as sink
    const onlySourceAddresses = [...fromSet].filter(addr => !toSet.has(addr));
    const onlySinkAddresses = [...toSet].filter(addr => !fromSet.has(addr));

    let sourceAddress, sinkAddress;
    
    // Use form data if available
    if (formData?.From && formData?.To) {
      sourceAddress = formData.From.toLowerCase();
      sinkAddress = formData.To.toLowerCase();
    } else if (onlySourceAddresses.length === 0 && onlySinkAddresses.length === 0) {
      sourceAddress = filteredTransfers[0]?.from;
      sinkAddress = filteredTransfers[filteredTransfers.length - 1]?.to;
    } else {
      sourceAddress = onlySourceAddresses[0] || filteredTransfers[0]?.from;
      sinkAddress = onlySinkAddresses[0] || filteredTransfers[filteredTransfers.length - 1]?.to;
    }

    const isSelfTransfer = sourceAddress === sinkAddress;

    // Build graph structure for depth calculation
    const graph = {};
    const reverseGraph = {};
    const allNodes = new Set();
    
    filteredTransfers.forEach(transfer => {
      allNodes.add(transfer.from);
      allNodes.add(transfer.to);
      
      if (!graph[transfer.from]) graph[transfer.from] = new Set();
      if (!reverseGraph[transfer.to]) reverseGraph[transfer.to] = new Set();
      
      graph[transfer.from].add(transfer.to);
      reverseGraph[transfer.to].add(transfer.from);
    });

    // Calculate depths using BFS
    const depths = {};
    const calculateDepths = () => {
      const queue = [sourceAddress];
      depths[sourceAddress] = 0;
      const visited = new Set([sourceAddress]);
      
      while (queue.length > 0) {
        const current = queue.shift();
        const currentDepth = depths[current];
        
        const neighbors = graph[current] || new Set();
        neighbors.forEach(neighbor => {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            depths[neighbor] = currentDepth + 1;
            queue.push(neighbor);
          }
        });
      }
      
      // Handle unvisited nodes
      const unvisited = [...allNodes].filter(node => !visited.has(node));
      if (unvisited.length > 0) {
        // Calculate from sink backwards
        const backwardQueue = [sinkAddress];
        const backwardDepths = { [sinkAddress]: 0 };
        const backwardVisited = new Set([sinkAddress]);
        
        while (backwardQueue.length > 0) {
          const current = backwardQueue.shift();
          const currentDepth = backwardDepths[current];
          
          const neighbors = reverseGraph[current] || new Set();
          neighbors.forEach(neighbor => {
            if (!backwardVisited.has(neighbor)) {
              backwardVisited.add(neighbor);
              backwardDepths[neighbor] = currentDepth + 1;
              backwardQueue.push(neighbor);
            }
          });
        }
        
        const maxForwardDepth = Math.max(...Object.values(depths));
        unvisited.forEach(node => {
          if (backwardDepths[node] !== undefined) {
            depths[node] = maxForwardDepth + 1 + backwardDepths[node];
          } else {
            depths[node] = Math.floor(maxForwardDepth / 2);
          }
        });
      }
    };
    
    calculateDepths();

    // Ensure sink is at maximum depth
    const maxDepth = Math.max(...Object.values(depths), 0);
    if (!isSelfTransfer && depths[sinkAddress] < maxDepth) {
      depths[sinkAddress] = maxDepth;
    }

    // For aggregated strategy, group nodes by depth
    if (strategy === 'aggregated' && showAggregated) {
      const depthGroups = {};
      const nodesByDepth = {};
      
      allNodes.forEach(node => {
        const depth = depths[node] || 0;
        if (!nodesByDepth[depth]) {
          nodesByDepth[depth] = [];
        }
        nodesByDepth[depth].push(node);
      });

      // Create aggregated nodes for each depth level
      const aggregatedNodes = [];
      const nodeMapping = {};
      
      Object.entries(nodesByDepth).forEach(([depth, nodes]) => {
        const depthInt = parseInt(depth);
        const aggregatedId = `depth_${depth}`;
        
        // Special handling for source and sink depths
        if (nodes.includes(sourceAddress) && nodes.length === 1) {
          aggregatedNodes.push({
            name: sourceAddress,
            realAddress: sourceAddress,
            itemStyle: { color: '#3B82F6' }
          });
          nodeMapping[sourceAddress] = sourceAddress;
        } else if (nodes.includes(sinkAddress) && nodes.length === 1) {
          aggregatedNodes.push({
            name: sinkAddress,
            realAddress: sinkAddress,
            itemStyle: { color: '#EF4444' }
          });
          nodeMapping[sinkAddress] = sinkAddress;
        } else {
          aggregatedNodes.push({
            name: aggregatedId,
            realAddress: `Level ${depthInt} (${nodes.length} nodes)`,
            itemStyle: { color: '#9CA3AF' }
          });
          nodes.forEach(node => {
            nodeMapping[node] = aggregatedId;
          });
        }
      });

      // Create aggregated links
      const aggregatedLinkMap = {};
      
      filteredTransfers.forEach(transfer => {
        const sourceNode = nodeMapping[transfer.from];
        const targetNode = nodeMapping[transfer.to];
        
        if (sourceNode !== targetNode) {
          const linkKey = `${sourceNode}-${targetNode}`;
          if (!aggregatedLinkMap[linkKey]) {
            aggregatedLinkMap[linkKey] = {
              source: sourceNode,
              target: targetNode,
              value: 0,
              transfers: [],
              tokens: new Set()
            };
          }
          
          const flowValue = Number(transfer.value) / 1e18;
          aggregatedLinkMap[linkKey].value += flowValue;
          aggregatedLinkMap[linkKey].transfers.push(transfer);
          aggregatedLinkMap[linkKey].tokens.add(transfer.tokenOwner);
        }
      });

      const aggregatedLinks = Object.values(aggregatedLinkMap).map(link => ({
        ...link,
        lineStyle: {
          color: link.tokens.size > 1 ? '#9333EA' : '#94A3B8',
          opacity: 0.6
        }
      }));

      return { nodes: aggregatedNodes, links: aggregatedLinks, strategy };
    }

    // Create nodes array
    const nodeMap = {};
    const nodes = [];
    
    if (isSelfTransfer) {
      // For self-transfer, create two logical nodes
      const sourceNodeId = `${sourceAddress}_source`;
      nodes.push({
        name: sourceNodeId,
        realAddress: sourceAddress,
        itemStyle: { color: '#e0f63b' }
      });
      nodeMap[sourceAddress + '_start'] = sourceNodeId;
      
      const sinkNodeId = `${sinkAddress}_sink`;
      nodes.push({
        name: sinkNodeId,
        realAddress: sinkAddress,
        itemStyle: { color: '#e0f63b' }
      });
      nodeMap[sinkAddress + '_end'] = sinkNodeId;
      
      allNodes.forEach(addr => {
        if (addr !== sourceAddress) {
          nodes.push({
            name: addr,
            realAddress: addr,
            itemStyle: { color: '#CBD5E1' }
          });
          nodeMap[addr] = addr;
        }
      });
    } else {
      allNodes.forEach(addr => {
        let color = '#CBD5E1';
        if (addr === sourceAddress) {
          color = '#3B82F6';
        } else if (addr === sinkAddress) {
          color = '#EF4444';
        }
        
        nodes.push({
          name: addr,
          realAddress: addr,
          itemStyle: { color }
        });
        nodeMap[addr] = addr;
      });
    }

    // Create individual links for each token transfer (no aggregation)
    const links = filteredTransfers.map((transfer, index) => {
      let sourceNode, targetNode;
      
      if (isSelfTransfer) {
        // For self-transfer, always use the logical source and sink nodes
        sourceNode = `${sourceAddress}_source`;
        targetNode = `${sinkAddress}_sink`;
        
        // Unless this transfer is between other addresses in the path
        if (transfer.from !== sourceAddress || transfer.to !== sinkAddress) {
          // Check if this is an intermediate transfer
          const isFromSource = transfer.from === sourceAddress;
          const isToSink = transfer.to === sinkAddress;
          
          if (isFromSource) {
            sourceNode = `${sourceAddress}_source`;
            targetNode = nodeMap[transfer.to] || transfer.to;
          } else if (isToSink) {
            sourceNode = nodeMap[transfer.from] || transfer.from;
            targetNode = `${sinkAddress}_sink`;
          } else {
            // Neither from source nor to sink, just normal nodes
            sourceNode = nodeMap[transfer.from] || transfer.from;
            targetNode = nodeMap[transfer.to] || transfer.to;
          }
        }
      } else {
        sourceNode = nodeMap[transfer.from] || transfer.from;
        targetNode = nodeMap[transfer.to] || transfer.to;
      }

      const flowValue = Number(transfer.value) / 1e18;
      const isWrapped = wrappedTokens.includes(transfer.tokenOwner);
      
      return {
        source: sourceNode,
        target: targetNode,
        value: flowValue,
        tokenOwner: transfer.tokenOwner,
        transferIndex: index,
        originalTransfer: transfer,
        lineStyle: {
          color: getTokenColor(transfer.tokenOwner),
          opacity: 0.6,
          type: isWrapped ? 'dashed' : 'solid'
        },
        emphasis: {
          lineStyle: {
            opacity: 1
          }
        }
      };
    });

    return { nodes, links, strategy };
  }, [minCapacity, maxCapacity, wrappedTokens, showAggregated, getTokenColor]);

  // Initialize and update chart
  useEffect(() => {
    if (!chartRef.current || !pathData) return;

    // Initialize ECharts instance
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, null, {
        renderer: 'canvas',
        width: 'auto',
        height: 'auto'
      });
    }

    const nodeCount = new Set(pathData.transfers.map(t => [t.from.toLowerCase(), t.to.toLowerCase()]).flat()).size;
    const edgeCount = pathData.transfers.length;
    const strategy = determineRenderingStrategy(nodeCount, edgeCount);
    setRenderingStrategy(strategy);

    const { nodes, links } = transformToSankeyData(pathData, formData, strategy);

    if (nodes.length === 0) {
      chartInstance.current.clear();
      return;
    }

    // Calculate dynamic sizing
    const isLarge = strategy === 'medium' || strategy === 'compact' || strategy === 'aggregated';
    const isVeryLarge = strategy === 'compact' || strategy === 'aggregated';
    
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
      default: // standard
        nodeGap = 5;
        nodeWidth = 15;
        fontSize = 9;
        layoutIterations = 32;
        showLabels = true;
    }

    // Prepare node labels
    const nodesWithLabels = nodes.map(node => {
      const profile = nodeProfiles[node.realAddress];
      const label = profile?.name || 
                   (node.realAddress.startsWith('0x') 
                     ? `${node.realAddress.slice(0, 6)}...${node.realAddress.slice(-4)}`
                     : node.realAddress);
      
      return {
        ...node,
        label: {
          show: showLabels && config.rendering.features.nodeLabels,
          formatter: label,
          fontSize: fontSize,
          overflow: 'truncate',
          ellipsis: '...',
          width: strategy === 'aggregated' ? 100 : 60
        }
      };
    });

    const option = {
      animation: !isLarge,
      animationDuration: isLarge ? 0 : 300,
      tooltip: {
        trigger: 'item',
        triggerOn: 'mousemove',
        confine: true,
        formatter: function(params) {
          if (params.dataType === 'node') {
            const addr = params.data.realAddress;
            
            // For aggregated nodes
            if (addr.startsWith('Level')) {
              return addr;
            }
            
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
            
            return tooltipHtml;
          } else if (params.dataType === 'edge') {
            const link = params.data;
            
            let tooltipHtml = `<strong>Flow: ${link.value.toFixed(6)} CRC</strong><br/>`;
            
            if (link.tokenOwner) {
              const tokenProfile = tokenOwnerProfiles[link.tokenOwner];
              const tokenName = tokenProfile?.name || link.tokenOwner.slice(0, 8) + '...';
              tooltipHtml += `Token: ${tokenName}<br/>`;
            } else if (link.tokens) {
              tooltipHtml += `Tokens: ${link.tokens.size}<br/>`;
              tooltipHtml += `Transfers: ${link.transfers.length}<br/>`;
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
          focusNodeAdjacency: 'allEdges',
          emphasis: {
            focus: 'adjacency',
            blurScope: 'coordinateSystem',
            itemStyle: {
              opacity: 1
            },
            lineStyle: {
              opacity: 1
            }
          },
          blur: {
            itemStyle: {
              opacity: 0.1
            },
            lineStyle: {
              opacity: 0.1
            }
          },
          lineStyle: {
            curveness: 0.5
          },
          label: {
            position: 'right',
            distance: 5
          }
        }
      ]
    };

    chartInstance.current.setOption(option, true);

    // Handle click events
    chartInstance.current.on('click', 'series.sankey.edge', function(params) {
      const link = params.data;
      if (link.originalTransfer) {
        const transfer = link.originalTransfer;
        const transactionId = `${transfer.from}-${transfer.to}-${transfer.tokenOwner}`;
        onTransactionSelect(transactionId);
      } else if (link.transfers && link.transfers.length > 0) {
        // For aggregated links
        const transfer = link.transfers[0];
        const transactionId = `${transfer.from}-${transfer.to}-${transfer.tokenOwner}`;
        onTransactionSelect(transactionId);
      }
    });

    // Handle resize
    const handleResize = () => {
      if (chartInstance.current) {
        chartInstance.current.resize();
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartInstance.current) {
        chartInstance.current.off('click');
      }
    };
  }, [pathData, formData, nodeProfiles, tokenOwnerProfiles, balancesByAccount, config.rendering.features, transformToSankeyData, onTransactionSelect, determineRenderingStrategy]);

  // Highlight selected transaction
  useEffect(() => {
    if (!chartInstance.current || !selectedTransactionId) return;

    const strategy = renderingStrategy;
    const { nodes, links } = transformToSankeyData(pathData, formData, strategy);
    
    // Update links with highlight
    const updatedLinks = links.map(link => {
      let isSelected = false;
      
      if (link.originalTransfer) {
        const transfer = link.originalTransfer;
        const tid = `${transfer.from}-${transfer.to}-${transfer.tokenOwner}`;
        isSelected = tid === selectedTransactionId;
      } else if (link.transfers) {
        isSelected = link.transfers.some(t => {
          const tid = `${t.from}-${t.to}-${t.tokenOwner}`;
          return tid === selectedTransactionId;
        });
      }
      
      return {
        ...link,
        lineStyle: {
          ...link.lineStyle,
          opacity: isSelected ? 1 : 0.2,
          width: isSelected ? 3 : 1
        }
      };
    });

    chartInstance.current.setOption({
      series: [{
        links: updatedLinks
      }]
    });
  }, [selectedTransactionId, pathData, formData, transformToSankeyData, renderingStrategy]);

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
      
      // Calculate zoom center
      const rect = chartRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Adjust translation to zoom on mouse position
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
      if (e.button === 0 && !e.target.closest('path')) { // Left click, not on a path
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

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Chart container with zoom transform */}
      <div 
        ref={chartRef}
        className="w-full h-full"
        style={{
          transform: `translate(${zoom.translateX}px, ${zoom.translateY}px) scale(${zoom.scale})`,
          transformOrigin: '0 0',
          transition: 'none',
          cursor: isPanning => isPanning ? 'grabbing' : 'grab'
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
    </div>
  );
};

export default SankeyVisualization;