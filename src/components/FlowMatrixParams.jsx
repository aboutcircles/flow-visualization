import { useState, useEffect } from "react";
import PropTypes from "prop-types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Code, ChevronDown, ChevronUp, Wallet, Send, X, AlertTriangle } from "lucide-react";
import { createFlowMatrix } from "@aboutcircles/sdk-pathfinder";
import { encodeFunctionData } from "viem";
import { useAccount, useConnect, useDisconnect, useSwitchChain, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from "wagmi";
import { gnosis } from "wagmi/chains";
import { HUB_ADDRESS } from "@/config/wagmi";
import { buildSafeFlowMatrixSimulationTx, executeFlowMatrixOnFork } from "@/services/circlesApi";
import CopyableAddress from "@/components/ui/copyable-address";

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

const SAFE_OWNERS_ABI = [
  {
    type: 'function',
    name: 'getOwners',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address[]' }],
  },
];

function bytesToHex(bytes) {
  return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

const toDisplayValue = (value) => {
  if (typeof value === 'bigint') return value.toString();
  if (value === null || value === undefined) return '—';
  return String(value);
};

const resolveSimulationSigner = async ({ publicClient, safeAddress, connectedAddress }) => {
  const normalizedSafe = safeAddress?.toLowerCase?.();
  const normalizedConnected = connectedAddress?.toLowerCase?.();

  let owners;
  try {
    owners = await publicClient.readContract({
      address: normalizedSafe,
      abi: SAFE_OWNERS_ABI,
      functionName: 'getOwners',
    });
  } catch {
    throw new Error(
      `Could not read Safe owners for ${normalizedSafe}. Ensure the sender address is a deployed Gnosis Safe contract.`
    );
  }

  const normalizedOwners = (owners || []).map((owner) => owner?.toLowerCase?.()).filter(Boolean);
  if (normalizedOwners.length === 0) {
    throw new Error(`No Safe owners found for sender safe ${normalizedSafe}.`);
  }

  if (normalizedConnected && normalizedOwners.includes(normalizedConnected)) {
    return {
      signer: normalizedConnected,
      owners: normalizedOwners,
      usesConnectedWallet: true,
    };
  }

  return {
    signer: normalizedOwners[0],
    owners: normalizedOwners,
    usesConnectedWallet: false,
  };
};

const FlowMatrixParams = ({ pathData, rawPathData, sender, receiver, showProcessed, isFiltered, view = 'all', blockNumber = '' }) => {
  const showParamsSection = view !== 'simulation';
  const showSimulationSection = view !== 'params';
  const [flowMatrix, setFlowMatrix] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState({ json: false, calldata: false });
  const [expanded, setExpanded] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationError, setSimulationError] = useState(null);
  const [simulationErrorLog, setSimulationErrorLog] = useState('');
  const [simulationResult, setSimulationResult] = useState(null);
  const [forkResult, setForkResult] = useState(null);
  const [isForkRunning, setIsForkRunning] = useState(false);
  const [forkError, setForkError] = useState(null);

  const { address, isConnected, chain } = useAccount();
  const publicClient = usePublicClient();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: hash, writeContract, isPending: isWritePending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  useEffect(() => {
    if (!showParamsSection) {
      setFlowMatrix(null);
      setError(null);
      return;
    }

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
  }, [pathData, sender, receiver, showParamsSection]);

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

  const handleSimulateTransaction = async () => {
    const simulationPathData = rawPathData || pathData;
    if (!simulationPathData || !sender || !receiver || !address || !publicClient) return;

    setSimulationError(null);
    setSimulationErrorLog('');
    setSimulationResult(null);
    setIsSimulating(true);
    let lastSimulationLog = '';

    try {
      const signerSelection = await resolveSimulationSigner({
        publicClient,
        safeAddress: sender,
        connectedAddress: address,
      });

      const buildSimulationTx = () => buildSafeFlowMatrixSimulationTx({
        pathData: simulationPathData,
        sender,
        receiver,
        signer: signerSelection.signer,
        hubAddress: HUB_ADDRESS,
      });

      const simulationTx = await buildSimulationTx();
      lastSimulationLog = simulationTx?.simulationLog || '';

      console.groupCollapsed('[FlowMatrix] Safe simulation');
      console.info('Simulation context', {
        sender: sender?.toLowerCase?.(),
        receiver: receiver?.toLowerCase?.(),
        connectedWallet: address?.toLowerCase?.(),
        simulationSigner: signerSelection.signer,
        safeOwners: signerSelection.owners,
        signerSelection: signerSelection.usesConnectedWallet
          ? 'connected wallet is a Safe owner'
          : 'connected wallet is not a Safe owner; using first Safe owner',
        safeAddress: simulationTx.safeAddress,
        gasFrom: simulationTx.gasFrom,
      });
      if (simulationTx.simulationLog) {
        console.log(simulationTx.simulationLog);
      }

      const gas = await publicClient.estimateGas({
        account: simulationTx.gasFrom,
        to: simulationTx.safeAddress,
        data: simulationTx.safeCalldata,
      });

      console.info('Estimated gas', gas.toString());
      console.groupEnd();

      if (gas === 0n) {
        throw new Error('Gas estimation returned 0 – path likely too long for a single block.');
      }

      setSimulationResult({
        gas,
        ...simulationTx.summary,
        diagnostics: simulationTx.diagnostics,
        simulationLog: simulationTx.simulationLog,
      });
    } catch (err) {
      console.error('[FlowMatrix] Safe simulation failed', err);
      if (console.groupEnd) {
        try {
          console.groupEnd();
        } catch {
          // no-op
        }
      }
      setSimulationError(err?.shortMessage || err?.message || 'Simulation failed');
      setSimulationErrorLog(
        lastSimulationLog ||
        ((typeof err?.simulationLog === 'string' && err.simulationLog) || '')
      );
    } finally {
      setIsSimulating(false);
    }
  };

  // Execute the operateFlowMatrix call on the session's Anvil fork of the pinned block and
  // report success/revert. No wallet needed — this is an eth_call from the flow source on
  // a throwaway fork. Only available in time-travel mode (a block is selected).
  const handleExecuteOnFork = async () => {
    setForkError(null);
    setForkResult(null);

    let calldata = null;
    try {
      calldata = getCalldata();
    } catch (err) {
      setForkError(err?.message || 'Could not build calldata');
      return;
    }
    if (!calldata || !sender) {
      setForkError('No calldata or source available.');
      return;
    }

    setIsForkRunning(true);
    try {
      const result = await executeFlowMatrixOnFork({
        blockNumber,
        source: sender,
        hubAddress: HUB_ADDRESS,
        calldata,
      });
      setForkResult(result);
    } catch (err) {
      setForkError(err?.message || 'Fork execution failed');
    } finally {
      setIsForkRunning(false);
    }
  };

  if (error && showParamsSection) {
    return (
      <Card className="mt-4">
        <CardContent className="pt-4">
          <p className="text-red-600 text-sm">Flow matrix error: {error}</p>
        </CardContent>
      </Card>
    );
  }

  if (showParamsSection && !flowMatrix) return null;

  const params = showParamsSection ? getJsonParams() : null;
  const shortParams = showParamsSection && params
    ? {
        ...params,
        _flowVertices: params._flowVertices.length > 3 ? [...params._flowVertices.slice(0, 3), "..."] : params._flowVertices,
        _flow: params._flow.length > 3 ? [...params._flow.slice(0, 3), "..."] : params._flow,
      }
    : null;

  const formattedJson = showParamsSection
    ? (expanded
    ? JSON.stringify({ method: "operateFlowMatrix", params }, null, 2)
    : JSON.stringify({ method: "operateFlowMatrix", params: shortParams }, null, 2))
    : null;

  let calldata = null;
  try {
    calldata = showParamsSection ? getCalldata() : null;
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
        {isFiltered && (
          <div className="flex items-center gap-2 mb-3 p-2 bg-indigo-50 border border-indigo-200 rounded text-indigo-800 text-xs">
            <span>Filtered: using {pathData.transfers.length} transfer{pathData.transfers.length !== 1 ? 's' : ''} from selected routes.</span>
          </div>
        )}
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <Code size={18} className="text-blue-500" />
            <h2 className="text-lg font-semibold">
              {showSimulationSection && !showParamsSection ? 'Flow Matrix Simulation' : 'operateFlowMatrix'}
            </h2>
            {showParamsSection && (
              <span className="text-xs text-gray-400 font-mono">{HUB_V2_ADDRESS.slice(0, 10)}…</span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {showParamsSection && (
              <>
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
                {blockNumber && (
                  <Button
                    onClick={handleExecuteOnFork}
                    disabled={isForkRunning || !flowMatrix}
                    variant="outline"
                    className="flex items-center gap-1 border-purple-300 text-purple-700 hover:bg-purple-50"
                  >
                    {isForkRunning ? 'Running on fork…' : 'Execute on fork'}
                  </Button>
                )}
              </>
            )}
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
                  showParamsSection && (
                    <Button
                      onClick={handleExecuteTransaction}
                      disabled={!canExecute}
                      className="flex items-center gap-1 bg-green-600 hover:bg-green-700"
                    >
                      <Send size={16} />
                      {isWritePending || isConfirming ? "Executing..." : isConfirmed ? "Transaction Confirmed!" : "Execute Transaction"}
                    </Button>
                  )
                )}
                {showSimulationSection && (
                  <Button
                    onClick={handleSimulateTransaction}
                    disabled={!isConnected || isWrongChain || isSimulating}
                    variant="outline"
                    className="flex items-center gap-1"
                  >
                    {isSimulating ? 'Simulating…' : 'Simulate'}
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
            Connected: <CopyableAddress address={address} />
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

        {showParamsSection && (forkResult || forkError) && (
          <div
            className={`mb-2 p-3 rounded text-sm border ${
              forkResult?.success
                ? 'bg-green-50 border-green-200 text-green-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            <div className="font-medium">Execute on fork (block {blockNumber})</div>
            {forkError && <div>Error: {forkError}</div>}
            {forkResult?.success && (
              <div>✔ Would succeed on-chain{forkResult.gasUsed ? ` — gas ${forkResult.gasUsed}` : ''}.</div>
            )}
            {forkResult && !forkResult.success && (
              <div>✖ Reverts: {forkResult.revertReason}</div>
            )}
          </div>
        )}

        {showSimulationSection && simulationError && (
          <div className="mb-2 p-2 bg-red-100 text-red-700 rounded text-sm space-y-2">
            <div>Simulation error: {simulationError}</div>
            {simulationErrorLog && (
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-red-800">Simulation log (until error)</div>
                <pre className="mt-1 max-h-64 overflow-auto rounded border border-red-200 bg-white/70 p-2 font-mono text-xs text-red-900 whitespace-pre-wrap text-left">
                  {simulationErrorLog}
                </pre>
              </div>
            )}
          </div>
        )}

        {showSimulationSection && simulationResult && (
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-900 space-y-1">
            <div className="font-medium">Safe simulation</div>
            <div>Estimated gas: {simulationResult.gas.toString()}</div>
            <div>Wrapped sender edges: {simulationResult.wrappedEdgesFromSender}</div>
            {simulationResult.wrappedEdgesByType && (
              <div className="text-xs text-blue-800">
                Wrapped edge types: static {simulationResult.wrappedEdgesByType.static} · demurraged {simulationResult.wrappedEdgesByType.demurraged}
              </div>
            )}
            <div>Sub-calls: {simulationResult.calls} (unwrap: {simulationResult.unwrapCalls}, re-wrap: {simulationResult.wrapCalls})</div>
            {simulationResult.unwrapByType && (
              <div className="text-xs text-blue-800">
                Unwrap targets: static {simulationResult.unwrapByType.static} · demurraged {simulationResult.unwrapByType.demurraged}
              </div>
            )}
            <div className="text-xs text-blue-700">Order: self-approval → unwrap(s) → operateFlowMatrix → re-wrap(s)</div>

            {simulationResult.diagnostics?.staticWrappers?.length > 0 && (
              <div className="mt-2">
                <div className="text-xs font-medium uppercase tracking-wide text-blue-700">Static wrappers</div>
                <div className="mt-1 overflow-auto rounded border border-blue-200 bg-white/80">
                  <table className="min-w-full text-xs">
                    <thead className="bg-blue-100/70 text-blue-900">
                      <tr>
                        <th className="px-2 py-1 text-left">Wrapper</th>
                        <th className="px-2 py-1 text-right">Path demurraged</th>
                        <th className="px-2 py-1 text-right">Unwrapped static</th>
                        <th className="px-2 py-1 text-right">Unwrapped demurraged</th>
                        <th className="px-2 py-1 text-right">Spent demurraged</th>
                        <th className="px-2 py-1 text-right">Re-wrap demurraged</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simulationResult.diagnostics.staticWrappers.map((row) => (
                        <tr key={row.wrapper} className="border-t border-blue-100">
                          <td className="px-2 py-1 font-mono text-[11px]">{row.wrapper}</td>
                          <td className="px-2 py-1 text-right font-mono">{toDisplayValue(row.pathDemurraged)}</td>
                          <td className="px-2 py-1 text-right font-mono">{toDisplayValue(row.staticBalanceUnwrapped)}</td>
                          <td className="px-2 py-1 text-right font-mono">{toDisplayValue(row.demurragedBalanceUnwrapped)}</td>
                          <td className="px-2 py-1 text-right font-mono">{toDisplayValue(row.demurragedSpent)}</td>
                          <td className="px-2 py-1 text-right font-mono">{toDisplayValue(row.demurragedRemainingToWrap)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {simulationResult.diagnostics?.demurragedWrappers?.length > 0 && (
              <div className="mt-2">
                <div className="text-xs font-medium uppercase tracking-wide text-blue-700">Demurraged wrappers</div>
                <div className="mt-1 overflow-auto rounded border border-blue-200 bg-white/80">
                  <table className="min-w-full text-xs">
                    <thead className="bg-blue-100/70 text-blue-900">
                      <tr>
                        <th className="px-2 py-1 text-left">Wrapper</th>
                        <th className="px-2 py-1 text-right">Path demurraged</th>
                        <th className="px-2 py-1 text-right">Unwrap demurraged</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simulationResult.diagnostics.demurragedWrappers.map((row) => (
                        <tr key={row.wrapper} className="border-t border-blue-100">
                          <td className="px-2 py-1 font-mono text-[11px]">{row.wrapper}</td>
                          <td className="px-2 py-1 text-right font-mono">{toDisplayValue(row.pathDemurraged)}</td>
                          <td className="px-2 py-1 text-right font-mono">{toDisplayValue(row.demurragedUnwrapAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {simulationResult.diagnostics?.callTimeline?.length > 0 && (
              <div className="mt-2">
                <div className="text-xs font-medium uppercase tracking-wide text-blue-700">Sub-call timeline</div>
                <div className="mt-1 overflow-auto rounded border border-blue-200 bg-white/80">
                  <table className="min-w-full text-xs">
                    <thead className="bg-blue-100/70 text-blue-900">
                      <tr>
                        <th className="px-2 py-1 text-right">#</th>
                        <th className="px-2 py-1 text-left">Action</th>
                        <th className="px-2 py-1 text-left">To</th>
                        <th className="px-2 py-1 text-left">Selector</th>
                        <th className="px-2 py-1 text-right">Bytes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simulationResult.diagnostics.callTimeline.map((row) => (
                        <tr key={`${row.index}-${row.selector}`} className="border-t border-blue-100">
                          <td className="px-2 py-1 text-right font-mono">{row.index}</td>
                          <td className="px-2 py-1">{row.label}</td>
                          <td className="px-2 py-1 font-mono text-[11px]">{row.to}</td>
                          <td className="px-2 py-1 font-mono">{row.selector}</td>
                          <td className="px-2 py-1 text-right font-mono">{row.dataLengthBytes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {simulationResult.simulationLog && (
              <div className="mt-2">
                <div className="text-xs font-medium uppercase tracking-wide text-blue-700">Simulation log</div>
                <pre className="mt-1 max-h-64 overflow-auto rounded border border-blue-200 bg-white/70 p-2 font-mono text-xs text-blue-900 whitespace-pre-wrap text-left">
                  {simulationResult.simulationLog}
                </pre>
              </div>
            )}
          </div>
        )}

        {showParamsSection && (
          <div className="relative">
            <div className="bg-gray-50 p-4 rounded-md overflow-auto max-h-96 font-mono text-sm">
              <pre className="whitespace-pre-wrap text-left">{formattedJson}</pre>
            </div>
          </div>
        )}
        {showParamsSection && calldata && (
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
  rawPathData: PropTypes.object,
  sender: PropTypes.string,
  receiver: PropTypes.string,
  showProcessed: PropTypes.bool,
  isFiltered: PropTypes.bool,
  view: PropTypes.oneOf(['all', 'params', 'simulation']),
  blockNumber: PropTypes.string,
};

export default FlowMatrixParams;
