import React, {useState} from 'react';
import {ChevronDown, ChevronUp} from 'lucide-react';

/**
 * profiles: Record<addressLowercase, { name?: string; image?: string; avatar?: string }>
 */
const TransactionTable = ({
                            transfers,
                            maxFlow,
                            onTransactionSelect,
                            selectedTransactionId,
                            profiles = {}
                          }) => {
  const [sortConfig, setSortConfig] = useState({key: null, direction: 'ascending'});

  // ──────────────────────────────────────────────────────────── helpers
  const formatValue = (v) => {
    const num = Number(v) / 1e18;
    return num < 0.000001 ? num.toExponential(6) : num.toFixed(6);
  };
  const fraction = (v) => ((Number(v) / Number(maxFlow)) * 100).toFixed(2) + '%';

  const sortTransfers = (arr) => {
    if (!sortConfig.key) return arr;
    return [...arr].sort((a, b) => {
      if (sortConfig.key === 'value' || sortConfig.key === 'fraction') {
        const av = Number(sortConfig.key === 'value' ? a.value : a.value / maxFlow);
        const bv = Number(sortConfig.key === 'value' ? b.value : b.value / maxFlow);
        return sortConfig.direction === 'ascending' ? av - bv : bv - av;
      }
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'ascending' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'ascending' ? 1 : -1;
      return 0;
    });
  };

  const requestSort = (key) =>
    setSortConfig((cfg) => ({
      key,
      direction: cfg.key === key && cfg.direction === 'ascending' ? 'descending' : 'ascending'
    }));

  const sortIcon = (col) =>
    sortConfig.key !== col ? (
      <ChevronDown className="opacity-20" size={16}/>
    ) : sortConfig.direction === 'ascending' ? (
      <ChevronUp className="text-blue-500" size={16}/>
    ) : (
      <ChevronDown className="text-blue-500" size={16}/>
    );

  const rowId = (t) => `${t.from}-${t.to}-${t.tokenOwner}`;

  // ───────────────────────────── render helpers
  const PartyCell = ({addr}) => {
    const p = profiles[addr.toLowerCase()] || {};
    const img = p.previewImageUrl || null;
    return (
      <div className="flex items-center gap-2 min-w-0">
        {img ? (
          <img src={img} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0"/>
        ) : (
          <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0"/>
        )}
        <div className="min-w-0">
          <div className="text-[10px] text-gray-500 font-mono truncate max-w-[150px]">{addr}</div>
          <div className="text-sm font-medium truncate max-w-[150px]">{p.name || '—'}</div>
        </div>
      </div>
    );
  };

  const data = sortTransfers(transfers);

  // ──────────────────────────────────────────────────────────── JSX
  return (
    <div className="w-full overflow-x-auto shadow-sm rounded-lg border">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 text-gray-600">
        <tr>
          <th className="px-4 py-3 cursor-pointer" onClick={() => requestSort('from')}>
            <div className="flex items-center gap-1">From {sortIcon('from')}</div>
          </th>
          <th className="px-4 py-3 cursor-pointer" onClick={() => requestSort('to')}>
            <div className="flex items-center gap-1">To {sortIcon('to')}</div>
          </th>
          <th className="px-4 py-3 cursor-pointer" onClick={() => requestSort('tokenOwner')}>
            <div className="flex items-center gap-1">Token {sortIcon('tokenOwner')}</div>
          </th>
          <th className="px-4 py-3 cursor-pointer" onClick={() => requestSort('value')}>
            <div className="flex items-center gap-1">Value {sortIcon('value')}</div>
          </th>
          <th className="px-4 py-3 cursor-pointer" onClick={() => requestSort('fraction')}>
            <div className="flex items-center gap-1">Fraction {sortIcon('fraction')}</div>
          </th>
        </tr>
        </thead>

        <tbody className="bg-white divide-y divide-gray-200">
        {data.map((t) => {
          const id = rowId(t);
          return (
            <tr
              key={id}
              onClick={() => onTransactionSelect(id)}
              className={`hover:bg-gray-50 cursor-pointer ${
                selectedTransactionId === id ? 'bg-blue-50' : ''
              }`}
            >
              <td className="px-4 py-3"><PartyCell addr={t.from}/></td>
              <td className="px-4 py-3"><PartyCell addr={t.to}/></td>
              <td className="px-4 py-3"><PartyCell addr={t.tokenOwner}/></td>
              <td className="px-4 py-3">{formatValue(t.value)}</td>
              <td className="px-4 py-3">{fraction(t.value)}</td>
            </tr>
          );
        })}
        </tbody>
      </table>
    </div>
  );
};

export default React.memo(TransactionTable);

