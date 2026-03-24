import { useState, useEffect, useRef } from 'react';
import { findPath, processPath, createCirclesClients, fetchTokenInfo, fetchProfiles, fetchTokenBalancesWithInfo, fetchAddressTokenBalances } from '../services/circlesApi';
import { usePerformance } from '@/contexts/PerformanceContext';
import { usePersistedState } from '@/hooks/usePersistedState';

export const usePathData = () => {
  const { circlesData, circlesProfiles, sdkRpc } = useRef(createCirclesClients()).current;
  const { config } = usePerformance();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [rawPathData, setRawPathData] = useState(null);
  const [processedPathData, setProcessedPathData] = useState(null);
  const [showProcessed, setShowProcessed] = usePersistedState('show-processed', true);
  const [processingMeta, setProcessingMeta] = useState(null);

  // Derived: active path depends on toggle
  const pathData = showProcessed && processedPathData ? processedPathData : rawPathData;

  const [wrappedTokens, setWrappedTokens] = useState([]);
  const [tokenInfo, setTokenInfo] = useState({});
  const [tokenOwnerProfiles, setTokenOwnerProfiles] = useState({});
  const [nodeProfiles, setNodeProfiles] = useState({});
  const [balancesByAccount, setBalancesByAccount] = useState({});
  const [sourceBalances, setSourceBalances] = useState([]);
  const [sourceBalancesLoading, setSourceBalancesLoading] = useState(false);
  const [sourceBalancesError, setSourceBalancesError] = useState(null);

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
    setSourceBalances([]);
    setSourceBalancesLoading(true);
    setSourceBalancesError(null);
    setProcessedPathData(null);
    setProcessingMeta(null);

    sourceAddressRef.current = formData.From;

    try {
      const data = await findPath(formData, sdkRpc);
      setRawPathData(data);

      try {
        const balances = await fetchAddressTokenBalances(
          formData.From,
          config.data.cacheEnabled
        );
        setSourceBalances(balances);
      } catch (balanceErr) {
        setSourceBalancesError(balanceErr.message || 'Failed to fetch source balances');
      } finally {
        setSourceBalancesLoading(false);
      }

      return data;
    } catch (err) {
      setError(`Failed to fetch path data: ${err.message}`);
      setRawPathData(null);
      setSourceBalancesLoading(false);
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

  // Load token info from raw path so wrapped metadata is preserved even when
  // "Resolve Wrappers" is enabled and displayed path uses resolved avatars.
  useEffect(() => {
    if (!rawPathData) return;
    
    const loadTokenInfo = async () => {
      const { wrapped, tokenInfo: info } = await fetchTokenInfo(
        circlesData, 
        rawPathData.transfers,
        config.data.cacheEnabled
      );
      setWrappedTokens(wrapped);
      setTokenInfo(info);
    };

    loadTokenInfo();
  }, [rawPathData, circlesData, config.data.cacheEnabled]);

  // Load balances only if needed for gradients/capacity
  useEffect(() => {
    if (!pathData) return;

    if (!config.rendering.features.edgeGradients &&
        !config.rendering.features.overCapacityHighlight &&
        config.data.lazyLoadBalances) {
      return;
    }

    const loadBalances = async () => {
      const addresses = Array.from(new Set(
        pathData.transfers.flatMap(t => [t.from.toLowerCase(), t.to.toLowerCase()])
      ));
      const { balances } = await fetchTokenBalancesWithInfo(addresses, pathData.transfers);
      setBalancesByAccount(balances);
    };

    loadBalances();
  }, [pathData, config.rendering.features, config.data.lazyLoadBalances]);

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

  // Bounds are now set by route decomposition in FlowVisualization

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
    sourceBalances,
    sourceBalancesLoading,
    sourceBalancesError,
    minCapacity,
    setMinCapacity,
    maxCapacity,
    setMaxCapacity,
    boundMin,
    setBoundMin,
    boundMax,
    setBoundMax
  };
};