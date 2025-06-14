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
    // Skip if already initializing or no data
    if (isInitializingRef.current || !pathData || !containerRef.current) return;
    
    isInitializingRef.current = true;
    const startTime = performance.now();

    // Process data
    const fromSet = new Set();
    const toSet = new Set();
    
    pathData.transfers.forEach(t => {
      fromSet.add(t.from.toLowerCase());
      toSet.add(t.to.toLowerCase());
    });

    const sinkAddress = [...toSet].find(addr => !fromSet.has(addr));
    const sourceAddress = [...fromSet].find(addr => !toSet.has(addr));
    const finalSource = sourceAddress || pathData.transfers[0]?.from.toLowerCase();
    const finalSink = sinkAddress || pathData.transfers[pathData.transfers.length - 1]?.to.toLowerCase();

    const connectedNodes = new Set();
    if (finalSource) connectedNodes.add(finalSource);
    if (finalSink) connectedNodes.add(finalSink);

    const edges = [];
    
    pathData.transfers.forEach((transfer, index) => {
      const fromAddr = transfer.from.toLowerCase();
      const toAddr = transfer.to.toLowerCase();

      connectedNodes.add(fromAddr);
      connectedNodes.add(toAddr);

      const flowValue = Number(transfer.value) / 1e18;
      const flowPercentage = ((Number(transfer.value) / Number(pathData.maxFlow)) * 100);
      
      const edgeData = {
        id: `e${index}`,
        source: fromAddr,
        target: toAddr,
        flowValue: flowValue,
        weight: Math.max(1, Math.min(flowPercentage / 10, 10)),
        flowAtto: transfer.value,
        percentage: flowPercentage.toFixed(2),
        tokenOwner: transfer.tokenOwner.toLowerCase(),
        isWrapped: wrappedTokens.includes(transfer.tokenOwner.toLowerCase()),
        originalFrom: transfer.from,
        originalTo: transfer.to,
        originalTokenOwner: transfer.tokenOwner
      };

      edges.push({ data: edgeData });
    });

    const nodes = Array.from(connectedNodes).map(id => {
      const isSource = id === finalSource;
      const isSink = id === finalSink;
      const isSameSourceSink = finalSource === finalSink;

      let color;
      if (isSameSourceSink && isSource && isSink) {
        color = '#e0f63b';
      } else if (isSource) {
        color = '#3B82F6';
      } else if (isSink) {
        color = '#EF4444';
      } else {
        color = '#CBD5E1';
      }

      const nodeData = {
        id,
        color,
        isSource,
        isSink
      };

      // Add label
      if (config.rendering.features.nodeLabels) {
        const profile = nodeProfiles[id];
        nodeData.label = profile?.name || `${id.slice(0, 6)}...${id.slice(-4)}`;
      }

      return { data: nodeData };
    });

    try {
      // Destroy previous instance if exists
      if (cyRef.current) {
        try {
          cyRef.current.destroy();
        } catch (e) {
          console.warn('Error destroying previous cytoscape instance:', e);
        }
        cyRef.current = null;
      }

      updateStats({
        nodeCount: nodes.length,
        edgeCount: edges.length
      });

      const isVeryLarge = edges.length > 500;

      // Styles
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

      styles.push({
        selector: '.highlighted',
        style: {
          'line-color': '#2563EB',
          'target-arrow-color': '#2563EB',
          'width': 3,
          'z-index': 999
        }
      });

      // Layout config
      const getLayoutConfig = () => {
        const baseConfig = {
          fit: true,
          padding: isVeryLarge ? 10 : 30,
          animate: false
        };

        switch (layoutName) {
          case 'hierarchical':
            // Calculate hop distances from source for strict hierarchical layout
            const hopDistances = {};
            hopDistances[finalSource] = 0;
            
            // BFS to calculate hop distances
            const queue = [finalSource];
            const visited = new Set([finalSource]);
            
            while (queue.length > 0) {
              const current = queue.shift();
              const currentDistance = hopDistances[current];
              
              // Find all nodes connected from current
              edges.forEach(edge => {
                const data = edge.data;
                if (data.source === current && !visited.has(data.target)) {
                  visited.add(data.target);
                  hopDistances[data.target] = currentDistance + 1;
                  queue.push(data.target);
                }
              });
            }
            
            // Group nodes by hop distance
            const nodesByHop = {};
            let maxHop = 0;
            
            nodes.forEach(node => {
              const nodeId = node.data.id;
              const hop = hopDistances[nodeId] ?? 999; // Put unconnected nodes at the end
              maxHop = Math.max(maxHop, hop === 999 ? maxHop : hop);
              
              if (!nodesByHop[hop]) {
                nodesByHop[hop] = [];
              }
              nodesByHop[hop].push(nodeId);
            });
            
            return {
              ...baseConfig,
              name: 'breadthfirst',
              directed: true,
              roots: [finalSource],
              maximal: true,
              grid: false,
              spacingFactor: isVeryLarge ? 1.5 : 3,
              avoidOverlap: true,
              nodeDimensionsIncludeLabels: true,
              sort: (a, b) => {
                const aHop = hopDistances[a.id()] ?? 999;
                const bHop = hopDistances[b.id()] ?? 999;
                return aHop - bHop;
              }
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

      // Create Cytoscape instance
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

      // After layout, fit with more padding for large graphs
      cy.ready(() => {
        if (isVeryLarge) {
          cy.fit(cy.elements(), 100);
        }
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
            
            if (node.data('isSource')) {
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

  }, [pathData, wrappedTokens]); // Add wrappedTokens to dependencies

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

  // Layout runner
  const runLayout = useCallback((newLayoutName) => {
    const cy = cyRef.current;
    if (!cy) return;

    const isVeryLarge = cy.edges().length > 500;
    
    const getLayoutConfig = () => {
      const baseConfig = {
        fit: true,
        padding: isVeryLarge ? 100 : 30,
        animate: !isVeryLarge && !config.rendering.fastMode,
        animationDuration: isVeryLarge ? 0 : 300
      };

      switch (newLayoutName) {
        case 'hierarchical':
          return {
            ...baseConfig,
            name: 'dagre',
            rankDir: 'LR', // Left to right
            align: 'UL', // Align nodes to upper left
            rankSep: isVeryLarge ? 100 : 200, // Separation between ranks (columns)
            nodeSep: isVeryLarge ? 30 : 50, // Separation between nodes in same rank
            edgeSep: 25, // Separation between edges
            ranker: 'longest-path', // Use longest path to assign ranks
            acyclicer: 'greedy' // Remove cycles
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
    };
  }, []);

  return { 
    cyRef, 
    highlightTransaction,
    runLayout,
    zoomIn,
    zoomOut,
    fit,
    center
  };
};