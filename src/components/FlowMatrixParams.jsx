import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Code, ChevronDown, ChevronUp, Wallet, Send, X } from "lucide-react";
import { generateFlowMatrixParams } from "@/lib/utils";
import { encodeFunctionData } from "viem";
import { useAccount, useConnect, useDisconnect, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { gnosis } from "wagmi/chains";
import { HUB_ADDRESS } from "@/config/wagmi";

// Just the operateFlowMatrix function ABI
const OPERATE_FLOW_MATRIX_ABI = [
  {
    inputs: [
      {
        internalType: "address[]",
        name: "_flowVertices",
        type: "address[]",
      },
      {
        components: [
          {
            internalType: "uint16",
            name: "streamSinkId",
            type: "uint16",
          },
          {
            internalType: "uint192",
            name: "amount",
            type: "uint192",
          },
        ],
        internalType: "struct TypeDefinitions.FlowEdge[]",
        name: "_flow",
        type: "tuple[]",
      },
      {
        components: [
          {
            internalType: "uint16",
            name: "sourceCoordinate",
            type: "uint16",
          },
          {
            internalType: "uint16[]",
            name: "flowEdgeIds",
            type: "uint16[]",
          },
          {
            internalType: "bytes",
            name: "data",
            type: "bytes",
          },
        ],
        internalType: "struct TypeDefinitions.Stream[]",
        name: "_streams",
        type: "tuple[]",
      },
      {
        internalType: "bytes",
        name: "_packedCoordinates",
        type: "bytes",
      },
    ],
    name: "operateFlowMatrix",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];

// API endpoint for RPC calls
const API_ENDPOINT = 'https://rpc.aboutcircles.com/';

// Fetch token info to determine if it's wrapped and get the actual owner
async function fetchTokenInfo(tokenAddress) {
  try {
    const requestBody = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "circles_getTokenInfo",
      params: [tokenAddress.toLowerCase()]
    };

    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      console.error(`Failed to fetch token info for ${tokenAddress}`);
      return null;
    }

    const responseData = await response.json();
    
    if (responseData.error) {
      console.error(`RPC error for token ${tokenAddress}:`, responseData.error);
      return null;
    }

    console.log(`Token info response for ${tokenAddress}:`, responseData.result);
    return responseData.result;
  } catch (error) {
    console.error(`Error fetching token info for ${tokenAddress}:`, error);
    return null;
  }
}

