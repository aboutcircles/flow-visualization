import { useState, useEffect, useRef } from 'react';
import { findPath, createCirclesClients, fetchTokenInfo, fetchProfiles, fetchTokenBalances } from '../services/circlesApi';

export const usePathData = () => {
  // Initialize SDK clients
  const { circlesData, circlesProfiles } = useRef(createCirclesClients()).current;
  
  // Main state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pathData, setPathData] = useState(null);
  
  // Related data
  const [wrappedTokens, setWrappedTokens] = useState([]);
  const [tokenInfo, setTokenInfo] = useState({});
  const [tokenOwnerProfiles, setTokenOwnerProfiles] = useState({});
  const [nodeProfiles, setNodeProfiles] = useState({});
  const [balancesByAccount, setBalancesByAccount] = useState({});
  
  // Flow capacity range
  const [minCapacity, setMinCapacity] = useState(0);
  const [maxCapacity, setMaxCapacity] = useState(0);
  const [boundMin, setBoundMin] = useState(0);
  const [boundMax, setBoundMax] = useState(0);

  // Load path data from API
  const loadPathData = async (formData) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await findPath(formData);
      setPathData(data);
      return data;
    } catch (err) {
      setError(`Failed to fetch path data: ${err.message}`);
      setPathData(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  // Load token information when pathData changes
  useEffect(() => {
    if (!pathData) return;

    const loadTokenInfos = async () => {
      const { wrapped, tokenInfo: info } = await fetchTokenInfo(circlesData, pathData.transfers);
      setWrappedTokens(wrapped);
      setTokenInfo(info);
    };

    loadTokenInfos();
  }, [pathData, circlesData]);

  // Load profiles for token owners
  useEffect(() => {
    const addresses = Object.keys(tokenInfo);
    if (addresses.length === 0) return;

    const loadProfiles = async () => {
      const profiles = await fetchProfiles(circlesProfiles, addresses);
      setTokenOwnerProfiles(prev => ({...prev, ...profiles}));
    };

    loadProfiles();
  }, [tokenInfo, circlesProfiles]);

  // Load profiles for nodes/accounts in transfers
  useEffect(() => {
    if (!pathData) return;
    
    const addresses = Array.from(new Set(
      pathData.transfers.flatMap(t => [t.from.toLowerCase(), t.to.toLowerCase()])
    ));
    
    const loadNodeProfiles = async () => {
      const profiles = await fetchProfiles(circlesProfiles, addresses);
      setNodeProfiles(prev => ({...prev, ...profiles}));
    };
    
    loadNodeProfiles();
  }, [pathData, circlesProfiles]);

  // Load token balances
  useEffect(() => {
    if (!pathData) return;
    
    const addresses = Array.from(new Set(
      pathData.transfers.flatMap(t => [t.from.toLowerCase(), t.to.toLowerCase()])
    ));
    
    const loadBalances = async () => {
      const balances = await fetchTokenBalances(addresses);
      setBalancesByAccount(balances);
    };
    
    loadBalances();
  }, [pathData]);

  // Set capacity range when pathData changes
  useEffect(() => {
    if (!pathData) return;
    
    // Pull out all the flowValues in token units
    const values = pathData.transfers.map(t => Number(t.value) / 1e18);
    const trueMin = Math.min(...values);
    const trueMax = Math.max(...values);
    
    // Initialize thumbs to full span
    setBoundMin(trueMin);
    setBoundMax(trueMax);
    setMinCapacity(trueMin);
    setMaxCapacity(trueMax);
  }, [pathData]);

  return {
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
  };
};