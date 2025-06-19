import { useRef, useEffect, useCallback } from 'react';
import cytoscape from 'cytoscape';
import klay from 'cytoscape-klay';
import dagre from 'cytoscape-dagre';
import { usePerformance } from '@/contexts/PerformanceContext';

// Register layout extensions
cytoscape.use(klay);
cytoscape.use(dagre);

export const useCytoscape = ({
  containerRef,
  pathData,
  formData,
  wrappedTokens,
  nodeProfiles,
  tokenOwnerProfiles,
  balancesByAccount,
  minCapacity,
  maxCapacity,
  onTooltip,
  onTransactionSelect,
  layoutName = 'klay'
}) => {
  const cyRef = useRef(null);
  const isInitializingRef = useRef(false);
  const { config, updateStats } = usePerformance();

  // Initialize graph when pathData changes
  useEffect(() => {
    // Store pathData globally for reference in highlighting
    window._pathData = pathData;
    
    // Create a unique key for this graph instance to force proper re-initialization
    const graphKey = `${pathData?.transfers?.length || 0}-${pathData?.maxFlow || 0}-${Date.now()}`;
    
    // Reset the initializing flag when pathData changes
    isInitializingRef.current = false;
    
    // Skip if no data
    if (!pathData || !containerRef.current) return;
    
    // Skip if already initializing
    if (isInitializingRef.current) return;
    
    isInitializingRef.current = true;
    const startTime = performance.now();

    // Process data with improved self-transfer handling
    const fromSet = new Set();
    const toSet = new Set();
    const allAddresses = new Set();
    
    pathData.transfers.forEach(t => {
      const from = t.from.toLowerCase();
      const to = t.to.toLowerCase();
      fromSet.add(from);
      toSet.add(to);
      allAddresses.add(from);
      allAddresses.add(to);
    });

    // Find addresses that ONLY appear as source or ONLY as sink
    const onlySourceAddresses = [...fromSet].filter(addr => !toSet.has(addr));
    const onlySinkAddresses = [...toSet].filter(addr => !fromSet.has(addr));

    // Determine final source and sink with better self-transfer detection
    let finalSource, finalSink;

    // First, try to use form data if available
    if (formData?.From && formData?.To) {
      finalSource = formData.From.toLowerCase();
      finalSink = formData.To.toLowerCase();
    } else if (onlySourceAddresses.length === 0 && onlySinkAddresses.length === 0) {
      // All addresses appear as both source and sink - likely a cycle or self-transfer
      finalSource = pathData.transfers[0]?.from.toLowerCase();
      finalSink = pathData.transfers[pathData.transfers.length - 1]?.to.toLowerCase();
    } else {
      // Normal case - use addresses that only appear as source or sink
      finalSource = onlySourceAddresses[0] || pathData.transfers[0]?.from.toLowerCase();
      finalSink = onlySinkAddresses[0] || pathData.transfers[pathData.transfers.length - 1]?.to.toLowerCase();
    }

    // Explicitly check for self-transfer
    const isSelfTransfer = finalSource === finalSink;

    const connectedNodes = new Set();
    if (finalSource) connectedNodes.add(finalSource);
    if (finalSink) connectedNodes.add(finalSink);

    const edges = [];
    const edgeCountMap = new Map(); // Track edge counts between nodes
    
    pathData.transfers.forEach((transfer, index) => {
      const fromAddr = transfer.from.toLowerCase();
      const toAddr = transfer.to.toLowerCase();
      const tokenOwner = transfer.tokenOwner.toLowerCase();

      connectedNodes.add(fromAddr);
      connectedNodes.add(toAddr);

      const flowValue = Number(transfer.value) / 1e18;
      const flowPercentage = ((Number(transfer.value) / Number(pathData.maxFlow)) * 100);
      
      // Create a unique key for this edge type
      const edgeTypeKey = `${fromAddr}-${toAddr}-${tokenOwner}`;
      const edgeCount = edgeCountMap.get(edgeTypeKey) || 0;
      edgeCountMap.set(edgeTypeKey, edgeCount + 1);
      
      const edgeData = {
        id: `e${index}`, // Unique ID based on transfer index
        source: fromAddr,
        target: toAddr,
        flowValue: flowValue,
        weight: Math.max(1, Math.min(flowPercentage / 10, 10)),
        flowAtto: transfer.value,
        percentage: flowPercentage.toFixed(2),
        tokenOwner: tokenOwner,
        isWrapped: wrappedTokens.includes(tokenOwner),
        originalFrom: transfer.from,
        originalTo: transfer.to,
        originalTokenOwner: transfer.tokenOwner,
        transferIndex: index, // Store the original transfer index
        edgeTypeCount: edgeCount // Store which instance of this edge type this is
      };

      edges.push({ data: edgeData });
    });

    const nodes = Array.from(connectedNodes).map(id => {
      // Improved node type detection
      const isSource = id === finalSource && !isSelfTransfer;
      const isSink = id === finalSink && !isSelfTransfer;
      const isSameSourceSink = id === finalSource && id === finalSink && isSelfTransfer;

      let color;
      if (isSameSourceSink) {
        color = '#e0f63b'; // Yellow for self-transfer
      } else if (isSource) {
        color = '#3B82F6'; // Blue for source
      } else if (isSink) {
        color = '#EF4444'; // Red for sink
      } else {
        color = '#CBD5E1'; // Gray for intermediate
      }

      const nodeData = {
        id,
        color,
        isSource,
        isSink,
        isSameSourceSink,
        // Add a version key to force style updates
        version: Date.now()
      };

      // Add label
      if (config.rendering.features.nodeLabels) {
        const profile = nodeProfiles[id];
        nodeData.label = profile?.name || `${id.slice(0, 6)}...${id.slice(-4)}`;
      }

      return { data: nodeData };
    });

    try {
      // More thorough cleanup of previous instance
      if (cyRef.current) {
        try {
          cyRef.current.removeAllListeners();
          cyRef.current.destroy();
        } catch (e) {
          console.warn('Error destroying previous cytoscape instance:', e);
        }
        cyRef.current = null;
      }
      
      // Clear the container's HTML to ensure no residual elements
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
      
      // Also clear any stored instance in window
      if (window._cyInstance) {
        window._cyInstance = null;
      }

      updateStats({
        nodeCount: nodes.length,
        edgeCount: edges.length
      });

      const isVeryLarge = edges.length > 500;

      // Styles with self-transfer specific styling
      const styles = [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            'width': isVeryLarge ? '20px' : '40px',
            'height': isVeryLarge ? '20px' : '40px',
            ...(config.rendering.features.nodeLabels && {
              'label': 'data(label)',
              'text-valign': 'center',
              'text-halign': 'center',
              'font-size': isVeryLarge ? '6px' : '10px',
              'text-margin-y': isVeryLarge ? '5px' : '10px',
              'min-zoomed-font-size': 4
            })
          }
        },
        {
          selector: 'node[?isSameSourceSink]',
          style: {
            'border-width': 3,
            'border-color': '#ca8a04', // Darker yellow border
            'border-style': 'solid'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': config.rendering.features.edgeWidthScaling ? (ele) => ele.data('weight') || 2 : 2,
            'line-color': '#94A3B8',
            'target-arrow-color': '#94A3B8',
            'target-arrow-shape': isVeryLarge ? 'none' : 'triangle',
            'curve-style': config.rendering.features.curvedEdges ? 'bezier' : 'straight',
            'line-opacity': isVeryLarge ? 0.3 : 0.8,
            'arrow-scale': 0.5,
            ...(config.rendering.features.edgeLabels && {
              'label': (ele) => ele.data('percentage') || '',
              'font-size': '8px',
              'text-opacity': 0.7
            })
          }
        }
      ];

      // Add style features
      if (config.rendering.features.wrappedTokenDashing) {
        styles.push({
          selector: 'edge[?isWrapped]',
          style: { 'line-style': 'dashed' }
        });
      }

      if (config.rendering.features.overCapacityHighlight) {
        styles.push({
          selector: 'edge.over-capacity',
          style: {
            'line-color': '#F97316',
            'target-arrow-color': '#F97316',
            'width': 3,
            'line-style': 'dotted'
          }
        });
      }

      if (config.rendering.features.edgeGradients) {
        styles.push({
          selector: 'edge.saturation',
          style: {
            'line-fill': 'linear-gradient',
            'line-gradient-stop-colors': '#16A34A #16A34A #94A3B8 #94A3B8',
            'line-gradient-stop-positions': '0 0 100 100'
          }
        });
      }

      // Highlighted transaction style
      styles.push({
        selector: '.highlighted',
        style: {
          'line-color': '#2563EB',
          'target-arrow-color': '#2563EB',
          'width': 3,
          'z-index': 999
        }
      });

      // Path highlighting styles
      styles.push({
        selector: '.path-highlighted',
        style: {
          'line-color': '#DC2626',
          'target-arrow-color': '#DC2626',
          'width': 5,
          'z-index': 9999,
          'line-opacity': 1,
          'target-arrow-shape': 'triangle',
          'arrow-scale': 1.2,
          'line-style': 'solid',
          'overlay-opacity': 0.8,
          'overlay-color': '#DC2626',
          'overlay-padding': 2
        }
      });
      
      styles.push({
        selector: '.path-node',
        style: {
          'background-color': '#F87171',  
          'border-width': 3,
          'border-color': '#DC2626',
          'z-index': 9999,
          'width': isVeryLarge ? '30px' : '50px',  
          'height': isVeryLarge ? '30px' : '50px',
          'overlay-opacity': 0
        }
      });

      // Layout config
      const getLayoutConfig = () => {
        const baseConfig = {
          fit: true,
          padding: isVeryLarge ? 10 : 30,
          animate: false,
          // Add randomization seed based on graph key to ensure consistent layout
          randomize: false,
          ready: () => {
            // Force a redraw after layout to ensure proper rendering
            if (cyRef.current) {
              cyRef.current.resize();
              cyRef.current.center();
            }
          }
        };

        switch (layoutName) {
          case 'hierarchical':
            return {
              ...baseConfig,
              name: 'dagre',
              rankDir: 'LR',
              align: 'UL',
              rankSep: isVeryLarge ? 50 : 100,
              nodeSep: isVeryLarge ? 20 : 40,
              edgeSep: 10,
              ranker: 'network-simplex',
              acyclicer: 'greedy'
            };
          case 'dagre':
            return {
              ...baseConfig,
              name: 'dagre',
              rankDir: 'LR',
              nodeSep: isVeryLarge ? 10 : 30,
              rankSep: isVeryLarge ? 20 : 50
            };
          case 'breadthfirst':
            return {
              ...baseConfig,
              name: 'breadthfirst',
              directed: true,
              roots: finalSource ? [finalSource] : undefined,
              spacingFactor: isVeryLarge ? 0.5 : 1.2
            };
          case 'circle':
            return {
              ...baseConfig,
              name: 'circle'
            };
          case 'concentric':
            return {
              ...baseConfig,
              name: 'concentric',
              minNodeSpacing: isVeryLarge ? 10 : 30
            };
          case 'klay':
          default:
            return {
              ...baseConfig,
              name: 'klay',
              klay: {
                direction: 'RIGHT',
                spacing: isVeryLarge ? 10 : 30,
                thoroughness: 1,
                nodeLayering: 'NETWORK_SIMPLEX',
                edgeRouting: 'POLYLINE'
              }
            };
        }
      };

      // Create Cytoscape instance with unique container ID
      const cy = cytoscape({
        container: containerRef.current,
        elements: { nodes, edges },
        style: styles,
        layout: getLayoutConfig(),
        // Performance settings
        textureOnViewport: false,
        hideEdgesOnViewport: false,
        hideLabelsOnViewport: false,
        motionBlur: false,
        pixelRatio: 1,
        // Interaction settings
        userPanningEnabled: true,
        userZoomingEnabled: true,
        boxSelectionEnabled: false,
        autoungrabify: isVeryLarge,
        autounselectify: isVeryLarge,
        minZoom: 0.01,
        maxZoom: 20
      });

      cyRef.current = cy;
      
      // Store instance globally for debugging
      window._cyInstance = cy;

      // After layout, fit with more padding for large graphs
      cy.ready(() => {
        if (isVeryLarge) {
          cy.fit(cy.elements(), 100);
        }
        // Force a style update to ensure proper coloring
        cy.nodes().forEach(node => {
          node.data('version', Date.now());
        });
      });

      // Event listeners with enhanced tooltips
      if (config.rendering.features.tooltips) {
        let hoverTimeout;
        
        cy.on('mouseover', 'node', (event) => {
          clearTimeout(hoverTimeout);
          hoverTimeout = setTimeout(() => {
            const node = event.target;
            const position = event.renderedPosition;
            const addr = node.id();
            const profile = nodeProfiles[addr];
            const balanceMap = balancesByAccount[addr] || {};
            const totalCrc = Object.values(balanceMap).reduce((sum, e) => sum + (e.crc || 0), 0);
            
            let tooltipText = '';
            if (profile?.name) {
              tooltipText += `Name: ${profile.name}\n`;
            }
            tooltipText += `Address: ${addr}`;
            
            if (totalCrc > 0) {
              tooltipText += `\nTotal balance: ${totalCrc.toFixed(6)} CRC`;
            }
            
            if (node.data('isSameSourceSink')) {
              tooltipText += '\n(Self-Transfer: Source & Sink)';
            } else if (node.data('isSource')) {
              tooltipText += '\n(Source)';
            } else if (node.data('isSink')) {
              tooltipText += '\n(Sink)';
            }
            
            onTooltip({
              text: tooltipText,
              position: { x: position.x, y: position.y }
            });
          }, 100);
        });

        cy.on('mouseover', 'edge', (event) => {
          clearTimeout(hoverTimeout);
          hoverTimeout = setTimeout(() => {
            const edge = event.target;
            const position = event.renderedPosition;
            const data = edge.data();
            
            let tooltipText = `Flow: ${data.flowValue.toFixed(6)} CRC\n`;
            
            if (data.percentage) {
              tooltipText += `Percentage: ${data.percentage}%\n`;
            }
            
            if (data.tokenOwner) {
              const tokenProfile = tokenOwnerProfiles[data.tokenOwner];
              if (tokenProfile?.name) {
                tooltipText += `Token Owner: ${tokenProfile.name}\n`;
              }
              tooltipText += `Token: ${data.tokenOwner}\n`;
              
              // Add balance info if available
              const srcAddr = data.source;
              const balEntry = balancesByAccount[srcAddr]?.[data.tokenOwner];
              if (balEntry) {
                tooltipText += `Source balance: ${balEntry.crc.toFixed(6)} CRC\n`;
                
                const flowAtto = BigInt(data.flowAtto || '0');
                const balAtto = balEntry.atto;
                const ratio = balAtto > 0n ? Math.min(Number(flowAtto) / Number(balAtto), 1) : 0;
                tooltipText += `Capacity used: ${(ratio * 100).toFixed(2)}%`;
              }
            }
            
            if (data.isWrapped) {
              tooltipText += '\n(Wrapped Token)';
            }
            
            onTooltip({
              text: tooltipText,
              position: { x: position.x, y: position.y }
            });
          }, 100);
        });

        cy.on('mouseout', () => {
          clearTimeout(hoverTimeout);
          onTooltip({ text: '', position: null });
        });
      }

      cy.on('click', 'edge', (event) => {
        const edge = event.target;
        const data = edge.data();
        if (data.originalFrom && data.originalTo && data.originalTokenOwner) {
          // Ensure lowercase for consistent matching
          const transactionId = `${data.originalFrom.toLowerCase()}-${data.originalTo.toLowerCase()}-${data.originalTokenOwner.toLowerCase()}`;
          onTransactionSelect(transactionId);
        }
      });

      const renderTime = performance.now() - startTime;
      updateStats({ renderTime: Math.round(renderTime) });

      if (renderTime > 1000) {
        console.warn(`Slow render detected: ${renderTime}ms for ${edges.length} edges. Consider using Fast mode.`);
      }

    } catch (error) {
      console.error('Error initializing Cytoscape:', error);
    } finally {
      isInitializingRef.current = false;
    }

  }, [pathData, formData, wrappedTokens, config.rendering.features, config.rendering.fastMode, updateStats, nodeProfiles, tokenOwnerProfiles, balancesByAccount, onTooltip, onTransactionSelect, layoutName]);

  // Update edge styles when config changes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.batch(() => {
      // Update curve style for all edges
      cy.edges().style({
        'curve-style': config.rendering.features.curvedEdges ? 'bezier' : 'straight'
      });
      
      // Update edge width scaling
      if (config.rendering.features.edgeWidthScaling) {
        cy.edges().forEach(edge => {
          edge.style('width', edge.data('weight') || 2);
        });
      } else {
        cy.edges().style('width', 2);
      }
      
      // Update edge labels
      if (config.rendering.features.edgeLabels) {
        cy.edges().forEach(edge => {
          edge.style({
            'label': edge.data('percentage') || '',
            'font-size': '8px',
            'text-opacity': 0.7
          });
        });
      } else {
        cy.edges().style('label', '');
      }
      
      // Update wrapped token dashing
      if (config.rendering.features.wrappedTokenDashing) {
        cy.edges().forEach(edge => {
          if (edge.data('isWrapped')) {
            edge.style('line-style', 'dashed');
          } else {
            edge.style('line-style', 'solid');
          }
        });
      } else {
        cy.edges().style('line-style', 'solid');
      }
    });
  }, [config.rendering.features]);

  // Update node labels when profiles change
  useEffect(() => {
    if (!config.rendering.features.nodeLabels || !cyRef.current) return;
    
    const cy = cyRef.current;
    if (Object.keys(nodeProfiles).length === 0) return;

    cy.batch(() => {
      Object.entries(nodeProfiles).forEach(([addr, profile]) => {
        if (profile?.name) {
          const node = cy.getElementById(addr);
          if (!node.empty()) {
            node.data('label', profile.name);
          }
        }
      });
    });
  }, [nodeProfiles, config.rendering.features.nodeLabels]);

  // Update edge gradients based on capacity
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    
    // Skip if gradients are not enabled
    if (!config.rendering.features.edgeGradients && !config.rendering.features.overCapacityHighlight) return;

    cy.batch(() => {
      cy.edges().forEach(edge => {
        const srcAddr = edge.data('source');
        const tokenAddr = edge.data('tokenOwner');

        if (!tokenAddr) {
          // If no balance data yet, just show the edge normally
          if (config.rendering.features.edgeGradients) {
            edge.addClass('saturation');
            edge.style({
              'line-gradient-stop-positions': '0 50 50 100'
            });
          }
          return;
        }

        const balEntry = balancesByAccount[srcAddr]?.[tokenAddr];
        if (!balEntry) {
          // No balance data for this edge
          if (config.rendering.features.edgeGradients) {
            edge.addClass('saturation');
            edge.style({
              'line-gradient-stop-positions': '0 0 0 100'
            });
          }
          return;
        }

        const balAtto = balEntry.atto;
        const flowAtto = BigInt(edge.data('flowAtto') || '0');

        const exceedsCap = flowAtto > balAtto;
        const ratio = balAtto > 0n
          ? Math.min(Number(flowAtto) / Number(balAtto), 1)
          : 0;

        if (config.rendering.features.overCapacityHighlight && exceedsCap) {
          edge.addClass('over-capacity');
          edge.removeClass('saturation');
        } else {
          edge.removeClass('over-capacity');
          
          if (config.rendering.features.edgeGradients) {
            edge.addClass('saturation');
            const pct = (ratio * 100).toFixed(2);
            edge.style({
              'line-gradient-stop-positions': `0 ${pct} ${pct} 100`
            });
          }
        }
      });
    });
  }, [balancesByAccount, config.rendering.features]);

  // Edge filtering
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.batch(() => {
      cy.edges().forEach(edge => {
        const v = edge.data('flowValue');
        if (v < minCapacity || v > maxCapacity) {
          edge.hide();
        } else {
          edge.show();
        }
      });
    });
  }, [minCapacity, maxCapacity]);

  // Highlight transaction
  const highlightTransaction = useCallback((transactionId) => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.batch(() => {
      cy.edges().removeClass('highlighted');

      if (transactionId) {
        const parts = transactionId.split('-');
        if (parts.length >= 3) {
          const [fromAddr, toAddr, tokenOwner] = parts;

          cy.edges().forEach(edge => {
            const data = edge.data();
            if (
              data.originalFrom?.toLowerCase() === fromAddr.toLowerCase() &&
              data.originalTo?.toLowerCase() === toAddr.toLowerCase() &&
              data.originalTokenOwner?.toLowerCase() === tokenOwner.toLowerCase()
            ) {
              edge.addClass('highlighted');
            }
          });
        }
      }
    });
  }, []);

  // Enhanced highlightPath implementation
  const highlightPath = useCallback((transfers) => {
    const cy = cyRef.current;
    if (!cy || !transfers || transfers.length === 0) return;
    
    console.log('Cytoscape: Highlighting path with transfers:', transfers);
    
    cy.batch(() => {
      // Clear existing highlights
      cy.elements().removeClass('path-highlighted path-node');
      
      const nodesToHighlight = new Set();
      const edgesToHighlight = new Set();
      
      // For each transfer in the path, find and highlight the corresponding edge
      transfers.forEach(transfer => {
        const from = transfer.from.toLowerCase();
        const to = transfer.to.toLowerCase();
        const token = transfer.tokenOwner.toLowerCase();
        
        // Add nodes to highlight set
        nodesToHighlight.add(from);
        nodesToHighlight.add(to);
        
        // Find matching edges in the graph
        cy.edges().forEach(edge => {
          const data = edge.data();
          if (
            data.source === from &&
            data.target === to &&
            data.tokenOwner === token
          ) {
            edgesToHighlight.add(edge);
          }
        });
      });
      
      // Highlight all edges in the path
      edgesToHighlight.forEach(edge => {
        edge.addClass('path-highlighted');
      });
      
      // Highlight all nodes in the path
      nodesToHighlight.forEach(nodeId => {
        const node = cy.getElementById(nodeId);
        if (node && node.length > 0) {
          node.addClass('path-node');
        }
      });
      
      console.log(`Highlighted ${edgesToHighlight.size} edges and ${nodesToHighlight.size} nodes`);
    });
  }, []);

  // Layout runner
  const runLayout = useCallback((newLayoutName) => {
    const cy = cyRef.current;
    if (!cy) return;

    const isVeryLarge = cy.edges().length > 500;
    
    // Get source node for hierarchical layouts
    const sourceNode = cy.nodes().filter(node => node.data('isSource') || node.data('isSameSourceSink'))[0];
    const sourceId = sourceNode ? sourceNode.id() : undefined;
    
    const getLayoutConfig = () => {
      const baseConfig = {
        fit: true,
        padding: isVeryLarge ? 10 : 30,
        animate: !isVeryLarge && !config.rendering.fastMode,
        animationDuration: isVeryLarge ? 0 : 300
      };

      switch (newLayoutName) {
        case 'hierarchical':
          return {
            ...baseConfig,
            name: 'dagre',
            rankDir: 'LR',
            align: 'UL',
            rankSep: isVeryLarge ? 50 : 100,
            nodeSep: isVeryLarge ? 20 : 40,
            edgeSep: 10,
            ranker: 'network-simplex',
            acyclicer: 'greedy'
          };
        case 'dagre':
          return {
            ...baseConfig,
            name: 'dagre',
            rankDir: 'LR',
            nodeSep: isVeryLarge ? 10 : 30,
            rankSep: isVeryLarge ? 20 : 50
          };
        case 'breadthfirst':
          return {
            ...baseConfig,
            name: 'breadthfirst',
            directed: true,
            roots: sourceId ? [sourceId] : undefined,
            spacingFactor: isVeryLarge ? 0.5 : 1.2
          };
        case 'circle':
          return {
            ...baseConfig,
            name: 'circle'
          };
        case 'concentric':
          return {
            ...baseConfig,
            name: 'concentric',
            minNodeSpacing: isVeryLarge ? 10 : 30
          };
        case 'klay':
        default:
          return {
            ...baseConfig,
            name: 'klay',
            klay: {
              direction: 'RIGHT',
              spacing: isVeryLarge ? 10 : 30,
              thoroughness: 1,
              nodeLayering: 'NETWORK_SIMPLEX',
              edgeRouting: 'POLYLINE'
            }
          };
      }
    };

    try {
      const layout = cy.layout(getLayoutConfig());
      layout.run();
    } catch (error) {
      console.error('Error running layout:', error);
    }
  }, [config.rendering.fastMode]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    
    const currentZoom = cy.zoom();
    const maxZoom = cy.maxZoom();
    const newZoom = Math.min(currentZoom * 1.2, maxZoom);
    
    const centerX = cy.width() / 2;
    const centerY = cy.height() / 2;
    
    cy.zoom({
      level: newZoom,
      renderedPosition: { x: centerX, y: centerY }
    });
  }, []);

  const zoomOut = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    
    const currentZoom = cy.zoom();
    const minZoom = cy.minZoom();
    const newZoom = Math.max(currentZoom * 0.8, minZoom);
    
    const centerX = cy.width() / 2;
    const centerY = cy.height() / 2;
    
    cy.zoom({
      level: newZoom,
      renderedPosition: { x: centerX, y: centerY }
    });
  }, []);

  const fit = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    
    const isVeryLarge = cy.edges().length > 500;
    const padding = isVeryLarge ? 100 : 50;
    
    cy.fit(cy.elements(), padding);
  }, []);

  const center = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    
    cy.center(cy.elements());
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cyRef.current) {
        try {
          cyRef.current.destroy();
        } catch (e) {
          console.warn('Error cleaning up cytoscape:', e);
        }
        cyRef.current = null;
      }
      if (window._cyInstance) {
        window._cyInstance = null;
      }
      if (window._pathData) {
        window._pathData = null;
      }
    };
  }, []);

  return { 
    cyRef, 
    highlightTransaction,
    runLayout,
    zoomIn,
    zoomOut,
    fit,
    center,
    highlightPath
  };
};