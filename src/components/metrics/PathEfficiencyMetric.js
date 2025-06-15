import { Network } from 'lucide-react';
import { createMetric, createMetricResult } from './BaseMetric';

export default createMetric({
  id: 'pathEfficiency',
  name: 'Path Efficiency',
  icon: Network,
  description: 'Direct flow efficiency (direct transfers / total flow exiting source)',
  order: 20,
  layout: 'half',
  
  calculate: (pathData) => {
    // 1. Reliable Source & Sink Detection
    const fromSet = new Set();
    const toSet = new Set();
    
    pathData.transfers.forEach(t => {
      fromSet.add(t.from.toLowerCase());
      toSet.add(t.to.toLowerCase());
    });
    
    const onlySourceAddresses = [...fromSet].filter(addr => !toSet.has(addr));
    const onlySinkAddresses = [...toSet].filter(addr => !fromSet.has(addr));

    let sourceAddress, sinkAddress;

    if (onlySourceAddresses.length === 0 && onlySinkAddresses.length === 0) {
      sourceAddress = pathData.transfers[0]?.from.toLowerCase();
      sinkAddress = sourceAddress; 
    } else {
      sourceAddress = onlySourceAddresses[0] || pathData.transfers[0]?.from.toLowerCase();
      sinkAddress = onlySinkAddresses[0] || pathData.transfers[pathData.transfers.length - 1]?.to.toLowerCase();
    }

    // 2. Handle the circular flow case (source === sink)
    if (sourceAddress && sourceAddress === sinkAddress) {
      // Calculate the total flow exiting the source node.
      let totalFlowExitingSource = 0n;
      for (const transfer of pathData.transfers) {
        if (transfer.from.toLowerCase() === sourceAddress) {
          totalFlowExitingSource += BigInt(transfer.value);
        }
      }
      const totalFlowCRC = Number(totalFlowExitingSource) / 1e18;

      return createMetricResult({
        value: 'N/A',
        description: 'Efficiency is not applicable for circular flows.',
        details: `Total flow exiting source: ${totalFlowCRC.toFixed(2)} CRC`,
      });
    }

    // 3. Logic for the standard case (source !== sink) with corrected totalFlow
    let directFlow = 0n;
    let totalFlowExitingSource = 0n;
    
    pathData.transfers.forEach(transfer => {
      // We only care about transfers originating from the source
      if (transfer.from.toLowerCase() === sourceAddress) {
        // Add its value to the total flow exiting the source
        totalFlowExitingSource += BigInt(transfer.value);
        
        // If this transfer also goes directly to the sink, count it as direct flow
        if (transfer.to.toLowerCase() === sinkAddress) {
          directFlow += BigInt(transfer.value);
        }
      }
    });
    
    // Calculate efficiency percentage based on the corrected total flow
    const efficiency = totalFlowExitingSource > 0n 
      ? (Number(directFlow) / Number(totalFlowExitingSource)) * 100 
      : 0;
    
    // Convert to CRC for display
    const directFlowCRC = Number(directFlow) / 1e18;
    const totalFlowExitingSourceCRC = Number(totalFlowExitingSource) / 1e18;
    
    return createMetricResult({
      value: `${efficiency.toFixed(1)}%`,
      description: 'Percentage of flow that goes directly from source to sink',
      details: `Direct: ${directFlowCRC.toFixed(2)} CRC / Exiting Source: ${totalFlowExitingSourceCRC.toFixed(2)} CRC`,
    });
  },
});