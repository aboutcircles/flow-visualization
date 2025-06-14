import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import ToggleSwitch from '@/components/ui/toggle-switch';
import { 
  Settings, 
  Zap, 
  Activity,
  ChevronDown,
  ChevronUp,
  Gauge,
  Trash2,
  Database
} from 'lucide-react';
import { usePerformance } from '@/contexts/PerformanceContext';
import cacheService from '@/services/cacheService';

const GraphPerformanceControls = ({ embedded = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [cacheStats, setCacheStats] = useState(null);
  const { 
    config, 
    setPreset, 
    toggleFeature, 
    performanceStats 
  } = usePerformance();

  const presets = [
    { name: 'low', label: 'Fast', icon: Zap },
    { name: 'medium', label: 'Balanced', icon: Gauge },
    { name: 'high', label: 'Quality', icon: Activity },
    { name: 'ultra', label: 'Ultra', icon: Settings }
  ];

  const features = [
    { key: 'edgeLabels', label: 'Edge Labels', description: 'Show token and percentage labels on edges' },
    { key: 'nodeLabels', label: 'Node Labels', description: 'Show address/name labels on nodes' },
    { key: 'edgeGradients', label: 'Capacity Gradients', description: 'Show capacity usage as gradients' },
    { key: 'curvedEdges', label: 'Curved Edges', description: 'Use bezier curves instead of straight lines' },
    { key: 'tooltips', label: 'Tooltips', description: 'Show detailed info on hover' },
    { key: 'wrappedTokenDashing', label: 'Wrapped Token Styling', description: 'Show wrapped tokens as dashed lines' },
    { key: 'overCapacityHighlight', label: 'Over-capacity Highlights', description: 'Highlight edges exceeding capacity' },
    { key: 'edgeWidthScaling', label: 'Dynamic Edge Width', description: 'Scale edge width by flow amount' }
  ];

  const handleClearCache = () => {
    cacheService.clearAll();
    setCacheStats(cacheService.getStats());
  };

  const handleShowCacheStats = () => {
    setCacheStats(cacheService.getStats());
  };

  const content = (
    <>
      {/* Performance Stats */}
      <div className="text-xs text-gray-600 mb-3">
        <div>Nodes: {performanceStats.nodeCount} | Edges: {performanceStats.edgeCount}</div>
        <div>FPS: {performanceStats.fps.toFixed(0)} | Render: {performanceStats.renderTime}ms</div>
      </div>

      {/* Preset Buttons */}
      <div className="flex gap-1 mb-3">
        {presets.map(preset => {
          const isActive = (config.rendering.fastMode && preset.name === 'low') ||
                         (!config.rendering.fastMode && preset.name !== 'low' && 
                          Object.values(config.rendering.features).filter(v => v).length > 
                          (preset.name === 'medium' ? 3 : preset.name === 'high' ? 6 : 0));
          
          return (
            <Button
              key={preset.name}
              variant={isActive ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPreset(preset.name)}
              className="flex-1"
            >
              <preset.icon size={14} className="mr-1" />
              {preset.label}
            </Button>
          );
        })}
      </div>

      {/* Detailed Controls */}
      {(isExpanded || embedded) && (
        <>
          <div className="space-y-2 border-t pt-3 mt-3">
            {features.map(feature => (
              <div key={feature.key} className="flex items-start justify-between py-1">
                <div className="flex-1 mr-2">
                  <Label className="text-sm font-medium">{feature.label}</Label>
                  <p className="text-xs text-gray-500">{feature.description}</p>
                </div>
                <ToggleSwitch
                  isEnabled={config.rendering.features[feature.key]}
                  onToggle={() => toggleFeature(feature.key)}
                  label=""
                />
              </div>
            ))}
          </div>

          {/* Cache Controls */}
          <div className="border-t pt-3 mt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Database size={16} />
                <Label className="text-sm font-medium">Cache</Label>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShowCacheStats}
                >
                  Stats
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearCache}
                >
                  <Trash2 size={14} className="mr-1" />
                  Clear
                </Button>
              </div>
            </div>
            
            {cacheStats && (
              <div className="text-xs text-gray-600 mt-2 p-2 bg-gray-50 rounded">
                <div>Memory: {cacheStats.memoryCount} items</div>
                <div>Storage: {cacheStats.localStorageCount} items ({cacheStats.localStorageSize})</div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );

  if (embedded) {
    return <Card><CardContent className="pt-4">{content}</CardContent></Card>;
  }

  return (
    <Card className="fixed bottom-4 right-4 z-40 shadow-lg max-w-md">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Settings size={18} />
            <h3 className="font-semibold">Performance</h3>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </Button>
        </div>
        {content}
      </CardContent>
    </Card>
  );
};

export default GraphPerformanceControls;