import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { checksumAddr } from '@/lib/utils';
import { useCytoscape } from '@/hooks/useCytoscape';
import { usePerformance } from '@/contexts/PerformanceContext';
import { usePersistedState } from '@/hooks/usePersistedState';
import { Button } from '@/components/ui/button';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Move,
  Layers,
  GitBranch,
  X
} from 'lucide-react';

const CytoscapeVisualization = forwardRef(({
  rawPathData,
  pathData,
  formData,
  wrappedTokens,
  tokenInfo,
  edgeCatalogByIndex,
  nodeProfiles,
  tokenOwnerProfiles,
  balancesByAccount,
  minCapacity,
  maxCapacity,
  onTransactionSelect,
  onNodeRemove,
  selectedTransactionId,
  onVisualizationModeChange,
  showNames = true
}, ref) => {
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState({ text: '', position: null });
  const [nodeMenu, setNodeMenu] = useState(null); // { id, position, isIntermediate }
  const [layoutName, setLayoutName] = usePersistedState('graph-layout', 'bfs-tiered');
  const [highlightedPath, setHighlightedPath] = useState(null);
  const { config } = usePerformance();
  
  const { 
    cyRef, 
    highlightTransaction,
    runLayout,
    zoomIn,
    zoomOut,
    fit,
    center,
    highlightPath: cytoscapeHighlightPath
  } = useCytoscape({
    containerRef,
    rawPathData,
    pathData,
    formData,
    wrappedTokens,
    tokenInfo,
    edgeCatalogByIndex,
    nodeProfiles,
    tokenOwnerProfiles,
    balancesByAccount,
    minCapacity,
    maxCapacity,
    onTooltip: setTooltip,
    onTransactionSelect,
    onNodeRemove,
    onNodeMenu: setNodeMenu,
    layoutName,
    showNames
  });

  // Enhanced highlightPath that also updates local state
  const highlightPath = useCallback((transfers) => {
    console.log('CytoscapeVisualization: highlightPath called with:', transfers);
    cytoscapeHighlightPath(transfers);
    setHighlightedPath(transfers);
  }, [cytoscapeHighlightPath]);

  // Clear highlight function
  const clearHighlight = useCallback(() => {
    const cy = cyRef.current;
    if (cy) {
      cy.batch(() => {
        cy.elements().removeClass('path-highlighted path-node');
      });
    }
    setHighlightedPath(null);
  }, [cyRef]);

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
    highlightPath,
    clearHighlight
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

  // Handle escape key to clear highlight
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && highlightedPath) {
        clearHighlight();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [highlightedPath, clearHighlight]);

  return (
    <div className="relative w-full h-full">
      {/* Cytoscape container */}
      <div ref={containerRef} className="w-full h-full" onContextMenu={(e) => e.preventDefault()} />
      
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
              <option value="bfs-tiered">BFS Tiered</option>
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
      
      {/* Highlight indicator */}
      {highlightedPath && (
        <div className="absolute top-4 right-4 z-20 bg-white rounded-lg shadow-sm p-2">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 bg-red-600 rounded-full"></div>
            <span>Path highlighted</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearHighlight}
              className="p-1 h-auto"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {highlightedPath.length} transfer{highlightedPath.length > 1 ? 's' : ''} • ESC to clear
          </div>
        </div>
      )}
      
      {/* Node context menu */}
      {nodeMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setNodeMenu(null)} />
          <div
            className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[170px]"
            style={{ left: nodeMenu.position.x + 8, top: nodeMenu.position.y + 8 }}
          >
            <div className="px-3 py-1.5 text-[10px] text-gray-400 border-b border-gray-100 font-mono">
              {checksumAddr(nodeMenu.id)}
            </div>
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
              onClick={() => {
                navigator.clipboard.writeText(checksumAddr(nodeMenu.id)).catch(() => {});
                setNodeMenu(null);
              }}
            >
              <span>📋</span> Copy Address
            </button>
            {nodeMenu.isIntermediate && onNodeRemove && (
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                onClick={() => {
                  onNodeRemove(nodeMenu.id);
                  setNodeMenu(null);
                }}
              >
                <span>✕</span> Remove from Graph
              </button>
            )}
          </div>
        </>
      )}

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