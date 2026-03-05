import React, { useState } from 'react';
import { ChevronDown, ChevronRight, User, Hash } from 'lucide-react';

const TransactionTable = ({
  routes,
  selectedRouteIds,
  onToggleRoute,
  onToggleAllRoutes,
  maxFlow,
  onTransactionSelect,
  selectedTransactionId,
  nodeProfiles
}) => {
  const [expandedRoutes, setExpandedRoutes] = useState(new Set());
  const [showNames, setShowNames] = useState(true);

  const formatValue = (value) => {
    const num = Number(value) / 1e18;
    if (num < 0.000001) return num.toExponential(6);
    return num.toFixed(6);
  };

  const calculateFraction = (value) => {
    return ((Number(value) / Number(maxFlow)) * 100).toFixed(2) + '%';
  };

  const toggleExpand = (routeId) => {
    setExpandedRoutes(prev => {
      const next = new Set(prev);
      if (next.has(routeId)) next.delete(routeId);
      else next.add(routeId);
      return next;
    });
  };

  const shortAddr = (addr) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  const displayAddr = (addr) => {
    if (!showNames || !nodeProfiles) return shortAddr(addr);
    const profile = nodeProfiles[addr.toLowerCase()];
    if (!profile?.name) return shortAddr(addr);
    const name = profile.name;
    return name.length > 16 ? name.slice(0, 15) + '…' : name;
  };

  // Sort routes by flow descending
  const sortedRoutes = [...routes].sort((a, b) => b.flowNum - a.flowNum);

  return (
    <div className="w-full overflow-auto shadow-sm rounded-lg border h-full">
      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10">
          <tr>
            <th className="px-3 py-3 w-10">
              <input
                type="checkbox"
                checked={selectedRouteIds.size === routes.length && routes.length > 0}
                ref={(el) => { if (el) el.indeterminate = selectedRouteIds.size > 0 && selectedRouteIds.size < routes.length; }}
                onChange={onToggleAllRoutes}
                className="rounded border-gray-300"
                title="Select all / none"
              />
            </th>
            <th className="px-3 py-3 w-8"></th>
            <th className="px-4 py-3">
              <div className="flex items-center gap-2">
                Route
                <button
                  onClick={() => setShowNames(v => !v)}
                  className="p-0.5 rounded hover:bg-gray-200 transition-colors"
                  title={showNames ? 'Show addresses' : 'Show names'}
                >
                  {showNames ? <Hash size={13} className="text-gray-400" /> : <User size={13} className="text-gray-400" />}
                </button>
              </div>
            </th>
            <th className="px-4 py-3">Hops</th>
            <th className="px-4 py-3">Flow (CRC)</th>
            <th className="px-4 py-3">% of Max</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sortedRoutes.map((route) => {
            const isSelected = selectedRouteIds.has(route.id);
            const isExpanded = expandedRoutes.has(route.id);
            const path = route.edges.map(e => displayAddr(e.from));
            path.push(displayAddr(route.edges[route.edges.length - 1].to));

            return (
              <React.Fragment key={route.id}>
                <tr
                  className={`
                    hover:bg-gray-50 cursor-pointer
                    ${!isSelected ? 'opacity-40' : ''}
                  `}
                >
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleRoute(route.id)}
                      className="rounded border-gray-300"
                    />
                  </td>
                  <td
                    className="px-3 py-3 cursor-pointer"
                    onClick={() => toggleExpand(route.id)}
                  >
                    {isExpanded
                      ? <ChevronDown size={14} className="text-gray-400" />
                      : <ChevronRight size={14} className="text-gray-400" />
                    }
                  </td>
                  <td
                    className={`px-4 py-3 text-xs text-gray-600 ${showNames ? '' : 'font-mono'}`}
                    onClick={() => toggleExpand(route.id)}
                  >
                    {path.join(' → ')}
                  </td>
                  <td className="px-4 py-3 text-center">{route.edges.length}</td>
                  <td className="px-4 py-3 font-medium">{formatValue(route.flow)}</td>
                  <td className="px-4 py-3">{calculateFraction(route.flow)}</td>
                </tr>
                {isExpanded && route.edges.map((edge, i) => {
                  const edgeId = `${edge.from}-${edge.to}-${edge.tokenOwner}`;
                  return (
                    <tr
                      key={`${route.id}-${i}`}
                      className={`
                        bg-gray-50 text-xs
                        ${selectedTransactionId === edgeId ? 'bg-blue-50' : ''}
                      `}
                      onClick={() => onTransactionSelect(edgeId)}
                    >
                      <td></td>
                      <td className="pl-6 pr-2 py-2 text-gray-300">↳</td>
                      <td className="px-4 py-2 break-all" colSpan={2}>
                        <span className={`text-gray-500 ${showNames ? '' : 'font-mono'}`}>{displayAddr(edge.from)}</span>
                        <span className="mx-1 text-gray-400">→</span>
                        <span className={`text-gray-500 ${showNames ? '' : 'font-mono'}`}>{displayAddr(edge.to)}</span>
                        <span className="ml-2 text-gray-400">token:</span>
                        <span className="ml-1 text-gray-500 font-mono">{shortAddr(edge.tokenOwner)}</span>
                      </td>
                      <td className="px-4 py-2 text-gray-500">{formatValue(edge.flow)}</td>
                      <td className="px-4 py-2 text-gray-400">{calculateFraction(edge.flow)}</td>
                    </tr>
                  );
                })}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default TransactionTable;
