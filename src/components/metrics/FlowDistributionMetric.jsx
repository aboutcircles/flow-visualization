import React from 'react';
import { TrendingUp } from 'lucide-react';
import { createMetric, createMetricResult } from './BaseMetric';

const getQuantile = (arr, q) => {
  const pos = (arr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (arr[base + 1] !== undefined) {
    return arr[base] + rest * (arr[base + 1] - arr[base]);
  } else {
    return arr[base];
  }
};

export default createMetric({
  id: 'flowDistribution',
  name: 'Flow Distribution',
  icon: TrendingUp,
  description: 'Statistical distribution of flow amounts',
  order: 40,
  
  calculate: (pathData) => {
    const flows = pathData.transfers
      .map(t => Number(t.value) / 1e18)
      .sort((a, b) => a - b);
    
    const stats = {
      min: flows[0]?.toFixed(2) || 0,
      q25: getQuantile(flows, 0.25).toFixed(2),
      median: getQuantile(flows, 0.5).toFixed(2),
      q75: getQuantile(flows, 0.75).toFixed(2),
      max: flows[flows.length - 1]?.toFixed(2) || 0,
      mean: (flows.reduce((a, b) => a + b, 0) / flows.length).toFixed(2)
    };
    
    return createMetricResult({
      value: stats,
      description: 'Statistical distribution of flow amounts (CRC)',
    });
  },
  
  visualize: (pathData, value) => (
    <div className="mt-4">
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <span className="text-gray-500">Min:</span> {value.min}
        </div>
        <div>
          <span className="text-gray-500">Median:</span> {value.median}
        </div>
        <div>
          <span className="text-gray-500">Max:</span> {value.max}
        </div>
        <div>
          <span className="text-gray-500">Q1:</span> {value.q25}
        </div>
        <div>
          <span className="text-gray-500">Mean:</span> {value.mean}
        </div>
        <div>
          <span className="text-gray-500">Q3:</span> {value.q75}
        </div>
      </div>
    </div>
  ),
});