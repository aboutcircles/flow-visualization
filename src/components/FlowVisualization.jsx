import React, { useState, useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
//import dagre from 'cytoscape-dagre';
import klay from 'cytoscape-klay';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Header from '@/components/ui/header';
import TransactionTable from '@/components/ui/transaction_table';
import ToggleSwitch from '@/components/ui/toggle-switch';

// Register the klay layout with Cytoscape
cytoscape.use(klay);

// Define the API endpoint as a constant for easy updating
const API_ENDPOINT = '/api';

// Function to fetch wrapped tokens
const fetchWrappedTokens = async () => {
  try {
    const response = await fetch('https://rpc.aboutcircles.com/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'circles_query',
        params: [{
          Namespace: 'V_Crc',
          Table: 'Tokens',
          Limit: 100000,
          Columns: ['token'],
          Filter: [{
            Type: 'FilterPredicate',
            FilterType: 'Equals',
            Column: 'version',
            Value: 2
          }, {
            Type: 'FilterPredicate',
            FilterType: 'Like',
            Column: 'type',
            Value: '%ERC20WrapperDeployed%'
          }],
          Order: []
        }]
      })
    });

    const data = await response.json();
    return data.result.rows.map(row => row[0].toLowerCase());
  } catch (error) {
    console.error('Error fetching wrapped tokens:', error);
    return [];
  }
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

