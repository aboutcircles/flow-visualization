import React from 'react';
import { Label } from '@/components/ui/label';  // Fixed import path

const ToggleSwitch = ({ isEnabled, onToggle, label }) => {
  return (
    <div className="flex items-center space-x-2">
      <button
        type="button"
        role="switch"
        aria-checked={isEnabled}
        className={`
          relative inline-flex h-6 w-11 items-center rounded-full
          transition-colors focus-visible:outline-none focus-visible:ring-2
          focus-visible:ring-offset-2 focus-visible:ring-offset-white
          ${isEnabled ? 'bg-blue-600' : 'bg-gray-200'}
        `}
        onClick={onToggle}
      >
        <span
          className={`
            inline-block h-4 w-4 transform rounded-full bg-white transition-transform
            ${isEnabled ? 'translate-x-6' : 'translate-x-1'}
          `}
        />
      </button>
      <Label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
        {label}
      </Label>
    </div>
  );
};

export default ToggleSwitch;