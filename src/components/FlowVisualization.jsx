import React, { useState } from 'react';
import { useFormData } from '@/hooks/useFormData';
import { usePathData } from '@/hooks/usePathData';
import Header from '@/components/ui/header';
import CollapsibleSidebar from '@/components/CollapsibleSidebar';
import CytoscapeVisualization from '@/components/CytoscapeVisualization';
import TransactionTable from '@/components/ui/transaction_table';
import FlowMatrixParams from '@/components/FlowMatrixParams';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

const FlowVisualization = () => {
  // State for UI components
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [selectedTransactionId, setSelectedTransactionId] = useState(null);
  const [activeTab, setActiveTab] = useState('transactions');
  
  // Form data state
  const { 
    formData, 
    handleInputChange, 
    handleTokensChange, 
    handleWithWrapToggle,
    handleFromTokensExclusionToggle,
    handleToTokensExclusionToggle
  } = useFormData();
  
  // Path data and related state
  const {
    pathData,
    loadPathData,
    isLoading,
    error,
    wrappedTokens,
    tokenOwnerProfiles,
    nodeProfiles,
    balancesByAccount,
    minCapacity,
    setMinCapacity,
    maxCapacity,
    setMaxCapacity,
    boundMin,
    boundMax
  } = usePathData();
  
  // Handle form submission
  const handleFindPath = async () => {
    await loadPathData(formData);
    setSelectedTransactionId(null); // Reset selection when loading new data
  };
  
  // Handle transaction selection
  const handleTransactionSelect = (transactionId) => {
    setSelectedTransactionId(transactionId);
    // Switch to transactions tab when a transaction is selected
    setActiveTab('transactions');
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <Header />
      <div className="flex flex-col mt-16">
        <div className="flex flex-1 min-h-[50vh]">
          {/* Sidebar */}
          <CollapsibleSidebar
            isCollapsed={isCollapsed}
            setIsCollapsed={setIsCollapsed}
            formData={formData}
            handleInputChange={handleInputChange}
            handleTokensChange={handleTokensChange}
            handleWithWrapToggle={handleWithWrapToggle}
            handleFromTokensExclusionToggle={handleFromTokensExclusionToggle}
            handleToTokensExclusionToggle={handleToTokensExclusionToggle}
            onFindPath={handleFindPath}
            isLoading={isLoading}
            error={error}
            pathData={pathData}
            minCapacity={minCapacity}
            setMinCapacity={setMinCapacity}
            maxCapacity={maxCapacity}
            setMaxCapacity={setMaxCapacity}
            boundMin={boundMin}
            boundMax={boundMax}
          />

          {/* Main content area */}
          <div className={`
            flex-1 bg-white relative
            transition-all duration-300 ease-in-out
            ${isCollapsed ? 'ml-12' : 'ml-0'}
          `}>
            {pathData ? (
              <CytoscapeVisualization
                pathData={pathData}
                wrappedTokens={wrappedTokens}
                nodeProfiles={nodeProfiles}
                tokenOwnerProfiles={tokenOwnerProfiles}
                balancesByAccount={balancesByAccount}
                minCapacity={minCapacity}
                maxCapacity={maxCapacity}
                onTransactionSelect={handleTransactionSelect}
                selectedTransactionId={selectedTransactionId}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                Enter addresses and click "Find Path" to visualize the flow
              </div>
            )}
          </div>
        </div>

        {/* Tabbed content for transactions and flow matrix */}
        {pathData && (
          <div className="p-4 bg-gray-50">
            <Tabs>
              <TabsList>
                <TabsTrigger 
                  isActive={activeTab === 'transactions'} 
                  onClick={() => setActiveTab('transactions')}
                >
                  Transactions
                </TabsTrigger>
                <TabsTrigger 
                  isActive={activeTab === 'parameters'} 
                  onClick={() => setActiveTab('parameters')}
                >
                  Flow Matrix Parameters
                </TabsTrigger>
              </TabsList>
              
              <TabsContent isActive={activeTab === 'transactions'}>
                <TransactionTable
                  transfers={pathData.transfers}
                  maxFlow={pathData.maxFlow}
                  onTransactionSelect={handleTransactionSelect}
                  selectedTransactionId={selectedTransactionId}
                />
              </TabsContent>
              
              <TabsContent isActive={activeTab === 'parameters'}>
                <FlowMatrixParams
                  pathData={pathData}
                  sender={formData.From}
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
};

export default FlowVisualization;