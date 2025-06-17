import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useCytoscape } from '@/hooks/useCytoscape';
import { usePerformance } from '@/contexts/PerformanceContext';
import { Button } from '@/components/ui/button';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Move,
  Layers,
  GitBranch
} from 'lucide-react';

const CytoscapeVisualization = forwardRef(({ 
  pathData,
  formData, // Add formData prop
  wrappedTokens,
  nodeProfiles,
  tokenOwnerProfiles,
  balancesByAccount,
  minCapacity,
  maxCapacity,
  onTransactionSelect,
  selectedTransactionId,
  onVisualizationModeChange
}, ref) => {
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState({ text: '', position: null });
  const [layoutName, setLayoutName] = useState('klay');
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
    formData, // Pass formData to hook
    wrappedTokens,
    nodeProfiles,
    tokenOwnerProfiles,
    balancesByAccount,
    minCapacity,
    maxCapacity,
    onTooltip: setTooltip,
    onTransactionSelect,
    layoutName
  });

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    cyRef,
    getCy: () => cyRef.current,
    zoomIn,
    zoomOut,
    fit,
    center,
    runLayout,
    highlightTransaction,
    highlightPath: (transfers) => {
      const cy = cyRef.current;
      if (!cy || !transfers || transfers.length === 0) return;
      
      console.log('Highlighting path with transfers:', transfers);
      
      cy.batch(() => {
        // Clear existing highlights
        cy.elements().removeClass('path-highlighted path-node');
        
        const nodesToHighlight = new Set();
        const transferIndices = new Set();
        
        // First, we need to match the transfers to the original pathData transfers
        // to get their indices
        transfers.forEach(transfer => {
          // Find the matching transfer in the original pathData
          const originalTransfers = window._pathData?.transfers || [];
          
          originalTransfers.forEach((origTransfer, index) => {
            if (
              origTransfer.from.toLowerCase() === transfer.from.toLowerCase() &&
              origTransfer.to.toLowerCase() === transfer.to.toLowerCase() &&
              origTransfer.tokenOwner.toLowerCase() === transfer.tokenOwner.toLowerCase() &&
              origTransfer.value === transfer.value
            ) {
              transferIndices.add(index);
              nodesToHighlight.add(transfer.from.toLowerCase());
              nodesToHighlight.add(transfer.to.toLowerCase());
            }
          });
        });
        
        console.log('Transfer indices to highlight:', Array.from(transferIndices));
        
        // Highlight edges by their transfer index
        cy.edges().forEach(edge => {
          const transferIndex = edge.data('transferIndex');
          if (transferIndices.has(transferIndex)) {
            edge.addClass('path-highlighted');
          }
        });
        
        // Highlight nodes
        nodesToHighlight.forEach(nodeId => {
          const node = cy.getElementById(nodeId);
          if (node && node.length > 0) {
            node.addClass('path-node');
          }
        });
      });
    }
  }));

  // Highlight selected transaction
  useEffect(() => {
    highlightTransaction(selectedTransactionId);
  }, [selectedTransactionId, highlightTransaction]);

  // Handle layout change
  const handleLayoutChange = (newLayout) => {
    if (newLayout === 'sankey') {
      // Switch to Sankey visualization
      if (onVisualizationModeChange) {
        onVisualizationModeChange('sankey');
      }
    } else {
      setLayoutName(newLayout);
      runLayout(newLayout);
    }
  };

  return (
    <div className="relative w-full h-full">
      {/* Cytoscape container */}
      <div ref={containerRef} className="w-full h-full" />
      
      {/* Controls overlay */}
      <div className="absolute top-4 left-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 bg-white rounded-lg shadow-sm p-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={zoomIn}
            title="Zoom In (+)"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={zoomOut}
            title="Zoom Out (-)"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={fit}
            title="Fit to Screen (F)"
          >
            <Maximize className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={center}
            title="Center (C)"
          >
            <Move className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="bg-white rounded-lg shadow-sm p-2">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-gray-500" />
            <select 
              value={layoutName} 
              onChange={(e) => handleLayoutChange(e.target.value)}
              className="text-sm border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="klay">Klay</option>
              <option value="hierarchical">Hierarchical</option>
              <option value="dagre">Dagre</option>
              <option value="breadthfirst">Breadthfirst</option>
              <option value="circle">Circle</option>
              <option value="concentric">Concentric</option>
              <option value="sankey" className="font-semibold">
                ↗ Sankey View
              </option>
            </select>
          </div>
        </div>
        

      </div>
      
      {/* Tooltip */}
      {tooltip.text && tooltip.position && (
        <div
          className="absolute z-50 bg-gray-900 text-white text-xs rounded px-2 py-1 pointer-events-none whitespace-pre-line"
          style={{
            left: tooltip.position.x + 10,
            top: tooltip.position.y - 10,
            maxWidth: '300px'
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
});

CytoscapeVisualization.displayName = 'CytoscapeVisualization';

export default CytoscapeVisualization;