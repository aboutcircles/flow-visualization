import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { defaultPerformanceConfig, performancePresets } from '@/config/performanceConfig';

const PerformanceContext = createContext();

export const usePerformance = () => {
  const context = useContext(PerformanceContext);
  if (!context) {
    throw new Error('usePerformance must be used within a PerformanceProvider');
  }
  return context;
};

export const PerformanceProvider = ({ children }) => {
  const [config, setConfig] = useState(() => {
    // Load saved config from localStorage if available
    const saved = localStorage.getItem('circlesPerformanceConfig');
    return saved ? JSON.parse(saved) : defaultPerformanceConfig;
  });

  const [performanceStats, setPerformanceStats] = useState({
    fps: 60,
    renderTime: 0,
    nodeCount: 0,
    edgeCount: 0,
    memoryUsage: 0
  });

  // Save config to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('circlesPerformanceConfig', JSON.stringify(config));
  }, [config]);

  const updateConfig = useCallback((updates) => {
    setConfig(prev => ({
      ...prev,
      ...updates,
      rendering: {
        ...prev.rendering,
        ...(updates.rendering || {}),
        features: {
          ...prev.rendering.features,
          ...(updates.rendering?.features || {})
        }
      },
      data: {
        ...prev.data,
        ...(updates.data || {})
      }
    }));
  }, []);

  const setPreset = useCallback((presetName) => {
    const preset = performancePresets[presetName];
    if (preset) {
      setConfig({
        ...defaultPerformanceConfig,
        ...preset,
        rendering: {
          ...defaultPerformanceConfig.rendering,
          ...preset.rendering,
          features: {
            ...defaultPerformanceConfig.rendering.features,
            ...preset.rendering.features
          }
        },
        data: {
          ...defaultPerformanceConfig.data,
          ...preset.data
        }
      });
    }
  }, []);

  const toggleFeature = useCallback((featureName) => {
    setConfig(prev => ({
      ...prev,
      rendering: {
        ...prev.rendering,
        features: {
          ...prev.rendering.features,
          [featureName]: !prev.rendering.features[featureName]
        }
      }
    }));
  }, []);

  const updateStats = useCallback((stats) => {
    setPerformanceStats(prev => {
      // Only update if values actually changed
      const hasChanges = Object.keys(stats).some(key => prev[key] !== stats[key]);
      return hasChanges ? { ...prev, ...stats } : prev;
    });
  }, []);

  const shouldAutoSimplify = useCallback(() => {
    return (
      performanceStats.nodeCount > config.thresholds.autoSimplifyNodeCount ||
      performanceStats.edgeCount > config.thresholds.autoSimplifyEdgeCount
    );
  }, [performanceStats.nodeCount, performanceStats.edgeCount, config.thresholds]);

  // Memoize the context value to prevent unnecessary renders
  const value = useMemo(() => ({
    config,
    updateConfig,
    setPreset,
    toggleFeature,
    performanceStats,
    updateStats,
    shouldAutoSimplify
  }), [config, updateConfig, setPreset, toggleFeature, performanceStats, updateStats, shouldAutoSimplify]);

  return (
    <PerformanceContext.Provider value={value}>
      {children}
    </PerformanceContext.Provider>
  );
};