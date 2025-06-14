import React from 'react';
import { Hash } from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  ResponsiveContainer,
  Legend 
} from 'recharts';
import { createMetric, createMetricResult } from './BaseMetric';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

export default createMetric({
  id: 'tokenDistribution',
  name: 'Token Usage Distribution',
  icon: Hash,
  description: 'Distribution of transfers across different tokens',
  order: 60,
  
  calculate: (pathData) => {
    const tokenUsage = {};
    
    pathData.transfers.forEach(t => {
      const token = t.tokenOwner.toLowerCase();
      if (!tokenUsage[token]) {
        tokenUsage[token] = {
          count: 0,
          totalFlow: 0
        };
      }
      tokenUsage[token].count++;
      tokenUsage[token].totalFlow += Number(t.value) / 1e18;
    });

    const distribution = Object.entries(tokenUsage)
      .map(([token, usage]) => ({
        token,
        count: usage.count,
        totalFlow: usage.totalFlow,
        percentage: (usage.count / pathData.transfers.length) * 100
      }))
      .sort((a, b) => b.count - a.count);

    return createMetricResult({
      value: distribution.length,
      description: 'Distribution of transfers across different tokens',
      details: distribution,
    });
  },
  
  visualize: (pathData, value, details) => {
    if (!details || details.length === 0) return null;
    
    const chartData = details.slice(0, 6).map((d, i) => ({
      name: `${d.token.slice(0, 6)}...${d.token.slice(-4)}`,
      value: d.count,
      percentage: d.percentage.toFixed(1)
    }));

    return (
      <div className="mt-4">
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ percentage }) => `${percentage}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  },
});