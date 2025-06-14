import { Users } from 'lucide-react';
import { createMetric, createMetricResult } from './BaseMetric';

export default createMetric({
  id: 'avgNodeDegree',
  name: 'Average Node Degree',
  icon: Users,
  description: 'Average number of connections per node',
  order: 80,
  
  calculate: (pathData) => {
    const nodeConnections = {};
    
    pathData.transfers.forEach(t => {
      const from = t.from.toLowerCase();
      const to = t.to.toLowerCase();
      
      if (!nodeConnections[from]) nodeConnections[from] = new Set();
      if (!nodeConnections[to]) nodeConnections[to] = new Set();
      
      nodeConnections[from].add(to);
      nodeConnections[to].add(from);
    });
    
    const degrees = Object.values(nodeConnections).map(connections => connections.size);
    const avgDegree = degrees.reduce((a, b) => a + b, 0) / degrees.length;
    
    return createMetricResult({
      value: avgDegree.toFixed(2),
      description: 'Average number of connections per node',
      details: `Max degree: ${Math.max(...degrees)}, Min degree: ${Math.min(...degrees)}`,
    });
  },
});