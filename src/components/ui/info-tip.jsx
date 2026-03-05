import React, { useState, useRef, useCallback } from 'react';
import { Info } from 'lucide-react';

const InfoTip = ({ text, size = 14 }) => {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState('below');
  const buttonRef = useRef(null);

  const show = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      // Show above if too close to bottom, below otherwise
      setPosition(rect.bottom + 120 > window.innerHeight ? 'above' : 'below');
    }
    setVisible(true);
  }, []);

  const hide = useCallback(() => setVisible(false), []);

  return (
    <span className="relative inline-flex items-center ml-1">
      <button
        ref={buttonRef}
        type="button"
        className="text-gray-400 hover:text-gray-600 focus:outline-none"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-label="More info"
      >
        <Info size={size} />
      </button>
      {visible && (
        <div
          className={`absolute z-50 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none ${
            position === 'above' ? 'bottom-full mb-2' : 'top-full mt-2'
          }`}
          style={{ left: '50%', transform: 'translateX(-50%)', width: 'min(240px, 60vw)' }}
        >
          {text}
        </div>
      )}
    </span>
  );
};

export default InfoTip;
