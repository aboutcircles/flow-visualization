/* eslint-disable react/prop-types, no-unused-vars */
import React from 'react';
import PropTypes from 'prop-types';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import TokenInput from '@/components/ui/token-input';
import ToggleSwitch from '@/components/ui/toggle-switch';
import * as SliderPrimitive from '@radix-ui/react-slider';

const PathFinderForm = ({
  formData,
  handleInputChange,
  handleTokensChange,
  handleWithWrapToggle,
  handleStagingToggle,
  handleFromTokensExclusionToggle,
  handleToTokensExclusionToggle,
  onFindPath,
  isLoading,
  pathData,
  minCapacity,
  setMinCapacity,
  maxCapacity,
  setMaxCapacity,
  boundMin,
  boundMax
}) => {
  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <div>
          <label className="block text-sm font-medium mb-1">From Address</label>
          <Input
            name="from"
            value={formData.From}
            onChange={handleInputChange}
            placeholder="0x..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">To Address</label>
          <Input
            name="to"
            value={formData.To}
            onChange={handleInputChange}
            placeholder="0x..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Value (in CRC)</label>
          <Input
            name="crcAmount"
            value={formData.crcAmount}
            onChange={handleInputChange}
            placeholder="Enter amount in ETH..."
            type="text"
            inputMode="decimal"
          />
        </div>

        {/* Token input components for multiple tokens */}
        <TokenInput
          value={formData.IsFromTokensExcluded ? formData.ExcludedFromTokens : formData.FromTokens}
          onChange={(value) => handleTokensChange('FromTokens', value)}
          placeholder="0x..."
          label="From Tokens (Add multiple)"
          isExcluded={formData.IsFromTokensExcluded}
          onExclusionToggle={handleFromTokensExclusionToggle}
        />

        <TokenInput
          value={formData.IsToTokensExcluded ? formData.ExcludedToTokens : formData.ToTokens}
          onChange={(value) => handleTokensChange('ToTokens', value)}
          placeholder="0x..."
          label="To Tokens (Add multiple)"
          isExcluded={formData.IsToTokensExcluded}
          onExclusionToggle={handleToTokensExclusionToggle}
        />

        <div>
          <ToggleSwitch
            isEnabled={formData.WithWrap}
            onToggle={handleWithWrapToggle}
            label="Include Wrapped Tokens"
          />
        </div>
        <div>
          <ToggleSwitch
            isEnabled={formData.UseStaging}
            onToggle={handleStagingToggle}
            label="Use Staging Endpoint"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Max Transfers</label>
          <Input
            name="maxTransfers"
            value={formData.MaxTransfers}
            onChange={handleInputChange}
            placeholder="Max transfers"
            type="number"
          />
        </div>

        {pathData && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Capacity range: {minCapacity.toFixed(3)} → {maxCapacity.toFixed(3)}
            </label>
            <SliderPrimitive.Root
              className="relative flex items-center select-none touch-none w-full h-5"
              min={boundMin}
              max={boundMax}
              step={0.001}
              value={[minCapacity, maxCapacity]}
              onValueChange={([newMin, newMax]) => {
                setMinCapacity(newMin);
                setMaxCapacity(newMax);
              }}
              aria-label="Edge capacity range"
            >
              <SliderPrimitive.Track
                className="bg-gray-200 relative flex-1 h-1 rounded-full">
                <SliderPrimitive.Range
                  className="absolute bg-blue-500 h-full rounded-full"/>
              </SliderPrimitive.Track>
              <SliderPrimitive.Thumb
                className="block w-4 h-4 bg-white border-2 border-blue-500 rounded-full shadow"/>
              <SliderPrimitive.Thumb
                className="block w-4 h-4 bg-white border-2 border-blue-500 rounded-full shadow"/>
            </SliderPrimitive.Root>
          </div>
        )}

        <Button
          className="w-full"
          onClick={onFindPath}
          disabled={isLoading}
        >
          {isLoading ? 'Finding Path...' : 'Find Path'}
        </Button>
      </CardContent>
    </Card>
  );
};

PathFinderForm.propTypes = {
  formData: PropTypes.shape({
    From: PropTypes.string.isRequired,
    To: PropTypes.string.isRequired,
    crcAmount: PropTypes.string.isRequired,
    FromTokens: PropTypes.string,
    ToTokens: PropTypes.string,
    ExcludedFromTokens: PropTypes.string,
    ExcludedToTokens: PropTypes.string,
    WithWrap: PropTypes.bool.isRequired,
    UseStaging: PropTypes.bool.isRequired,
    MaxTransfers: PropTypes.string,
    IsFromTokensExcluded: PropTypes.bool.isRequired,
    IsToTokensExcluded: PropTypes.bool.isRequired,
  }).isRequired,
  handleInputChange: PropTypes.func.isRequired,
  handleTokensChange: PropTypes.func.isRequired,
  handleWithWrapToggle: PropTypes.func.isRequired,
  handleStagingToggle: PropTypes.func.isRequired,
  handleFromTokensExclusionToggle: PropTypes.func.isRequired,
  handleToTokensExclusionToggle: PropTypes.func.isRequired,
  onFindPath: PropTypes.func.isRequired,
  isLoading: PropTypes.bool.isRequired,
  pathData: PropTypes.object,
  minCapacity: PropTypes.number,
  setMinCapacity: PropTypes.func,
  maxCapacity: PropTypes.number,
  setMaxCapacity: PropTypes.func,
  boundMin: PropTypes.number,
  boundMax: PropTypes.number,
};
export default PathFinderForm;