async function generateFlowMatrixParams(pathData, from) {
  if (!pathData || !from || !pathData.transfers || pathData.transfers.length === 0) return null;
  
  try {
    // Extract the 'to' address
    const to = pathData.transfers.length > 0 
      ? pathData.transfers[pathData.transfers.length - 1].to.toLowerCase()
      : null;
    
    // Normalize from address
    from = from.toLowerCase();
    
    // First, collect all unique token addresses from transfers
    const tokenAddresses = [...new Set(pathData.transfers.map(t => t.tokenOwner.toLowerCase()))];
    
    // Fetch token info for all tokens to check if they're wrapped
    const tokenInfoPromises = tokenAddresses.map(addr => fetchTokenInfo(addr));
    const tokenInfoResults = await Promise.all(tokenInfoPromises);
    
    // Create a mapping from token to actual owner
    const tokenToOwnerMapping = {};
    
    tokenAddresses.forEach((tokenAddr, index) => {
      const info = tokenInfoResults[index];
      if (info) {
        // Check if it's a wrapped token - use tokenType not type
        if (info.tokenType === 'CrcV2_ERC20WrapperDeployed_Inflationary' || 
            info.tokenType === 'CrcV2_ERC20WrapperDeployed_Demurraged') {
          tokenToOwnerMapping[tokenAddr] = info.tokenOwner.toLowerCase();
          console.log(`Token ${tokenAddr} is wrapped (${info.tokenType}), actual owner: ${info.tokenOwner}`);
        } else {
          tokenToOwnerMapping[tokenAddr] = tokenAddr;
          console.log(`Token ${tokenAddr} is not wrapped, using same address`);
        }
      } else {
        // If we couldn't fetch info, assume the token is its own owner
        tokenToOwnerMapping[tokenAddr] = tokenAddr;
        console.warn(`Could not fetch info for token ${tokenAddr}, assuming not wrapped`);
      }
    });
    
    console.log('Final token to owner mapping:', tokenToOwnerMapping);
    
    // 1. Build the vertices list (unique addresses involved in transfers)
    const addressSet = new Set();
    addressSet.add(from);
    if (to) addressSet.add(to);
    
    // Normalize all transfers
    const normalizedTransfers = pathData.transfers.map(t => ({
      from: t.from.toLowerCase(),
      to: t.to.toLowerCase(),
      tokenOwner: t.tokenOwner.toLowerCase(),
      value: t.value
    }));
    
    // Add all addresses from transfers (using actual token owners for wrapped tokens)
    normalizedTransfers.forEach(transfer => {
      addressSet.add(transfer.from);
      addressSet.add(transfer.to);
      // Add the actual token owner (not the wrapped token address)
      const actualOwner = tokenToOwnerMapping[transfer.tokenOwner] || transfer.tokenOwner;
      addressSet.add(actualOwner);
    });
    
    // Convert to sorted array (using BigInt sorting like in the TypeScript implementation)
    console.log('Address set before sorting:', Array.from(addressSet));
    
    const flowVertices = Array.from(addressSet).sort((a, b) => {
      // Add '0x' prefix if not present to avoid conversion errors
      const aHex = a.startsWith('0x') ? a : '0x' + a;
      const bHex = b.startsWith('0x') ? b : '0x' + b;
      
      try {
        const bigintA = BigInt(aHex);
        const bigintB = BigInt(bHex);
        return bigintA < bigintB ? -1 : bigintA > bigintB ? 1 : 0;
      } catch (e) {
        // Fallback to string comparison if BigInt conversion fails
        return a.localeCompare(b);
      }
    });
    
    // 2. Create a lookup map for addresses to indices
    const lookup = {};
    flowVertices.forEach((addr, index) => {
      lookup[addr] = index;
    });
    
    // 3. Build flow edges and coordinates
    const flowEdges = [];
    const coordinates = [];
    
    normalizedTransfers.forEach(transfer => {
      // Mark edges that flow to the destination with streamSinkId=1
      const isToSink = to && transfer.to === to;
      
      // Add flow edge
      flowEdges.push({
        streamSinkId: isToSink ? 1 : 0,
        amount: transfer.value
      });
      
      // Add coordinates (token, from, to) - using actual token owner for wrapped tokens
      const actualTokenOwner = tokenToOwnerMapping[transfer.tokenOwner] || transfer.tokenOwner;
      coordinates.push(
        lookup[actualTokenOwner],
        lookup[transfer.from],
        lookup[transfer.to]
      );
    });
    
    // Ensure at least one terminal edge is marked, as in the TypeScript code
    if (!flowEdges.some(edge => edge.streamSinkId === 1) && flowEdges.length > 0) {
      // Find the last edge where transfer.to matches the 'to' address
      const lastIndex = normalizedTransfers.map(t => t.to).lastIndexOf(to);
      if (lastIndex !== -1) {
        flowEdges[lastIndex].streamSinkId = 1;
      } else {
        // If not found, set the last edge as terminal by default
        flowEdges[flowEdges.length - 1].streamSinkId = 1;
      }
    }
    
    // 4. Create flowEdgeIds array (indices of edges with streamSinkId = 1)
    const flowEdgeIds = flowEdges
      .map((edge, index) => edge.streamSinkId === 1 ? index : -1)
      .filter(index => index !== -1);
    
    // 5. Create stream object
    const stream = {
      sourceCoordinate: lookup[from],
      flowEdgeIds: flowEdgeIds,
      data: "0x" // Empty bytes
    };
    
    // 6. Pack coordinates
    const packedCoordinates = packCoordinates(coordinates);
    
    // Create the final params object
    return {
      _flowVertices: flowVertices,
      _flow: flowEdges,
      _streams: [stream],
      _packedCoordinates: packedCoordinates
    };
  } catch (error) {
    console.error('Error generating operateFlowMatrix params:', error);
    return null;
  }
}

