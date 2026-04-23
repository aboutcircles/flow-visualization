import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useFormData } from '@/hooks/useFormData';
import { usePathData } from '@/hooks/usePathData';
import { usePersistedState } from '@/hooks/usePersistedState';
import { usePerformance } from '@/contexts/PerformanceContext';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { decomposeFlow, transfersFromRoutes } from '@/utils/flowDecomposition';
import { parseAddressList } from '@/services/circlesApi';
import { getOrCreateSession, destroySession } from '@/services/testEnvService';
import Header from '@/components/ui/header';
import CollapsibleLeftPanel from '@/components/CollapsibleLeftPanel';
import CytoscapeVisualization from '@/components/CytoscapeVisualization';
import SankeyVisualization from '@/components/visualizations/SankeyVisualization';
import TransactionTable from '@/components/ui/transaction_table';
import FlowMatrixParams from '@/components/FlowMatrixParams';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, GripHorizontal, User, Hash } from 'lucide-react';
import InfoTip from '@/components/ui/info-tip';
import PathStats from '@/components/PathStats';

const FlowVisualization = () => {
  const [isCollapsed, setIsCollapsed] = usePersistedState('panel-collapsed', false);
  const [selectedTransactionId, setSelectedTransactionId] = useState(null);
  const [activeTab, setActiveTab] = usePersistedState('active-tab', 'transactions');
  const [showPerformanceWarning, setShowPerformanceWarning] = useState(false);
  const [tableHeight, setTableHeight] = usePersistedState('table-height', 320);
  const [sourceBalancesHeight, setSourceBalancesHeight] = usePersistedState('source-balances-height', 260);
  const [visualizationMode, setVisualizationMode] = usePersistedState('viz-mode', 'graph');
  const [showNames, setShowNames] = usePersistedState('show-names', true);
  const [quickFilterEnabled, setQuickFilterEnabled] = usePersistedState('quick-filter-enabled', false);
  const [sourceBalanceSort, setSourceBalanceSort] = usePersistedState('source-balance-sort', { key: 'crc', direction: 'desc' });
  const [lowerPanelTab, setLowerPanelTab] = usePersistedState('lower-panel-tab', 'source');
  // selectedTransfers removed — route-based selection via selectedRouteIds
  const cytoscapeRef = useRef(null);
  const sankeyRef = useRef(null);
  const autoSimplifiedRef = useRef(false);
  const containerRef = useRef(null);
  const isDraggingRef = useRef(false);
  const transactionsContentRef = useRef(null);
  const isSourceBalancesDraggingRef = useRef(false);
  
  const { shouldAutoSimplify, setPreset, toggleFeature, config } = usePerformance();
  
  const {
    formData, 
    formErrors,
    handleInputChange, 
    handleTokensChange, 
    handleWithWrapToggle,
    handleStagingToggle,
    handleTestEnvToggle,
    handleTestEnvUrlChange,
    handleTestEnvBlockNumberChange,
    handleQuantizedModeToggle,
    handleDebugIntermediateToggle,
    handleFromTokensExclusionToggle,
    handleToTokensExclusionToggle,
    setFromTokensIncludeValue,
    setToTokensIncludeValue,
    validateFormData,
  } = useFormData();
  const [formWarnings, setFormWarnings] = useState([]);
  const [testEnvSession, setTestEnvSession] = useState(null);

  const handleDestroySession = useCallback(async () => {
    await destroySession();
    setTestEnvSession(null);
  }, []);

  const {
    pathData,
    rawPathData,
    processedPathData,
    showProcessed,
    setShowProcessed,
    processingMeta,
    loadPathData,
    isLoading,
    error,
    wrappedTokens,
    tokenInfo,
    edgeCatalogByIndex,
    tokenOwnerProfiles,
    nodeProfiles,
    balancesByAccount,
    sourceBalances,
    sourceBalancesLoading,
    sourceBalancesError,
    sinkTrustRows,
    sinkTrustLoading,
    sinkTrustError,
    minCapacity,
    setMinCapacity,
    maxCapacity,
    setMaxCapacity,
    boundMin,
    setBoundMin,
    boundMax,
    setBoundMax
  } = usePathData(formData.To);
  
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

  // Function to clear highlights
  const clearHighlights = useCallback(() => {
    if (visualizationMode === 'graph' && cytoscapeRef.current?.clearHighlight) {
      cytoscapeRef.current.clearHighlight();
    } else if (visualizationMode === 'sankey' && sankeyRef.current?.clearHighlight) {
      sankeyRef.current.clearHighlight();
    }
  }, [visualizationMode]);

  // Expose the highlight function globally
  useEffect(() => {
    window.highlightPath = highlightPath;
    window.getCyInstance = getCyInstance;
    window.clearHighlights = clearHighlights;
    
    return () => {
      delete window.highlightPath;
      delete window.getCyInstance;
      delete window.clearHighlights;
    };
  }, [highlightPath, getCyInstance, clearHighlights]);
  
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
    { key: 'Escape', callback: clearHighlights },
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
  
  const formatBalanceNum = useCallback((value) => {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return '0';
    if (Math.abs(num) < 0.000001 && num !== 0) return num.toExponential(3);
    return num.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }, []);

  const parseComparableNumeric = useCallback((value) => {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
      if (/^-?\d+$/.test(value)) {
        try {
          return BigInt(value);
        } catch {
          // fall through
        }
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }, []);

  const sortedSourceBalances = useMemo(() => {
    if (!Array.isArray(sourceBalances)) return [];
    const rows = [...sourceBalances];
    const { key, direction } = sourceBalanceSort;
    const factor = direction === 'asc' ? 1 : -1;

    rows.sort((a, b) => {
      const av = parseComparableNumeric(a?.[key]);
      const bv = parseComparableNumeric(b?.[key]);

      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;

      if (typeof av === 'bigint' && typeof bv === 'bigint') {
        return av === bv ? 0 : (av > bv ? factor : -factor);
      }

      const an = Number(av);
      const bn = Number(bv);
      if (an === bn) return 0;
      return (an > bn ? 1 : -1) * factor;
    });

    return rows;
  }, [sourceBalances, sourceBalanceSort, parseComparableNumeric]);

  const normalizedFromTokens = useMemo(() => {
    if (formData.IsFromTokensExcluded) return [];
    return parseAddressList(formData.FromTokens).map(a => a.toLowerCase());
  }, [formData.FromTokens, formData.IsFromTokensExcluded]);

  const normalizedToTokens = useMemo(() => {
    if (formData.IsToTokensExcluded) return [];
    return parseAddressList(formData.ToTokens).map(a => a.toLowerCase());
  }, [formData.ToTokens, formData.IsToTokensExcluded]);

  const selectedSourceCrcSum = useMemo(() => {
    if (!Array.isArray(sourceBalances) || normalizedFromTokens.length === 0) return 0;

    return sourceBalances.reduce((sum, row) => {
      const tokenAddress = row?.tokenAddress?.toLowerCase();
      if (!tokenAddress || !normalizedFromTokens.includes(tokenAddress)) return sum;

      const crc = Number(row?.circles ?? row?.crc ?? 0);
      return Number.isFinite(crc) ? sum + crc : sum;
    }, 0);
  }, [sourceBalances, normalizedFromTokens]);


  const isWrappedSourceBalance = useCallback((row) => (
    !!(row?.isWrapped || row?.tokenType?.includes('ERC20Wrapper'))
  ), []);

  const isStaticSourceBalance = useCallback((row) => (
    isWrappedSourceBalance(row) && row?.isInflationary === true
  ), [isWrappedSourceBalance]);

  const isDemurragedWrappedSourceBalance = useCallback((row) => (
    isWrappedSourceBalance(row) && row?.isInflationary !== true
  ), [isWrappedSourceBalance]);

  const isRegular1155SourceBalance = useCallback((row) => (
    !isWrappedSourceBalance(row)
  ), [isWrappedSourceBalance]);

  const isGroupSourceBalance = useCallback((row) => {
    const tokenType = typeof row?.tokenType === 'string' ? row.tokenType.toLowerCase() : '';
    const wrappedTokenType = typeof row?.wrappedTokenType === 'string' ? row.wrappedTokenType.toLowerCase() : '';

    return tokenType.includes('group') || wrappedTokenType.includes('group');
  }, []);

  const executeFindPath = useCallback(async (requestData) => {
    autoSimplifiedRef.current = false;
    setSelectedTransactionId(null);
    clearHighlights();

    // If test-env mode, ensure we have a valid session attached
    if (requestData.UseTestEnv) {
      if (!requestData.TestEnvBlockNumber) {
        setFormWarnings(['Enter a block number for test environment mode']);
        return;
      }
      const parsedBlock = Number(requestData.TestEnvBlockNumber);
      if (!Number.isInteger(parsedBlock) || parsedBlock < 0) {
        setFormWarnings(['Block number must be a non-negative integer']);
        return;
      }
      try {
        const session = await getOrCreateSession(requestData.TestEnvUrl, parsedBlock);
        setTestEnvSession(session);
        await loadPathData({ ...requestData, testEnvSession: session });
      } catch (err) {
        const isMaxSessions = err.message.includes('Maximum concurrent sessions');
        const hint = isMaxSessions
          ? ' — close unused sessions or wait for them to expire (30 min TTL).'
          : '';
        setFormWarnings([`Test-env session error: ${err.message}${hint}`]);
        setTestEnvSession(null);
      }
      return;
    }

    setTestEnvSession(null);
    await loadPathData(requestData);
  }, [loadPathData, clearHighlights, setFormWarnings, setTestEnvSession]);

  const selectQuickTokensByPredicate = useCallback(async (predicate) => {
    const allTokens = Array.from(new Set(
      (sourceBalances || [])
        .map((row) => row?.tokenAddress?.toLowerCase())
        .filter(Boolean)
    ));
    const selectedTokens = Array.from(new Set(
      (sourceBalances || [])
        .filter(predicate)
        .map((row) => row?.tokenAddress?.toLowerCase())
        .filter(Boolean)
    ));
    const nextFromTokens = selectedTokens.join(',');
    const excludedTokens = allTokens.filter(t => !selectedTokens.includes(t));
    const nextExcludedFromTokens = excludedTokens.join(',');

    setFromTokensIncludeValue(nextFromTokens);

    if (quickFilterEnabled) {
      await executeFindPath({
        ...formData,
        FromTokens: nextFromTokens,
        ExcludedFromTokens: nextExcludedFromTokens,
        IsFromTokensExcluded: false,
      });
    }
  }, [sourceBalances, setFromTokensIncludeValue, quickFilterEnabled, executeFindPath, formData]);

  const selectAllQuickTokens = useCallback(async () => {
    await selectQuickTokensByPredicate(() => true);
  }, [selectQuickTokensByPredicate]);

  const toggleSelectAllQuickTokens = useCallback(async () => {
    const allTokenAddresses = Array.from(new Set(
      (sourceBalances || [])
        .map((row) => row?.tokenAddress?.toLowerCase())
        .filter(Boolean)
    ));
    const allSelected = allTokenAddresses.length > 0
      && allTokenAddresses.every((token) => normalizedFromTokens.includes(token));

    if (allSelected) {
      await selectQuickTokensByPredicate(() => false);
      return;
    }

    await selectAllQuickTokens();
  }, [sourceBalances, normalizedFromTokens, selectQuickTokensByPredicate, selectAllQuickTokens]);

  const selectWrappedQuickTokens = useCallback(async () => {
    await selectQuickTokensByPredicate(isWrappedSourceBalance);
  }, [selectQuickTokensByPredicate, isWrappedSourceBalance]);

  const selectStaticQuickTokens = useCallback(async () => {
    await selectQuickTokensByPredicate(isStaticSourceBalance);
  }, [selectQuickTokensByPredicate, isStaticSourceBalance]);

  const selectDemurragedQuickTokens = useCallback(async () => {
    await selectQuickTokensByPredicate(isDemurragedWrappedSourceBalance);
  }, [selectQuickTokensByPredicate, isDemurragedWrappedSourceBalance]);

  const selectRegular1155QuickTokens = useCallback(async () => {
    await selectQuickTokensByPredicate(isRegular1155SourceBalance);
  }, [selectQuickTokensByPredicate, isRegular1155SourceBalance]);

  const selectGroupQuickTokens = useCallback(async () => {
    await selectQuickTokensByPredicate(isGroupSourceBalance);
  }, [selectQuickTokensByPredicate, isGroupSourceBalance]);

  const handleFindPath = useCallback(async (overrideFormData) => {
    const baseData = overrideFormData || formData;
    const validation = validateFormData(baseData);
    setFormWarnings(validation.warnings || []);
    if (!validation.isValid) {
      return;
    }

    await executeFindPath(baseData);
  }, [formData, executeFindPath, validateFormData]);

  // Auto-run findPath on mount if form has sufficient persisted values
  const hasAutoRun = useRef(false);
  useEffect(() => {
    if (hasAutoRun.current) return;
    const isAddress = (v) => typeof v === 'string' && /^0x[a-fA-F0-9]{40}$/.test(v.trim());
    if (isAddress(formData.From) && isAddress(formData.To) && formData.Amount && formData.Amount !== '0') {
      hasAutoRun.current = true;
      handleFindPath();
    }
  }, [formData.From, formData.To, formData.Amount, handleFindPath]);

  const noPathSuggestions = useMemo(() => {
    if (!pathData) return [];
    const hasNoPath = String(pathData?.maxFlow || '0') === '0' && (pathData?.transfers?.length || 0) === 0;
    if (!hasNoPath) return [];

    return [
      'Remove token exclusions',
      'Clear token allowlists',
      'Disable Quantized Mode',
      'Try enabling wrapped tokens',
      'Add simulated trust/balance entries',
    ];
  }, [pathData]);

  const isQuickTokenSelected = useCallback((tokenAddress) => {
    if (!tokenAddress) return false;
    return normalizedFromTokens.includes(tokenAddress.toLowerCase());
  }, [normalizedFromTokens]);

  const toggleQuickToken = useCallback(async (tokenAddress) => {
    if (!tokenAddress) return;
    const normalized = tokenAddress.toLowerCase();
    const nextTokens = normalizedFromTokens.includes(normalized)
      ? normalizedFromTokens.filter(t => t !== normalized)
      : [...normalizedFromTokens, normalized];
    const nextFromTokens = nextTokens.join(',');

    const allTokens = Array.from(new Set(
      (sourceBalances || [])
        .map((row) => row?.tokenAddress?.toLowerCase())
        .filter(Boolean)
    ));
    const excludedTokens = allTokens.filter(t => !nextTokens.includes(t));
    const nextExcludedFromTokens = excludedTokens.join(',');

    setFromTokensIncludeValue(nextFromTokens);

    if (quickFilterEnabled) {
      await executeFindPath({
        ...formData,
        FromTokens: nextFromTokens,
        ExcludedFromTokens: nextExcludedFromTokens,
        IsFromTokensExcluded: false,
      });
    }
  }, [
    normalizedFromTokens,
    sourceBalances,
    setFromTokensIncludeValue,
    quickFilterEnabled,
    executeFindPath,
    formData,
  ]);

  const toggleQuickFilterEnabled = useCallback(async () => {
    const nextEnabled = !quickFilterEnabled;
    setQuickFilterEnabled(nextEnabled);
    if (nextEnabled) {
      await executeFindPath(formData);
    }
  }, [
    quickFilterEnabled,
    setQuickFilterEnabled,
    executeFindPath,
    formData,
  ]);

  const isQuickSinkTokenSelected = useCallback((tokenAddress) => {
    if (!tokenAddress) return false;
    return normalizedToTokens.includes(tokenAddress.toLowerCase());
  }, [normalizedToTokens]);

  const selectSinkQuickTokensByPredicate = useCallback(async (predicate) => {
    const nextTokens = Array.from(new Set(
      sinkTrustRows
        .filter(predicate)
        .map((row) => row?.tokenAddress?.toLowerCase())
        .filter(Boolean)
    ));
    const nextToTokens = nextTokens.join(',');

    setToTokensIncludeValue(nextToTokens);

    if (quickFilterEnabled) {
      await executeFindPath({
        ...formData,
        ToTokens: nextToTokens,
        ExcludedToTokens: '',
        IsToTokensExcluded: false,
      });
    }
  }, [sinkTrustRows, setToTokensIncludeValue, quickFilterEnabled, executeFindPath, formData]);

  const toggleSelectAllSinkQuickTokens = useCallback(async () => {
    const allTokenAddresses = Array.from(new Set(
      sinkTrustRows
        .map((row) => row?.tokenAddress?.toLowerCase())
        .filter(Boolean)
    ));
    const allSelected = allTokenAddresses.length > 0
      && allTokenAddresses.every((token) => normalizedToTokens.includes(token));

    await selectSinkQuickTokensByPredicate(allSelected ? () => false : () => true);
  }, [sinkTrustRows, normalizedToTokens, selectSinkQuickTokensByPredicate]);

  const toggleQuickSinkToken = useCallback(async (tokenAddress) => {
    if (!tokenAddress) return;
    const normalized = tokenAddress.toLowerCase();
    const nextTokens = normalizedToTokens.includes(normalized)
      ? normalizedToTokens.filter(t => t !== normalized)
      : [...normalizedToTokens, normalized];
    const nextToTokens = nextTokens.join(',');

    setToTokensIncludeValue(nextToTokens);

    if (quickFilterEnabled) {
      await executeFindPath({
        ...formData,
        ToTokens: nextToTokens,
        ExcludedToTokens: '',
        IsToTokensExcluded: false,
      });
    }
  }, [
    normalizedToTokens,
    setToTokensIncludeValue,
    quickFilterEnabled,
    executeFindPath,
    formData,
  ]);

  const clearQuickFilterSelection = useCallback(async () => {
    setFromTokensIncludeValue('');
    if (quickFilterEnabled) {
      await executeFindPath({
        ...formData,
        FromTokens: '',
        ExcludedFromTokens: '',
        IsFromTokensExcluded: false,
      });
    }
  }, [
    setFromTokensIncludeValue,
    quickFilterEnabled,
    executeFindPath,
    formData,
  ]);

  const toggleSourceBalanceSort = useCallback((key) => {
    setSourceBalanceSort(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'desc' };
    });
  }, [setSourceBalanceSort]);

  const sortIndicator = useCallback((key) => {
    if (sourceBalanceSort.key !== key) return '↕';
    return sourceBalanceSort.direction === 'asc' ? '↑' : '↓';
  }, [sourceBalanceSort]);

  const handleTransactionSelect = useCallback((transactionId) => {
    setSelectedTransactionId(transactionId);
    setActiveTab('transactions');
  }, []);

  const routeTokenInfoByIndex = useMemo(() => {
    const byIndex = {};
    const addMeta = (transfer, idx) => {
      const owner = transfer?.tokenOwner?.toLowerCase?.();
      if (!owner) return;
      const meta = tokenInfo?.[owner];
      if (meta) byIndex[idx] = meta;
    };

    rawPathData?.transfers?.forEach((transfer, idx) => addMeta(transfer, idx));
    pathData?.transfers?.forEach((transfer, idx) => {
      if (!byIndex[idx]) addMeta(transfer, idx);
    });

    return byIndex;
  }, [rawPathData, pathData, tokenInfo]);

  const tokenMetaByTokenOwner = useMemo(() => {
    const byOwner = {};

    Object.entries(tokenInfo || {}).forEach(([owner, meta]) => {
      if (!owner || !meta) return;
      byOwner[owner.toLowerCase()] = meta;
    });

    (sourceBalances || []).forEach((row) => {
      const owner = row?.tokenAddress?.toLowerCase?.();
      if (!owner || byOwner[owner]) return;
      byOwner[owner] = {
        token: owner,
        type: row?.tokenType,
        tokenType: row?.tokenType,
        isWrapped: !!(row?.isWrapped || row?.tokenType?.includes('ERC20Wrapper')),
        isInflationary: row?.isInflationary,
      };
    });

    return byOwner;
  }, [tokenInfo, sourceBalances]);

  // --- Route-based flow decomposition ---
  const [routes, setRoutes] = useState([]);
  const [selectedRouteIds, setSelectedRouteIds] = useState(new Set());

  // Decompose into routes when pathData changes
  useEffect(() => {
    if (!pathData || !Array.isArray(pathData.transfers) || !formData.From || !formData.To) {
      setRoutes([]);
      setSelectedRouteIds(new Set());
      return;
    }
    const source = formData.From.toLowerCase();
    const sink = formData.To.toLowerCase();
    const decomposed = decomposeFlow(pathData.transfers, source, sink);
    setRoutes(decomposed);
    setSelectedRouteIds(new Set(decomposed.map(r => r.id)));
  }, [pathData, formData.From, formData.To]);

  // Skip next slider effect after manual toggle (prevents overwrite)
  const skipSliderEffectRef = useRef(false);

  // Slider filters routes by flow threshold
  useEffect(() => {
    if (routes.length === 0) return;
    if (skipSliderEffectRef.current) {
      skipSliderEffectRef.current = false;
      return;
    }
    setSelectedRouteIds(
      new Set(
        routes
          .filter(r => r.flowNum >= minCapacity && r.flowNum <= maxCapacity)
          .map(r => r.id)
      )
    );
  }, [routes, minCapacity, maxCapacity]);

  // Update slider bounds when routes change
  useEffect(() => {
    if (routes.length === 0) return;
    const flows = routes.map(r => r.flowNum);
    const min = Math.min(...flows);
    const max = Math.max(...flows);
    setBoundMin(min);
    setBoundMax(max);
    setMinCapacity(min);
    setMaxCapacity(max);
  }, [routes]);

  const resetSliderToFull = useCallback(() => {
    skipSliderEffectRef.current = true;
    setMinCapacity(boundMin);
    setMaxCapacity(boundMax);
  }, [boundMin, boundMax, setMinCapacity, setMaxCapacity]);

  const handleToggleRoute = useCallback((routeId) => {
    resetSliderToFull();
    setSelectedRouteIds(prev => {
      const next = new Set(prev);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      return next;
    });
  }, [resetSliderToFull]);

  const handleToggleAllRoutes = useCallback(() => {
    resetSliderToFull();
    setSelectedRouteIds(prev => {
      if (prev.size === routes.length) return new Set();
      return new Set(routes.map(r => r.id));
    });
  }, [routes, resetSliderToFull]);

  // Click node in graph → remove all routes passing through that node
  const handleNodeRemove = useCallback((nodeId) => {
    const id = nodeId.toLowerCase();
    const source = formData.From.toLowerCase();
    const sink = formData.To.toLowerCase();
    if (id === source || id === sink) return;

    resetSliderToFull();
    setSelectedRouteIds(prev => {
      const next = new Set(prev);
      for (const route of routes) {
        if (!next.has(route.id)) continue;
        const passesThrough = route.edges.some(
          e => e.from === id || e.to === id
        );
        if (passesThrough) next.delete(route.id);
      }
      return next;
    });
  }, [routes, formData, resetSliderToFull]);

  // Build filtered path data from selected routes
  const filteredPathData = useMemo(() => {
    if (!pathData || routes.length === 0) return null;
    if (selectedRouteIds.size === routes.length) return null; // all selected
    if (selectedRouteIds.size === 0) return { ...pathData, transfers: [], maxFlow: '0' };
    return {
      ...pathData,
      ...transfersFromRoutes(routes, selectedRouteIds, pathData.transfers),
    };
  }, [pathData, routes, selectedRouteIds]);

  // Route selection info for left panel
  const routeSelectionInfo = pathData && routes.length > 0 ? {
    count: selectedRouteIds.size,
    total: routes.length,
    flow: routes
      .filter(r => selectedRouteIds.has(r.id))
      .reduce((s, r) => s + r.flowNum, 0),
    isFiltered: selectedRouteIds.size < routes.length,
  } : null;

  // Handle resize
  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, []);

  const handleSourceBalancesMouseDown = useCallback((e) => {
    e.preventDefault();
    isSourceBalancesDraggingRef.current = true;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isSourceBalancesDraggingRef.current && transactionsContentRef.current) {
        const contentRect = transactionsContentRef.current.getBoundingClientRect();
        const newHeight = contentRect.bottom - e.clientY;
        const minHeight = 120;
        const maxHeight = contentRect.height - 160;

        if (newHeight >= minHeight && newHeight <= maxHeight) {
          setSourceBalancesHeight(newHeight);
        }
        return;
      }

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
      isSourceBalancesDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [setSourceBalancesHeight, setTableHeight]);

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
            formErrors={formErrors}
            formWarnings={formWarnings}
            handleInputChange={handleInputChange}
            handleTokensChange={handleTokensChange}
            handleWithWrapToggle={handleWithWrapToggle}
            handleStagingToggle={handleStagingToggle}
            handleTestEnvToggle={handleTestEnvToggle}
            handleTestEnvUrlChange={handleTestEnvUrlChange}
            handleTestEnvBlockNumberChange={handleTestEnvBlockNumberChange}
            testEnvSession={testEnvSession}
            onDestroySession={handleDestroySession}
            handleQuantizedModeToggle={handleQuantizedModeToggle}
            handleDebugIntermediateToggle={handleDebugIntermediateToggle}
            handleFromTokensExclusionToggle={handleFromTokensExclusionToggle}
            handleToTokensExclusionToggle={handleToTokensExclusionToggle}
            onFindPath={handleFindPath}
            isLoading={isLoading}
            error={error}
            pathData={pathData}
            showProcessed={showProcessed}
            setShowProcessed={setShowProcessed}
            processedPathData={processedPathData}
            processingMeta={processingMeta}
            minCapacity={minCapacity}
            setMinCapacity={setMinCapacity}
            maxCapacity={maxCapacity}
            setMaxCapacity={setMaxCapacity}
            boundMin={boundMin}
            boundMax={boundMax}
            routeSelectionInfo={routeSelectionInfo}
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
                    rawPathData={rawPathData}
                    pathData={filteredPathData || pathData}
                    formData={formData}
                    wrappedTokens={wrappedTokens}
                    tokenInfo={tokenInfo}
                    edgeCatalogByIndex={edgeCatalogByIndex}
                    nodeProfiles={nodeProfiles}
                    tokenOwnerProfiles={tokenOwnerProfiles}
                    balancesByAccount={balancesByAccount}
                    minCapacity={minCapacity}
                    maxCapacity={maxCapacity}
                    onTransactionSelect={handleTransactionSelect}
                    onNodeRemove={handleNodeRemove}
                    selectedTransactionId={selectedTransactionId}
                    onVisualizationModeChange={setVisualizationMode}
                    showNames={showNames}
                  />
                ) : (
                  <SankeyVisualization
                    ref={sankeyRef}
                    pathData={filteredPathData || pathData}
                    formData={formData}
                    wrappedTokens={wrappedTokens}
                    nodeProfiles={nodeProfiles}
                    tokenOwnerProfiles={tokenOwnerProfiles}
                    balancesByAccount={balancesByAccount}
                    minCapacity={minCapacity}
                    maxCapacity={maxCapacity}
                    onTransactionSelect={handleTransactionSelect}
                    selectedTransactionId={selectedTransactionId}
                    showNames={showNames}
                  />
                )
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <p className="mb-2">Enter addresses and click &quot;Find Path&quot; to visualize the flow</p>
                    <p className="text-sm text-gray-400">
                      Keyboard shortcuts: +/- zoom, F fit, C center, 1-4 presets, S toggle sidebar, K switch view, ESC clear highlights
                    </p>
                  </div>
                </div>
              )}
              {noPathSuggestions.length > 0 && (
                <Card className="absolute bottom-4 left-4 z-10 bg-amber-50 border-amber-200 max-w-sm">
                  <CardContent className="p-3">
                    <p className="text-xs font-semibold text-amber-800">No feasible route under current constraints</p>
                    <ul className="mt-1 list-disc list-inside text-xs text-amber-700">
                      {noPathSuggestions.map((tip) => (
                        <li key={tip}>{tip}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
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
                  <div className="px-4 pt-4 flex items-center justify-between gap-4">
                    <TabsList className="mb-0">
                      <TabsTrigger
                        isActive={activeTab === 'transactions'}
                        onClick={() => setActiveTab('transactions')}
                      >
                        Routes ({routes.length})
                      </TabsTrigger>
                      <TabsTrigger
                        isActive={activeTab === 'parameters'}
                        onClick={() => setActiveTab('parameters')}
                      >
                        Flow Matrix Parameters
                      </TabsTrigger>
                      <TabsTrigger
                        isActive={activeTab === 'simulation'}
                        onClick={() => setActiveTab('simulation')}
                      >
                        Simulation
                      </TabsTrigger>
                      <TabsTrigger
                        isActive={activeTab === 'stats'}
                        onClick={() => setActiveTab('stats')}
                      >
                        Path Stats
                      </TabsTrigger>
                    </TabsList>
                    <div className="flex rounded-md shadow-sm text-xs">
                      <button
                        onClick={() => setShowNames(true)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-l-md border transition-colors ${
                          showNames
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <User size={12} />
                        <span>Names</span>
                      </button>
                      <button
                        onClick={() => setShowNames(false)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-r-md border-t border-r border-b transition-colors ${
                          !showNames
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <Hash size={12} />
                        <span>Addr</span>
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-auto px-4 pb-4">
                    <TabsContent isActive={activeTab === 'transactions'} className="h-full overflow-hidden">
                      <div ref={transactionsContentRef} className="h-full flex flex-col gap-3 min-h-0">
                        <div className="min-h-0 flex-1">
                          <TransactionTable
                            routes={routes}
                            selectedRouteIds={selectedRouteIds}
                            onToggleRoute={handleToggleRoute}
                            onToggleAllRoutes={handleToggleAllRoutes}
                            maxFlow={pathData.maxFlow}
                            onTransactionSelect={handleTransactionSelect}
                            selectedTransactionId={selectedTransactionId}
                            nodeProfiles={nodeProfiles}
                            tokenInfo={tokenInfo}
                            routeTokenInfoByIndex={routeTokenInfoByIndex}
                            tokenMetaByTokenOwner={tokenMetaByTokenOwner}
                            showNames={showNames}
                          />
                        </div>

                        <div
                          className="flex items-center gap-3 px-1 py-1 cursor-ns-resize select-none"
                          onMouseDown={handleSourceBalancesMouseDown}
                        >
                          <div className="h-px flex-1 bg-gray-300" />
                          <span className="text-[10px] uppercase tracking-wider text-gray-400">Source balances</span>
                          <GripHorizontal size={12} className="text-gray-400" />
                          <div className="h-px flex-1 bg-gray-300" />
                        </div>

                        <div
                          className="border rounded-lg bg-white overflow-hidden flex flex-col"
                          style={{ height: `${sourceBalancesHeight}px` }}
                        >
                          <div className="px-3 pt-2 bg-gray-50 border-b">
                            <TabsList className="mb-2">
                              <TabsTrigger
                                isActive={lowerPanelTab === 'source'}
                                onClick={() => setLowerPanelTab('source')}
                                className="text-xs"
                              >
                                Source balances ({sortedSourceBalances.length})
                                <InfoTip text="Tokens the sender holds. Select tokens to constrain which ones the pathfinder can spend (first hop)." size={12} />
                              </TabsTrigger>
                              <TabsTrigger
                                isActive={lowerPanelTab === 'sink'}
                                onClick={() => setLowerPanelTab('sink')}
                                className="text-xs"
                              >
                                Sink trust ({sinkTrustRows.length})
                                <InfoTip text="Avatars the receiver trusts. Select to constrain which token owners the receiver accepts (last hop). Independent from source balances — intermediaries bridge trust gaps." size={12} />
                              </TabsTrigger>
                            </TabsList>
                          </div>

                          {lowerPanelTab === 'source' ? (
                            <div className="min-h-0 flex-1 overflow-auto">
                              <div className="px-3 py-2 border-b bg-white sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={toggleQuickFilterEnabled}
                                    title="When ON, selecting tokens automatically re-runs pathfinding with the current selection"
                                    className={`text-xs px-2 py-1 rounded border ${
                                      quickFilterEnabled
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-gray-100 text-gray-700 border-gray-300'
                                    }`}
                                  >
                                    Auto-search {quickFilterEnabled ? 'ON' : 'OFF'}
                                  </button>
                                  <span className="text-xs text-gray-500">
                                    {normalizedFromTokens.length} selected
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    Σ Selected CRC: {formatBalanceNum(selectedSourceCrcSum)}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 flex-wrap">
                                  <button type="button" onClick={toggleSelectAllQuickTokens} className="text-xs px-2 py-1 rounded border bg-white text-gray-600 border-gray-300">Clear</button>
                                  <button type="button" onClick={selectWrappedQuickTokens} className="text-xs px-2 py-1 rounded border bg-white text-gray-600 border-gray-300">Wrapped</button>
                                  <button type="button" onClick={selectRegular1155QuickTokens} className="text-xs px-2 py-1 rounded border bg-white text-gray-600 border-gray-300">Circles</button>
                                  <button type="button" onClick={selectGroupQuickTokens} className="text-xs px-2 py-1 rounded border bg-white text-gray-600 border-gray-300">Groups</button>
                                  <button type="button" onClick={selectStaticQuickTokens} className="text-xs px-2 py-1 rounded border bg-white text-gray-600 border-gray-300">Static</button>
                                  <button type="button" onClick={selectDemurragedQuickTokens} className="text-xs px-2 py-1 rounded border bg-white text-gray-600 border-gray-300">Demurraged</button>
                                </div>
                              </div>

                              {sourceBalancesLoading ? (
                                <div className="px-3 py-2 text-xs text-gray-500">Loading source balances…</div>
                              ) : sourceBalancesError ? (
                                <div className="px-3 py-2 text-xs text-red-600">{sourceBalancesError}</div>
                              ) : sortedSourceBalances.length === 0 ? (
                                <div className="px-3 py-2 text-xs text-gray-500">No source balances found.</div>
                              ) : (
                                <table className="w-full text-xs text-left">
                                  <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10">
                                    <tr>
                                      <th className="px-3 py-2">Use</th>
                                      <th className="px-3 py-2">Token</th>
                                      <th className="px-3 py-2">Owner</th>
                                      <th className="px-3 py-2 text-right"><button type="button" onClick={() => toggleSourceBalanceSort('crc')} className="inline-flex items-center gap-1 hover:text-gray-900" title="Sort by CRC">CRC <span className="text-[10px]">{sortIndicator('crc')}</span></button></th>
                                      <th className="px-3 py-2 text-right"><button type="button" onClick={() => toggleSourceBalanceSort('staticCircles')} className="inline-flex items-center gap-1 hover:text-gray-900" title="Sort by Static CRC">Static CRC <span className="text-[10px]">{sortIndicator('staticCircles')}</span></button></th>
                                      <th className="px-3 py-2">Label</th>
                                      <th className="px-3 py-2">Type</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {sortedSourceBalances.map((row) => {
                                      const wrapped = row?.isWrapped || row?.tokenType?.includes('ERC20Wrapper');
                                      const cadence = typeof row?.isInflationary === 'boolean' ? (row.isInflationary ? 'Static' : 'Demurraged') : null;
                                      const ownerAddress = row?.tokenOwner || '';
                                      const ownerProfile = tokenOwnerProfiles?.[ownerAddress.toLowerCase()];
                                      const ownerDisplay = showNames ? (ownerProfile?.name || `${ownerAddress.slice(0, 6)}…${ownerAddress.slice(-4)}`) : `${ownerAddress.slice(0, 6)}…${ownerAddress.slice(-4)}`;

                                      return (
                                        <tr key={`${row.tokenAddress}-${row.tokenOwner}`} className="hover:bg-gray-50">
                                          <td className="px-3 py-2"><input type="checkbox" checked={isQuickTokenSelected(row.tokenAddress)} onChange={() => toggleQuickToken(row.tokenAddress)} className="rounded border-gray-300" title="Include this source token in quick fromTokens filter" /></td>
                                          <td className="px-3 py-2 font-mono text-[11px] text-gray-700">{row.tokenAddress?.slice(0, 6)}…{row.tokenAddress?.slice(-4)}</td>
                                          <td className={`px-3 py-2 text-[11px] text-gray-600 ${showNames ? '' : 'font-mono'}`}>{ownerDisplay}</td>
                                          <td className="px-3 py-2 text-right text-gray-700">{formatBalanceNum(row.circles)}</td>
                                          <td className="px-3 py-2 text-right text-gray-700">{formatBalanceNum(row.staticCircles)}</td>
                                          <td className="px-3 py-2">
                                            <div className="flex items-center gap-1.5">
                                              {wrapped && cadence && (<span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-100 text-indigo-800 border border-indigo-200">{cadence}</span>)}
                                            </div>
                                          </td>
                                          <td className="px-3 py-2 text-gray-500">{row.tokenType || '—'}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          ) : (
                            <div className="min-h-0 flex-1 overflow-auto">
                              <div className="px-3 py-2 border-b bg-white sticky top-0 z-20 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <button
                                    type="button"
                                    onClick={toggleQuickFilterEnabled}
                                    title="When ON, selecting tokens automatically re-runs pathfinding with the current selection"
                                    className={`text-xs px-2 py-1 rounded border ${
                                      quickFilterEnabled
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-gray-100 text-gray-700 border-gray-300'
                                    }`}
                                  >
                                    Auto-search {quickFilterEnabled ? 'ON' : 'OFF'}
                                  </button>
                                  <span className="text-xs text-gray-500">{normalizedToTokens.length} selected</span>
                                </div>
                                <div className="flex items-center gap-1 flex-wrap">
                                  <button type="button" onClick={toggleSelectAllSinkQuickTokens} className="text-xs px-2 py-1 rounded border bg-white text-gray-600 border-gray-300">Clear</button>
                                </div>
                              </div>

                              {sinkTrustLoading ? (
                                <div className="px-3 py-2 text-xs text-gray-500">Loading sink trust…</div>
                              ) : sinkTrustError ? (
                                <div className="px-3 py-2 text-xs text-red-600">{sinkTrustError}</div>
                              ) : sinkTrustRows.length === 0 ? (
                                <div className="px-3 py-2 text-xs text-gray-500">No sink trust avatars found.</div>
                              ) : (
                                <table className="w-full text-xs text-left">
                                  <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10">
                                    <tr>
                                      <th className="px-3 py-2">Use</th>
                                      <th className="px-3 py-2">Avatar</th>
                                      <th className="px-3 py-2">Trusted</th>
                                      <th className="px-3 py-2 text-right">Relation</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {sinkTrustRows.map((row) => {
                                      const avatarAddress = row?.tokenAddress || '';
                                      const profile = tokenOwnerProfiles?.[avatarAddress.toLowerCase()];
                                      const avatarDisplay = showNames
                                        ? (profile?.name || `${avatarAddress.slice(0, 6)}…${avatarAddress.slice(-4)}`)
                                        : `${avatarAddress.slice(0, 6)}…${avatarAddress.slice(-4)}`;
                                      return (
                                        <tr key={avatarAddress} className="hover:bg-gray-50">
                                          <td className="px-3 py-2"><input type="checkbox" checked={isQuickSinkTokenSelected(avatarAddress)} onChange={() => toggleQuickSinkToken(avatarAddress)} className="rounded border-gray-300" title="Include this sink-trusted avatar in quick toTokens filter" /></td>
                                          <td className="px-3 py-2 font-mono text-[11px] text-gray-700">{avatarAddress.slice(0, 6)}…{avatarAddress.slice(-4)}</td>
                                          <td className={`px-3 py-2 text-[11px] text-gray-600 ${showNames ? '' : 'font-mono'}`}>{avatarDisplay}</td>
                                          <td className="px-3 py-2 text-right text-gray-700">{row.relation || 'trusts'}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </TabsContent>
                    
                    <TabsContent isActive={activeTab === 'parameters'} className="h-full">
                      <FlowMatrixParams
                        pathData={filteredPathData || pathData}
                        rawPathData={rawPathData}
                        sender={formData.From}
                        receiver={formData.To}
                        showProcessed={showProcessed}
                        isFiltered={!!filteredPathData}
                        view="params"
                      />
                    </TabsContent>

                    <TabsContent isActive={activeTab === 'simulation'} className="h-full">
                      <FlowMatrixParams
                        pathData={filteredPathData || pathData}
                        rawPathData={rawPathData}
                        sender={formData.From}
                        receiver={formData.To}
                        showProcessed={showProcessed}
                        isFiltered={!!filteredPathData}
                        view="simulation"
                      />
                    </TabsContent>
                    
                    <TabsContent isActive={activeTab === 'stats'} className="h-full">
                      <PathStats
                        pathData={filteredPathData || pathData}
                        tokenOwnerProfiles={tokenOwnerProfiles}
                        nodeProfiles={nodeProfiles}
                        tokenInfo={tokenInfo}
                        routes={routes}
                        selectedRouteIds={selectedRouteIds}
                        onToggleRoute={handleToggleRoute}
                        onToggleAllRoutes={handleToggleAllRoutes}
                        maxFlow={pathData.maxFlow}
                        showNames={showNames}
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