import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Code, ChevronDown, ChevronUp, Wallet, Send, X, AlertTriangle } from "lucide-react";
import { createFlowMatrix } from "@aboutcircles/sdk-pathfinder";
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

const HUB_V2_ADDRESS = '0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8';

function bytesToHex(bytes) {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

const FlowMatrixParams = ({ pathData, sender, receiver, showProcessed }) => {
  const [flowMatrix, setFlowMatrix] = useState(null);
  const [error, setError] = useState(null);
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
    setError(null);

    try {
      const transfers = pathData.transfers;
      if (!transfers || transfers.length === 0 || !receiver) return;

      // Convert string values to bigint for SDK
      const bigintTransfers = transfers.map(t => ({
        ...t,
        value: BigInt(t.value),
      }));

      const fm = createFlowMatrix(sender, receiver, BigInt(pathData.maxFlow), bigintTransfers);
      setFlowMatrix(fm);
    } catch (err) {
      console.error('Error generating flow matrix:', err);
      setError(err.message);
      setFlowMatrix(null);
    }
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

  const getCalldata = () => {
    if (!flowMatrix) return null;

    const streamsWithHex = flowMatrix.streams.map(s => ({
      sourceCoordinate: s.sourceCoordinate,
      flowEdgeIds: s.flowEdgeIds,
      data: s.data instanceof Uint8Array ? bytesToHex(s.data) : (s.data || '0x'),
    }));

    return encodeFunctionData({
      abi: OPERATE_FLOW_MATRIX_ABI,
      functionName: "operateFlowMatrix",
      args: [
        flowMatrix.flowVertices,
        flowMatrix.flowEdges.map(e => ({ streamSinkId: e.streamSinkId, amount: BigInt(e.amount) })),
        streamsWithHex,
        flowMatrix.packedCoordinates,
      ],
    });
  };

  const getJsonParams = () => {
    if (!flowMatrix) return null;
    return {
      _flowVertices: flowMatrix.flowVertices,
      _flow: flowMatrix.flowEdges.map(e => ({ streamSinkId: e.streamSinkId, amount: e.amount.toString() })),
      _streams: flowMatrix.streams.map(s => ({
        sourceCoordinate: s.sourceCoordinate,
        flowEdgeIds: [...s.flowEdgeIds],
        data: s.data instanceof Uint8Array ? bytesToHex(s.data) : (s.data || '0x'),
      })),
      _packedCoordinates: flowMatrix.packedCoordinates,
    };
  };

  const copyToClipboard = async (type) => {
    if (!flowMatrix) return;

    let textToCopy;
    try {
      if (type === "json") {
        textToCopy = JSON.stringify({ method: "operateFlowMatrix", params: getJsonParams() }, null, 2);
      } else if (type === "calldata") {
        textToCopy = getCalldata();
      }
    } catch (err) {
      console.error("Error generating " + type + ":", err);
      return;
    }

    await navigator.clipboard.writeText(textToCopy);
    setCopied((prev) => ({ ...prev, [type]: true }));
    setTimeout(() => setCopied((prev) => ({ ...prev, [type]: false })), 2000);
  };

  const handleConnectWallet = (connector) => {
    connect({ connector });
    setShowWalletModal(false);
  };

  const getWalletInfo = (connector) => {
    const provider = connector.provider;

    if (typeof window !== 'undefined' && provider) {
      if (provider.isRabby || window.rabby === provider) {
        return { name: 'Rabby Wallet', detected: true };
      }
      if (provider.isMetaMask && !provider.isRabby) {
        return { name: 'MetaMask', detected: true };
      }
      if (provider.isCoinbaseWallet) {
        return { name: 'Coinbase Wallet', detected: true };
      }
      if (provider.isBraveWallet) {
        return { name: 'Brave Wallet', detected: true };
      }
    }

    return {
      name: connector.name === 'Injected' ? 'Browser Wallet' : connector.name,
      detected: connector.name !== 'WalletConnect'
    };
  };

  const handleExecuteTransaction = async () => {
    if (!flowMatrix) return;

    const params = getJsonParams();
    if (!params) return;

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
          params._flow.map(e => ({ streamSinkId: e.streamSinkId, amount: BigInt(e.amount) })),
          params._streams.map(s => ({
            sourceCoordinate: s.sourceCoordinate,
            flowEdgeIds: s.flowEdgeIds,
            data: s.data || '0x',
          })),
          params._packedCoordinates,
        ],
      });
    } catch (error) {
      console.error("Error executing transaction:", error);
    }
  };

  if (error) {
    return (
      <Card className="mt-4">
        <CardContent className="pt-4">
          <p className="text-red-600 text-sm">Flow matrix error: {error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!flowMatrix) return null;

  const params = getJsonParams();
  const shortParams = {
    ...params,
    _flowVertices: params._flowVertices.length > 3 ? [...params._flowVertices.slice(0, 3), "..."] : params._flowVertices,
    _flow: params._flow.length > 3 ? [...params._flow.slice(0, 3), "..."] : params._flow,
  };

  const formattedJson = expanded
    ? JSON.stringify({ method: "operateFlowMatrix", params }, null, 2)
    : JSON.stringify({ method: "operateFlowMatrix", params: shortParams }, null, 2);

  let calldata = null;
  try {
    calldata = getCalldata();
  } catch (err) {
    // will show error inline
  }

  const isWrongChain = isConnected && chain?.id !== gnosis.id;
  const canExecute = isConnected && !isWrongChain && !isWritePending && !isConfirming;

  return (
    <Card className="mt-4">
      <CardContent className="pt-4">
        {!showProcessed && (
          <div className="flex items-center gap-2 mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs">
            <AlertTriangle size={14} />
            <span>Raw path — may contain wrapper addresses. Enable &quot;Resolve Wrappers&quot; for executable calldata.</span>
          </div>
        )}
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <Code size={18} className="text-blue-500" />
            <h2 className="text-lg font-semibold">
              operateFlowMatrix
            </h2>
            <span className="text-xs text-gray-400 font-mono">{HUB_V2_ADDRESS.slice(0, 10)}…</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => setExpanded(!expanded)}
              variant="outline"
              className="flex items-center gap-1"
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              {expanded ? "Less" : "Full"}
            </Button>
            <Button
              onClick={() => copyToClipboard("json")}
              variant="outline"
              className="flex items-center gap-1"
            >
              {copied.json ? <Check size={16} /> : <Copy size={16} />}
              {copied.json ? "Copied!" : "JSON"}
            </Button>
            <Button
              onClick={() => copyToClipboard("calldata")}
              variant="outline"
              className="flex items-center gap-1"
            >
              {copied.calldata ? <Check size={16} /> : <Copy size={16} />}
              {copied.calldata ? "Copied!" : "Calldata"}
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
        {calldata && (
          <div className="mt-3">
            <p className="text-xs text-gray-500 mb-1">Encoded calldata ({calldata.length} chars)</p>
            <div className="bg-gray-50 p-2 rounded-md overflow-auto max-h-24 font-mono text-xs text-gray-600 break-all">
              {calldata.slice(0, 200)}{calldata.length > 200 ? '…' : ''}
            </div>
          </div>
        )}

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
