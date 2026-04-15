import { useState, useEffect, useCallback } from 'react';
import { ethToWei, DEFAULT_TEST_ENV_URL } from '../services/circlesApi';

const STORAGE_KEY = 'flow-viz-form';

function loadSavedForm() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const merged = { ...DEFAULTS, ...parsed };
      // Test-env requires staging — normalize on load
      if (merged.UseTestEnv && !merged.UseStaging) {
        merged.UseStaging = true;
      }
      console.log('[form-persist] loaded:', {
        FromTokens: merged.FromTokens,
        ToTokens: merged.ToTokens,
        ExcludedFromTokens: merged.ExcludedFromTokens,
        ExcludedToTokens: merged.ExcludedToTokens,
        IsFromTokensExcluded: merged.IsFromTokensExcluded,
        IsToTokensExcluded: merged.IsToTokensExcluded,
      });
      return merged;
    }
  } catch {}
  return null;
}

const DEFAULTS = {
  From: '0x42cEDde51198D1773590311E2A340DC06B24cB37',
  To: '0x14c16ce62d26fd51582a646e2e30a3267b1e6d7e',
  FromTokens: '',
  ToTokens: '',
  ExcludedFromTokens: '',
  ExcludedToTokens: '',
  crcAmount: '1000',
  Amount: '1000000000000000000000',
  WithWrap: true,
  UseStaging: false,
  UseTestEnv: false,
  TestEnvUrl: DEFAULT_TEST_ENV_URL,
  TestEnvBlockNumber: '',
  MaxTransfers: '10',
  IsFromTokensExcluded: false,
  IsToTokensExcluded: false,
  QuantizedMode: false,
  DebugShowIntermediateSteps: false,
  SimulatedBalances: '[]',
  SimulatedTrusts: '[]',
  SimulatedConsentedAvatars: '',
};

const isAddress = (value) => typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value.trim());

const parseTokenSet = (value) => new Set(
  (value || '')
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
);

const hasDuplicates = (values) => {
  const normalized = values
    .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
    .filter(Boolean);
  return new Set(normalized).size !== normalized.length;
};

