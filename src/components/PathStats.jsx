import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { User, Hash } from 'lucide-react';
import { calculateAllMetrics } from '@/components/metrics';

const shortAddr = (addr) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

const RouteSelector = ({ routes, selectedRouteIds, onToggleRoute, onToggleAllRoutes, maxFlow, nodeProfiles }) => {
  const [showNames, setShowNames] = useState(true);
  const sorted = [...routes].sort((a, b) => b.flowNum - a.flowNum);
  const allSelected = selectedRouteIds.size === routes.length && routes.length > 0;
  const someSelected = selectedRouteIds.size > 0 && selectedRouteIds.size < routes.length;

  const displayAddr = (addr) => {
    if (!showNames || !nodeProfiles) return shortAddr(addr);
    const profile = nodeProfiles[addr.toLowerCase()];
    if (!profile?.name) return shortAddr(addr);
    const name = profile.name;
    return name.length > 16 ? name.slice(0, 15) + '…' : name;
  };

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-900">
          Route Selection
          <span className="ml-2 text-xs text-gray-500 font-normal">
            {selectedRouteIds.size}/{routes.length} selected
          </span>
        </h3>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowNames(v => !v)}
            className="p-1 rounded hover:bg-gray-200 transition-colors"
            title={showNames ? 'Show addresses' : 'Show names'}
          >
            {showNames ? <Hash size={14} className="text-gray-400" /> : <User size={14} className="text-gray-400" />}
          </button>
          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = someSelected; }}
              onChange={onToggleAllRoutes}
              className="rounded border-gray-300"
            />
            All
          </label>
        </div>
      </div>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {sorted.map((route) => {
          const isSelected = selectedRouteIds.has(route.id);
          const path = route.edges.map(e => displayAddr(e.from));
          path.push(displayAddr(route.edges[route.edges.length - 1].to));
          const pct = ((Number(route.flow) / Number(maxFlow)) * 100).toFixed(1);

          return (
            <label
              key={route.id}
              className={`
                flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-50 transition-colors
                ${!isSelected ? 'opacity-40' : ''}
              `}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleRoute(route.id)}
                className="rounded border-gray-300 flex-shrink-0"
              />
              <span className={`text-xs text-gray-600 truncate flex-1 ${showNames ? '' : 'font-mono'}`}>
                {path.join(' → ')}
              </span>
              <span className="text-xs font-medium text-gray-700 flex-shrink-0 w-24 text-right">
                {route.flowNum.toFixed(3)} CRC
              </span>
              <span className="text-xs text-gray-400 flex-shrink-0 w-14 text-right">
                {pct}%
              </span>
            </label>
          );
        })}
      </div>
    </Card>
  );
};

const PathStats = ({ pathData, tokenInfo, nodeProfiles, routes, selectedRouteIds, onToggleRoute, onToggleAllRoutes, maxFlow }) => {
  if (!pathData) {
    return (
      <div className="text-center text-gray-500 py-8">
        No path data available. Run a path search to see statistics.
      </div>
    );
  }

  const metrics = calculateAllMetrics(pathData, tokenInfo, nodeProfiles);

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
      {/* Route selection — drives flow matrix */}
      {routes && routes.length > 0 && (
        <RouteSelector
          routes={routes}
          selectedRouteIds={selectedRouteIds}
          onToggleRoute={onToggleRoute}
          onToggleAllRoutes={onToggleAllRoutes}
          maxFlow={maxFlow}
          nodeProfiles={nodeProfiles}
        />
      )}

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
