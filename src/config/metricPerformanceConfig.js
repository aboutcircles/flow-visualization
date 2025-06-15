// Performance thresholds for metrics
export const METRIC_PERFORMANCE_THRESHOLDS = {
  // Graph size thresholds
  SMALL_GRAPH: 50,      // transfers
  MEDIUM_GRAPH: 100,    // transfers
  LARGE_GRAPH: 500,     // transfers
  VERY_LARGE_GRAPH: 2000, // transfers - increased to allow computation for graphs up to 2000
  
  // Path analysis limits
  MAX_PATHS_TO_ANALYZE: 1000,
  MAX_PATH_LENGTH: 20,
  MAX_PATHS_TO_DISPLAY: 10,
  
  // Timeout for expensive calculations (ms)
  CALCULATION_TIMEOUT: 10000, // Increased to 10 seconds
};

// Metric performance categories
export const METRIC_CATEGORIES = {
  CHEAP: [
    'transferCount',
    'intermediateNodes', 
    'distinctTokens',
    'pathEfficiency',
    'wrappedTokens'
  ],
  EXPENSIVE: [
    'distinctPaths'
  ]
};

// Helper to check if metric should be calculated
export const shouldCalculateMetric = (metricId, transferCount) => {
  if (METRIC_CATEGORIES.CHEAP.includes(metricId)) {
    return true;
  }
  
  if (METRIC_CATEGORIES.EXPENSIVE.includes(metricId)) {
    return transferCount < METRIC_PERFORMANCE_THRESHOLDS.LARGE_GRAPH;
  }
  
  return true;
};

// Helper to get performance warning message
export const getPerformanceWarning = (transferCount) => {
  if (transferCount > METRIC_PERFORMANCE_THRESHOLDS.VERY_LARGE_GRAPH) {
    return {
      level: 'error',
      message: `This graph has ${transferCount} transfers and exceeds the limit of ${METRIC_PERFORMANCE_THRESHOLDS.VERY_LARGE_GRAPH}. Advanced metrics cannot be calculated.`,
      canCalculate: false
    };
  }
  
  if (transferCount > METRIC_PERFORMANCE_THRESHOLDS.LARGE_GRAPH) {
    return {
      level: 'warning', 
      message: `This graph has ${transferCount} transfers. Advanced metrics may take several seconds to calculate.`,
      canCalculate: true
    };
  }
  
  if (transferCount > METRIC_PERFORMANCE_THRESHOLDS.MEDIUM_GRAPH) {
    return {
      level: 'info',
      message: `Large graph detected (${transferCount} transfers). Some calculations may be slower.`,
      canCalculate: true
    };
  }
  
  return null;
};