import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useFormData } from '@/hooks/useFormData';
import { usePathData } from '@/hooks/usePathData';
import { usePerformance } from '@/contexts/PerformanceContext';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import Header from '@/components/ui/header';
import CollapsibleLeftPanel from '@/components/CollapsibleLeftPanel';
import CytoscapeVisualization from '@/components/CytoscapeVisualization';
import SankeyVisualization from '@/components/visualizations/SankeyVisualization';
import TransactionTable from '@/components/ui/transaction_table';
import FlowMatrixParams from '@/components/FlowMatrixParams';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, GripHorizontal } from 'lucide-react';
import PathStats from '@/components/PathStats';

const FlowVisualization = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState(null);
  const [activeTab, setActiveTab] = useState('transactions');
  const [showPerformanceWarning, setShowPerformanceWarning] = useState(false);
  const [tableHeight, setTableHeight] = useState(320); // Default height in pixels
  const [visualizationMode, setVisualizationMode] = useState('graph'); // 'graph' or 'sankey'
  const cytoscapeRef = useRef(null);
  const sankeyRef = useRef(null); // ADD THIS LINE
  const autoSimplifiedRef = useRef(false);
  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);
  
  const { shouldAutoSimplify, setPreset, toggleFeature, config } = usePerformance();
  
  const { 
    formData, 
    handleInputChange, 
    handleTokensChange, 
    handleWithWrapToggle,
    handleFromTokensExclusionToggle,
    handleToTokensExclusionToggle
  } = useFormData();
  
  const {
    pathData,
    loadPathData,
    isLoading,
    error,
    wrappedTokens,
    tokenInfo,
    tokenOwnerProfiles,
    nodeProfiles,
    balancesByAccount,
    minCapacity,
    setMinCapacity,
    maxCapacity,
    setMaxCapacity,
    boundMin,
    boundMax
  } = usePathData();
  
  // Helper function to get Cytoscape instance
  const getCyInstance = useCallback(() => {
    // Try multiple methods to get the cy instance
    
    // Method 1: From cytoscapeRef
    if (cytoscapeRef.current && cytoscapeRef.current.cyRef) {
      return cytoscapeRef.current.cyRef.current;
    }
    
    // Method 2: From window if stored
    if (window._cyInstance) {
      return window._cyInstance;
    }
    
    // Method 3: From container with _cyreg
    const containers = document.querySelectorAll('div');
    for (let container of containers) {
      if (container._cyreg && container._cyreg.cy) {
        window._cyInstance = container._cyreg.cy; // Store for next time
        return container._cyreg.cy;
      }
    }
    
    return null;
  }, []);
  
  // Store cy instance when graph is ready
  useEffect(() => {
    if (!pathData || visualizationMode !== 'graph') return;
    
    // Try to store cy instance after graph renders
    const timer = setTimeout(() => {
      const cy = getCyInstance();
      if (cy) {
        window._cyInstance = cy;
        console.log('Stored Cytoscape instance');
      }
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [pathData, visualizationMode, getCyInstance]);
  
  // Function to highlight a path
  const highlightPath = useCallback((transfers) => {
    console.log('highlightPath called with transfers:', transfers);
    
    if (!transfers || transfers.length === 0) {
      console.log('No transfers to highlight');
      return;
    }
    
    if (visualizationMode === 'graph') {
      console.log('In graph mode, using Cytoscape highlight');
      if (!cytoscapeRef.current) {
        console.error('No cytoscapeRef.current');
        return;
      }
      
      // Use the exposed highlightPath method
      if (cytoscapeRef.current.highlightPath) {
        cytoscapeRef.current.highlightPath(transfers);
        console.log('Path highlighted successfully in graph');
      } else {
        console.error('highlightPath method not found on cytoscapeRef');
      }
    } else if (visualizationMode === 'sankey') {
      console.log('In sankey mode, using Sankey highlight');
      if (!sankeyRef.current) {
        console.error('No sankeyRef.current');
        return;
      }
      
      // Use the exposed highlightPath method for Sankey
      if (sankeyRef.current.highlightPath) {
        sankeyRef.current.highlightPath(transfers);
        console.log('Path highlighted successfully in sankey');
      } else {
        console.error('highlightPath method not found on sankeyRef');
      }
    }
  }, [visualizationMode]);

  // Expose the highlight function globally
  useEffect(() => {
    window.highlightPath = highlightPath;
    window.getCyInstance = getCyInstance;
    
    return () => {
      delete window.highlightPath;
      delete window.getCyInstance;
    };
  }, [highlightPath, getCyInstance]);
  
  // Define keyboard shortcuts
  useKeyboardShortcuts([
    { key: '+', callback: () => visualizationMode === 'graph' && cytoscapeRef.current?.zoomIn() },
    { key: '=', callback: () => visualizationMode === 'graph' && cytoscapeRef.current?.zoomIn() },
    { key: '-', callback: () => visualizationMode === 'graph' && cytoscapeRef.current?.zoomOut() },
    { key: '0', callback: () => visualizationMode === 'graph' && cytoscapeRef.current?.fit() },
    { key: 'f', callback: () => visualizationMode === 'graph' && cytoscapeRef.current?.fit() },
    { key: 'c', callback: () => visualizationMode === 'graph' && cytoscapeRef.current?.center() },
    { key: '1', callback: () => setPreset('low') },
    { key: '2', callback: () => setPreset('medium') },
    { key: '3', callback: () => setPreset('high') },
    { key: '4', callback: () => setPreset('ultra') },
    { key: 'l', callback: () => toggleFeature('edgeLabels') },
    { key: 'g', callback: () => toggleFeature('edgeGradients') },
    { key: 't', callback: () => toggleFeature('tooltips') },
    { key: 's', callback: () => setIsCollapsed(!isCollapsed) },
    { key: 'k', callback: () => setVisualizationMode(mode => mode === 'graph' ? 'sankey' : 'graph') },
  ]);
  
  // Auto-simplify for large graphs
  useEffect(() => {
    if (pathData && !autoSimplifiedRef.current && visualizationMode === 'graph') {
      const edgeCount = pathData.transfers?.length || 0;
      const isVeryLarge = edgeCount > config.thresholds.veryLargeGraphEdgeCount;
      
      if (isVeryLarge && !config.rendering.fastMode) {
        setShowPerformanceWarning(true);
        setPreset('low');
        console.log(`Auto-simplifying very large graph with ${edgeCount} edges`);
      } else if (shouldAutoSimplify()) {
        setPreset('low');
        console.log('Auto-simplifying graph due to size');
      }
      
      autoSimplifiedRef.current = true;
    }
  }, [pathData, config.thresholds.veryLargeGraphEdgeCount, config.rendering.fastMode, shouldAutoSimplify, setPreset, visualizationMode]);
  
  const handleFindPath = useCallback(async () => {
    autoSimplifiedRef.current = false;
    setSelectedTransactionId(null); // Clear selected transaction
    
    // Clear any existing graph highlights
    if (visualizationMode === 'graph' && cytoscapeRef.current && cytoscapeRef.current.getCy) {
      const cy = cytoscapeRef.current.getCy();
      if (cy) {
        cy.batch(() => {
          cy.elements().removeClass('highlighted path-highlighted path-node');
        });
      }
    } else if (visualizationMode === 'sankey' && sankeyRef.current && sankeyRef.current.clearHighlight) {
      sankeyRef.current.clearHighlight();
    }
    
    await loadPathData(formData);
  }, [formData, loadPathData, visualizationMode]);
  
  const handleTransactionSelect = useCallback((transactionId) => {
    setSelectedTransactionId(transactionId);
    setActiveTab('transactions');
  }, []);

  // Handle resize
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const newHeight = containerRect.bottom - e.clientY;
      
      // Set min/max heights
      const minHeight = 100;
      const maxHeight = containerRect.height - 200;
      
      if (newHeight >= minHeight && newHeight <= maxHeight) {
        setTableHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Debug wrapped tokens
  useEffect(() => {
    if (wrappedTokens.length > 0) {
      console.log('Wrapped tokens detected:', wrappedTokens);
      console.log('Token info:', tokenInfo);
    }
  }, [wrappedTokens, tokenInfo]);

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <Header />
      {/* Main content area with proper spacing for header */}
      <div className="flex flex-1 overflow-hidden pt-16">
        <div className="flex w-full h-full">
          {/* Left Panel */}
          <CollapsibleLeftPanel
            isCollapsed={isCollapsed}
            setIsCollapsed={setIsCollapsed}
            formData={formData}
            handleInputChange={handleInputChange}
            handleTokensChange={handleTokensChange}
            handleWithWrapToggle={handleWithWrapToggle}
            handleFromTokensExclusionToggle={handleFromTokensExclusionToggle}
            handleToTokensExclusionToggle={handleToTokensExclusionToggle}
            onFindPath={handleFindPath}
            isLoading={isLoading}
            error={error}
            pathData={pathData}
            minCapacity={minCapacity}
            setMinCapacity={setMinCapacity}
            maxCapacity={maxCapacity}
            setMaxCapacity={setMaxCapacity}
            boundMin={boundMin}
            boundMax={boundMax}
          />

          {/* Right content area */}
          <div ref={containerRef} className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Graph visualization area - takes remaining space */}
            <div className="flex-1 bg-white relative overflow-hidden min-h-0">
              {/* Visualization Mode Toggle */}
              {pathData && (
                <div className="absolute top-4 right-4 z-10 bg-white rounded-lg shadow-sm p-1 flex">
                  <Button
                    size="sm"
                    variant={visualizationMode === 'graph' ? 'default' : 'ghost'}
                    onClick={() => setVisualizationMode('graph')}
                    className="rounded-r-none"
                  >
                    Graph
                  </Button>
                  <Button
                    size="sm"
                    variant={visualizationMode === 'sankey' ? 'default' : 'ghost'}
                    onClick={() => setVisualizationMode('sankey')}
                    className="rounded-l-none"
                  >
                    Sankey
                  </Button>
                </div>
              )}

              {/* Performance Warning */}
              {showPerformanceWarning && visualizationMode === 'graph' && (
                <Card className="absolute top-4 right-4 z-20 bg-yellow-50 border-yellow-200 max-w-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="text-yellow-600 mt-0.5" size={18} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-yellow-800">Large Graph Detected</p>
                        <p className="text-xs text-yellow-700 mt-1">
                          This graph has {pathData?.transfers?.length || 0} edges. Fast mode has been enabled for better performance.
                        </p>
                        <p className="text-xs text-yellow-700 mt-1">
                          Try the Sankey view for better performance with large graphs.
                        </p>
                        <div className="flex gap-2 mt-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setVisualizationMode('sankey')}
                          >
                            Switch to Sankey
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowPerformanceWarning(false)}
                          >
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {pathData ? (
                visualizationMode === 'graph' ? (
                  <CytoscapeVisualization
                    ref={cytoscapeRef}
                    pathData={pathData}
                    formData={formData}
                    wrappedTokens={wrappedTokens}
                    nodeProfiles={nodeProfiles}
                    tokenOwnerProfiles={tokenOwnerProfiles}
                    balancesByAccount={balancesByAccount}
                    minCapacity={minCapacity}
                    maxCapacity={maxCapacity}
                    onTransactionSelect={handleTransactionSelect}
                    selectedTransactionId={selectedTransactionId}
                    onVisualizationModeChange={setVisualizationMode}
                  />
                ) : (
                  <SankeyVisualization
                    ref={sankeyRef}  
                    pathData={pathData}
                    formData={formData}
                    wrappedTokens={wrappedTokens}
                    nodeProfiles={nodeProfiles}
                    tokenOwnerProfiles={tokenOwnerProfiles}
                    balancesByAccount={balancesByAccount}
                    minCapacity={minCapacity}
                    maxCapacity={maxCapacity}
                    onTransactionSelect={handleTransactionSelect}
                    selectedTransactionId={selectedTransactionId}
                  />
                )
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <p className="mb-2">Enter addresses and click "Find Path" to visualize the flow</p>
                    <p className="text-sm text-gray-400">
                      Keyboard shortcuts: +/- zoom, F fit, C center, 1-4 presets, S toggle sidebar, K switch view
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Resizable divider and table area */}
            {pathData && (
            <>
              {/* Draggable divider */}
              <div 
                className="h-2 bg-gray-200 cursor-ns-resize hover:bg-gray-300 transition-colors flex items-center justify-center"
                onMouseDown={handleMouseDown}
              >
                <GripHorizontal size={16} className="text-gray-500" />
              </div>

              {/* Table area with dynamic height */}
              <div 
                className="bg-gray-50 overflow-hidden flex flex-col"
                style={{ height: `${tableHeight}px` }}
              >
                <Tabs className="flex flex-col h-full">
                  <div className="px-4 pt-4">
                    <TabsList>
                      <TabsTrigger 
                        isActive={activeTab === 'transactions'} 
                        onClick={() => setActiveTab('transactions')}
                      >
                        Transactions ({pathData.transfers?.length || 0})
                      </TabsTrigger>
                      <TabsTrigger 
                        isActive={activeTab === 'parameters'} 
                        onClick={() => setActiveTab('parameters')}
                      >
                        Flow Matrix Parameters
                      </TabsTrigger>
                      <TabsTrigger 
                        isActive={activeTab === 'stats'} 
                        onClick={() => setActiveTab('stats')}
                      >
                        Path Stats
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  
                  <div className="flex-1 overflow-auto px-4 pb-4">
                    <TabsContent isActive={activeTab === 'transactions'} className="h-full">
                      <TransactionTable
                        transfers={pathData.transfers}
                        maxFlow={pathData.maxFlow}
                        onTransactionSelect={handleTransactionSelect}
                        selectedTransactionId={selectedTransactionId}
                      />
                    </TabsContent>
                    
                    <TabsContent isActive={activeTab === 'parameters'} className="h-full">
                      <FlowMatrixParams
                        pathData={pathData}
                        sender={formData.From}
                      />
                    </TabsContent>
                    
                    <TabsContent isActive={activeTab === 'stats'} className="h-full">
                      <PathStats
                        pathData={pathData}
                        tokenOwnerProfiles={tokenOwnerProfiles}
                        nodeProfiles={nodeProfiles}
                        tokenInfo={tokenInfo}
                      />
                    </TabsContent>
                  </div>
                </Tabs>
              </div>
            </>
          )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlowVisualization;