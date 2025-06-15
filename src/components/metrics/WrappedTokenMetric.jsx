// src/components/metrics/WrappedTokenMetric.jsx
import React from 'react';
import { Package } from 'lucide-react';
import { createMetric, createMetricResult } from './BaseMetric';

export default createMetric({
  id: 'wrappedTokens',
  name: 'Wrapped Token Usage',
  icon: Package,
  description: 'Analysis of wrapped token usage in the path',
  order: 30,
  layout: 'full',
  enabled: true,
  
  calculate: (pathData, tokenInfo) => {
    // Count wrapped vs non-wrapped transfers
    let wrappedCount = 0;
    let nonWrappedCount = 0;
    let wrappedVolume = 0;
    let nonWrappedVolume = 0;
    
    pathData.transfers.forEach(transfer => {
      const tokenOwner = transfer.tokenOwner.toLowerCase();
      const tokenData = tokenInfo[tokenOwner];
      
      // Check for wrapped token
      const isWrapped = tokenData?.isWrapped || 
                       tokenData?.type?.includes('ERC20Wrapper') || 
                       false;
      
      const volume = Number(transfer.value) / 1e18;
      
      if (isWrapped) {
        wrappedCount++;
        wrappedVolume += volume;
      } else {
        nonWrappedCount++;
        nonWrappedVolume += volume;
      }
    });
    
    const totalCount = wrappedCount + nonWrappedCount;
    const wrappedPercentage = totalCount > 0 ? (wrappedCount / totalCount * 100).toFixed(1) : 0;
    const volumePercentage = (wrappedVolume + nonWrappedVolume) > 0 
      ? (wrappedVolume / (wrappedVolume + nonWrappedVolume) * 100).toFixed(1) 
      : 0;
    
    return createMetricResult({
      value: `${wrappedCount} / ${totalCount}`,
      description: `${wrappedPercentage}% of transfers use wrapped tokens`,
      details: `Volume: ${volumePercentage}% through wrapped tokens`,
      // Store data for visualization
      wrappedData: {
        wrappedCount,
        nonWrappedCount,
        wrappedVolume: wrappedVolume.toFixed(2),
        nonWrappedVolume: nonWrappedVolume.toFixed(2),
        volumePercentage
      }
    });
  },
  
  // Custom visualization - recalculate if needed
  visualize: (pathData, value, details) => {
    // Parse the value to get counts
    const [wrappedStr, totalStr] = value.split(' / ');
    const wrappedCount = parseInt(wrappedStr);
    const totalCount = parseInt(totalStr);
    const nonWrappedCount = totalCount - wrappedCount;
    
    // Parse volume percentage from details
    const volumeMatch = details.match(/Volume: ([\d.]+)%/);
    const volumePercentage = volumeMatch ? volumeMatch[1] : '0';
    
    return (
      <div className="mt-3 p-3 bg-gray-50 rounded-lg">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600 block text-xs">Wrapped transfers</span>
            <p className="font-medium">{wrappedCount}</p>
          </div>
          <div>
            <span className="text-gray-600 block text-xs">Regular transfers</span>
            <p className="font-medium">{nonWrappedCount}</p>
          </div>
          <div className="col-span-2">
            <span className="text-gray-600 block text-xs">Volume through wrapped tokens</span>
            <p className="font-medium">{volumePercentage}%</p>
          </div>
        </div>
      </div>
    );
  },
});