import TransferCountMetric from './TransferCountMetric';
import IntermediateNodesMetric from './IntermediateNodesMetric';
import DistinctTokensMetric from './DistinctTokensMetric';
import DistinctPathsMetric from './DistinctPathsMetric.jsx';
import PathEfficiencyMetric from './PathEfficiencyMetric';
import WrappedTokenMetric from './WrappedTokenMetric.jsx';

// Import all metrics here
const allMetrics = [
  TransferCountMetric,
  IntermediateNodesMetric,
  DistinctTokensMetric,
  DistinctPathsMetric,
  PathEfficiencyMetric,
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
      // Add timeout protection for each metric
      const startTime = Date.now();
      const result = metric.calculate(pathData, tokenInfo, nodeProfiles);
      const calcTime = Date.now() - startTime;
      
      // Log slow calculations
      if (calcTime > 1000) {
        console.warn(`Metric ${metric.id} took ${calcTime}ms to calculate`);
      }
      
      // Create the full metric result object
      const fullResult = {
        ...metric,
        ...result
      };
      
      // If metric has a visualize function, generate the visualization
      if (metric.visualize && result.value !== null && result.value !== 'Error' && result.value !== 'Too Large') {
        try {
          // Wrap visualization in try-catch
          let visualization = null;
          
          // Check if the visualize function expects 4 parameters
          if (metric.visualize.length >= 4) {
            visualization = metric.visualize(pathData, result.value, result.details, result);
          } else {
            // Fall back to 3 parameter version
            visualization = metric.visualize(pathData, result.value, result.details);
          }
          
          fullResult.visualization = visualization;
        } catch (vizError) {
          console.error(`Error creating visualization for ${metric.id}:`, vizError);
          fullResult.visualization = null;
        }
      }
      
      return fullResult;
    } catch (error) {
      console.error(`Error calculating metric ${metric.id}:`, error);
      return {
        ...metric,
        value: 'Error',
        description: metric.description,
        error: error.message,
        visualization: null
      };
    }
  });
};