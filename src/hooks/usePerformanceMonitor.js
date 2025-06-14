import { useEffect, useRef, useCallback } from 'react';

export const usePerformanceMonitor = (enabled = true) => {
  const metricsRef = useRef({
    renderStart: 0,
    renderEnd: 0,
    frameCount: 0,
    lastFrameTime: 0,
    fps: 0,
    renderTimes: [],
    averageRenderTime: 0
  });

  const startRender = useCallback(() => {
    if (!enabled) return;
    metricsRef.current.renderStart = performance.now();
  }, [enabled]);

  const endRender = useCallback(() => {
    if (!enabled) return;
    const renderTime = performance.now() - metricsRef.current.renderStart;
    metricsRef.current.renderTimes.push(renderTime);
    
    // Keep only last 100 render times
    if (metricsRef.current.renderTimes.length > 100) {
      metricsRef.current.renderTimes.shift();
    }
    
    // Calculate average
    const sum = metricsRef.current.renderTimes.reduce((a, b) => a + b, 0);
    metricsRef.current.averageRenderTime = sum / metricsRef.current.renderTimes.length;
    
    return renderTime;
  }, [enabled]);

  // FPS calculation
  useEffect(() => {
    if (!enabled) return;
    
    let frameCount = 0;
    let lastTime = performance.now();
    let animationId;
    
    const calculateFPS = () => {
      frameCount++;
      const currentTime = performance.now();
      
      if (currentTime >= lastTime + 1000) {
        metricsRef.current.fps = Math.round((frameCount * 1000) / (currentTime - lastTime));
        frameCount = 0;
        lastTime = currentTime;
      }
      
      animationId = requestAnimationFrame(calculateFPS);
    };
    
    animationId = requestAnimationFrame(calculateFPS);
    
    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [enabled]);

  const getMetrics = useCallback(() => {
    return {
      fps: metricsRef.current.fps,
      averageRenderTime: metricsRef.current.averageRenderTime,
      lastRenderTime: metricsRef.current.renderTimes[metricsRef.current.renderTimes.length - 1] || 0
    };
  }, []);

  return {
    startRender,
    endRender,
    getMetrics
  };
};