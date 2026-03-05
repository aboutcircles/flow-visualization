import React, { useState } from 'react';
import { Info } from 'lucide-react';

const InfoTip = ({ text, size = 14 }) => {
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative inline-flex items-center ml-1">
      <button
        type="button"
        className="text-gray-400 hover:text-gray-600 focus:outline-none"
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        aria-label="More info"
      >
        <Info size={size} />
      </button>
      {visible && (
        <div className="absolute z-50 left-6 top-1/2 -translate-y-1/2 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 w-64 shadow-lg pointer-events-none">
          {text}
        </div>
      )}
    </span>
  );
};

export default InfoTip;
