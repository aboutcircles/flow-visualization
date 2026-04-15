import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import TokenInput from '@/components/ui/token-input';
import ToggleSwitch from '@/components/ui/toggle-switch';
import InfoTip from '@/components/ui/info-tip';
import { parseAddressList } from '@/services/circlesApi';
import * as SliderPrimitive from '@radix-ui/react-slider';

const BALANCES_GRID_COLUMNS = ['holder', 'token', 'amount', 'isWrapped', 'isStatic'];
const TRUSTS_GRID_COLUMNS = ['truster', 'trustee'];
const EMPTY_BALANCE_ROW = { holder: '', token: '', amount: '', isWrapped: false, isStatic: false };
const EMPTY_TRUST_ROW = { truster: '', trustee: '' };

const toGridText = (rows, columns) => rows
  .map((row) => columns.map((column) => {
    const value = row?.[column];
    return typeof value === 'boolean' ? String(value) : `${value ?? ''}`;
  }).join('\t'))
  .join('\n');

const parseBooleanCell = (value) => {
  const normalized = (value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y';
};

const parseGridText = (text, columns) => {
  const lines = (text || '').replace(/\r/g, '').split('\n');

  return lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const values = line.includes('\t')
        ? line.split('\t')
        : line.split(',');

      return columns.reduce((acc, column, index) => {
        const raw = (values[index] || '').trim();
        if (column === 'isWrapped' || column === 'isStatic') {
          acc[column] = parseBooleanCell(raw);
        } else {
          acc[column] = raw;
        }
        return acc;
      }, {});
    });
};

