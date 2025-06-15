import { GitBranch } from 'lucide-react';
import { createMetric, createMetricResult } from './BaseMetric';

export default createMetric({
  id: 'intermediateNodes',
  name: 'Intermediate Nodes',
  icon: GitBranch,
  description: 'Number of nodes between source and sink',
  order: 20,
  layout: 'half',
  
  calculate: (pathData) => {
    // Find the actual source and sink
    const fromSet = new Set();
    const toSet = new Set();
    
    pathData.transfers.forEach(t => {
      fromSet.add(t.from.toLowerCase());
      toSet.add(t.to.toLowerCase());
    });
    
    // Source: appears in 'from' but not in 'to' (unless self-transfer)
    // Sink: appears in 'to' but not in 'from' (unless self-transfer)
    const sourceAddress = [...fromSet].find(addr => !toSet.has(addr)) || 
                         pathData.transfers[0]?.from.toLowerCase();
    const sinkAddress = [...toSet].find(addr => !fromSet.has(addr)) || 
                       pathData.transfers[pathData.transfers.length - 1]?.to.toLowerCase();
    
    // Collect all unique nodes
    const allNodes = new Set();
    pathData.transfers.forEach(t => {
      allNodes.add(t.from.toLowerCase());
      allNodes.add(t.to.toLowerCase());
    });
    
    // Count intermediate nodes (exclude source and sink)
    let intermediateCount = allNodes.size;
    
    // Handle the self-transfer case
    if (sourceAddress === sinkAddress) {
      // If source and sink are the same, subtract only 1
      intermediateCount = Math.max(0, intermediateCount - 1);
    } else {
      // Normal case: subtract both source and sink
      intermediateCount = Math.max(0, intermediateCount - 2);
    }
    
    return createMetricResult({
      value: intermediateCount,
      description: 'Number of nodes between source and sink',
      details: `Total nodes: ${allNodes.size}, Source: ${sourceAddress.slice(0,6)}..., Sink: ${sinkAddress.slice(0,6)}...`,
    });
  },
});