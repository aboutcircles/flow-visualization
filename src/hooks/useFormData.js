import { useState, useEffect, useCallback } from 'react';
import { ethToWei } from '../services/circlesApi';

const STORAGE_KEY = 'flow-viz-form';

function loadSavedForm() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
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
  MaxTransfers: '10',
  IsFromTokensExcluded: false,
  IsToTokensExcluded: false,
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
      UseStaging: !prev.UseStaging
    }));
  };

  return {
    formData,
    formErrors,
    setFormErrors,
    handleInputChange,
    handleTokensChange,
    handleWithWrapToggle,
    handleStagingToggle,
    handleFromTokensExclusionToggle,
    handleToTokensExclusionToggle
  };
};
