import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Move,
  Layout,
  ChevronDown
} from 'lucide-react';

const GraphControls = ({ 
  onZoomIn, 
  onZoomOut, 
  onFit, 
  onCenter, 
  onLayoutChange, 
  currentLayout,
  disabled = false 
}) => {
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);

  const layouts = [
    { id: 'klay', name: 'Klay (Hierarchical)', description: 'Best for flow visualization' },
    { id: 'dagre', name: 'Dagre (Layered)', description: 'Clear left-to-right flow' },
    { id: 'breadthfirst', name: 'Breadth First', description: 'Tree-like structure' },
    { id: 'circle', name: 'Circle', description: 'Nodes in a circle' },
    { id: 'concentric', name: 'Concentric', description: 'Concentric circles' }
  ];

  const handleZoomIn = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && onZoomIn) {
      onZoomIn();
    }
  };

  const handleZoomOut = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && onZoomOut) {
      onZoomOut();
    }
  };

  const handleFit = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && onFit) {
      onFit();
    }
  };

  const handleCenter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && onCenter) {
      onCenter();
    }
  };

  return (
    <div className="absolute top-4 left-4 z-30 flex gap-2">
      {/* Zoom Controls */}
      <Card className="flex gap-1 p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleZoomIn}
          disabled={disabled}
          title="Zoom In"
          className="h-8 w-8 p-0"
        >
          <ZoomIn size={18} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleZoomOut}
          disabled={disabled}
          title="Zoom Out"
          className="h-8 w-8 p-0"
        >
          <ZoomOut size={18} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleFit}
          disabled={disabled}
          title="Fit to Screen"
          className="h-8 w-8 p-0"
        >
          <Maximize2 size={18} />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCenter}
          disabled={disabled}
          title="Center Graph"
          className="h-8 w-8 p-0"
        >
          <Move size={18} />
        </Button>
      </Card>

      {/* Layout Selector */}
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowLayoutMenu(!showLayoutMenu)}
          disabled={disabled}
          className="flex items-center gap-2"
        >
          <Layout size={18} />
          <span className="hidden sm:inline">Layout</span>
          <ChevronDown size={16} />
        </Button>

        {showLayoutMenu && !disabled && (
          <>
            {/* Click outside to close */}
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setShowLayoutMenu(false)}
            />
            
            <Card className="absolute top-full mt-2 left-0 p-2 w-64 shadow-lg z-20">
              <div className="space-y-1">
                {layouts.map(layout => (
                  <button
                    key={layout.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onLayoutChange(layout.id);
                      setShowLayoutMenu(false);
                    }}
                    className={`
                      w-full text-left p-2 rounded hover:bg-gray-100 transition-colors
                      ${currentLayout === layout.id ? 'bg-blue-50 text-blue-600' : ''}
                    `}
                  >
                    <div className="font-medium text-sm">{layout.name}</div>
                    <div className="text-xs text-gray-500">{layout.description}</div>
                  </button>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default GraphControls;