import { useState, useEffect, useRef } from 'react';
import { findPath, processPath, createCirclesClients, fetchTokenInfo, fetchProfiles, fetchTokenBalancesWithInfo } from '../services/circlesApi';
import { usePerformance } from '@/contexts/PerformanceContext';
import { usePersistedState } from '@/hooks/usePersistedState';

export const usePathData = () => {
  const { circlesData, circlesProfiles, sdkRpc } = useRef(createCirclesClients()).current;
  const { config } = usePerformance();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rawPathData, setRawPathData] = useState(null);
  const [processedPathData, setProcessedPathData] = useState(null);
  const [showProcessed, setShowProcessed] = usePersistedState('show-processed', false);
  const [processingMeta, setProcessingMeta] = useState(null);

  // Derived: active path depends on toggle
  const pathData = showProcessed && processedPathData ? processedPathData : rawPathData;

  const [wrappedTokens, setWrappedTokens] = useState([]);
  const [tokenInfo, setTokenInfo] = useState({});
  const [tokenOwnerProfiles, setTokenOwnerProfiles] = useState({});
  const [nodeProfiles, setNodeProfiles] = useState({});
  const [balancesByAccount, setBalancesByAccount] = useState({});

  const [minCapacity, setMinCapacity] = useState(0);
  const [maxCapacity, setMaxCapacity] = useState(0);
  const [boundMin, setBoundMin] = useState(0);
  const [boundMax, setBoundMax] = useState(0);

  // Keep a ref to the source address for post-processing
  const sourceAddressRef = useRef(null);

  const loadPathData = async (formData) => {
    setIsLoading(true);
    setError(null);

    // Reset all derived data when loading new path
    setWrappedTokens([]);
    setTokenInfo({});
    setTokenOwnerProfiles({});
    setNodeProfiles({});
    setBalancesByAccount({});
    setProcessedPathData(null);
    setProcessingMeta(null);

    sourceAddressRef.current = formData.From;

    try {
      const data = await findPath(formData, sdkRpc);
      setRawPathData(data);
      return data;
    } catch (err) {
      setError(`Failed to fetch path data: ${err.message}`);
      setRawPathData(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Post-process path when raw data arrives
  useEffect(() => {
    if (!rawPathData || !sourceAddressRef.current) return;

    const runProcessing = async () => {
      try {
        const result = await processPath(rawPathData, sourceAddressRef.current);
        setProcessedPathData(result);
        setProcessingMeta(result._meta);
      } catch (err) {
        console.error('Path post-processing failed:', err);
        // Non-fatal — raw path is still usable
      }
    };

    runProcessing();
  }, [rawPathData]);

  // Combined loading of token info and balances for efficiency
  useEffect(() => {
    if (!pathData) return;
    
    const loadDataEfficiently = async () => {
      // Get all addresses involved
      const addresses = Array.from(new Set(
        pathData.transfers.flatMap(t => [t.from.toLowerCase(), t.to.toLowerCase()])
      ));
      
      // Load token info first (with heavy caching)
      const { wrapped, tokenInfo: info } = await fetchTokenInfo(
        circlesData, 
        pathData.transfers,
        config.data.cacheEnabled
      );
      setWrappedTokens(wrapped);
      setTokenInfo(info);
      
      // Load balances only if needed for gradients/capacity
      if (config.rendering.features.edgeGradients || 
          config.rendering.features.overCapacityHighlight || 
          !config.data.lazyLoadBalances) {
        const { balances } = await fetchTokenBalancesWithInfo(addresses, pathData.transfers);
        setBalancesByAccount(balances);
      }
    };

    loadDataEfficiently();
  }, [pathData, circlesData, config.data.cacheEnabled, config.rendering.features, config.data.lazyLoadBalances]);

  // Load profiles for token owners
  useEffect(() => {
    const addresses = Object.keys(tokenInfo);
    if (addresses.length === 0) return;

    const loadProfiles = async () => {
      const batchSize = config.data.batchSize;
      const batches = [];
      
      for (let i = 0; i < addresses.length; i += batchSize) {
        batches.push(addresses.slice(i, i + batchSize));
      }
      
      for (const batch of batches) {
        const profiles = await fetchProfiles(
          circlesProfiles, 
          batch,
          config.data.cacheEnabled
        );
        setTokenOwnerProfiles(prev => ({...prev, ...profiles}));
      }
    };

    loadProfiles();
  }, [tokenInfo, circlesProfiles, config.data]);

  // Load profiles for nodes
  useEffect(() => {
    if (!pathData) return;
    
    // Skip if node labels are disabled and lazy loading is enabled
    if (!config.rendering.features.nodeLabels && config.data.lazyLoadProfiles) return;
    
    const addresses = Array.from(new Set(
      pathData.transfers.flatMap(t => [t.from.toLowerCase(), t.to.toLowerCase()])
    ));
    
    const loadNodeProfiles = async () => {
      const batchSize = config.data.batchSize;
      const batches = [];
      
      for (let i = 0; i < addresses.length; i += batchSize) {
        batches.push(addresses.slice(i, i + batchSize));
      }
      
      for (const batch of batches) {
        const profiles = await fetchProfiles(
          circlesProfiles, 
          batch,
          config.data.cacheEnabled
        );
        setNodeProfiles(prev => ({...prev, ...profiles}));
      }
    };
    
    loadNodeProfiles();
  }, [pathData, circlesProfiles, config.rendering.features.nodeLabels, config.data]);

  // Set capacity range only on new search (rawPathData change), not on view toggle
  useEffect(() => {
    if (!rawPathData) return;

    const values = rawPathData.transfers.map(t => Number(t.value) / 1e18);
    const trueMin = Math.min(...values);
    const trueMax = Math.max(...values);

    setBoundMin(trueMin);
    setBoundMax(trueMax);
    setMinCapacity(trueMin);
    setMaxCapacity(trueMax);
  }, [rawPathData]);

  return {
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
    tokenOwnerProfiles,
    nodeProfiles,
    balancesByAccount,
    minCapacity,
    setMinCapacity,
    maxCapacity,
    setMaxCapacity,
    boundMin,
    boundMax
  };
};