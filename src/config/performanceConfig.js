// Default performance configuration
export const defaultPerformanceConfig = {
  rendering: {
    fastMode: true,
    features: {
      edgeLabels: false,
      nodeLabels: true, // Keep this true by default
      edgeGradients: false,
      curvedEdges: false,
      tooltips: false,
      animations: false,
      wrappedTokenDashing: false,
      overCapacityHighlight: false,
      edgeWidthScaling: false
    }
  },
  data: {
    lazyLoadProfiles: true,
    lazyLoadBalances: true,
    batchSize: 50,
    cacheEnabled: true
  },
  thresholds: {
    largeGraphNodeCount: 100,
    largeGraphEdgeCount: 200,
    veryLargeGraphEdgeCount: 500,
    autoSimplifyNodeCount: 300,
    autoSimplifyEdgeCount: 500
  }
};

// Performance presets - update low preset to keep node labels
export const performancePresets = {
  ultra: {
    rendering: {
      fastMode: false,
      features: {
        edgeLabels: true,
        nodeLabels: true,
        edgeGradients: true,
        curvedEdges: true,
        tooltips: true,
        animations: true,
        wrappedTokenDashing: true,
        overCapacityHighlight: true,
        edgeWidthScaling: true
      }
    },
    data: {
      lazyLoadProfiles: false,
      lazyLoadBalances: false,
      batchSize: 100,
      cacheEnabled: true
    }
  },
  high: {
    rendering: {
      fastMode: false,
      features: {
        edgeLabels: true,
        nodeLabels: true,
        edgeGradients: true,
        curvedEdges: false,
        tooltips: true,
        animations: false,
        wrappedTokenDashing: true,
        overCapacityHighlight: true,
        edgeWidthScaling: true
      }
    },
    data: {
      lazyLoadProfiles: true,
      lazyLoadBalances: false,
      batchSize: 50,
      cacheEnabled: true
    }
  },
  medium: {
    rendering: {
      fastMode: false,
      features: {
        edgeLabels: false,
        nodeLabels: true,
        edgeGradients: false,
        curvedEdges: false,
        tooltips: true,
        animations: false,
        wrappedTokenDashing: false,
        overCapacityHighlight: false,
        edgeWidthScaling: false
      }
    },
    data: {
      lazyLoadProfiles: true,
      lazyLoadBalances: true,
      batchSize: 50,
      cacheEnabled: true
    }
  },
  low: {
    rendering: {
      fastMode: true,
      features: {
        edgeLabels: false,
        nodeLabels: true, // Keep labels in fast mode too
        edgeGradients: false,
        curvedEdges: false,
        tooltips: false,
        animations: false,
        wrappedTokenDashing: false,
        overCapacityHighlight: false,
        edgeWidthScaling: false
      }
    },
    data: {
      lazyLoadProfiles: true,
      lazyLoadBalances: true,
      batchSize: 25,
      cacheEnabled: true
    }
  }
};