const parseJsonArray = (value) => {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const useFormData = () => {
  const [formData, setFormData] = useState(() => loadSavedForm() || DEFAULTS);

  const [formErrors, setFormErrors] = useState({});

  // Persist form data to localStorage
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(formData)); } catch {}
  }, [formData]);

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (name === 'crcAmount') {
      // For amount field, store ETH value and calculate Wei
      const weiValue = ethToWei(value);
      setFormData(prev => ({
        ...prev,
        crcAmount: value,
        Amount: weiValue
      }));
    } else {
      // Map UI field names to the capitalized API parameter names
      const mappedFieldName = name === 'from' ? 'From' :
        name === 'to' ? 'To' :
        name === 'fromTokens' ? 'FromTokens' :
        name === 'toTokens' ? 'ToTokens' :
        name === 'maxTransfers' ? 'MaxTransfers' :
        name;

      // Clear token filters when addresses change (stale filters cause empty results)
      const updates = { [mappedFieldName]: value };
      if (mappedFieldName === 'From') {
        updates.FromTokens = '';
        updates.ExcludedFromTokens = '';
      }
      if (mappedFieldName === 'To') {
        updates.ToTokens = '';
        updates.ExcludedToTokens = '';
      }

      setFormData(prev => ({
        ...prev,
        ...updates
      }));
    }

    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  // Handle from tokens exclusion toggle
  const handleFromTokensExclusionToggle = () => {
    setFormData(prev => {
      // If changing from include to exclude, move tokens from FromTokens to ExcludedFromTokens
      if (!prev.IsFromTokensExcluded) {
        return {
          ...prev,
          ExcludedFromTokens: prev.FromTokens,
          FromTokens: '',
          IsFromTokensExcluded: true
        };
      } else {
        // Otherwise, move tokens from ExcludedFromTokens to FromTokens
        return {
          ...prev,
          FromTokens: prev.ExcludedFromTokens,
          ExcludedFromTokens: '',
          IsFromTokensExcluded: false
        };
      }
    });
  };

  // Handle to tokens exclusion toggle
  const handleToTokensExclusionToggle = () => {
    setFormData(prev => {
      // If changing from include to exclude, move tokens from ToTokens to ExcludedToTokens
      if (!prev.IsToTokensExcluded) {
        return {
          ...prev,
          ExcludedToTokens: prev.ToTokens,
          ToTokens: '',
          IsToTokensExcluded: true
        };
      } else {
        // Otherwise, move tokens from ExcludedToTokens to ToTokens
        return {
          ...prev,
          ToTokens: prev.ExcludedToTokens,
          ExcludedToTokens: '',
          IsToTokensExcluded: false
        };
      }
    });
  };

  // Updated token input change handler to work with either included or excluded tokens
  const handleTokensChange = (field, value) => {
    if (field === 'FromTokens') {
      setFormData(prev => ({
        ...prev,
        [prev.IsFromTokensExcluded ? 'ExcludedFromTokens' : 'FromTokens']: value
      }));
    } else if (field === 'ToTokens') {
      setFormData(prev => ({
        ...prev,
        [prev.IsToTokensExcluded ? 'ExcludedToTokens' : 'ToTokens']: value
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  // Handle toggle change for WithWrap option
  const handleWithWrapToggle = () => {
    setFormData(prev => ({
      ...prev,
      WithWrap: !prev.WithWrap
    }));
  };

  const handleStagingToggle = () => {
    setFormData(prev => ({
      ...prev,
      UseStaging: !prev.UseStaging,
      // Turning off staging also turns off test-env (test-env requires staging)
      UseTestEnv: !prev.UseStaging ? prev.UseTestEnv : false,
    }));
  };

  const handleTestEnvToggle = () => {
    setFormData(prev => ({
      ...prev,
      UseTestEnv: !prev.UseTestEnv,
      // Test-env requires staging — auto-enable it
      UseStaging: !prev.UseTestEnv ? true : prev.UseStaging,
    }));
  };

  const handleTestEnvUrlChange = (e) => {
    setFormData(prev => ({ ...prev, TestEnvUrl: e.target.value }));
  };

  const handleTestEnvBlockNumberChange = (e) => {
    setFormData(prev => ({ ...prev, TestEnvBlockNumber: e.target.value }));
  };

  const handleQuantizedModeToggle = () => {
    setFormData(prev => ({
      ...prev,
      QuantizedMode: !prev.QuantizedMode
    }));
  };

  const handleDebugIntermediateToggle = () => {
    setFormData(prev => ({
      ...prev,
      DebugShowIntermediateSteps: !prev.DebugShowIntermediateSteps
    }));
  };

  const validateFormData = useCallback((candidateFormData) => {
    const nextErrors = {};
    const nextWarnings = [];

    if (!isAddress(candidateFormData?.From)) nextErrors.From = 'Source must be a valid 0x address';
    if (!isAddress(candidateFormData?.To)) nextErrors.To = 'Sink must be a valid 0x address';

    try {
      const target = BigInt(candidateFormData?.Amount || '0');
      if (target <= 0n) nextErrors.Amount = 'Target flow must be greater than 0';
    } catch {
      nextErrors.Amount = 'Target flow must be a valid uint value';
    }

    if (candidateFormData?.MaxTransfers) {
      const mt = Number(candidateFormData.MaxTransfers);
      if (!Number.isInteger(mt) || mt < 1 || mt > 500) {
        nextErrors.MaxTransfers = 'Max transfers must be an integer between 1 and 500';
      }
    }

    const simulatedBalances = parseJsonArray(candidateFormData?.SimulatedBalances);
    if (!simulatedBalances) {
      nextErrors.SimulatedBalances = 'Simulated balances must be a valid JSON array';
    } else {
      if (simulatedBalances.length > 200) {
        nextErrors.SimulatedBalances = 'Too many simulated balances (max 200).';
      } else {
        const hasInvalidBalanceRow = simulatedBalances.some((entry) => {
          const holderOk = isAddress(entry?.holder);
          const tokenOk = isAddress(entry?.token);
          let amountOk = false;
          try {
            const value = BigInt(entry?.amount ?? '');
            amountOk = value >= 0n;
          } catch {
            amountOk = false;
          }
          return !(holderOk && tokenOk && amountOk);
        });
        if (hasInvalidBalanceRow) {
          nextErrors.SimulatedBalances = 'Each simulated balance must include valid holder, token, and uint amount.';
        } else if (hasDuplicates(simulatedBalances.map((entry) => `${entry?.holder}|${entry?.token}|${entry?.amount}|${entry?.isWrapped}|${entry?.isStatic}`))) {
          nextWarnings.push('Simulated balances contain duplicate rows. Duplicates will be ignored by pathfinder semantics in most cases.');
        }
      }
    }

    const simulatedTrusts = parseJsonArray(candidateFormData?.SimulatedTrusts);
    if (!simulatedTrusts) {
      nextErrors.SimulatedTrusts = 'Simulated trusts must be a valid JSON array';
    } else {
      if (simulatedTrusts.length > 200) {
        nextErrors.SimulatedTrusts = 'Too many simulated trusts (max 200).';
      } else {
        const hasInvalidTrustRow = simulatedTrusts.some((entry) => (
          !isAddress(entry?.truster) || !isAddress(entry?.trustee)
        ));
        if (hasInvalidTrustRow) {
          nextErrors.SimulatedTrusts = 'Each simulated trust must include valid truster and trustee addresses.';
        } else if (hasDuplicates(simulatedTrusts.map((entry) => `${entry?.truster}|${entry?.trustee}`))) {
          nextWarnings.push('Simulated trusts contain duplicate edges. Consider deduplicating for clearer results.');
        }
      }
    }

    const consentedAvatars = (candidateFormData?.SimulatedConsentedAvatars || '')
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (consentedAvatars.length > 200) {
      nextErrors.SimulatedConsentedAvatars = 'Too many consented avatars (max 200).';
    } else if (consentedAvatars.some((value) => !isAddress(value))) {
      nextErrors.SimulatedConsentedAvatars = 'Consented avatars must be valid 0x addresses.';
    } else if (hasDuplicates(consentedAvatars)) {
      nextWarnings.push('Simulated consented avatars contain duplicates.');
    }

    const includeFromTokens = parseTokenSet(candidateFormData?.FromTokens);
    const excludeFromTokens = parseTokenSet(candidateFormData?.ExcludedFromTokens);
    const includeToTokens = parseTokenSet(candidateFormData?.ToTokens);
    const excludeToTokens = parseTokenSet(candidateFormData?.ExcludedToTokens);

    const fromConflict = [...includeFromTokens].some((token) => excludeFromTokens.has(token));
    const toConflict = [...includeToTokens].some((token) => excludeToTokens.has(token));

    if (fromConflict) nextWarnings.push('Some source tokens appear in both include and exclude lists.');
    if (toConflict) nextWarnings.push('Some sink tokens appear in both include and exclude lists.');
    if (hasDuplicates((candidateFormData?.FromTokens || '').split(','))) {
      nextWarnings.push('Source token allowlist contains duplicates.');
    }
    if (hasDuplicates((candidateFormData?.ExcludedFromTokens || '').split(','))) {
      nextWarnings.push('Source token exclusion list contains duplicates.');
    }
    if (hasDuplicates((candidateFormData?.ToTokens || '').split(','))) {
      nextWarnings.push('Sink token allowlist contains duplicates.');
    }
    if (hasDuplicates((candidateFormData?.ExcludedToTokens || '').split(','))) {
      nextWarnings.push('Sink token exclusion list contains duplicates.');
    }

    setFormErrors(nextErrors);
    return {
      isValid: Object.keys(nextErrors).length === 0,
      warnings: nextWarnings,
      errors: nextErrors,
    };
  }, []);

  const applyFormUpdates = useCallback((updatesOrUpdater) => {
    setFormData(prev => {
      if (typeof updatesOrUpdater === 'function') {
        return updatesOrUpdater(prev);
      }
      return {
        ...prev,
        ...updatesOrUpdater,
      };
    });
  }, []);

  const setFromTokensIncludeValue = useCallback((value) => {
    setFormData(prev => ({
      ...prev,
      FromTokens: value,
      IsFromTokensExcluded: false,
    }));
  }, []);

  const setToTokensIncludeValue = useCallback((value) => {
    setFormData(prev => ({
      ...prev,
      ToTokens: value,
      IsToTokensExcluded: false,
    }));
  }, []);

  return {
    formData,
    formErrors,
    setFormErrors,
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
    applyFormUpdates,
    setFromTokensIncludeValue,
    setToTokensIncludeValue,
    validateFormData,
  };
};
