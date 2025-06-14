// src/components/metrics/WrappedTokenMetric.jsx
import { Package } from 'lucide-react';
import { createMetric, createMetricResult } from './BaseMetric';

export default createMetric({
  id: 'wrappedTokens',
  name: 'Wrapped Token Usage',
  icon: Package,
  description: 'Analysis of wrapped token usage in the path',
  order: 35,
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
      details: {
        wrappedCount,
        nonWrappedCount,
        wrappedVolume: wrappedVolume.toFixed(2),
        nonWrappedVolume: nonWrappedVolume.toFixed(2),
        volumePercentage
      },
    });
  },
  
  // Custom visualization
  visualize: (pathData, value, details) => {
    if (!details) return null;
    
    return (
      <div className="mt-3 p-3 bg-gray-50 rounded-lg">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Wrapped transfers:</span>
            <p className="font-medium">{details.wrappedCount}</p>
          </div>
          <div>
            <span className="text-gray-600">Regular transfers:</span>
            <p className="font-medium">{details.nonWrappedCount}</p>
          </div>
          <div>
            <span className="text-gray-600">Wrapped volume:</span>
            <p className="font-medium">{details.wrappedVolume} CRC</p>
          </div>
          <div>
            <span className="text-gray-600">Volume percentage:</span>
            <p className="font-medium">{details.volumePercentage}%</p>
          </div>
        </div>
      </div>
    );
  },
});