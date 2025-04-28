import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, X } from 'lucide-react';
import { parseAddressList } from '@/services/circlesApi';

// TokenInput component for handling multiple token inputs
const TokenInput = ({ value, onChange, placeholder, label }) => {
  const [inputValue, setInputValue] = useState('');

  // Parse the current value string into an array of tokens
  const tokens = parseAddressList(value);

  const handleAddToken = () => {
    if (inputValue && inputValue.startsWith('0x')) {
      // Combine existing tokens with the new one and update parent
      const updatedTokens = [...tokens, inputValue];
      onChange(updatedTokens.join(','));
      setInputValue('');
    }
  };

  const handleRemoveToken = (tokenToRemove) => {
    const updatedTokens = tokens.filter(token => token !== tokenToRemove);
    onChange(updatedTokens.join(','));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && inputValue) {
      e.preventDefault();
      handleAddToken();
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <div className="flex mb-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder}
          onKeyDown={handleKeyDown}
          className="flex-1"
        />
        <Button
          type="button"
          onClick={handleAddToken}
          className="ml-2"
        >
          <Plus size={16}/>
        </Button>
      </div>
      {tokens.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {tokens.map((token, index) => (
            <div key={index} className="flex items-center bg-gray-100 rounded-md px-2 py-1">
              <span className="text-xs font-mono mr-1 truncate" style={{maxWidth: '120px'}}>
                {token}
              </span>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700"
                onClick={() => handleRemoveToken(token)}
              >
                <X size={14}/>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TokenInput;