import React, { useRef, useState } from 'react';
import { useCytoscape } from '@/hooks/useCytoscape';
import Tooltip from '@/components/ui/tooltip';

const CytoscapeVisualization = ({
  pathData,
  wrappedTokens,
  nodeProfiles,
  tokenOwnerProfiles,
  balancesByAccount,
  minCapacity,
  maxCapacity,
  onTransactionSelect,
  selectedTransactionId
}) => {
  const containerRef = useRef(null);
  const [tooltip, setTooltip] = useState({ text: '', position: null });
  
  const { highlightTransaction } = useCytoscape({
    containerRef,
    pathData,
    wrappedTokens,
    nodeProfiles,
    tokenOwnerProfiles,
    balancesByAccount,
    minCapacity,
    maxCapacity,
    onTooltip: setTooltip,
    onTransactionSelect
  });
  
  // When selectedTransactionId changes from parent, highlight it in the graph
  React.useEffect(() => {
    if (selectedTransactionId) {
      highlightTransaction(selectedTransactionId);
    }
  }, [selectedTransactionId, highlightTransaction]);
  
  return (
    <div className="w-full h-full relative">
      <div
        ref={containerRef}
        className="w-full h-full"
      />
      <Tooltip {...tooltip} />
    </div>
  );
};

export default CytoscapeVisualization;