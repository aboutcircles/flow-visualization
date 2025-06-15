import React from 'react';
import { Card } from '@/components/ui/card';
import { calculateAllMetrics } from '@/components/metrics';

const PathStats = ({ pathData, tokenInfo, nodeProfiles }) => {
  if (!pathData) {
    return (
      <div className="text-center text-gray-500 py-8">
        No path data available. Run a path search to see statistics.
      </div>
    );
  }

  const metrics = calculateAllMetrics(pathData, tokenInfo, nodeProfiles);
  
  // Debug: Log what we're getting
  console.log('Calculated metrics:', metrics);
  metrics.forEach(m => {
    if (m.visualization) {
      console.log(`${m.name} has visualization:`, m.visualization);
    }
  });
  
  // Group metrics by layout type (defaulting to 'full' if not specified)
  const fullWidthMetrics = metrics.filter(m => !m.layout || m.layout === 'full');
  const halfWidthMetrics = metrics.filter(m => m.layout === 'half');
  
  // Pair half-width metrics for row display
  const halfWidthPairs = [];
  for (let i = 0; i < halfWidthMetrics.length; i += 2) {
    halfWidthPairs.push({
      left: halfWidthMetrics[i],
      right: halfWidthMetrics[i + 1] || null
    });
  }

  return (
    <div className="space-y-4">     
      {/* Render half-width metrics in pairs */}
      {halfWidthPairs.map((pair, index) => (
        <div key={`pair-${index}`} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetricCard metric={pair.left} />
          {pair.right && <MetricCard metric={pair.right} />}
        </div>
      ))}
      
      {/* Render full-width metrics */}
      {fullWidthMetrics.map(metric => (
        <MetricCard key={metric.id} metric={metric} className="w-full" />
      ))}
    </div>
  );
};

const MetricCard = ({ metric, className = '' }) => {
  const Icon = metric.icon;
  
  // Debug log
  console.log(`Rendering ${metric.name}:`, {
    hasVisualization: !!metric.visualization,
    value: metric.value,
    details: metric.details
  });
  
  // Handle different value types
  const renderValue = (value) => {
    if (typeof value === 'object' && value !== null) {
      // For FlowDistribution metric which returns an object with stats
      if (value.min !== undefined && value.median !== undefined) {
        return `${value.median} CRC (median)`;
      }
      return JSON.stringify(value);
    }
    return value;
  };
  
  return (
    <Card className={`p-4 ${className}`}>
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <Icon className="h-5 w-5 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-gray-900">{metric.name}</h3>
          <p className="text-2xl font-semibold mt-1">
            {renderValue(metric.value)}
          </p>
          <p className="text-sm text-gray-500 mt-1">{metric.description}</p>
          {metric.details && typeof metric.details === 'string' && (
            <p className="text-xs text-gray-400 mt-2">{metric.details}</p>
          )}
          {metric.visualization && (
            <div className="mt-4">
              {metric.visualization}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default PathStats;