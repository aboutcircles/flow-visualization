import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Check, Code, ChevronDown, ChevronUp } from "lucide-react";
import { generateFlowMatrixParams } from "@/lib/utils";
import { encodeFunctionData } from "viem";

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

const FlowMatrixParams = ({ pathData, sender }) => {
  const [params, setParams] = useState(null);
  const [copied, setCopied] = useState({ json: false, calldata: false });
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!pathData || !sender) return;
    const flowParams = generateFlowMatrixParams(pathData, sender);
    setParams(flowParams);
  }, [pathData, sender]);

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
          <div className="flex gap-2">
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
              className="flex items-center gap-1"
            >
              {copied.calldata ? <Check size={16} /> : <Copy size={16} />}
              {copied.calldata ? "Copied!" : "Copy Calldata"}
            </Button>
          </div>
        </div>
        <div className="relative">
          <div className="bg-gray-50 p-4 rounded-md overflow-auto max-h-96 font-mono text-sm">
            <pre className="whitespace-pre-wrap text-left">{formattedJson}</pre>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default FlowMatrixParams;