const PathFinderForm = ({
  formData,
  formErrors,
  formWarnings,
  handleInputChange,
  handleTokensChange,
  handleWithWrapToggle,
  handleStagingToggle,
  handleTestEnvToggle,
  handleTestEnvUrlChange,
  handleTestEnvBlockNumberChange,
  handleQuantizedModeToggle,
  handleDebugIntermediateToggle,
  testEnvSession,
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
  boundMax,
  routeSelectionInfo
}) => {
  const fromTokensRef = useRef(null);
  const toTokensRef = useRef(null);
  const [isSimulationEditorOpen, setIsSimulationEditorOpen] = useState(false);
  const [simulationBalanceRows, setSimulationBalanceRows] = useState([]);
  const [simulationTrustRows, setSimulationTrustRows] = useState([]);
  const [simulationConsentedRows, setSimulationConsentedRows] = useState([]);

  const parsedSimulatedBalances = useMemo(() => {
    try {
      const parsed = JSON.parse(formData.SimulatedBalances || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [formData.SimulatedBalances]);

  const parsedSimulatedTrusts = useMemo(() => {
    try {
      const parsed = JSON.parse(formData.SimulatedTrusts || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [formData.SimulatedTrusts]);

  const openSimulationEditor = () => {
    setSimulationBalanceRows(parsedSimulatedBalances.map((row) => ({
      holder: `${row?.holder || ''}`,
      token: `${row?.token || ''}`,
      amount: `${row?.amount || ''}`,
      isWrapped: Boolean(row?.isWrapped),
      isStatic: Boolean(row?.isStatic),
    })));
    setSimulationTrustRows(parsedSimulatedTrusts.map((row) => ({
      truster: `${row?.truster || ''}`,
      trustee: `${row?.trustee || ''}`,
    })));
    setSimulationConsentedRows(parseAddressList(formData.SimulatedConsentedAvatars));
    setIsSimulationEditorOpen(true);
  };

  const closeSimulationEditor = () => {
    setIsSimulationEditorOpen(false);
  };

  const updateBalanceRow = (index, field, value) => {
    setSimulationBalanceRows((prev) => prev.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [field]: value } : row
    )));
  };

  const updateTrustRow = (index, field, value) => {
    setSimulationTrustRows((prev) => prev.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [field]: value } : row
    )));
  };

  const updateConsentedRow = (index, value) => {
    setSimulationConsentedRows((prev) => prev.map((row, rowIndex) => (
      rowIndex === index ? value : row
    )));
  };

  const appendEmptyBalanceRow = () => {
    setSimulationBalanceRows((prev) => [...prev, { ...EMPTY_BALANCE_ROW }]);
  };

  const appendEmptyTrustRow = () => {
    setSimulationTrustRows((prev) => [...prev, { ...EMPTY_TRUST_ROW }]);
  };

  const appendEmptyConsentedRow = () => {
    setSimulationConsentedRows((prev) => [...prev, '']);
  };

  const removeBalanceRow = (index) => {
    setSimulationBalanceRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const removeTrustRow = (index) => {
    setSimulationTrustRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const removeConsentedRow = (index) => {
    setSimulationConsentedRows((prev) => prev.filter((_, rowIndex) => rowIndex !== index));
  };

  const saveSimulationEditor = () => {
    const cleanedBalances = simulationBalanceRows
      .map((row) => ({
        holder: (row.holder || '').trim(),
        token: (row.token || '').trim(),
        amount: (row.amount || '').trim(),
        isWrapped: Boolean(row.isWrapped),
        isStatic: Boolean(row.isStatic),
      }))
      .filter((row) => row.holder || row.token || row.amount);

    const cleanedTrusts = simulationTrustRows
      .map((row) => ({
        truster: (row.truster || '').trim(),
        trustee: (row.trustee || '').trim(),
      }))
      .filter((row) => row.truster || row.trustee);

    const cleanedConsentedAvatars = parseAddressList(simulationConsentedRows.join(','));

    handleInputChange({
      target: {
        name: 'SimulatedBalances',
        value: JSON.stringify(cleanedBalances),
      }
    });
    handleInputChange({
      target: {
        name: 'SimulatedTrusts',
        value: JSON.stringify(cleanedTrusts),
      }
    });
    handleInputChange({
      target: {
        name: 'SimulatedConsentedAvatars',
        value: cleanedConsentedAvatars.join(','),
      }
    });
    closeSimulationEditor();
  };

  const normalizeSimulationGridText = () => {
    const normalizedBalances = parseGridText(toGridText(simulationBalanceRows, BALANCES_GRID_COLUMNS), BALANCES_GRID_COLUMNS)
      .map((row) => ({
        holder: (row.holder || '').trim(),
        token: (row.token || '').trim(),
        amount: (row.amount || '').trim(),
        isWrapped: Boolean(row.isWrapped),
        isStatic: Boolean(row.isStatic),
      }))
      .filter((row) => row.holder || row.token || row.amount);

    const normalizedTrusts = parseGridText(toGridText(simulationTrustRows, TRUSTS_GRID_COLUMNS), TRUSTS_GRID_COLUMNS)
      .map((row) => ({
        truster: (row.truster || '').trim(),
        trustee: (row.trustee || '').trim(),
      }))
      .filter((row) => row.truster || row.trustee);

    const normalizedConsented = parseAddressList(simulationConsentedRows.join(','));

    setSimulationBalanceRows(normalizedBalances);
    setSimulationTrustRows(normalizedTrusts);
    setSimulationConsentedRows(normalizedConsented);
  };

  useEffect(() => {
    if (!isSimulationEditorOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSimulationEditor();
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        saveSimulationEditor();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isSimulationEditorOpen, simulationBalanceRows, simulationTrustRows, simulationConsentedRows]);

  const handleFindPath = () => {
    // Auto-add any typed-but-not-submitted tokens, then pass patched formData
    // to avoid stale closure issues with onFindPath
    let patched = { ...formData };

    const fromPending = fromTokensRef.current?.getPending?.();
    if (fromPending) {
      fromTokensRef.current.flushPending(); // visual update
      const field = formData.IsFromTokensExcluded ? 'ExcludedFromTokens' : 'FromTokens';
      const current = parseAddressList(patched[field]);
      patched[field] = [...current, fromPending].join(',');
    }

    const toPending = toTokensRef.current?.getPending?.();
    if (toPending) {
      toTokensRef.current.flushPending(); // visual update
      const field = formData.IsToTokensExcluded ? 'ExcludedToTokens' : 'ToTokens';
      const current = parseAddressList(patched[field]);
      patched[field] = [...current, toPending].join(',');
    }

    onFindPath(fromPending || toPending ? patched : undefined);
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            From Address
            <InfoTip text="The sender's avatar address. The pathfinder finds token flows from this address to the recipient." />
          </label>
          <Input
            name="from"
            value={formData.From}
            onChange={handleInputChange}
            placeholder="0x..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            To Address
            <InfoTip text="The recipient's avatar address. Must trust (directly or transitively) the tokens being sent." />
          </label>
          <Input
            name="to"
            value={formData.To}
            onChange={handleInputChange}
            placeholder="0x..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Value (in CRC)
            <InfoTip text="Amount to transfer in CRC (not wei). The pathfinder will find the cheapest route for this amount, or return the max possible flow if insufficient." />
          </label>
          <Input
            name="crcAmount"
            value={formData.crcAmount}
            onChange={handleInputChange}
            placeholder="Enter amount in CRC..."
            type="text"
            inputMode="decimal"
          />
        </div>

        {/* Token input components for multiple tokens */}
        <TokenInput
          ref={fromTokensRef}
          value={formData.IsFromTokensExcluded ? formData.ExcludedFromTokens : formData.FromTokens}
          onChange={(value) => handleTokensChange('FromTokens', value)}
          placeholder="0x..."
          label="From Tokens (Add multiple)"
          isExcluded={formData.IsFromTokensExcluded}
          onExclusionToggle={handleFromTokensExclusionToggle}
          infoTip="Restrict which tokens the sender can use. Toggle 'Exclude' to instead block specific tokens."
        />

        <TokenInput
          ref={toTokensRef}
          value={formData.IsToTokensExcluded ? formData.ExcludedToTokens : formData.ToTokens}
          onChange={(value) => handleTokensChange('ToTokens', value)}
          placeholder="0x..."
          label="To Tokens (Add multiple)"
          isExcluded={formData.IsToTokensExcluded}
          onExclusionToggle={handleToTokensExclusionToggle}
          infoTip="Restrict which tokens the recipient accepts. Toggle 'Exclude' to instead block specific tokens."
        />

        <div className="flex items-center">
          <ToggleSwitch
            isEnabled={formData.WithWrap}
            onToggle={handleWithWrapToggle}
            label="Include Wrapped Tokens"
          />
          <InfoTip text="Allow the pathfinder to use ERC20-wrapped Circles tokens. Wrapped tokens have broader trust acceptance but require unwrap/wrap operations before the on-chain transfer." />
        </div>
        <div className="flex items-center">
          <ToggleSwitch
            isEnabled={formData.UseStaging}
            onToggle={handleStagingToggle}
            label="Use Staging Endpoint"
          />
          <InfoTip text={`Prod: rpc.aboutcircles.com\nStaging: staging.circlesubi.network\n\nCurrently using: ${formData.UseStaging ? 'staging.circlesubi.network' : 'rpc.aboutcircles.com'}`} />
        </div>
        <div className="flex items-center">
          <ToggleSwitch
            isEnabled={formData.UseTestEnv}
            onToggle={handleTestEnvToggle}
            label="Test Environment"
          />
          <InfoTip text="Run pathfinder against historical blockchain state at a specific block number. Creates a test-env session that filters all data to that block." />
        </div>
        {formData.UseTestEnv && (
          <div className="ml-4 space-y-2 border-l-2 border-blue-500/30 pl-3">
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-400">Test-Env URL</label>
              <Input
                type="text"
                value={formData.TestEnvUrl}
                onChange={handleTestEnvUrlChange}
                className="text-xs"
                placeholder="https://staging.circlesubi.network/test-env"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-gray-400">Block Number</label>
              <Input
                type="text"
                value={formData.TestEnvBlockNumber}
                onChange={handleTestEnvBlockNumberChange}
                className="text-xs"
                placeholder="e.g. 43193632"
              />
            </div>
            {testEnvSession && (
              <div className="text-xs text-green-400 bg-green-900/20 rounded p-2">
                Session active at block {testEnvSession.blockNumber}
                {testEnvSession.expiresAt && (
                  <span className="text-gray-500 ml-1">
                    (expires {new Date(testEnvSession.expiresAt).toLocaleTimeString()})
                  </span>
                )}
              </div>
            )}
            {formData.UseTestEnv && !formData.TestEnvBlockNumber && (
              <div className="text-xs text-yellow-400">Enter a block number to query historical state</div>
            )}
          </div>
        )}
        <div className="flex items-center opacity-40 pointer-events-none" title="Not yet supported by SDK">
          <ToggleSwitch
            isEnabled={formData.QuantizedMode}
            onToggle={handleQuantizedModeToggle}
            label="Quantized Mode"
          />
          <InfoTip text="Not yet supported — awaiting SDK update. Will enable 96 CRC quantization semantics." />
        </div>
        <div className="flex items-center opacity-40 pointer-events-none" title="Not yet supported by SDK">
          <ToggleSwitch
            isEnabled={formData.DebugShowIntermediateSteps}
            onToggle={handleDebugIntermediateToggle}
            label="Debug Intermediate Steps"
          />
          <InfoTip text="Not yet supported — awaiting SDK update. Will request intermediate debug details from pathfinder." />
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
        <div className="space-y-2">
          <label className="block text-sm font-medium mb-1">
            Simulations
            <InfoTip text="Open an editor with dedicated grids for simulated balances and simulated trusts." />
          </label>
          <div className="rounded-md border border-input p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-gray-500">
                Balances: {parsedSimulatedBalances.length} · Trusts: {parsedSimulatedTrusts.length}
              </div>
              <Button type="button" onClick={openSimulationEditor}>Edit simulations</Button>
            </div>
            <p className="text-xs text-gray-500">
              Edit simulated balances and trusts for hypothetical pathfinding scenarios.
            </p>
          </div>
          {formErrors?.SimulatedBalances && <p className="text-xs text-red-600">{formErrors.SimulatedBalances}</p>}
          {formErrors?.SimulatedTrusts && <p className="text-xs text-red-600">{formErrors.SimulatedTrusts}</p>}
        </div>
        <div className="opacity-40 pointer-events-none" title="Not yet supported by SDK">
          <label className="block text-sm font-medium mb-1">
            Simulated Consented Avatars
            <InfoTip text='Not yet supported — awaiting SDK update. Will accept comma/space separated avatar addresses.' />
          </label>
          <Input
            name="SimulatedConsentedAvatars"
            value={formData.SimulatedConsentedAvatars}
            onChange={handleInputChange}
            placeholder="0x...,0x..."
            disabled
          />
          {formErrors?.SimulatedConsentedAvatars && <p className="mt-1 text-xs text-red-600">{formErrors.SimulatedConsentedAvatars}</p>}
        </div>

        {(formErrors?.From || formErrors?.To || formErrors?.Amount) && (
          <p className="text-xs text-red-600">
            {formErrors.From || formErrors.To || formErrors.Amount}
          </p>
        )}
        {Array.isArray(formWarnings) && formWarnings.length > 0 && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 space-y-1">
            {formWarnings.map((warning, index) => (
              <p key={`${warning}-${index}`}>{warning}</p>
            ))}
          </div>
        )}

        {pathData && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Route flow: {minCapacity.toFixed(3)} → {maxCapacity.toFixed(3)} CRC
              <InfoTip text="Filter routes by their flow value (CRC). Each route is a complete source→sink path. Routes with flow outside this range are excluded from the graph and calldata." />
            </label>
            {routeSelectionInfo && (
              <p className="text-xs text-indigo-600 mb-1">
                {routeSelectionInfo.count}/{routeSelectionInfo.total} routes selected — {routeSelectionInfo.flow.toFixed(3)} CRC total
              </p>
            )}
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
          onClick={handleFindPath}
          disabled={isLoading}
        >
          {isLoading ? 'Finding Path...' : 'Find Path'}
        </Button>

        {isSimulationEditorOpen && typeof document !== 'undefined' && createPortal(
          <div
            className="fixed inset-0 z-[1000] bg-slate-950/65 backdrop-blur-[2px] p-4 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="simulation-editor-title"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                closeSimulationEditor();
              }
            }}
          >
            <div className="mx-auto flex h-full w-full max-w-[1440px] items-center justify-center">
              <div className="flex h-[min(900px,calc(100vh-2rem))] w-full flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl sm:h-[min(900px,calc(100vh-3rem))]">
                <div className="flex items-start justify-between gap-4 border-b bg-gray-50 px-5 py-4">
                  <div className="space-y-1">
                    <h3 id="simulation-editor-title" className="text-base font-semibold tracking-tight">Simulation Editor</h3>
                    <p className="text-xs text-gray-500">
                      Edit simulated balances and trusts in a structured data grid.
                    </p>
                  </div>
                  <Button type="button" className="h-8 px-3" onClick={closeSimulationEditor}>Close</Button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <div className="overflow-hidden rounded-xl border bg-white">
                      <div className="flex items-center justify-between border-b px-4 py-3">
                        <h4 className="text-sm font-semibold">Simulated Balances</h4>
                        <Button type="button" className="h-8 px-3" onClick={appendEmptyBalanceRow}>Add row</Button>
                      </div>
                      <div className="space-y-3 p-4">
                        <div className="grid grid-cols-[1fr_1fr_1fr_60px_52px_64px] gap-2 rounded-md border bg-gray-100 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          <span>holder</span>
                          <span>token</span>
                          <span>amount</span>
                          <span>wrapped</span>
                          <span>static</span>
                          <span className="text-right">action</span>
                        </div>
                        <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
                          {simulationBalanceRows.map((row, index) => (
                            <div key={`balance-row-${index}`} className="grid grid-cols-[1fr_1fr_1fr_60px_52px_64px] gap-2 rounded-md border border-transparent bg-gray-50/50 p-1.5 hover:border-gray-200 hover:bg-gray-50">
                              <Input value={row.holder} onChange={(event) => updateBalanceRow(index, 'holder', event.target.value)} placeholder="0xholder" className="h-8 font-mono text-xs" />
                              <Input value={row.token} onChange={(event) => updateBalanceRow(index, 'token', event.target.value)} placeholder="0xtoken" className="h-8 font-mono text-xs" />
                              <Input value={row.amount} onChange={(event) => updateBalanceRow(index, 'amount', event.target.value)} placeholder="1000000000000000000" className="h-8 font-mono text-xs" />
                              <label className="flex h-8 items-center justify-center gap-1 rounded-md border bg-white px-2 text-[11px] font-medium">
                                <input type="checkbox" checked={Boolean(row.isWrapped)} onChange={(event) => updateBalanceRow(index, 'isWrapped', event.target.checked)} />
                                yes
                              </label>
                              <label className="flex h-8 items-center justify-center gap-1 rounded-md border bg-white px-2 text-[11px] font-medium">
                                <input type="checkbox" checked={Boolean(row.isStatic)} onChange={(event) => updateBalanceRow(index, 'isStatic', event.target.checked)} />
                                yes
                              </label>
                              <Button type="button" className="h-8 px-2 text-xs" onClick={() => removeBalanceRow(index)}>Remove</Button>
                            </div>
                          ))}
                        </div>
                        <p className="text-[11px] text-gray-500">One editable row per simulated balance.</p>
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-xl border bg-white">
                      <div className="flex items-center justify-between border-b px-4 py-3">
                        <h4 className="text-sm font-semibold">Simulated Trusts</h4>
                        <Button type="button" className="h-8 px-3" onClick={appendEmptyTrustRow}>Add row</Button>
                      </div>
                      <div className="space-y-3 p-4">
                        <div className="grid grid-cols-[1fr_1fr_86px] gap-2 rounded-md border bg-gray-100 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          <span>truster</span>
                          <span>trustee</span>
                          <span className="text-right">action</span>
                        </div>
                        <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
                          {simulationTrustRows.map((row, index) => (
                            <div key={`trust-row-${index}`} className="grid grid-cols-[1fr_1fr_86px] gap-2 rounded-md border border-transparent bg-gray-50/50 p-1.5 hover:border-gray-200 hover:bg-gray-50">
                              <Input value={row.truster} onChange={(event) => updateTrustRow(index, 'truster', event.target.value)} placeholder="0xtruster" className="h-8 font-mono text-xs" />
                              <Input value={row.trustee} onChange={(event) => updateTrustRow(index, 'trustee', event.target.value)} placeholder="0xtrustee" className="h-8 font-mono text-xs" />
                              <Button type="button" className="h-8 px-2 text-xs" onClick={() => removeTrustRow(index)}>Remove</Button>
                            </div>
                          ))}
                        </div>
                        <p className="text-[11px] text-gray-500">One editable row per trust edge.</p>
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-xl border bg-white opacity-40 pointer-events-none">
                      <div className="flex items-center justify-between border-b px-4 py-3">
                        <h4 className="text-sm font-semibold">Simulated Consented Avatars <span className="text-xs font-normal text-gray-500">(not yet supported by SDK)</span></h4>
                        <Button type="button" className="h-8 px-3" onClick={appendEmptyConsentedRow}>Add row</Button>
                      </div>
                      <div className="space-y-3 p-4">
                        <div className="grid grid-cols-[1fr_86px] gap-2 rounded-md border bg-gray-100 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                          <span>avatar</span>
                          <span className="text-right">action</span>
                        </div>
                        <div className="max-h-[48vh] space-y-2 overflow-y-auto pr-1">
                          {simulationConsentedRows.map((row, index) => (
                            <div key={`consented-row-${index}`} className="grid grid-cols-[1fr_86px] gap-2 rounded-md border border-transparent bg-gray-50/50 p-1.5 hover:border-gray-200 hover:bg-gray-50">
                              <Input value={row} onChange={(event) => updateConsentedRow(index, event.target.value)} placeholder="0xavatar" className="h-8 font-mono text-xs" />
                              <Button type="button" className="h-8 px-2 text-xs" onClick={() => removeConsentedRow(index)}>Remove</Button>
                            </div>
                          ))}
                        </div>
                        <p className="text-[11px] text-gray-500">One editable row per consented avatar.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-gray-50 px-5 py-3">
                  <div className="text-xs text-gray-500">Shortcuts: Ctrl/Cmd+Enter = Apply, Esc = Cancel</div>
                  <div className="flex items-center gap-2">
                    <Button type="button" className="h-8 px-3" onClick={normalizeSimulationGridText}>Normalize</Button>
                    <Button type="button" className="h-8 px-3" onClick={() => { setSimulationBalanceRows([]); setSimulationTrustRows([]); setSimulationConsentedRows([]); }}>Clear</Button>
                    <Button type="button" className="h-8 px-3" onClick={closeSimulationEditor}>Cancel</Button>
                    <Button type="button" className="h-8 px-4" onClick={saveSimulationEditor}>Apply</Button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
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
    QuantizedMode: PropTypes.bool.isRequired,
    DebugShowIntermediateSteps: PropTypes.bool.isRequired,
    SimulatedBalances: PropTypes.string.isRequired,
    SimulatedTrusts: PropTypes.string.isRequired,
    SimulatedConsentedAvatars: PropTypes.string.isRequired,
  }).isRequired,
  formErrors: PropTypes.object,
  formWarnings: PropTypes.arrayOf(PropTypes.string),
  handleInputChange: PropTypes.func.isRequired,
  handleTokensChange: PropTypes.func.isRequired,
  handleWithWrapToggle: PropTypes.func.isRequired,
  handleStagingToggle: PropTypes.func.isRequired,
  handleTestEnvToggle: PropTypes.func.isRequired,
  handleTestEnvUrlChange: PropTypes.func.isRequired,
  handleTestEnvBlockNumberChange: PropTypes.func.isRequired,
  handleQuantizedModeToggle: PropTypes.func.isRequired,
  testEnvSession: PropTypes.object,
  handleDebugIntermediateToggle: PropTypes.func.isRequired,
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