import { useState } from 'react';
import { ethToWei } from '../services/circlesApi';

export const useFormData = () => {
  const [formData, setFormData] = useState({
    From: '0x42cEDde51198D1773590311E2A340DC06B24cB37',
    To: '0x14c16ce62d26fd51582a646e2e30a3267b1e6d7e',
    FromTokens: '0x42cEDde51198D1773590311E2A340DC06B24cB37',
    ToTokens: '',
    crcAmount: '1000',  // Amount in ETH (for UI display)
    Amount: '1000000000000000000000', // Amount in Wei (calculated from crcAmount)
    WithWrap: true // Flag for API endpoint
  });
  
  const [formErrors, setFormErrors] = useState({});

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
            name === 'toTokens' ? 'ToTokens' : name;

      // For other fields, store value as is
      setFormData(prev => ({
        ...prev,
        [mappedFieldName]: value
      }));
    }

    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  // Handle token list changes
  const handleTokensChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle toggle change for WithWrap option
  const handleWithWrapToggle = () => {
    setFormData(prev => ({
      ...prev,
      WithWrap: !prev.WithWrap
    }));
  };

  return {
    formData,
    formErrors,
    setFormErrors,
    handleInputChange,
    handleTokensChange,
    handleWithWrapToggle
  };
};