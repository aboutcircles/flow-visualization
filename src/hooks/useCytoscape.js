import { useRef, useEffect } from 'react';
import cytoscape from 'cytoscape';
import klay from 'cytoscape-klay';

// Register the klay layout with Cytoscape
cytoscape.use(klay);

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
  onTransactionSelect
}) => {
  const cyRef = useRef(null);
  
  // Initialize the graph
  useEffect(() => {
    if (!pathData || !containerRef.current) return;

    try {
      // Clean up existing instance
      if (cyRef.current) {
        cyRef.current.destroy();
      }

      // Prepare graph elements
      const elements = {
        nodes: new Set(),
        edges: []
      };

      // Process transfers to create nodes and edges
      // find source/sink by degree rather than array position
      const fromSet = new Set(pathData.transfers.map(t => t.from.toLowerCase()));
      const toSet   = new Set(pathData.transfers.map(t => t.to.toLowerCase()));

      const sinkAddress   = [...toSet].find(addr => !fromSet.has(addr));         // receives only
      const sourceAddress = [...fromSet].find(addr => !toSet.has(addr));         // sends only

      // fallback (very unlikely) – if everything both sends & receives we keep the old guess
      const fallbackSrc  = pathData.transfers[0]?.from.toLowerCase();
      const fallbackSink = pathData.transfers[pathData.transfers.length - 1]?.to.toLowerCase();
      const finalSource  = sourceAddress ?? fallbackSrc;
      const finalSink    = sinkAddress   ?? fallbackSink;

      // Track which nodes are actually used in edges
      const connectedNodes = new Set();

      // Add source and sink addresses to connected nodes
      if (finalSource) connectedNodes.add(finalSource);
      if (finalSink) connectedNodes.add(finalSink);

      // First pass: create all edges and track connected nodes
      pathData.transfers.forEach(transfer => {
        const fromAddr = transfer.from.toLowerCase();
        const toAddr = transfer.to.toLowerCase();

        // Record that these nodes are connected
        connectedNodes.add(fromAddr);
        connectedNodes.add(toAddr);

        const flowPercentage = ((Number(transfer.value) / Number(pathData.maxFlow)) * 100);
        const flowValue = Number(transfer.value) / 1e18;
        const flowAtto = BigInt(transfer.value);
        const isWrappedToken = wrappedTokens.includes(transfer.tokenOwner.toLowerCase());

        // Create a unique ID for each edge
        const edgeId = `${fromAddr}-${toAddr}-${transfer.tokenOwner.toLowerCase()}-${Math.random().toString(36).substring(2, 9)}`;
        const profile = tokenOwnerProfiles[transfer.tokenOwner.toLowerCase()];
        const ownerLabel = profile?.name || `${transfer.tokenOwner.slice(0, 6)}...${transfer.tokenOwner.slice(-4)}`;

        elements.edges.push({
          data: {
            id: edgeId,
            source: fromAddr,
            target: toAddr,
            weight: Math.max(1, flowPercentage / 10),
            flowValue: flowValue,
            flowAtto: flowAtto.toString(),
            percentage: flowPercentage.toFixed(2),
            edgeLabel: ownerLabel,
            tokenOwner: transfer.tokenOwner.toLowerCase(),
            isWrapped: isWrappedToken,

            originalFrom: transfer.from,
            originalTo: transfer.to,
            originalTokenOwner: transfer.tokenOwner,

            fullInfo:
              `Flow: ${flowValue.toFixed(6)} CRC\n` +
              `Token address: ${transfer.tokenOwner}\n` +
              `Percentage: ${flowPercentage.toFixed(2)} %\n` +
              `Owner: ${ownerLabel}`
          }
        });
      });

      // Second pass: add only connected nodes to the elements
      connectedNodes.forEach(nodeId => {
        elements.nodes.add(nodeId);
      });

      // Determine if source and sink are the same
      const isSameSourceSink = sourceAddress === sinkAddress;

      // Convert nodes set to array of node objects
      const nodeElements = Array.from(elements.nodes).map(id => {
        const isSource = id.toLowerCase() === sourceAddress;
        const isSink = id.toLowerCase() === sinkAddress;

        let color;
        let profile = nodeProfiles[id.toLowerCase()];
        let label = profile?.name || `${id.slice(0, 6)}...${id.slice(-4)}`;
        let tooltipText = profile
          ? `Name: ${profile.name}\nAddress: ${id}`
          : `Address: ${id}`;

        if (isSameSourceSink && isSource && isSink) {
          color = '#e0f63b';
        } else if (isSource) {
          color = '#3B82F6'; // Blue for source
        } else if (isSink) {
          color = '#EF4444'; // Red for sink
        } else {
          color = '#CBD5E1'; // Gray for intermediate nodes
        }

        return {
          data: {
            id,
            label,
            fullAddress: id,
            isSource,
            isSink,
            color,
            tooltipText,
            // Store whether we're using a profile name
            hasProfileName: !!profile?.name
          }
        };
      });

      // Create Cytoscape graph
      const all = pathData.transfers.map(t => Number(t.value) / 1e18);
      const dmin = Math.min(...all), dmax = Math.max(...all);
      const minPx = 1, maxPx = 10;
      const widthExpr = `mapData(flowValue,${dmin},${dmax},${minPx},${maxPx})`;

      // Create Cytoscape instance with improved layout options
      const cy = cytoscape({
        container: containerRef.current,
        elements: {
          nodes: nodeElements,
          edges: elements.edges
        },
        style: [
          {
            selector: 'node',
            style: {
              'background-color': 'data(color)',
              'label': 'data(label)',
              'text-valign': 'center',
              'text-halign': 'center',
              'text-wrap': 'wrap',
              'text-max-width': '100px',
              'font-size': '10px',
              'width': '45px',
              'height': '45px',
              'text-margin-y': '10px'
            }
          },
          {
            selector: 'edge',
            style: {
              'width': widthExpr,
              'line-color': '#94A3B8',
              'target-arrow-color': '#94A3B8',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'line-style': function (ele) {
                return ele.data('isWrapped') ? 'dashed' : 'solid';
              },
              'label': function (ele) {
                return ele.data('edgeLabel') + " " + ele.data('percentage') + '%';
              },
              'text-rotation': 'autorotate',
              'font-size': '8px',
              'text-margin-y': '-10px',
              'text-outline-color': '#ffffff',
              'text-outline-width': 1
            }
          },
          {
            selector: 'edge.over-capacity',
            style: {
              'line-color': '#F97316',
              'target-arrow-color': '#F97316',
              'width': 4,
              'line-style': 'dotted'   // visually distinct from wrapped dashed edges
            }
          },
          {
            selector: 'edge.saturation',
            style: {
              'line-fill': 'linear-gradient',

              //      0%         pct         pct         100%
              'line-gradient-stop-colors': '#16A34A #16A34A #94A3B8 #94A3B8',
              'line-gradient-stop-positions': '0        0.0    0.0    1'  // overwritten per-edge
            }
          },
          {
            selector: '.highlighted',
            style: {
              'line-color': '#2563EB',
              'target-arrow-color': '#2563EB',
              'z-index': 999
            }
          }
        ],
        layout: {
          name: 'klay',
          nodeDimensionsIncludeLabels: true,
          klay: {
            direction: 'RIGHT',
            edgeSpacingFactor: 2.0,
            inLayerSpacingFactor: 2.0,
            spacing: 50,
            thoroughness: 10,
            nodeLayering: 'NETWORK_SIMPLEX',
            separateConnectedComponents: false,
            edgeRouting: 'SPLINES'
          }
        }
      });

      // Add event listeners for tooltips
      cy.on('mouseover', 'node', (event) => {
        const node = event.target;
        const position = event.renderedPosition;
        onTooltip({
          text: `${node.data('tooltipText')}`,
          position: {x: position.x, y: position.y}
        });
      });

      cy.on('mouseover', 'edge', (event) => {
        const edge = event.target;
        const position = event.renderedPosition;
        onTooltip({
          text: edge.data('fullInfo'),
          position: {x: position.x, y: position.y}
        });
      });

      cy.on('mouseout', () => {
        onTooltip({text: '', position: null});
      });

      // Add click handler for edges
      cy.on('click', 'edge', (event) => {
        const edge = event.target;
        const data = edge.data();
        // Create transaction ID from original transaction data
        const transactionId = `${data.originalFrom}-${data.originalTo}-${data.originalTokenOwner}`;
        onTransactionSelect(transactionId);
      });

      cyRef.current = cy;

      // Run layout again after a short delay to ensure proper positioning
      cyRef.current.layout({
        name: 'klay',
        nodeDimensionsIncludeLabels: true,
        klay: {
          direction: 'RIGHT',
          spacing: 50,
          thoroughness: 10
        }
      }).run();

    } catch (error) {
      console.error('Error initializing Cytoscape:', error);
    }

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
      }
    };
  }, [pathData, wrappedTokens, nodeProfiles, tokenOwnerProfiles, containerRef, onTooltip, onTransactionSelect]);

  // Update node labels/tooltips as nodeProfiles arrive
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || Object.keys(nodeProfiles).length === 0) return;

    cy.batch(() => {
      Object.entries(nodeProfiles).forEach(([addr, profile]) => {
        const node = cy.getElementById(addr);
        // Only update if we have a node and a profile with a name,
        // and we haven't already set a profile name
        if (!node.empty() && profile?.name && !node.data('hasProfileName')) {
          node.data('label', profile.name);
          node.data('tooltipText', `Name: ${profile.name}\nAddress: ${addr}`);
          node.data('hasProfileName', true); // Mark that we've set a profile name
        }
      });
    });
  }, [nodeProfiles]);

  // Update edge labels when tokenOwnerProfiles arrive
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !Object.keys(tokenOwnerProfiles).length) return;

    cy.batch(() => {
      Object.entries(tokenOwnerProfiles).forEach(([ownerAddr, profile]) => {
        if (!profile?.name) return;
        
        const label = profile.name;
        // select only edges whose tokenOwner matches
        cy.edges(`[tokenOwner = "${ownerAddr}"]`).forEach(edge => {
          edge.data('edgeLabel', label);
          // rebuild the fullInfo tooltip cleanly
          const flowValue = edge.data('flowValue').toFixed(6);
          const percentage = edge.data('percentage');
          edge.data(
            'fullInfo',
            `Flow: ${flowValue} CRC\n` +
            `Token address: ${ownerAddr}\n` +
            `Percentage: ${percentage}%\n` +
            `Owner: ${label}`
          );
        });
      });
    });
  }, [tokenOwnerProfiles]);

  // Update edge capacities when balancesByAccount changes
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !Object.keys(balancesByAccount).length) {
      return;
    }

    cy.batch(() => {
      cy.nodes().forEach(node => {
        const addr = node.id().toLowerCase();
        const balMap = balancesByAccount[addr] ?? {};
        const totalCrc = Object.values(balMap)
          .reduce((sum, e) => sum + e.crc, 0);

        // build a fresh tooltip, keep name / address if already present
        const base = node.data('hasProfileName')
          ? `Name: ${node.data('label')}\n`
          : '';
        node.data(
          'tooltipText',
          `${base}Address: ${addr}\n` +
          `Total balance: ${totalCrc.toFixed(6)} CRC`
        );
      });

      cy.edges().forEach(edge => {
        const srcAddr = edge.data('source').toLowerCase();
        const tokenAddr = edge.data('tokenOwner').toLowerCase();

        const balEntry = balancesByAccount[srcAddr]?.[tokenAddr];
        const balAtto = balEntry ? balEntry.atto : 0n;
        const balCrc = balEntry ? balEntry.crc : 0;

        const flowAtto = BigInt(edge.data('flowAtto'));
        const flowCrcDec = Number(edge.data('flowValue'));

        const exceedsCap = flowAtto > balAtto;
        const ratio = balAtto > 0n
          ? Math.min(Number(flowAtto) / Number(balAtto), 1)
          : 0;

        if (exceedsCap) {
          edge.addClass('over-capacity');
          edge.removeClass('saturation');
        } else {
          edge.removeClass('over-capacity');
          edge.addClass('saturation');

          const pct = (ratio * 100).toFixed(2);            // 0-100 %
          edge.style({
            'line-gradient-stop-colors': '#16A34A #16A34A #94A3B8 #94A3B8',
            'line-gradient-stop-positions': `0 ${pct} ${pct} 100`
          });
        }

        // Keep the original edge label/owner info
        const oldInfo = edge.data('fullInfo');
        const ownerInfo = oldInfo.split('\n').find(line => line.startsWith('Owner:')) || '';

        edge.data(
          'fullInfo',
          `Flow: ${flowCrcDec.toFixed(6)} CRC\n` +
          `Token address: ${tokenAddr}\n` +
          `Source balance: ${balCrc.toFixed(6)} CRC\n` +
          `Used: ${(ratio * 100).toFixed(2)} %\n` +
          ownerInfo
        );
      });
    });
  }, [balancesByAccount]);

  // Update edge width based on capacity
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const minPx = 1;  // minimum rendered width
    const maxPx = 10; // maximum rendered width

    // Build the mapData call on one line
    const expr = `mapData(flowValue,${minCapacity},${maxCapacity},${minPx},${maxPx})`;

    cy.style()
      .selector('edge')
      .style('width', expr)
      .update();
  }, [minCapacity, maxCapacity]);

  // Filter edges based on capacity range
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.batch(() => {
      cy.edges().forEach(edge => {
        const v = edge.data('flowValue');
        // hide anything outside [minCapacity, maxCapacity]
        if (v < minCapacity || v > maxCapacity) {
          edge.hide();
        } else {
          edge.show();
        }
      });
    });
  }, [minCapacity, maxCapacity]);

  const highlightTransaction = (transactionId) => {
    if (!cyRef.current) return;

    // Reset all edges to default style
    cyRef.current.edges().forEach(edge => {
      edge.style({
        'line-color': '#94A3B8',
        'target-arrow-color': '#94A3B8',
        'width': edge.data('weight')
      });
    });

    // Highlight selected edge
    if (transactionId) {
      // Find the edge in the table by its components rather than direct ID
      const parts = transactionId.split('-');
      if (parts.length >= 3) {
        const fromAddr = parts[0];
        const toAddr = parts[1];
        const tokenOwner = parts[2];

        // Find edges that match the transaction components
        const matchingEdges = cyRef.current.edges().filter(edge => {
          const data = edge.data();
          return (
            data.originalFrom.toLowerCase() === fromAddr.toLowerCase() &&
            data.originalTo.toLowerCase() === toAddr.toLowerCase() &&
            data.originalTokenOwner.toLowerCase() === tokenOwner.toLowerCase()
          );
        });

        if (matchingEdges.length > 0) {
          // Highlight all matching edges
          matchingEdges.forEach(edge => {
            edge.style({
              'line-color': '#2563EB',
              'target-arrow-color': '#2563EB',
              'width': Math.max(edge.data('weight') * 1.5, 3)
            });

            // Bring the edge to front
            edge.select();
          });
        }
      }
    }
  };

  return { cyRef, highlightTransaction };
};