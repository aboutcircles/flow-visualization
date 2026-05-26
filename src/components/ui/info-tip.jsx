import { useState, useRef, useCallback } from 'react';
import { Info } from 'lucide-react';

const InfoTip = ({ text, size = 14 }) => {
  const [tooltipStyle, setTooltipStyle] = useState(null);
  const buttonRef = useRef(null);

  const show = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const useAbove = spaceBelow < 120 && rect.top > 120;
    setTooltipStyle({
      position: 'fixed',
      left: rect.left + rect.width / 2,
      ...(useAbove
        ? { bottom: window.innerHeight - rect.top + 8 }
        : { top: rect.bottom + 8 }),
      transform: 'translateX(-50%)',
      width: 'min(240px, 60vw)',
      zIndex: 9999,
    });
  }, []);

  const hide = useCallback(() => setTooltipStyle(null), []);

  return (
    <span className="relative inline-flex items-center ml-1 align-middle">
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
      {tooltipStyle && (
        <span
          role="tooltip"
          className="block bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg pointer-events-none"
          style={tooltipStyle}
        >
          {text}
        </span>
      )}
    </span>
  );
};

export default InfoTip;
