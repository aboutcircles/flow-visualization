import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { createMetric, createMetricResult } from './BaseMetric';

export default createMetric({
  id: 'bottlenecks',
  name: 'Flow Bottlenecks',
  icon: AlertTriangle,
  description: 'Transfers using >90% of maximum flow capacity',
  order: 50,
  
  calculate: (pathData) => {
    const bottlenecks = pathData.transfers
      .map(t => ({
        ...t,
        flowCRC: Number(t.value) / 1e18,
        percentage: (Number(t.value) / Number(pathData.maxFlow)) * 100
      }))
      .filter(t => t.percentage > 90)
      .sort((a, b) => b.percentage - a.percentage);
    
    return createMetricResult({
      value: bottlenecks.length,
      description: 'Transfers using >90% of maximum flow capacity',
      details: bottlenecks,
    });
  },
  
  visualize: (pathData, value, details) => {
    if (!details || details.length === 0) return null;
    
    const chartData = details.slice(0, 5).map((b, i) => ({
      name: `${b.from.slice(0, 6)}...→${b.to.slice(0, 6)}...`,
      percentage: b.percentage.toFixed(1),
      flow: b.flowCRC.toFixed(2)
    }));

    return (
      <div className="mt-4">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
            <YAxis />
            <Tooltip 
              formatter={(value, name) => {
                if (name === 'percentage') return `${value}%`;
                return `${value} CRC`;
              }}
            />
            <Bar dataKey="percentage" fill="#ef4444" name="Usage %" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  },
});