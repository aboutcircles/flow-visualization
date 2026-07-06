import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { ChevronDown, ChevronRight } from 'lucide-react';

// Renders the pathfinder's `debug` pipeline stages (returned when
// debugShowIntermediateSteps=true). Each stage is a list of transfer steps
// { from, to, tokenOwner, value } at a point in the transformation pipeline:
//   rawPaths       — solver output with token-pool nodes (tpool-0x…)
//   collapsed      — pools removed, avatar → avatar flows aggregated
//   routerInserted — group mints routed (avatar → router → group)
//   sorted         — final on-chain execution order (collateral before mints)
const STAGES = [
  { key: 'rawPaths', label: '1 · Raw paths', hint: 'Solver output with token-pool nodes' },
  { key: 'collapsed', label: '2 · Collapsed', hint: 'Pools removed, flows aggregated' },
  { key: 'routerInserted', label: '3 · Router inserted', hint: 'Group mints routed via router' },
  { key: 'sorted', label: '4 · Sorted', hint: 'Final on-chain execution order' },
];

const short = (address) => {
  if (typeof address !== 'string' || address.length < 12) return address ?? '';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
};

const toCrc = (weiString) => {
  try {
    const wei = BigInt(weiString);
    // Whole-CRC with 3 decimals, without floating-point error on large uint256 values.
    const whole = wei / 10n ** 18n;
    const frac = (wei % 10n ** 18n) / 10n ** 15n; // 3 decimal places
    return `${whole}.${frac.toString().padStart(3, '0')}`;
  } catch {
    return String(weiString ?? '');
  }
};

const StageSection = ({ stage, steps }) => {
  const [open, setOpen] = useState(false);
  const count = steps.length;

  return (
    <div className="rounded-md border border-input">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {stage.label}
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-normal text-gray-600">
            {count} step{count === 1 ? '' : 's'}
          </span>
        </span>
        <span className="text-[11px] font-normal text-gray-400">{stage.hint}</span>
      </button>
      {open && count > 0 && (
        <div className="overflow-x-auto border-t">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-1.5 font-semibold">from</th>
                <th className="px-3 py-1.5 font-semibold">to</th>
                <th className="px-3 py-1.5 font-semibold">token</th>
                <th className="px-3 py-1.5 text-right font-semibold">CRC</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step, index) => (
                <tr key={`${stage.key}-${index}`} className="border-t border-gray-100">
                  <td className="px-3 py-1" title={step.from}>{short(step.from)}</td>
                  <td className="px-3 py-1" title={step.to}>{short(step.to)}</td>
                  <td className="px-3 py-1" title={step.tokenOwner}>{short(step.tokenOwner)}</td>
                  <td className="px-3 py-1 text-right">{toCrc(step.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && count === 0 && (
        <p className="border-t px-3 py-2 text-xs text-gray-400">No steps at this stage.</p>
      )}
    </div>
  );
};

StageSection.propTypes = {
  stage: PropTypes.shape({
    key: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    hint: PropTypes.string.isRequired,
  }).isRequired,
  steps: PropTypes.array.isRequired,
};

const DebugStagesView = ({ debug }) => {
  if (!debug) {
    return (
      <p className="text-sm text-gray-500">
        No debug stages. Enable “Debug Intermediate Steps” in the form and run Find Path.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Pathfinder transformation pipeline (from “Debug Intermediate Steps”). Each stage shows the
        transfer steps as they are collapsed, routed, and sorted for on-chain execution.
      </p>
      {STAGES.map((stage) => (
        <StageSection key={stage.key} stage={stage} steps={Array.isArray(debug[stage.key]) ? debug[stage.key] : []} />
      ))}
    </div>
  );
};

DebugStagesView.propTypes = {
  debug: PropTypes.shape({
    rawPaths: PropTypes.array,
    collapsed: PropTypes.array,
    routerInserted: PropTypes.array,
    sorted: PropTypes.array,
  }),
};

export default DebugStagesView;
