import { Network } from 'lucide-react';
import { createMetric, createMetricResult } from './BaseMetric';

export default createMetric({
  id: 'pathEfficiency',
  name: 'Path Efficiency',
  icon: Network,
  description: 'Direct flow efficiency (direct transfers / total flow)',
  order: 20,
  layout: 'half',
  
  calculate: (pathData) => {
    // Find the actual source and sink addresses
    const fromSet = new Set();
    const toSet = new Set();
    
    pathData.transfers.forEach(t => {
      fromSet.add(t.from.toLowerCase());
      toSet.add(t.to.toLowerCase());
    });
    
    // Source: appears in 'from' but not in 'to'
    // Sink: appears in 'to' but not in 'from'
    const sourceAddress = [...fromSet].find(addr => !toSet.has(addr)) || 
                         pathData.transfers[0]?.from.toLowerCase();
    const sinkAddress = [...toSet].find(addr => !fromSet.has(addr)) || 
                       pathData.transfers[pathData.transfers.length - 1]?.to.toLowerCase();
    
    // Calculate direct flow (transfers that go directly from source to sink)
    let directFlow = 0n; // Use BigInt for precision
    let totalFlow = 0n;
    
    pathData.transfers.forEach(transfer => {
      const flowAmount = BigInt(transfer.value);
      totalFlow += flowAmount;
      
      // Check if this transfer goes directly from source to sink
      if (transfer.from.toLowerCase() === sourceAddress && 
          transfer.to.toLowerCase() === sinkAddress) {
        directFlow += flowAmount;
      }
    });
    
    // Calculate efficiency percentage
    const efficiency = totalFlow > 0n 
      ? (Number(directFlow) / Number(totalFlow)) * 100 
      : 0;
    
    // Convert to CRC for display
    const directFlowCRC = Number(directFlow) / 1e18;
    const totalFlowCRC = Number(totalFlow) / 1e18;
    
    return createMetricResult({
      value: `${efficiency.toFixed(1)}%`,
      description: 'Percentage of flow that goes directly from source to sink',
      details: `Direct: ${directFlowCRC.toFixed(2)} CRC / Total: ${totalFlowCRC.toFixed(2)} CRC`,
    });
  },
});