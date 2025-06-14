import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { calculateAllMetrics } from '@/components/metrics';

const PathStats = ({ pathData, tokenOwnerProfiles, nodeProfiles, tokenInfo }) => {
  // Calculate all metrics using the modular system
  const calculatedMetrics = useMemo(() => {
    if (!pathData) return [];
    // Pass tokenInfo for wrapped token detection
    return calculateAllMetrics(pathData, tokenInfo, nodeProfiles);
  }, [pathData, tokenInfo, nodeProfiles]);

  if (!pathData) return null;

  return (
    <div className="p-4 space-y-4">
      {/* Basic Path Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600">Maximum Flow</span>
              <span className="text-sm font-semibold">
                {(Number(pathData.maxFlow) / 1e18).toFixed(6)} CRC
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600">From</span>
              <span className="text-xs font-mono">{pathData.transfers[0]?.from}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm font-medium text-gray-600">To</span>
              <span className="text-xs font-mono">
                {pathData.transfers[pathData.transfers.length - 1]?.to}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Render all calculated metrics */}
      {calculatedMetrics.map((metric) => {
        const Icon = metric.icon;
        
        return (
          <Card key={metric.id}>
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Icon className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{metric.name}</h4>
                  <div className="mt-1 text-lg font-semibold text-gray-900">
                    {typeof metric.value === 'object' ? (
                      <div className="text-base">
                        {Object.entries(metric.value).map(([key, val]) => (
                          <div key={key} className="flex justify-between">
                            <span className="text-gray-600 capitalize">{key}:</span>
                            <span>{val}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      metric.value
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{metric.description}</p>
                  {metric.details && typeof metric.details === 'string' && (
                    <p className="mt-1 text-xs text-gray-500">{metric.details}</p>
                  )}
                  
                  {/* Render visualization if metric provides one */}
                  {metric.visualization && (
                    <div className="mt-2">
                      {metric.visualization}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default PathStats;