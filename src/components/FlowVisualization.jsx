import React, { useState, useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import klay from 'cytoscape-klay';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import Header from '@/components/ui/header';
import TransactionTable from '@/components/ui/transaction_table';
import ToggleSwitch from '@/components/ui/toggle-switch';
import FlowMatrixParams from './FlowMatrixParams';
import {CirclesData, CirclesRpc} from "@circles-sdk/data";
import {Profiles} from "@circles-sdk/profiles";
import * as SliderPrimitive from '@radix-ui/react-slider';

// Register the klay layout with Cytoscape
cytoscape.use(klay);

// Define the API endpoint as a constant for easy updating
const API_ENDPOINT =  'https://rpc.aboutcircles.com/'

// Helper function to parse string of addresses into an array
const parseAddressList = (addressString) => {
  if (!addressString) return [];

  // Split by comma, newline, or space and filter out empty entries
  return addressString
      .split(/[\s,]+/)
      .map(addr => addr.trim())
      .filter(addr => addr && addr.startsWith('0x'));
};

// Tooltip component with improved formatting
const Tooltip = ({ text, position }) => {
  if (!position) return null;

  // Split the text by newlines and create separate lines
  const lines = text.split('\n');

  return (
      <div
          className="absolute z-50 bg-black/75 text-white p-2 rounded text-sm"
          style={{
            left: position.x + 10,
            top: position.y + 10,
            maxWidth: '400px'
          }}
      >
        {lines.map((line, index) => (
            <div key={index} className="whitespace-pre-wrap">{line}</div>
        ))}
      </div>
  );
};

// TokenInput component for handling multiple token inputs
const TokenInput = ({ value, onChange, placeholder, label }) => {
  const [inputValue, setInputValue] = useState('');

  // Parse the current value string into an array of tokens
  const tokens = parseAddressList(value);

  const handleAddToken = () => {
    if (inputValue && inputValue.startsWith('0x')) {
      // Combine existing tokens with the new one and update parent
      const updatedTokens = [...tokens, inputValue];
      onChange(updatedTokens.join(','));
      setInputValue('');
    }
  };

  const handleRemoveToken = (tokenToRemove) => {
    const updatedTokens = tokens.filter(token => token !== tokenToRemove);
    onChange(updatedTokens.join(','));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && inputValue) {
      e.preventDefault();
      handleAddToken();
    }
  };

  return (
      <div>
        <label className="block text-sm font-medium mb-1">{label}</label>
        <div className="flex mb-2">
          <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={placeholder}
              onKeyDown={handleKeyDown}
              className="flex-1"
          />
          <Button
              type="button"
              onClick={handleAddToken}
              className="ml-2"
          >
            <Plus size={16} />
          </Button>
        </div>
        {tokens.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {tokens.map((token, index) => (
                  <div key={index} className="flex items-center bg-gray-100 rounded-md px-2 py-1">
              <span className="text-xs font-mono mr-1 truncate" style={{ maxWidth: '120px' }}>
                {token}
              </span>
                    <button
                        type="button"
                        className="text-gray-500 hover:text-gray-700"
                        onClick={() => handleRemoveToken(token)}
                    >
                      <X size={14} />
                    </button>
                  </div>
              ))}
            </div>
        )}
      </div>
  );
};

