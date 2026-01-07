/* eslint-disable react/prop-types, no-unused-vars */
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import PathFinderForm from './PathFinderForm';

const CollapsibleSidebar = ({
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
  minCapacity,
  setMinCapacity,
  maxCapacity,
  setMaxCapacity,
  boundMin,
  boundMax
}) => {
  return (
    <div
      className={`
        transform transition-all duration-300 ease-in-out
        bg-white shadow-lg relative
        ${isCollapsed ? 'w-12' : 'w-[32rem]'}
      `}
      style={{
        minWidth: isCollapsed ? '3rem' : '32rem',
        maxWidth: isCollapsed ? '3rem' : '32rem'
      }}
    >
      {/* Toggle button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-1/2 -translate-y-1/2 bg-white shadow-lg p-2 rounded-full z-10"
      >
        {isCollapsed ? <ChevronRight size={16}/> : <ChevronLeft size={16}/>}
      </button>

      {/* Sidebar content - only shown when expanded */}
      {!isCollapsed && (
        <div className="p-4 space-y-4">
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

          {pathData && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm font-medium">Max Flow</p>
                <p className="text-lg">{(Number(pathData.maxFlow) / 1e18).toFixed(6)}</p>
              </CardContent>
            </Card>
          )}

          {error && (
            <Card className="bg-red-50">
              <CardContent className="pt-4">
                <p className="text-red-600">{error}</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

export default CollapsibleSidebar;