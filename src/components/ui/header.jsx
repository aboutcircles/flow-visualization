import React from 'react';

const Header = () => {
  return (
    <header className="bg-white border-b border-gray-200 px-4 h-16 flex items-center fixed top-0 left-0 right-0 z-50">
      <div className="flex items-center gap-3">
        <img 
          src="https://explorer.aboutcircles.com/icons/circles-logo.avif"
          alt="Circles Logo" 
          className="h-8 w-8"
        />
        <h1 className="text-xl font-semibold">
          <span style={{ color: 'hsl(244.67 47.87% 36.86% / 1)' }}>Circles</span>
          {' '}
          <span style={{ color: 'hsl(8.09 68.78% 59.8% / 1)' }}>Pathfinder</span>
        </h1>
      </div>
    </header>
  );
};

export default Header;