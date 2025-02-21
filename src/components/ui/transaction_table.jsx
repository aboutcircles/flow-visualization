import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const TransactionTable = ({ transfers, maxFlow, onTransactionSelect, selectedTransactionId }) => {
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: 'ascending'
  });

  // Format value to show in scientific notation if very small
  const formatValue = (value) => {
    const num = Number(value) / 1e18;
    if (num < 0.000001) {
      return num.toExponential(6);
    }
    return num.toFixed(6);
  };

  // Calculate and format fraction as percentage
  const calculateFraction = (value) => {
    return ((Number(value) / Number(maxFlow)) * 100).toFixed(2) + '%';
  };

  // Sorting function
  const sortTransfers = (transfers) => {
    if (!sortConfig.key) return transfers;

    return [...transfers].sort((a, b) => {
      if (sortConfig.key === 'value' || sortConfig.key === 'fraction') {
        const aValue = Number(sortConfig.key === 'value' ? a.value : (a.value / maxFlow));
        const bValue = Number(sortConfig.key === 'value' ? b.value : (b.value / maxFlow));
        return sortConfig.direction === 'ascending' ? aValue - bValue : bValue - aValue;
      }
      
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'ascending' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'ascending' ? 1 : -1;
      }
      return 0;
    });
  };

  // Handle sorting
  const requestSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  // Get sort direction icon
  const getSortIcon = (columnKey) => {
    if (sortConfig.key !== columnKey) {
      return <ChevronDown className="opacity-20" size={16} />;
    }
    return sortConfig.direction === 'ascending' ? 
      <ChevronUp className="text-blue-500" size={16} /> : 
      <ChevronDown className="text-blue-500" size={16} />;
  };

  // Generate unique ID for a transaction
  const getTransactionId = (transfer) => `${transfer.from}-${transfer.to}-${transfer.tokenOwner}`;

  const sortedTransfers = sortTransfers(transfers);

  return (
    <div className="w-full overflow-x-auto shadow-sm rounded-lg border">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 text-gray-600">
          <tr>
            <th 
              className="px-6 py-3 cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => requestSort('from')}
            >
              <div className="flex items-center gap-1">
                From {getSortIcon('from')}
              </div>
            </th>
            <th 
              className="px-6 py-3 cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => requestSort('to')}
            >
              <div className="flex items-center gap-1">
                To {getSortIcon('to')}
              </div>
            </th>
            <th 
              className="px-6 py-3 cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => requestSort('tokenOwner')}
            >
              <div className="flex items-center gap-1">
                Token {getSortIcon('tokenOwner')}
              </div>
            </th>
            <th 
              className="px-6 py-3 cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => requestSort('value')}
            >
              <div className="flex items-center gap-1">
                Value {getSortIcon('value')}
              </div>
            </th>
            <th 
              className="px-6 py-3 cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => requestSort('fraction')}
            >
              <div className="flex items-center gap-1">
                Fraction {getSortIcon('fraction')}
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sortedTransfers.map((transfer) => {
            const transactionId = getTransactionId(transfer);
            return (
              <tr 
                key={transactionId}
                className={`
                  hover:bg-gray-50 cursor-pointer
                  ${selectedTransactionId === transactionId ? 'bg-blue-50' : ''}
                `}
                onClick={() => onTransactionSelect(transactionId)}
              >
                <td className="px-6 py-4 font-mono text-xs break-all">{transfer.from}</td>
                <td className="px-6 py-4 font-mono text-xs break-all">{transfer.to}</td>
                <td className="px-6 py-4 font-mono text-xs break-all">{transfer.tokenOwner}</td>
                <td className="px-6 py-4">{formatValue(transfer.value)}</td>
                <td className="px-6 py-4">{calculateFraction(transfer.value)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default TransactionTable;