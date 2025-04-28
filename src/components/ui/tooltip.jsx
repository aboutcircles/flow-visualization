import React from 'react';

// Tooltip component with improved formatting
const Tooltip = ({ text, position }) => {
  if (!position) return null;

  // Split the text by newlines and create separate lines
  const lines = text.split('\n');

  return (
    <div
      className="absolute z-50 bg-black/75 text-white p-2 rounded text-sm"
      style={{
        left: position.x + 10,
        top: position.y + 10,
        maxWidth: '400px'
      }}
    >
      {lines.map((line, index) => (
        <div key={index} className="whitespace-pre-wrap">{line}</div>
      ))}
    </div>
  );
};

export default Tooltip;