const FlowVisualization = () => {
  // State management for the component
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [formData, setFormData] = useState({
    From: '0x42cEDde51198D1773590311E2A340DC06B24cB37',
    To: '0x14c16ce62d26fd51582a646e2e30a3267b1e6d7e',
    FromTokens: '0x42cEDde51198D1773590311E2A340DC06B24cB37',
    ToTokens: '',
    crcAmount: '1000',  // Amount in ETH (for UI display)
    Amount: '1000000000000000000000', // Amount in Wei (will be calculated from crcAmount)
    WithWrap: true // New flag for API endpoint
  });
  const [formErrors, setFormErrors] = useState({});
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tooltip, setTooltip] = useState({ text: '', position: null });
  const [selectedTransactionId, setSelectedTransactionId] = useState(null);
  const [wrappedTokens, setWrappedTokens] = useState([]);
  const [tokenInfo, setTokenInfo] = useState({});
  const [tokenOwnerProfiles, setTokenOwnerProfiles] = useState({});
  const [nodeProfiles, setNodeProfiles] = useState({});
  const [pathData, setPathData] = useState(null);
  const [minCapacity, setMinCapacity] = useState(0);
  const [maxCapacity, setMaxCapacity] = useState(0);
  const [boundMin, setBoundMin] = useState(0);
  const [boundMax, setBoundMax] = useState(0);
  const circlesData = useRef(new CirclesData(new CirclesRpc(API_ENDPOINT))).current;
  const circlesProfiles = useRef(new Profiles(API_ENDPOINT + "profiles/")).current;

  // References for Cytoscape
  const cyRef = useRef(null);
  const containerRef = useRef(null);

  // Once we have pathData, fetch info for each tokenOwner in the path
  useEffect(() => {
    if (!pathData) return;

    const loadTokenInfos = async () => {
      // Collect unique tokenOwner addresses from transfers
      const tokenOwners = Array.from(
          new Set(pathData.transfers.map(t => t.tokenOwner.toLowerCase()))
      );

      // Fetch token info rows via the SDK
      const infoRows = await circlesData.getTokenInfoBatch(tokenOwners);

      // Keep only ERC20 wrapper deployments
      const wrapperTypes = [
        'CrcV2_ERC20WrapperDeployed_Inflationary',
        'CrcV2_ERC20WrapperDeployed_Demurraged'
      ];

      const wrapped = infoRows
          .filter(row => wrapperTypes.includes(row.type))
          .map(row => row.token.toLowerCase());

      const tokenInfoMap = infoRows.reduce((p,c) => {
        p[c.token.toLowerCase()] = c;
        return p;
      }, {});

      console.log("Wrapped token in path:", wrapped);

      setWrappedTokens(wrapped);
      setTokenInfo(tokenInfoMap);
    };

    loadTokenInfos();
  }, [pathData, circlesData]);

  // fetch profiles of token owners in batches of 50. In the end setTokenOwnerProfiles.
  useEffect(() => {
    const addresses = Object.keys(tokenInfo);
    if (addresses.length === 0) return;

    const loadProfiles = async () => {
      const batches = [];
      for (let i = 0; i < addresses.length; i += 50) {
        batches.push(addresses.slice(i, i + 50));
      }

      const profilesMap = {};
      for (const batch of batches) {
        const profiles = await circlesProfiles.searchByAddresses(batch, { fetchComplete: true });
        profiles.forEach(profile => {
          profilesMap[profile.address.toLowerCase()] = profile;
        });
      }

      setTokenOwnerProfiles(profilesMap);
    };

    loadProfiles();
  }, [tokenInfo, circlesProfiles]);

  // Fetch profiles for nodes/accounts involved in transfers
  useEffect(() => {
    if (!pathData) return;
    const addresses = Array.from(new Set(
        pathData.transfers.flatMap(t => [t.from.toLowerCase(), t.to.toLowerCase()])
    ));
    const loadNodeProfiles = async () => {
      const map = {};
      for (let i = 0; i < addresses.length; i += 50) {
        const batch = addresses.slice(i, i + 50);
        const profiles = await circlesProfiles.searchByAddresses(batch, { fetchComplete: true });
        profiles.forEach(p => { map[p.address.toLowerCase()] = p; });
      }
      setNodeProfiles(map);
    };
    loadNodeProfiles();
  }, [pathData, circlesProfiles]);

  // Set the min. and max. of the value filter slider
  useEffect(() => {
    if (!pathData) return;
    // pull out all the flowValues in token units
    const values = pathData.transfers.map(t => Number(t.value) / 1e18);
    const trueMin = Math.min(...values);
    const trueMax = Math.max(...values);
    // initialize your thumbs to the full span
    setBoundMin(trueMin);
    setBoundMax(trueMax);
    setMinCapacity(trueMin);
    setMaxCapacity(trueMax);
  }, [pathData]);

  // Convert ETH to Wei
  const ethToWei = (crcAmount) => {
    try {
      if (!crcAmount || isNaN(crcAmount)) return '0';

      // Convert to Wei (multiply by 10^18)
      const [whole, fraction = ''] = crcAmount.toString().split('.');
      const decimals = fraction.padEnd(18, '0');
      const wei = whole + decimals;
      return BigInt(wei).toString();
    } catch (error) {
      console.error('Error converting ETH to Wei:', error);
      return '0';
    }
  };

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (name === 'crcAmount') {
      // For amount field, store ETH value and calculate Wei
      const weiValue = ethToWei(value);
      setFormData(prev => ({
        ...prev,
        crcAmount: value,
        Amount: weiValue
      }));
    } else {
      // Map UI field names to the capitalized API parameter names
      const mappedFieldName = name === 'from' ? 'From' :
          name === 'to' ? 'To' :
              name === 'fromTokens' ? 'FromTokens' :
                  name === 'toTokens' ? 'ToTokens' : name;

      // For other fields, store value as is
      setFormData(prev => ({
        ...prev,
        [mappedFieldName]: value
      }));
    }

    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  // Handle token list changes
  const handleTokensChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle toggle change for WithWrap option
  const handleWithWrapToggle = () => {
    setFormData(prev => ({
      ...prev,
      WithWrap: !prev.WithWrap
    }));
  };

  // Function to fetch path data from API using JSON-RPC POST
  const fetchPathData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Parse token strings into arrays
      const fromTokensArray = parseAddressList(formData.FromTokens);
      const toTokensArray = parseAddressList(formData.ToTokens);

      // Create the params object for the JSON-RPC request
      const params = {
        Source: formData.From,
        Sink: formData.To,
        TargetFlow: formData.Amount,
      };

      // Only add optional parameters if they have values
      if (fromTokensArray.length > 0) {
        params.FromTokens = fromTokensArray;
      }

      if (toTokensArray.length > 0) {
        params.ToTokens = toTokensArray;
      }

      // WithWrap is a boolean, so always include it
      params.WithWrap = formData.WithWrap;

      // Construct the JSON-RPC request
      const requestBody = {
        jsonrpc: "2.0",
        id: 0,
        method: "circlesV2_findPath",
        params: [params]
      };

      console.log('Sending JSON-RPC request:', requestBody);

      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} ${response.statusText}\n${errorText}`);
      }

      const responseData = await response.json();

      if (responseData.error) {
        throw new Error(`JSON-RPC error: ${responseData.error.message || JSON.stringify(responseData.error)}`);
      }

      // Extract the result data
      const data = responseData.result;
      setPathData(data);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(`Failed to fetch path data: ${err.message}`);
      setPathData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTransactionSelect = (transactionId) => {
    setSelectedTransactionId(transactionId);

    if (cyRef.current) {
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
    }
  };

  // Initialize and update Cytoscape graph
  useEffect(() => {
    if (!pathData || !containerRef.current) return;

    try {
      // Clean up existing instance
      if (cyRef.current) {
        cyRef.current.destroy();
      }

      const all = pathData.transfers.map(t => Number(t.value)/1e18);
      const dmin = Math.min(...all), dmax = Math.max(...all);
      const minPx = 1, maxPx = 10;
      const widthExpr = `mapData(flowValue,${dmin},${dmax},${minPx},${maxPx})`;

      // Prepare graph elements
      const elements = {
        nodes: new Set(),
        edges: []
      };

      // Process transfers to create nodes and edges - fixed for token owner issue
      const sourceAddress = formData.From.toLowerCase();
      const sinkAddress = formData.To.toLowerCase();

      // Track which nodes are actually used in edges
      const connectedNodes = new Set();

      // Add source and sink addresses to connected nodes
      connectedNodes.add(sourceAddress);
      connectedNodes.add(sinkAddress);

      // First pass: create all edges and track connected nodes
      pathData.transfers.forEach(transfer => {
        const fromAddr = transfer.from.toLowerCase();
        const toAddr = transfer.to.toLowerCase();

        // Record that these nodes are connected
        connectedNodes.add(fromAddr);
        connectedNodes.add(toAddr);

        const flowPercentage = ((Number(transfer.value) / Number(pathData.maxFlow)) * 100);
        const flowValue = Number(transfer.value) / 1e18;
        const isWrappedToken = wrappedTokens.includes(transfer.tokenOwner.toLowerCase());

        // Create a unique ID for each edge
        const edgeId = `${fromAddr}-${toAddr}-${transfer.tokenOwner.toLowerCase()}-${Math.random().toString(36).substring(2, 9)}`;
        const profile = tokenOwnerProfiles[transfer.tokenOwner.toLowerCase()];
        const ownerLabel = profile?.name || `${transfer.tokenOwner.slice(0,6)}...${transfer.tokenOwner.slice(-4)}`;

        elements.edges.push({
          data: {
            id: edgeId,
            source: fromAddr,
            target: toAddr,
            weight: Math.max(1, flowPercentage / 10),
            flowValue: flowValue,
            percentage: flowPercentage.toFixed(2),
            edgeLabel: ownerLabel,
            tokenOwner: transfer.tokenOwner.toLowerCase(),
            isWrapped: isWrappedToken,
            // Track the original transfer for table selection
            originalFrom: transfer.from,
            originalTo: transfer.to,
            originalTokenOwner: transfer.tokenOwner,
            fullInfo: `Flow: ${flowValue.toFixed(6)} tokens\nPercentage: ${flowPercentage.toFixed(2)}%\nToken (${isWrappedToken ? 'CRC20' : 'ERC1155'}): ${transfer.tokenOwner}\n${ownerLabel}`
          }
        });
      });

      // Second pass: add only connected nodes to the elements
      connectedNodes.forEach(nodeId => {
        elements.nodes.add(nodeId);
      });

      // Log node and edge counts for debugging
      console.log(`Creating graph with ${connectedNodes.size} nodes and ${elements.edges.length} edges`);
      console.log('Connected nodes:', Array.from(connectedNodes));

      // Determine if source and sink are the same
      const isSameSourceSink = sourceAddress === sinkAddress;

      // Convert nodes set to array of node objects
      const nodeElements = Array.from(elements.nodes).map(id => {
        const isSource = id.toLowerCase() === sourceAddress;
        const isSink = id.toLowerCase() === sinkAddress;

        let color;
        let profile = nodeProfiles[id];
        let label = profile?.name ?? `${id.slice(0,6)}...${id.slice(-4)}`;
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
            tooltipText
          }
        };
      });

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
              'line-style': function(ele) {
                return ele.data('isWrapped') ? 'dashed' : 'solid';
              },
              'label': function(ele) {
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
        setTooltip({
          text: `${node.data('tooltipText')}`,
          position: { x: position.x, y: position.y }
        });
      });

      cy.on('mouseover', 'edge', (event) => {
        const edge = event.target;
        const position = event.renderedPosition;
        setTooltip({
          text: edge.data('fullInfo'),
          position: { x: position.x, y: position.y }
        });
      });

      cy.on('mouseout', () => {
        setTooltip({ text: '', position: null });
      });

      // Add click handler for edges
      cy.on('click', 'edge', (event) => {
        const edge = event.target;
        const data = edge.data();
        // Create transaction ID from original transaction data
        const transactionId = `${data.originalFrom}-${data.originalTo}-${data.originalTokenOwner}`;
        handleTransactionSelect(transactionId);
      });

      cyRef.current = cy;

      // Run layout again after a short delay to ensure proper positioning
      setTimeout(() => {
        if (cyRef.current) {
          cyRef.current.layout({
            name: 'klay',
            nodeDimensionsIncludeLabels: true,
            klay: {
              direction: 'RIGHT',
              spacing: 50,
              thoroughness: 10
            }
          }).run();
        }
      }, 100);

    } catch (error) {
      console.error('Error initializing Cytoscape:', error);
      setError(`Failed to initialize visualization: ${error.message}`);
    }

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
      }
    };
  }, [pathData, wrappedTokens]);

  // patch node labels/tooltips as nodeProfiles arrive
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || Object.keys(nodeProfiles).length === 0) return;

    cy.batch(() => {
      Object.entries(nodeProfiles).forEach(([addr, profile]) => {
        const node = cy.getElementById(addr);
        if (!node.empty()) {
          node.data('label', profile.name || node.data('label'));
          node.data(
              'tooltipText',
              `Name: ${profile.name}\nAddress: ${addr}`
          );
        }
      });
    });
  }, [nodeProfiles]);

  // patch edge labels when tokenOwnerProfiles arrive
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !Object.keys(tokenOwnerProfiles).length) return;

    cy.batch(() => {
      Object.entries(tokenOwnerProfiles).forEach(([ownerAddr, profile]) => {
        const label = profile.name || '';
        // select only edges whose tokenOwner matches
        cy.edges(`[tokenOwner = "${ownerAddr}"]`).forEach(edge => {
          edge.data('edgeLabel', label);
          // rebuild the fullInfo tooltip cleanly
          const flowValue   = edge.data('flowValue').toFixed(6);
          const percentage  = edge.data('percentage');
          edge.data(
              'fullInfo',
              `Flow: ${flowValue} tokens\n` +
              `Percentage: ${percentage}%\n` +
              `Owner: ${label}`
          );
        });
      });
    });
  }, [tokenOwnerProfiles]);

  // whenever minCapacity changes, show/hide edges
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

  return (
      <div className="flex flex-col h-screen bg-gray-50">
        <Header />
        <div className="flex flex-col mt-16">
          <div className="flex flex-1 min-h-[50vh]">
            {/* Sidebar with collapsible functionality */}
            <div
                className={`
              transform transition-all duration-300 ease-in-out
              bg-white shadow-lg relative
              ${isCollapsed ? 'w-12' : 'w-[32rem]'}
            `}
                style={{
                  minWidth: isCollapsed ? '3rem' : '32rem',
                  maxWidth: isCollapsed ? '3rem' : '32rem'
                }}
            >
              {/* Toggle button */}
              <button
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="absolute -right-3 top-1/2 -translate-y-1/2 bg-white shadow-lg p-2 rounded-full z-10"
              >
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
              </button>

              {/* Sidebar content - only shown when expanded */}
              {!isCollapsed && (
                  <div className="p-4 space-y-4">
                    <Card>
                      <CardContent className="space-y-4 pt-4">
                        <div>
                          <label className="block text-sm font-medium mb-1">From Address</label>
                          <Input
                              name="from"
                              value={formData.From}
                              onChange={handleInputChange}
                              placeholder="0x..."
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">To Address</label>
                          <Input
                              name="to"
                              value={formData.To}
                              onChange={handleInputChange}
                              placeholder="0x..."
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1">Value (in CRC)</label>
                          <Input
                              name="crcAmount"
                              value={formData.crcAmount}
                              onChange={handleInputChange}
                              placeholder="Enter amount in ETH..."
                              type="text"
                              inputMode="decimal"
                          />
                        </div>

                        {/* Token input components for multiple tokens */}
                        <TokenInput
                            value={formData.FromTokens}
                            onChange={(value) => handleTokensChange('FromTokens', value)}
                            placeholder="0x..."
                            label="From Tokens (Optional, Add multiple)"
                        />

                        <TokenInput
                            value={formData.ToTokens}
                            onChange={(value) => handleTokensChange('ToTokens', value)}
                            placeholder="0x..."
                            label="To Tokens (Optional, Add multiple)"
                        />

                        <div>
                          <ToggleSwitch
                              isEnabled={formData.WithWrap}
                              onToggle={handleWithWrapToggle}
                              label="Include Wrapped Tokens"
                          />
                        </div>

                        {pathData && (
                            <div className="mb-4">
                              <label className="block text-sm font-medium mb-1">
                                Capacity range: {minCapacity.toFixed(3)} → {maxCapacity.toFixed(3)}
                              </label>
                              <SliderPrimitive.Root
                                  className="relative flex items-center select-none touch-none w-full h-5"
                                  min={boundMin}
                                  max={boundMax}
                                  step={0.001}
                                  value={[minCapacity, maxCapacity]}
                                  onValueChange={([newMin, newMax]) => {
                                    setMinCapacity(newMin);
                                    setMaxCapacity(newMax);
                                  }}
                                  aria-label="Edge capacity range"
                              >
                                <SliderPrimitive.Track className="bg-gray-200 relative flex-1 h-1 rounded-full">
                                  <SliderPrimitive.Range className="absolute bg-blue-500 h-full rounded-full" />
                                </SliderPrimitive.Track>
                                <SliderPrimitive.Thumb className="block w-4 h-4 bg-white border-2 border-blue-500 rounded-full shadow" />
                                <SliderPrimitive.Thumb className="block w-4 h-4 bg-white border-2 border-blue-500 rounded-full shadow" />
                              </SliderPrimitive.Root>
                            </div>
                        )}

                        <Button
                            className="w-full"
                            onClick={fetchPathData}
                            disabled={isLoading}
                        >
                          {isLoading ? 'Finding Path...' : 'Find Path'}
                        </Button>
                      </CardContent>
                    </Card>

                    {pathData && (
                        <>
                          <Card>
                            <CardContent className="pt-4">
                              <p className="text-sm font-medium">Max Flow</p>
                              <p className="text-lg">{(Number(pathData.maxFlow) / 1e18).toFixed(6)}</p>
                            </CardContent>
                          </Card>
                        </>
                    )}

                    {error && (
                        <Card className="bg-red-50">
                          <CardContent className="pt-4">
                            <p className="text-red-600">{error}</p>
                          </CardContent>
                        </Card>
                    )}
                  </div>
              )}
            </div>

            {/* Main content area - remains the same */}
            <div className={`
            flex-1 bg-white relative
            transition-all duration-300 ease-in-out
            ${isCollapsed ? 'ml-12' : 'ml-0'}
          `}>
              {pathData ? (
                  <>
                    <div
                        ref={containerRef}
                        className="w-full h-full"
                    />
                    <Tooltip {...tooltip} />
                  </>
              ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    Enter addresses and click "Find Path" to visualize the flow
                  </div>
              )}
            </div>
          </div>

          {/* Transaction Table Section */}
          {pathData && (
              <div className="p-4 bg-gray-50">
                <h2 className="text-lg font-semibold mb-4">Transactions</h2>
                <TransactionTable
                    transfers={pathData.transfers}
                    maxFlow={pathData.maxFlow}
                    onTransactionSelect={handleTransactionSelect}
                    selectedTransactionId={selectedTransactionId}
                />
              </div>
          )}

          {/* Flow Matrix Parameters Section */}
          {pathData && (
              <div className="p-4 bg-gray-50">
                <FlowMatrixParams
                    pathData={pathData}
                    sender={formData.From}
                />
              </div>
          )}
        </div>
      </div>
  );
};

export default FlowVisualization;