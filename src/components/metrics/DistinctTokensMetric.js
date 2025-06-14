import { Coins } from 'lucide-react';
import { createMetric, createMetricResult } from './BaseMetric';

export default createMetric({
  id: 'distinctTokens',
  name: 'Distinct Tokens',
  icon: Coins,
  description: 'Number of unique tokens used in the path',
  order: 30,
  
  calculate: (pathData) => {
    const tokens = new Set(pathData.transfers.map(t => t.tokenOwner.toLowerCase()));
    
    return createMetricResult({
      value: tokens.size,
      description: 'Number of unique tokens used in the path',
    });
  },
});