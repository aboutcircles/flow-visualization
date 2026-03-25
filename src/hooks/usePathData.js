import { useState, useEffect, useMemo, useRef } from 'react';
import { findPath, processPath, createCirclesClients, fetchTokenInfo, fetchProfiles, fetchTokenBalancesWithInfo, fetchAddressTokenBalances, fetchSinkTrustAvatars } from '../services/circlesApi';
import { usePerformance } from '@/contexts/PerformanceContext';
import { usePersistedState } from '@/hooks/usePersistedState';

export const usePathData = (sinkAddress) => {
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
  const [sinkTrustRows, setSinkTrustRows] = useState([]);
  const [sinkTrustLoading, setSinkTrustLoading] = useState(false);
  const [sinkTrustError, setSinkTrustError] = useState(null);

  const [minCapacity, setMinCapacity] = useState(0);
  const [maxCapacity, setMaxCapacity] = useState(0);
  const [boundMin, setBoundMin] = useState(0);
  const [boundMax, setBoundMax] = useState(0);

  // Keep a ref to the source address for post-processing
  const sourceAddressRef = useRef(null);
  const normalizeAddress = (value) => (typeof value === 'string' ? value.toLowerCase() : '');

  const transferKey = (transfer) => `${
    normalizeAddress(transfer?.from)
  }|${
    normalizeAddress(transfer?.to)
  }|${String(transfer?.value || '')}`;

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

  // Resolve token-owner identities for source edges first (avatar vs token).
  useEffect(() => {
    if (!rawPathData || !sourceAddressRef.current) return;

    const sourceAddress = sourceAddressRef.current.toLowerCase();
    const sourceEdgeOwners = Array.from(new Set(
      (rawPathData.transfers || [])
        .filter((transfer) => normalizeAddress(transfer?.from) === sourceAddress)
        .map((transfer) => normalizeAddress(transfer?.tokenOwner))
        .filter(Boolean)
    ));

    if (sourceEdgeOwners.length === 0) return;

    const loadSourceOwnerProfiles = async () => {
      const profiles = await fetchProfiles(
        circlesProfiles,
        sourceEdgeOwners,
        config.data.cacheEnabled
      );
      setTokenOwnerProfiles((prev) => ({ ...prev, ...profiles }));
    };

    loadSourceOwnerProfiles();
  }, [rawPathData, circlesProfiles, config.data.cacheEnabled]);

  // Load profiles for token owners present in source balances (for Owner column display).
  useEffect(() => {
    const ownerAddresses = Array.from(new Set(
      (sourceBalances || [])
        .map((row) => normalizeAddress(row?.tokenOwner))
        .filter(Boolean)
    ));

    if (ownerAddresses.length === 0) return;

    const loadSourceBalanceOwnerProfiles = async () => {
      const profiles = await fetchProfiles(
        circlesProfiles,
        ownerAddresses,
        config.data.cacheEnabled
      );
      setTokenOwnerProfiles((prev) => ({ ...prev, ...profiles }));
    };

    loadSourceBalanceOwnerProfiles();
  }, [sourceBalances, circlesProfiles, config.data.cacheEnabled]);

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

  useEffect(() => {
    const normalizedSink = normalizeAddress(sinkAddress);

    if (!normalizedSink) {
      setSinkTrustRows([]);
      setSinkTrustError(null);
      setSinkTrustLoading(false);
      return;
    }

    let cancelled = false;
    setSinkTrustLoading(true);
    setSinkTrustError(null);

    const loadSinkTrust = async () => {
      try {
        const rows = await fetchSinkTrustAvatars(normalizedSink, sdkRpc);
        if (!cancelled) {
          setSinkTrustRows(rows);
        }
      } catch (err) {
        if (!cancelled) {
          setSinkTrustRows([]);
          setSinkTrustError(err.message || 'Failed to fetch sink trust');
        }
      } finally {
        if (!cancelled) {
          setSinkTrustLoading(false);
        }
      }
    };

    loadSinkTrust();

    return () => {
      cancelled = true;
    };
  }, [sinkAddress, sdkRpc]);

  useEffect(() => {
    if (!sinkTrustRows?.length) return;

    const ownerAddresses = Array.from(new Set(
      sinkTrustRows
        .map((row) => normalizeAddress(row?.tokenOwner || row?.tokenAddress))
        .filter(Boolean)
    ));

    if (ownerAddresses.length === 0) return;

    const loadSinkTrustProfiles = async () => {
      const profiles = await fetchProfiles(
        circlesProfiles,
        ownerAddresses,
        config.data.cacheEnabled
      );
      setTokenOwnerProfiles((prev) => ({ ...prev, ...profiles }));
    };

    loadSinkTrustProfiles();
  }, [sinkTrustRows, circlesProfiles, config.data.cacheEnabled]);

  // Bounds are now set by route decomposition in FlowVisualization

  const edgeCatalog = useMemo(() => {
    if (!pathData?.transfers?.length) return [];

    const rawTransfersByKey = new Map();
    (rawPathData?.transfers || []).forEach((rawTransfer) => {
      const key = transferKey(rawTransfer);
      const bucket = rawTransfersByKey.get(key) || [];
      bucket.push(rawTransfer);
      rawTransfersByKey.set(key, bucket);
    });

    const wrappedSet = new Set((wrappedTokens || []).map(normalizeAddress));
    const sourceAddress = normalizeAddress(sourceAddressRef.current);

    return pathData.transfers.map((transfer, index) => {
      const key = transferKey(transfer);
      const rawTransferCandidates = rawTransfersByKey.get(key);
      const rawTransfer = rawTransferCandidates?.length ? rawTransferCandidates.shift() : null;

      const from = normalizeAddress(transfer?.from);
      const tokenOwner = normalizeAddress(transfer?.tokenOwner);
      const originalTokenOwner = normalizeAddress(rawTransfer?.tokenOwner || transfer?.tokenOwner);
      const tokenAddress = normalizeAddress(
        rawTransfer?.token ||
        rawTransfer?.tokenAddress ||
        rawTransfer?.tokenOwner ||
        transfer?.token ||
        transfer?.tokenAddress ||
        originalTokenOwner ||
        tokenOwner
      );

      const transferTokenMeta = tokenInfo?.[tokenAddress] || tokenInfo?.[originalTokenOwner] || tokenInfo?.[tokenOwner];
      const isWrapped = !!(
        transferTokenMeta?.isWrapped ||
        wrappedSet.has(tokenAddress) ||
        wrappedSet.has(originalTokenOwner) ||
        wrappedSet.has(tokenOwner)
      );
      const isStaticWrapped = isWrapped && transferTokenMeta?.isInflationary === true;

      const isSourceEdge = !!sourceAddress && from === sourceAddress;
      const ownerProfile = tokenOwnerProfiles[originalTokenOwner] || tokenOwnerProfiles[tokenOwner];
      const ownerHasTokenMeta = !!(tokenInfo?.[originalTokenOwner] || tokenInfo?.[tokenOwner] || tokenInfo?.[tokenAddress]);

      let tokenKind = 'unknown';
      if (isSourceEdge) {
        if (ownerProfile) {
          tokenKind = 'avatar';
        } else if (isWrapped) {
          tokenKind = 'wrapped-token';
        } else if (ownerHasTokenMeta) {
          tokenKind = 'token';
        }
      }

      const wrappingType = isWrapped
        ? (isStaticWrapped ? 'wrapped-static' : 'wrapped-demurrage')
        : 'erc1155-demurrage';

      return {
        index,
        tokenOwner: originalTokenOwner || tokenOwner,
        originalTokenOwner,
        tokenAddress,
        isWrapped,
        isStaticWrapped,
        tokenKind,
        wrappingType,
      };
    });
  }, [pathData, rawPathData, wrappedTokens, tokenInfo, tokenOwnerProfiles]);

  const edgeCatalogByIndex = useMemo(() => {
    const byIndex = {};
    edgeCatalog.forEach((edge) => {
      byIndex[edge.index] = edge;
    });
    return byIndex;
  }, [edgeCatalog]);

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
    edgeCatalog,
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
  };
};