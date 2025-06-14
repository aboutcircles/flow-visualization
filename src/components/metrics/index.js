// src/components/metrics/index.js
import TransferCountMetric from './TransferCountMetric';
import IntermediateNodesMetric from './IntermediateNodesMetric';
import DistinctTokensMetric from './DistinctTokensMetric';
import FlowDistributionMetric from './FlowDistributionMetric.jsx';
import BottlenecksMetric from './BottlenecksMetric.jsx';
import TokenDistributionMetric from './TokenDistributionMetric.jsx';
import PathEfficiencyMetric from './PathEfficiencyMetric';
import AverageNodeDegreeMetric from './AverageNodeDegreeMetric';
import WrappedTokenMetric from './WrappedTokenMetric.jsx';

// Import all metrics here
const allMetrics = [
  TransferCountMetric,
  IntermediateNodesMetric,
  DistinctTokensMetric,
  FlowDistributionMetric,
  BottlenecksMetric,
  TokenDistributionMetric,
  PathEfficiencyMetric,
  AverageNodeDegreeMetric,
  WrappedTokenMetric
];

// Sort metrics by order
const sortedMetrics = allMetrics.sort((a, b) => a.order - b.order);

// Export as both array and object for different use cases
export const metrics = sortedMetrics;

export const metricsById = sortedMetrics.reduce((acc, metric) => {
  acc[metric.id] = metric;
  return acc;
}, {});

// Helper to get enabled metrics
export const getEnabledMetrics = () => {
  return sortedMetrics.filter(metric => metric.enabled !== false);
};

// Helper to calculate all metrics
export const calculateAllMetrics = (pathData, tokenInfo, nodeProfiles) => {
  const enabledMetrics = getEnabledMetrics();
  
  return enabledMetrics.map(metric => {
    try {
      const result = metric.calculate(pathData, tokenInfo, nodeProfiles);
      
      // If metric has a visualize function, generate the visualization
      let visualization = null;
      if (metric.visualize && result.value !== null) {
        visualization = metric.visualize(pathData, result.value, result.details);
      }
      
      return {
        ...metric,
        ...result,
        visualization
      };
    } catch (error) {
      console.error(`Error calculating metric ${metric.id}:`, error);
      return {
        ...metric,
        value: 'Error',
        description: metric.description,
        error: error.message,
      };
    }
  });
};