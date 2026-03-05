import React from 'react';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import PathFinderForm from './PathFinderForm';
import GraphPerformanceControls from './GraphPerformanceControls';
import InfoTip from '@/components/ui/info-tip';
import { usePersistedState } from '@/hooks/usePersistedState';

const CollapsibleLeftPanel = ({
  isCollapsed,
  setIsCollapsed,
  formData,
  handleInputChange,
  handleTokensChange,
  handleWithWrapToggle,
  handleStagingToggle,
  handleFromTokensExclusionToggle,
  handleToTokensExclusionToggle,
  onFindPath,
  isLoading,
  error,
  pathData,
  showProcessed,
  setShowProcessed,
  processedPathData,
  processingMeta,
  minCapacity,
  setMinCapacity,
  maxCapacity,
  setMaxCapacity,
  boundMin,
  boundMax
}) => {
  const [expandedSections, setExpandedSections] = usePersistedState('expanded-sections', {
    form: true,
    performance: true
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  return (
    <div
      className={`
        transform transition-all duration-300 ease-in-out
        bg-gray-50 shadow-lg relative flex flex-col
        ${isCollapsed ? 'w-12 h-auto' : 'w-[32rem] h-full'}
      `}
      style={{
        minWidth: isCollapsed ? '3rem' : '32rem',
        maxWidth: isCollapsed ? '3rem' : '32rem',
        alignSelf: isCollapsed ? 'center' : 'stretch'
      }}
    >
      {/* Toggle button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className={`
          absolute -right-3 bg-white shadow-lg p-2 rounded-full z-10
          ${isCollapsed ? 'top-4' : 'top-1/2 -translate-y-1/2'}
        `}
      >
        {isCollapsed ? <ChevronRight size={16}/> : <ChevronLeft size={16}/>}
      </button>

      {/* Panel content - only shown when expanded */}
      {!isCollapsed && (
        <div className="flex flex-col h-full overflow-y-auto">
          {/* Path Finder Form Section */}
          <div className="p-4 pb-2">
            <div 
              className="flex items-center justify-between mb-2 cursor-pointer"
              onClick={() => toggleSection('form')}
            >
              <h3 className="text-lg font-semibold">Path Builder</h3>
              <button className="p-1">
                {expandedSections.form ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            </div>
            
            {expandedSections.form && (
              <PathFinderForm
                formData={formData}
                handleInputChange={handleInputChange}
                handleTokensChange={handleTokensChange}
                handleWithWrapToggle={handleWithWrapToggle}
                handleStagingToggle={handleStagingToggle}
                handleFromTokensExclusionToggle={handleFromTokensExclusionToggle}
                handleToTokensExclusionToggle={handleToTokensExclusionToggle}
                onFindPath={onFindPath}
                isLoading={isLoading}
                pathData={pathData}
                minCapacity={minCapacity}
                setMinCapacity={setMinCapacity}
                maxCapacity={maxCapacity}
                setMaxCapacity={setMaxCapacity}
                boundMin={boundMin}
                boundMax={boundMax}
              />
            )}
          </div>

          {/* Performance Controls Section */}
          <div className="p-4 pt-2">
            <div 
              className="flex items-center justify-between mb-2 cursor-pointer"
              onClick={() => toggleSection('performance')}
            >
              <h3 className="text-lg font-semibold">Performance</h3>
              <button className="p-1">
                {expandedSections.performance ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            </div>
            
            {expandedSections.performance && (
              <GraphPerformanceControls embedded={true} />
            )}
          </div>

          {/* Max Flow Display */}
          {pathData && (
            <div className="p-4 pt-0">
              <Card className="p-4">
                <p className="text-sm font-medium">Max Flow</p>
                <p className="text-lg">{(Number(pathData.maxFlow) / 1e18).toFixed(6)}</p>
              </Card>
            </div>
          )}

          {/* SDK Post-Processing Toggle */}
          {pathData && processedPathData && (
            <div className="p-4 pt-0">
              <Card className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium">
                    Resolve Wrappers
                    <InfoTip text="Display option only — does not change the path. When ON, wrapper contract addresses in the graph are replaced with the underlying avatar addresses, showing the path as it would execute on-chain." />
                  </p>
                  <button
                    onClick={() => setShowProcessed(!showProcessed)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      showProcessed ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      showProcessed ? 'translate-x-4' : 'translate-x-0.5'
                    }`} />
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  {showProcessed ? 'Wrapper addresses → avatar addresses' : 'Raw pathfinder output'}
                </p>
                {processingMeta?.hasWrappedTokens && (
                  <p className="text-xs text-amber-600 mt-1">
                    {processingMeta.wrappedTokenCount} wrapped token{processingMeta.wrappedTokenCount !== 1 ? 's' : ''} in path
                  </p>
                )}
              </Card>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-4 pt-0">
              <Card className="p-4 bg-red-50">
                <p className="text-red-600">{error}</p>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CollapsibleLeftPanel;