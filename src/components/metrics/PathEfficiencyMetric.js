import { Network } from 'lucide-react';
import { createMetric, createMetricResult } from './BaseMetric';

export default createMetric({
  id: 'pathEfficiency',
  name: 'Path Efficiency',
  icon: Network,
  description: 'Path efficiency compared to direct transfer',
  order: 70,
  
  calculate: (pathData) => {
    const directPath = 2; // Minimum possible: source -> sink
    const actualPath = new Set(
      pathData.transfers.flatMap(t => [t.from.toLowerCase(), t.to.toLowerCase()])
    ).size;
    
    const efficiency = (directPath / actualPath) * 100;
    
    return createMetricResult({
      value: `${efficiency.toFixed(1)}%`,
      description: 'Path efficiency compared to direct transfer',
      details: `${actualPath} nodes used vs ${directPath} minimum`,
    });
  },
});