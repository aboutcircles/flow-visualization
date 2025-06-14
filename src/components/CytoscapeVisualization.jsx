import React, { useRef, useState, useEffect, forwardRef, useImperativeHandle, memo } from 'react';
import { useCytoscape } from '@/hooks/useCytoscape';
import { usePerformance } from '@/contexts/PerformanceContext';
import Tooltip from '@/components/ui/tooltip';
import GraphControls from '@/components/GraphControls';

const CytoscapeVisualization = memo(forwardRef(({
  pathData,
  wrappedTokens,
  nodeProfiles,
  tokenOwnerProfiles,
  balancesByAccount,
  minCapacity,
  maxCapacity,
  onTransactionSelect,
  selectedTransactionId
}, ref) => {
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState({ text: '', position: null });
  const [currentLayout, setCurrentLayout] = useState('klay');
  const { config } = usePerformance();
  
  const { 
    cyRef,
    highlightTransaction,
    runLayout,
    zoomIn,
    zoomOut,
    fit,
    center
  } = useCytoscape({
    containerRef,
    pathData,
    wrappedTokens,
    nodeProfiles,
    tokenOwnerProfiles,
    balancesByAccount,
    minCapacity,
    maxCapacity,
    onTooltip: setTooltip,
    onTransactionSelect,
    layoutName: currentLayout
  });
  
  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    zoomIn,
    zoomOut,
    fit,
    center,
    runLayout
  }));
  
  useEffect(() => {
    if (selectedTransactionId && !config.rendering.fastMode) {
      highlightTransaction(selectedTransactionId);
    }
  }, [selectedTransactionId, highlightTransaction, config.rendering.fastMode]);

  const handleLayoutChange = (layoutName) => {
    setCurrentLayout(layoutName);
    setTimeout(() => {
      runLayout(layoutName);
    }, 100);
  };
  
  return (
    <div className="w-full h-full relative">
      <div
        ref={containerRef}
        className="w-full h-full"
      />
      
      {/* Graph Controls */}
      <GraphControls
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onFit={fit}
        onCenter={center}
        onLayoutChange={handleLayoutChange}
        currentLayout={currentLayout}
      />
      
      {config.rendering.features.tooltips && <Tooltip {...tooltip} />}
    </div>
  );
}));

CytoscapeVisualization.displayName = 'CytoscapeVisualization';

export default CytoscapeVisualization;