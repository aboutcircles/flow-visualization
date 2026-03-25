import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

const TransactionTable = ({
  routes,
  selectedRouteIds,
  onToggleRoute,
  onToggleAllRoutes,
  maxFlow,
  onTransactionSelect,
  selectedTransactionId,
  nodeProfiles,
  tokenInfo,
  routeTokenInfoByIndex,
  tokenMetaByTokenOwner,
  showNames = true
}) => {
  const [expandedRoutes, setExpandedRoutes] = useState(new Set());

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

  const getTokenMeta = (edge) => {
    const tokenOwner = edge?.tokenOwner;
    if (!tokenOwner) return { isWrapped: false, cadence: null };

    const normalizedOwner = tokenOwner.toLowerCase();

    const tokenData =
      routeTokenInfoByIndex?.[edge?.originalTransferIdx] ||
      tokenInfo?.[normalizedOwner] ||
      tokenMetaByTokenOwner?.[normalizedOwner];

    const isWrapped = tokenData?.isWrapped || tokenData?.type?.includes('ERC20Wrapper') || false;
    const cadence = typeof tokenData?.isInflationary === 'boolean'
      ? (tokenData.isInflationary ? 'Static' : 'Demurraged')
      : null;

    return { isWrapped, cadence };
  };

  const renderTokenBadges = (edge) => {
    const { isWrapped, cadence } = getTokenMeta(edge);

    // Route badges are only shown for wrapped tokens, and only as cadence
    // (Static/Demurraged). Regular CRC is the default and stays unlabeled.
    if (!isWrapped || !cadence) return null;

    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-indigo-100 text-indigo-800 border border-indigo-200">
        {cadence}
      </span>
    );
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
            <th className="px-4 py-3">Route</th>
            <th className="px-4 py-3">Hops</th>
            <th className="px-4 py-3">Flow (CRC)</th>
            <th className="px-4 py-3">% of Max</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {sortedRoutes.map((route) => {
            const isSelected = selectedRouteIds.has(route.id);
            const isExpanded = expandedRoutes.has(route.id);

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
                    <div className="flex flex-wrap items-center gap-1.5">
                      {route.edges.map((edge, idx) => (
                        <React.Fragment key={`${route.id}-path-${idx}`}>
                          <span>{displayAddr(edge.from)}</span>
                          <span className="text-gray-400">→</span>
                          <span>{displayAddr(edge.to)}</span>
                          {renderTokenBadges(edge)}
                          {idx < route.edges.length - 1 && <span className="text-gray-300 mx-1">|</span>}
                        </React.Fragment>
                      ))}
                    </div>
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
                        {renderTokenBadges(edge)}
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
