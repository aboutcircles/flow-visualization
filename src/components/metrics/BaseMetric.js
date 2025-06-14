import React from 'react';

/**
 * Base structure for all metrics
 * Each metric should export an object with these properties
 */
export const createMetric = ({
  id,
  name,
  icon,
  description,
  calculate,
  visualize = null,
  order = 100, // Order in which metrics appear (lower = first)
  enabled = true, // Whether the metric is enabled by default
  requiresProfiles = false, // Whether this metric needs profile data
  requiresBalances = false, // Whether this metric needs balance data
}) => ({
  id,
  name,
  icon,
  description,
  calculate,
  visualize,
  order,
  enabled,
  requiresProfiles,
  requiresBalances,
});

/**
 * Base calculation result structure
 */
export const createMetricResult = ({
  value,
  description,
  details = null,
  visualization = null,
}) => ({
  value,
  description,
  details,
  visualization,
});