const FlowMatrixParams = ({ pathData, sender }) => {
  const [params, setParams] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState({ json: false, calldata: false });
  const [expanded, setExpanded] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);

  const { address, isConnected, chain } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: hash, writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (!pathData || !sender) return;
    
    setIsLoading(true);
    generateFlowMatrixParams(pathData, sender)
      .then(flowParams => {
        setParams(flowParams);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Error generating params:', err);
        setIsLoading(false);
      });
  }, [pathData, sender]);

  useEffect(() => {
    if (writeError) {
      console.error("Transaction error:", writeError);
    }
  }, [writeError]);

  useEffect(() => {
    if (isConfirmed) {
      console.log("Transaction confirmed:", hash);
    }
  }, [isConfirmed, hash]);

  const copyToClipboard = async (type) => {
    if (!params) return;

    let textToCopy;

    if (type === "json") {
      textToCopy = JSON.stringify(
        {
          method: "operateFlowMatrix",
          params,
        },
        null,
        2,
      );
    } else if (type === "calldata") {
      try {
        const calldata = encodeFunctionData({
          abi: OPERATE_FLOW_MATRIX_ABI,
          functionName: "operateFlowMatrix",
          args: [
            params._flowVertices,
            params._flow,
            params._streams,
            params._packedCoordinates,
          ],
        });
        textToCopy = calldata;
      } catch (error) {
        console.error("Error generating calldata:", error);
        return;
      }
    }

    await navigator.clipboard.writeText(textToCopy);
    setCopied((prev) => ({ ...prev, [type]: true }));

    setTimeout(() => {
      setCopied((prev) => ({ ...prev, [type]: false }));
    }, 2000);
  };

  const handleConnectWallet = (connector) => {
    connect({ connector });
    setShowWalletModal(false);
  };

  const getWalletInfo = (connector) => {
    // Check the connector's actual provider
    const provider = connector.provider;
    
    if (typeof window !== 'undefined' && provider) {
      // Check for Rabby
      if (provider.isRabby || window.rabby === provider) {
        return { name: 'Rabby Wallet', detected: true };
      }
      // Check for MetaMask (but not if it's Rabby pretending to be MetaMask)
      if (provider.isMetaMask && !provider.isRabby) {
        return { name: 'MetaMask', detected: true };
      }
      // Check for Coinbase Wallet
      if (provider.isCoinbaseWallet) {
        return { name: 'Coinbase Wallet', detected: true };
      }
      // Check for Brave Wallet
      if (provider.isBraveWallet) {
        return { name: 'Brave Wallet', detected: true };
      }
    }
    
    // Fallback to connector name
    return { 
      name: connector.name === 'Injected' ? 'Browser Wallet' : connector.name, 
      detected: connector.name !== 'WalletConnect' 
    };
  };

  const handleExecuteTransaction = async () => {
    if (!params) return;

    // Check if we're on Gnosis Chain
    if (chain?.id !== gnosis.id) {
      try {
        await switchChain({ chainId: gnosis.id });
      } catch (error) {
        console.error("Error switching chain:", error);
        return;
      }
    }

    try {
      writeContract({
        address: HUB_ADDRESS,
        abi: OPERATE_FLOW_MATRIX_ABI,
        functionName: "operateFlowMatrix",
        args: [
          params._flowVertices,
          params._flow,
          params._streams,
          params._packedCoordinates,
        ],
      });
    } catch (error) {
      console.error("Error executing transaction:", error);
    }
  };

  if (!params) return null;

  const shortParams = {
    ...params,
    _flowVertices:
      params._flowVertices.length > 3
        ? [...params._flowVertices.slice(0, 3), "..."]
        : params._flowVertices,
    _flow:
      params._flow.length > 3
        ? [...params._flow.slice(0, 3), "..."]
        : params._flow,
  };

  const formattedJson = expanded
    ? JSON.stringify({ method: "operateFlowMatrix", params }, null, 2)
    : JSON.stringify(
        { method: "operateFlowMatrix", params: shortParams },
        null,
        2,
      );

  const isWrongChain = isConnected && chain?.id !== gnosis.id;
  const canExecute = isConnected && !isWrongChain && !isWritePending && !isConfirming;

  return (
    <Card className="mt-4">
      <CardContent className="pt-4">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <Code size={18} className="text-blue-500" />
            <h2 className="text-lg font-semibold">
              operateFlowMatrix Parameters
            </h2>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => setExpanded(!expanded)}
              variant="outline"
              className="flex items-center gap-1"
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              {expanded ? "Show Less" : "Show Full Params"}
            </Button>
            <Button
              onClick={() => copyToClipboard("json")}
              variant="outline"
              className="flex items-center gap-1"
            >
              {copied.json ? <Check size={16} /> : <Copy size={16} />}
              {copied.json ? "Copied!" : "Copy JSON"}
            </Button>
            <Button
              onClick={() => copyToClipboard("calldata")}
              variant="outline"
              className="flex items-center gap-1"
            >
              {copied.calldata ? <Check size={16} /> : <Copy size={16} />}
              {copied.calldata ? "Copied!" : "Copy Calldata"}
            </Button>
            {!isConnected ? (
              <Button
                onClick={() => setShowWalletModal(true)}
                className="flex items-center gap-1 bg-green-600 hover:bg-green-700"
              >
                <Wallet size={16} />
                Connect Wallet
              </Button>
            ) : (
              <>
                {isWrongChain ? (
                  <Button
                    onClick={() => switchChain({ chainId: gnosis.id })}
                    className="flex items-center gap-1 bg-orange-600 hover:bg-orange-700"
                  >
                    Switch to Gnosis Chain
                  </Button>
                ) : (
                  <Button
                    onClick={handleExecuteTransaction}
                    disabled={!canExecute}
                    className="flex items-center gap-1 bg-green-600 hover:bg-green-700"
                  >
                    <Send size={16} />
                    {isWritePending || isConfirming ? "Executing..." : isConfirmed ? "Transaction Confirmed!" : "Execute Transaction"}
                  </Button>
                )}
                <Button
                  onClick={() => disconnect()}
                  variant="outline"
                  className="flex items-center gap-1"
                >
                  Disconnect
                </Button>
              </>
            )}
          </div>
        </div>
        
        {isConnected && (
          <div className="mb-2 text-sm text-gray-600">
            Connected: {address?.slice(0, 6)}...{address?.slice(-4)} 
            {chain && ` (${chain.name})`}
          </div>
        )}
        
        {writeError && (
          <div className="mb-2 p-2 bg-red-100 text-red-700 rounded text-sm">
            Error: {writeError.message}
          </div>
        )}
        
        {hash && (
          <div className="mb-2 p-2 bg-green-100 text-green-700 rounded text-sm">
            Transaction submitted: {hash.slice(0, 10)}...{hash.slice(-8)}
            {isConfirming && " - Confirming..."}
            {isConfirmed && " - Confirmed!"}
          </div>
        )}
        
        <div className="relative">
          <div className="bg-gray-50 p-4 rounded-md overflow-auto max-h-96 font-mono text-sm">
            <pre className="whitespace-pre-wrap text-left">{formattedJson}</pre>
          </div>
        </div>

        {/* Wallet Selection Modal */}
        {showWalletModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowWalletModal(false)}>
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Connect Wallet</h3>
                <button onClick={() => setShowWalletModal(false)} className="text-gray-500 hover:text-gray-700">
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-2">
                {Array.from(new Map(connectors.map(c => [c.uid, c])).values()).map((connector) => {
                  const walletInfo = getWalletInfo(connector);
                  return (
                    <Button
                      key={connector.uid}
                      onClick={() => handleConnectWallet(connector)}
                      variant="outline"
                      className="w-full justify-start text-left hover:bg-gray-50"
                    >
                      <Wallet size={16} className="mr-2" />
                      <span className="flex-1">{walletInfo.name}</span>
                      {walletInfo.detected && (
                        <span className="text-xs text-green-600 ml-2">● Detected</span>
                      )}
                    </Button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-500 mt-4 text-center">
                {window?.rabby 
                  ? '✓ Rabby Wallet is installed and ready' 
                  : window?.ethereum?.isMetaMask 
                  ? '✓ MetaMask is installed and ready'
                  : window?.ethereum
                  ? '✓ Wallet detected'
                  : 'Please install a Web3 wallet to continue'}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

FlowMatrixParams.propTypes = {
  pathData: PropTypes.object,
  sender: PropTypes.string,
};

export default FlowMatrixParams;