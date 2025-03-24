import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Copy, Check, Code, ChevronDown, ChevronUp } from 'lucide-react';
import { generateFlowMatrixParams } from '@/lib/utils';

const FlowMatrixParams = ({ pathData, sender }) => {
  const [params, setParams] = useState(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!pathData || !sender) return;
    // Generate params using the sender as the "from" address
    const flowParams = generateFlowMatrixParams(pathData, sender);
    setParams(flowParams);
  }, [pathData, sender]);

  const copyToClipboard = () => {
    if (!params) return;
    
    const formatted = JSON.stringify({
      method: "operateFlowMatrix",
      params
    }, null, 2);
    
    navigator.clipboard.writeText(formatted);
    setCopied(true);
    
    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  if (!params) return null;

  // For UI clarity, create shorter versions with limited data
  const shortParams = {
    ...params,
    _flowVertices: params._flowVertices.length > 3 
      ? [...params._flowVertices.slice(0, 3), '...'] 
      : params._flowVertices,
    _flow: params._flow.length > 3 
      ? [...params._flow.slice(0, 3), '...'] 
      : params._flow
  };

  const formattedJson = expanded 
    ? JSON.stringify({ method: "operateFlowMatrix", params }, null, 2)
    : JSON.stringify({ method: "operateFlowMatrix", params: shortParams }, null, 2);

  return (
    <Card className="mt-4">
      <CardContent className="pt-4">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-2">
            <Code size={18} className="text-blue-500" />
            <h2 className="text-lg font-semibold">operateFlowMatrix Parameters</h2>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => setExpanded(!expanded)}
              variant="outline"
              className="flex items-center gap-1"
            >
              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              {expanded ? 'Show Less' : 'Show Full Params'}
            </Button>
            <Button 
              onClick={copyToClipboard} 
              className="flex items-center gap-1"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>
        <div className="relative">
          <div className="bg-gray-50 p-4 rounded-md overflow-auto max-h-96 font-mono text-sm">
            <pre className="whitespace-pre-wrap text-left">
              {formattedJson}
            </pre>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default FlowMatrixParams;