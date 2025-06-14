// Graph optimization utilities

export const GraphOptimizer = {
  // Determine if we should use simple rendering based on graph size
  shouldUseSimpleRendering: (edgeCount) => {
    return edgeCount > 500;
  },

  // Determine if we should show labels based on zoom level
  shouldShowLabels: (zoom) => {
    return zoom > 0.5;
  },

  // Determine if we should use curves based on edge count
  shouldUseCurves: (edgeCount, zoom) => {
    if (edgeCount > 1000) return false;
    if (edgeCount > 500 && zoom < 0.7) return false;
    return true;
  },

  // Get optimized style based on graph size and zoom
  getOptimizedEdgeStyle: (edgeCount, zoom, baseStyle) => {
    const simple = GraphOptimizer.shouldUseSimpleRendering(edgeCount);
    const showLabels = GraphOptimizer.shouldShowLabels(zoom);
    const useCurves = GraphOptimizer.shouldUseCurves(edgeCount, zoom);

    const optimizedStyle = { ...baseStyle };

    if (!useCurves) {
      optimizedStyle['curve-style'] = 'straight';
    }

    if (!showLabels) {
      optimizedStyle['label'] = '';
    }

    if (simple) {
      // Remove complex styling for performance
      delete optimizedStyle['line-gradient-stop-colors'];
      delete optimizedStyle['line-gradient-stop-positions'];
      delete optimizedStyle['text-outline-color'];
      delete optimizedStyle['text-outline-width'];
      optimizedStyle['line-style'] = 'solid';
    }

    return optimizedStyle;
  },

  // Viewport culling - check if element is in viewport
  isInViewport: (boundingBox, viewport, buffer = 100) => {
    return !(
      boundingBox.x2 < viewport.x1 - buffer ||
      boundingBox.x1 > viewport.x2 + buffer ||
      boundingBox.y2 < viewport.y1 - buffer ||
      boundingBox.y1 > viewport.y2 + buffer
    );
  },

  // Progressive rendering - render in chunks
  renderProgressively: async (elements, batchSize = 50, callback) => {
    const chunks = [];
    for (let i = 0; i < elements.length; i += batchSize) {
      chunks.push(elements.slice(i, i + batchSize));
    }

    for (const chunk of chunks) {
      await new Promise(resolve => {
        requestAnimationFrame(() => {
          callback(chunk);
          resolve();
        });
      });
    }
  }
};