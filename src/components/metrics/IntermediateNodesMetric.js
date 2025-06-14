import { GitBranch } from 'lucide-react';
import { createMetric, createMetricResult } from './BaseMetric';

export default createMetric({
  id: 'intermediateNodes',
  name: 'Intermediate Nodes',
  icon: GitBranch,
  description: 'Number of nodes between source and sink',
  order: 20,
  
  calculate: (pathData) => {
    const nodes = new Set();
    pathData.transfers.forEach(t => {
      nodes.add(t.from.toLowerCase());
      nodes.add(t.to.toLowerCase());
    });
    
    // Subtract 2 for source and sink
    const intermediateCount = Math.max(0, nodes.size - 2);
    
    return createMetricResult({
      value: intermediateCount,
      description: 'Number of nodes between source and sink',
      details: `Total nodes: ${nodes.size}`,
    });
  },
});