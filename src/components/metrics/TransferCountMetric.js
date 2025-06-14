import { Activity } from 'lucide-react';
import { createMetric, createMetricResult } from './BaseMetric';

export default createMetric({
  id: 'transferCount',
  name: 'Total Transfers',
  icon: Activity,
  description: 'Number of individual token transfers in the path',
  order: 10,
  
  calculate: (pathData) => {
    return createMetricResult({
      value: pathData.transfers.length,
      description: 'Number of individual token transfers in the path',
    });
  },
});