const FlowVisualization = () => {
  // State management for the component
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [formData, setFormData] = useState({
    from: '0x42cEDde51198D1773590311E2A340DC06B24cB37',
    to: '0x14c16ce62d26fd51582a646e2e30a3267b1e6d7e',
    fromTokens: '0x42cEDde51198D1773590311E2A340DC06B24cB37',
    toTokens: '',
    crcAmount: '1000',  // Amount in ETH
    amount: '1000000000000000000000' // Amount in Wei (will be calculated from crcAmount)
  });
  const [formErrors, setFormErrors] = useState({});
  const [pathData, setPathData] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [tooltip, setTooltip] = useState({ text: '', position: null });
  const [selectedTransactionId, setSelectedTransactionId] = useState(null);
  const [wrappedTokens, setWrappedTokens] = useState([]);
  const [showWrappedTokens, setShowWrappedTokens] = useState(true);
  
  // References for Cytoscape
  const cyRef = useRef(null);
  const containerRef = useRef(null);

  // Fetch wrapped tokens on component mount
  useEffect(() => {
    const loadWrappedTokens = async () => {
      const tokens = await fetchWrappedTokens();
      setWrappedTokens(tokens);
    };
    loadWrappedTokens();
  }, []);

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
    
    if (name === 'amount') {
      // For amount field, store ETH value and calculate Wei
      const weiValue = ethToWei(value);
      setFormData(prev => ({
        ...prev,
        crcAmount: value,
        amount: weiValue
      }));
    } else {
      // For other fields, store value as is
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
    
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  // Function to fetch path data from API
  const fetchPathData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Filter out empty values from the query parameters
      const queryParams = new URLSearchParams(
        Object.entries(formData).filter(([key, value]) => value !== '' && key !== 'crcAmount')
      );
      
      const url = `${API_ENDPOINT}/findPath?${queryParams}`;
      console.log('Fetching from URL:', url);

      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} ${response.statusText}\n${errorText}`);
      }
      
      const data = await response.json();
      console.log('API Response:', data);
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
        const selectedEdge = cyRef.current.getElementById(transactionId);
        if (selectedEdge) {
          selectedEdge.style({
            'line-color': '#2563EB',
            'target-arrow-color': '#2563EB',
            'width': Math.max(selectedEdge.data('weight') * 1.5, 3)
          });
          
          // Bring the edge to front
          selectedEdge.select();
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

      // Prepare graph elements
      const elements = {
        nodes: new Set(),
        edges: []
      };

      // Process transfers to create nodes and edges
      pathData.transfers.forEach(transfer => {
        elements.nodes.add(transfer.from);
        elements.nodes.add(transfer.to);

        const flowPercentage = ((Number(transfer.value) / Number(pathData.maxFlow)) * 100);
        const flowValue = Number(transfer.value) / 1e18;
        const isWrappedToken = wrappedTokens.includes(transfer.tokenOwner.toLowerCase());

        elements.edges.push({
          data: {
            id: `${transfer.from}-${transfer.to}-${transfer.tokenOwner}`,
            source: transfer.from,
            target: transfer.to,
            weight: Math.max(1, flowPercentage / 10),
            flowValue: flowValue,
            percentage: flowPercentage.toFixed(2),
            tokenOwner: transfer.tokenOwner,
            isWrapped: isWrappedToken,
            fullInfo: `Flow: ${flowValue.toFixed(6)} tokens\nPercentage: ${flowPercentage.toFixed(2)}%\nToken (${isWrappedToken ? 'CRC20' : 'ERC1155'}): ${transfer.tokenOwner}`
          }
        });
      });

      // Determine if source and sink are the same
      const sourceAddress = formData.from.toLowerCase();
      const sinkAddress = formData.to.toLowerCase();
      const isSameSourceSink = sourceAddress === sinkAddress;

      // Convert nodes set to array of node objects
      const nodeElements = Array.from(elements.nodes).map(id => {
        const isSource = id.toLowerCase() === sourceAddress;
        const isSink = id.toLowerCase() === sinkAddress;
        
        let color;
        if (isSameSourceSink && (isSource || isSink)) {
          color = 'linear-gradient(90deg, #3B82F6 50%, #EF4444 50%)';
        } else {
          color = isSource ? '#3B82F6' : isSink ? '#EF4444' : '#CBD5E1';
        }

        return {
          data: { 
            id,
            label: `${id.slice(0, 6)}...${id.slice(-4)}`,
            fullAddress: id,
            isSource,
            isSink,
            color
          }
        };
      });

      // Create Cytoscape instance
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
              'font-size': '10px',
              'width': '40px',
              'height': '40px'
            }
          },
          {
            selector: 'edge',
            style: {
              'width': 'data(weight)',
              'line-color': '#94A3B8',
              'target-arrow-color': '#94A3B8',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              'visibility': function(ele) {
                return (!showWrappedTokens && ele.data('isWrapped')) ? 'hidden' : 'visible';
              },
              'line-style': function(ele) {
                return ele.data('isWrapped') ? 'dashed' : 'solid';
              },
              'label': function(ele) {
                return ele.data('percentage') + '%';
              },
              'text-rotation': 'autorotate',
              'font-size': '8px',
              'text-margin-y': '-10px'
            }
          }
        ],
        layout: {
          name: 'klay',
          rankDir: 'LR',
          padding: 50,
          spacingFactor: 1.5
        }
      });

      // Add event listeners for tooltips
      cy.on('mouseover', 'node', (event) => {
        const node = event.target;
        const position = event.renderedPosition;
        setTooltip({
          text: `Address: ${node.data('fullAddress')}`,
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

      cyRef.current = cy;

    } catch (error) {
      console.error('Error initializing Cytoscape:', error);
      setError(`Failed to initialize visualization: ${error.message}`);
    }

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
      }
    };
  }, [pathData, formData.from, formData.to, wrappedTokens, showWrappedTokens]);

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
                        value={formData.from}
                        onChange={handleInputChange}
                        placeholder="0x..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">To Address</label>
                      <Input
                        name="to"
                        value={formData.to}
                        onChange={handleInputChange}
                        placeholder="0x..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Value (in CRC)</label>
                      <Input
                        name="amount"
                        value={formData.crcAmount}
                        onChange={handleInputChange}
                        placeholder="Enter amount in ETH..."
                        type="text"
                        inputMode="decimal"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">From Token (Optional)</label>
                      <Input
                        name="fromTokens"
                        value={formData.fromTokens}
                        onChange={handleInputChange}
                        placeholder="0x..."
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">To Token (Optional)</label>
                      <Input
                        name="toTokens"
                        value={formData.toTokens}
                        onChange={handleInputChange}
                        placeholder="0x..."
                      />
                    </div>
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

                  <Card>
                  <CardContent className="pt-4">
                    <ToggleSwitch
                      isEnabled={showWrappedTokens}
                      onToggle={() => setShowWrappedTokens(!showWrappedTokens)}
                      label="Show Wrapped Tokens"
                    />
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
      </div>
    </div>
  );
};

export default FlowVisualization;