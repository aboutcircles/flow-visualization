import React, { useState, useEffect } from 'react';
import { usePerformanceMonitor } from '@/hooks/usePerformanceMonitor';

const PerformanceOverlay = ({ enabled = true, edgeCount = 0, nodeCount = 0 }) => {
  const { getMetrics } = usePerformanceMonitor(enabled);
  const [metrics, setMetrics] = useState({ fps: 0, averageRenderTime: 0 });

  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      setMetrics(getMetrics());
    }, 1000);

    return () => clearInterval(interval);
  }, [enabled, getMetrics]);

  if (!enabled) return null;

  return (
    <div className="absolute top-4 right-4 bg-black/75 text-white p-3 rounded-lg text-xs font-mono z-50">
      <div>FPS: {metrics.fps}</div>
      <div>Avg Render: {metrics.averageRenderTime.toFixed(2)}ms</div>
      <div>Edges: {edgeCount}</div>
      <div>Nodes: {nodeCount}</div>
    </div>
  );
};

export default PerformanceOverlay;