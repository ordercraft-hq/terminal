import React, { useState, useEffect } from 'react';
import {
  X,
  SlidersHorizontal,
  Activity,
  Plus,
  Trash2,
  CandlestickChart,
  ChevronDown,
  ChevronUp,
  Pencil,
} from 'lucide-react';
import { useSyncStore, type OrderflowSettings } from '../../../store/syncStore';
import { ColorPickerPopover } from '../../Common/ColorPickerPopover';
import { isChartTypeSupported } from '../../../utils/chartTypeSupport';

interface ColorSwatchProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
}

const ColorSwatch: React.FC<ColorSwatchProps> = ({ label, value, onChange }) => (
  <div className="flex items-center justify-between py-1">
    <span className="text-xs text-[#d1d4dc]">{label}</span>
    <ColorPickerPopover
      color={value}
      onChange={onChange}
    />
  </div>
);

interface ImbalanceSwatchProps {
  color: string;
  onChange: (val: string) => void;
}

const ImbalanceSwatch: React.FC<ImbalanceSwatchProps> = ({ color, onChange }) => (
  <ColorPickerPopover
    color={color}
    onChange={onChange}
    customTrigger={({ color: c }) => (
      <div className="flex items-center justify-between w-[72px] h-[26px] px-1.5 bg-[#161a25] border border-[#2a2e39] rounded hover:border-[#434651] transition cursor-pointer shrink-0">
        <div
          className="w-10 h-3.5 rounded-sm border border-black/40 relative overflow-hidden"
          style={{
            backgroundImage:
              'linear-gradient(45deg, #363a45 25%, transparent 25%), linear-gradient(-45deg, #363a45 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #363a45 75%), linear-gradient(-45deg, transparent 75%, #363a45 75%)',
            backgroundSize: '6px 6px',
            backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px',
          }}
        >
          <div className="absolute inset-0" style={{ backgroundColor: c }} />
        </div>
        <ChevronDown size={11} className="text-[#787b86]" />
      </div>
    )}
  />
);

export const OrderflowPanel: React.FC = () => {
  const toggleTab = useSyncStore((s) => s.toggleRightSidebarTab);
  const activePaneId = useSyncStore((s) => s.activePaneId || 'pane-1');
  const paneConfig = useSyncStore((s) => s.panes[activePaneId]);
  const fallbackSymbol = useSyncStore((s) => s.symbol);
  const fallbackTimeframe = useSyncStore((s) => s.timeframe);
  const fallbackChartType = useSyncStore((s) => s.chartType);
  const activeSymbol = paneConfig?.symbol || fallbackSymbol;
  const activeTimeframe = paneConfig?.timeframe || fallbackTimeframe;
  const globalSettings = useSyncStore((s) => s.orderflowSettings);
  const settings = paneConfig?.orderflowSettings || globalSettings;
  const updatePaneOrderflowSettings = useSyncStore((s) => s.updatePaneOrderflowSettings);
  const setSettings = (partial: Partial<OrderflowSettings>) => updatePaneOrderflowSettings(activePaneId, partial);
  const chartType = paneConfig?.chartType || fallbackChartType;
  const setChartType = useSyncStore((s) => s.setChartType);

  const addImbalanceRule = useSyncStore((s) => s.addImbalanceRule);
  const updateImbalanceRule = useSyncStore((s) => s.updateImbalanceRule);
  const deleteImbalanceRule = useSyncStore((s) => s.deleteImbalanceRule);
  const setImbalanceGlobalSettings = useSyncStore((s) => s.setImbalanceGlobalSettings);
  const loadImbalanceRulesFromDb = useSyncStore((s) => s.loadImbalanceRulesFromDb);

  useEffect(() => {
    loadImbalanceRulesFromDb();
  }, [loadImbalanceRulesFromDb]);

  // Imbalance Template Builder State
  const [templatePercent, setTemplatePercent] = useState<number>(300);
  const [templateDeltaFilter, setTemplateDeltaFilter] = useState<number>(15);
  const [templateDeltaFilterEnabled, setTemplateDeltaFilterEnabled] = useState<boolean>(true);

  const [templateSellColor, setTemplateSellColor] = useState<string>('#d8b4e2');
  const [templateSellDisplay, setTemplateSellDisplay] = useState<boolean>(true);

  const [templateBuyColor, setTemplateBuyColor] = useState<string>('#8da9c4');
  const [templateBuyDisplay, setTemplateBuyDisplay] = useState<boolean>(true);

  // Active rule edit state
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  const supportResult = isChartTypeSupported(activeSymbol, 'footprint');
  const isL2Supported = supportResult.supported;

  const globalImb = settings.imbalanceGlobalSettings || {
    skipZeroValues: false,
    showStackedImbalances: true,
    showMitigatedZones: true,
    drawZoneBorders: false,
    stackedMinLevels: 3,
  };
  const imbalanceRules = settings.imbalanceRules || [];

  const handleAddImbalanceToChart = async () => {
    await addImbalanceRule({
      name: `${templatePercent}% • Delta ≥ ${templateDeltaFilter}`,
      enabled: true,
      imbalancePercent: templatePercent,
      deltaFilter: templateDeltaFilter,
      deltaFilterEnabled: templateDeltaFilterEnabled,
      sellColor: templateSellColor,
      sellLineWidth: 1.0,
      sellLineStyle: 'solid',
      sellDisplay: templateSellDisplay,
      buyColor: templateBuyColor,
      buyLineWidth: 1.0,
      buyLineStyle: 'solid',
      buyDisplay: templateBuyDisplay,
    });
  };

  const isEnabled = chartType === 'footprint' || settings.enabled;
  const activeSubTab = settings.activeSubTab;

  return (
    <div className="flex flex-col h-full bg-[#131722] text-[#d1d4dc] select-none text-sm font-sans">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#2a2e39] bg-[#1e222d]">
        <div className="flex items-center space-x-2">
          <div className="w-5 h-5 rounded bg-[#2962ff]/20 flex items-center justify-center text-[#2962ff]">
            <Activity size={14} />
          </div>
          <span className="font-semibold text-xs tracking-wide uppercase text-[#f0f3fa]">
            Orderflow & Footprint
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#7b1fa2]/25 text-[#ce93d8] font-bold border border-[#7b1fa2]/40">
            L2 SUITE
          </span>
        </div>
        <button
          onClick={() => toggleTab('orderflow')}
          className="p-1 text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39] rounded transition cursor-pointer"
          aria-label="Close Orderflow Panel"
        >
          <X size={15} />
        </button>
      </div>

      {/* Active Chart Header Pill (matching ObjectTreePanel) */}
      <div className="flex items-center space-x-2 px-3 py-2 bg-[#181b27] border-b border-[#2a2e39] font-semibold text-white">
        <CandlestickChart size={14} className="text-[#2962ff]" />
        <span className="truncate">{activeSymbol}</span>
        <span className="text-[#787b86] font-normal">·</span>
        <span className="text-[#787b86] font-mono text-[11px]">{activeTimeframe}</span>
      </div>

      {/* If L2 is NOT supported by the active chart's provider, show notice */}
      {!isL2Supported ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4">
          <div className="w-12 h-12 rounded-full bg-[#1e222d] border border-[#2a2e39] flex items-center justify-center text-[#f23645]">
            <Activity size={24} />
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-[#f0f3fa]">
              OrderFlow Features not Supported for this provider
            </h3>
            <p className="text-xs text-[#787b86] max-w-[280px] leading-relaxed mx-auto">
              The active chart is connected to <span className="text-[#d1d4dc] font-medium">{supportResult.providerDisplay || 'this provider'}</span>, which provides Level 1 data only. OrderFlow and Footprint features require a Level 2 provider such as DataBridge.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Orderflow Subpanel Nav Tabs: 4 Columns */}
          <div className="grid grid-cols-4 border-b border-[#2a2e39] bg-[#161a25] text-[11px]">
        <button
          onClick={() => setSettings({ activeSubTab: 'general' })}
          className={`py-2 px-1 text-center font-medium transition cursor-pointer truncate ${
            activeSubTab === 'general'
              ? 'text-[#2962ff] border-b-2 border-[#2962ff] bg-[#1e222d]'
              : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1a1e29]'
          }`}
          title="Footprint 1 - General"
        >
          General
        </button>
        <button
          onClick={() => setSettings({ activeSubTab: 'imbalances' })}
          className={`py-2 px-1 text-center font-medium transition cursor-pointer truncate ${
            activeSubTab === 'imbalances'
              ? 'text-[#2962ff] border-b-2 border-[#2962ff] bg-[#1e222d]'
              : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1a1e29]'
          }`}
          title="Footprint 1 - Imbalances"
        >
          Imbalances
        </button>
        <button
          onClick={() => setSettings({ activeSubTab: 'stats' })}
          className={`py-2 px-1 text-center font-medium transition cursor-pointer truncate ${
            activeSubTab === 'stats'
              ? 'text-[#2962ff] border-b-2 border-[#2962ff] bg-[#1e222d]'
              : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1a1e29]'
          }`}
          title="Footprint 1 - Stats"
        >
          Stats
        </button>
        <button
          onClick={() => setSettings({ activeSubTab: 'volumeProfile' })}
          className={`py-2 px-1 text-center font-medium transition cursor-pointer truncate ${
            activeSubTab === 'volumeProfile'
              ? 'text-[#2962ff] border-b-2 border-[#2962ff] bg-[#1e222d]'
              : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1a1e29]'
          }`}
          title="Footprint 1 - Volume Profile"
        >
          Vol Profile
        </button>
      </div>

      {/* Subpanel Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 custom-scrollbar">
        {/* GENERAL SUBTAB */}
        {activeSubTab === 'general' && (
          <div className="space-y-4">
            {/* Section Title */}
            <div className="text-[11px] font-semibold text-[#00b4d8] uppercase tracking-wider">
              Footprint 1 - General
            </div>

            {/* Enabled Switch */}
            <div className="flex items-center justify-between py-1 border-b border-[#2a2e39]/50">
              <span className="text-xs text-[#d1d4dc] font-medium">Enabled</span>
              <button
                type="button"
                onClick={() => {
                  const nextState = !isEnabled;
                  setSettings({ enabled: nextState });
                  if (nextState) {
                    setChartType('footprint');
                  } else {
                    setChartType('candles');
                  }
                }}
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isEnabled ? 'bg-[#00b4d8]' : 'bg-[#2a2e39]'
                }`}
                title={isEnabled ? 'Disable Footprint (switch to Candlesticks)' : 'Enable Footprint Chart'}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    isEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Checkbox: Aggregate profiles on chart price scaling */}
            <label className="flex items-center space-x-2.5 cursor-pointer py-1 group">
              <input
                type="checkbox"
                checked={settings.aggregateProfiles}
                onChange={(e) => setSettings({ aggregateProfiles: e.target.checked })}
                className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#00b4d8] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#00b4d8]"
              />
              <span className="text-xs text-[#d1d4dc] group-hover:text-[#ffffff] transition">
                Aggregate profiles on chart price scaling
              </span>
            </label>

            {/* Checkbox: Convert cluster to candles on zoom */}
            <label className="flex items-center space-x-2.5 cursor-pointer py-1 group">
              <input
                type="checkbox"
                checked={settings.convertClusterToCandlesOnZoom}
                onChange={(e) => setSettings({ convertClusterToCandlesOnZoom: e.target.checked })}
                className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#00b4d8] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#00b4d8]"
              />
              <span className="text-xs text-[#d1d4dc] group-hover:text-[#ffffff] transition">
                Convert cluster to candles on zoom
              </span>
            </label>

            {/* Checkbox: Include empty levels */}
            <label className="flex items-center space-x-2.5 cursor-pointer py-1 group">
              <input
                type="checkbox"
                checked={settings.includeEmptyLevels}
                onChange={(e) => setSettings({ includeEmptyLevels: e.target.checked })}
                className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#00b4d8] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#00b4d8]"
              />
              <span className="text-xs text-[#d1d4dc] group-hover:text-[#ffffff] transition">
                Include empty levels
              </span>
            </label>

            {/* Section Divider */}
            <div className="border-t border-[#2a2e39] my-2" />

            {/* Point of Control (POC) Settings */}
            <div className="space-y-2">
              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-[#d1d4dc] font-medium">Point of Control (POC)</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showPOC !== false}
                    onChange={(e) => setSettings({ showPOC: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-[#2a2e39] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-[#00b4d8]"></div>
                </label>
              </div>
              {settings.showPOC !== false && (
                <ColorSwatch
                  label="POC Color"
                  value={settings.pocColor || '#ffb700'}
                  onChange={(val) => setSettings({ pocColor: val })}
                />
              )}
            </div>

            {/* Section Divider */}
            <div className="border-t border-[#2a2e39] my-2" />

            {/* Imbalance Representation */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-[#00b4d8] uppercase tracking-wider">
                Imbalance Representation
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#d1d4dc]">Representation</span>
                <select
                  value={settings.imbalanceRepresentation || 'Highlight text'}
                  onChange={(e) =>
                    setSettings({
                      imbalanceRepresentation: e.target.value as any,
                    })
                  }
                  className="w-40 bg-[#1e222d] border border-[#2a2e39] text-[#d1d4dc] text-xs rounded px-2 py-1.5 focus:border-[#00b4d8] focus:outline-none cursor-pointer"
                >
                  <option value="Highlight text">Highlight text</option>
                  <option value="Border box">Border box</option>
                  <option value="Box & text">Box & text</option>
                </select>
              </div>
              <ColorSwatch
                label="Buy Imbalance Color"
                value={settings.imbalanceBuyColor || '#00e676'}
                onChange={(val) => setSettings({ imbalanceBuyColor: val })}
              />
              <ColorSwatch
                label="Sell Imbalance Color"
                value={settings.imbalanceSellColor || '#ff5252'}
                onChange={(val) => setSettings({ imbalanceSellColor: val })}
              />
            </div>

            {/* Section Divider */}
            <div className="border-t border-[#2a2e39] my-2" />

            {/* Numbers & Text Colors */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-[#00b4d8] uppercase tracking-wider">
                Numbers & Values
              </div>
              <ColorSwatch
                label="Normal Values Color"
                value={settings.textColor || '#d1d4dc'}
                onChange={(val) => setSettings({ textColor: val })}
              />
              <ColorSwatch
                label="Zero Values Color"
                value={settings.zeroColor || '#505460'}
                onChange={(val) => setSettings({ zeroColor: val })}
              />
            </div>

            {/* Section Divider */}
            <div className="border-t border-[#2a2e39] my-2" />

            {/* Bar Visualization */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-[#00b4d8] uppercase tracking-wider">
                Visualization
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-[#d1d4dc]">Bar visualization</span>
                <select
                  value={settings.barVisualization}
                  onChange={(e) =>
                    setSettings({
                      barVisualization: e.target.value as any,
                    })
                  }
                  className="w-40 bg-[#1e222d] border border-[#2a2e39] text-[#d1d4dc] text-xs rounded px-2 py-1.5 focus:border-[#00b4d8] focus:outline-none cursor-pointer"
                >
                  <option value="None">None</option>
                  <option value="Bid x Ask">Bid x Ask</option>
                  <option value="Delta">Delta</option>
                </select>
              </div>

              {settings.barVisualization === 'Bid x Ask' && (
                <>
                  <ColorSwatch
                    label="Bid Volume Color"
                    value={settings.bidColor || '#f23645'}
                    onChange={(val) => setSettings({ bidColor: val })}
                  />
                  <ColorSwatch
                    label="Ask Volume Color"
                    value={settings.askColor || '#089981'}
                    onChange={(val) => setSettings({ askColor: val })}
                  />
                </>
              )}

              {settings.barVisualization === 'Delta' && (
                <>
                  <ColorSwatch
                    label="Positive Delta Color"
                    value={settings.deltaPositiveColor || '#089981'}
                    onChange={(val) => setSettings({ deltaPositiveColor: val })}
                  />
                  <ColorSwatch
                    label="Negative Delta Color"
                    value={settings.deltaNegativeColor || '#f23645'}
                    onChange={(val) => setSettings({ deltaNegativeColor: val })}
                  />
                </>
              )}
            </div>

            {/* Section Divider */}
            <div className="border-t border-[#2a2e39] my-2" />

            {/* Candle Zone */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-[#00b4d8] uppercase tracking-wider">
                Candle Zone
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#d1d4dc]">Candle zone</span>
                <select
                  value={settings.candleZone}
                  onChange={(e) =>
                    setSettings({
                      candleZone: e.target.value as any,
                    })
                  }
                  className="w-40 bg-[#1e222d] border border-[#2a2e39] text-[#d1d4dc] text-xs rounded px-2 py-1.5 focus:border-[#00b4d8] focus:outline-none cursor-pointer"
                >
                  <option value="Candle">Candle</option>
                  <option value="Bar">Bar</option>
                  <option value="None">None</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-[#d1d4dc]">Candle zone position</span>
                <select
                  value={settings.candleZonePosition}
                  onChange={(e) =>
                    setSettings({
                      candleZonePosition: e.target.value as any,
                    })
                  }
                  className="w-40 bg-[#1e222d] border border-[#2a2e39] text-[#d1d4dc] text-xs rounded px-2 py-1.5 focus:border-[#00b4d8] focus:outline-none cursor-pointer"
                >
                  <option value="Footprint #1">Footprint #1</option>
                  <option value="Behind">Behind</option>
                  <option value="Front">Front</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-[#d1d4dc]">Bar margin (px)</span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={settings.barMarginPx}
                  onChange={(e) =>
                    setSettings({
                      barMarginPx: Math.max(0, parseInt(e.target.value) || 0),
                    })
                  }
                  className="w-40 bg-[#1e222d] border border-[#2a2e39] text-[#d1d4dc] text-xs rounded px-2 py-1.5 text-right font-mono focus:border-[#00b4d8] focus:outline-none"
                />
              </div>

              <label className="flex items-center space-x-2.5 cursor-pointer py-1 group">
                <input
                  type="checkbox"
                  checked={settings.calculateFontSizeAuto}
                  onChange={(e) => setSettings({ calculateFontSizeAuto: e.target.checked })}
                  className="w-4 h-4 rounded border-[#363a45] bg-[#1e222d] text-[#00b4d8] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#00b4d8]"
                />
                <span className="text-xs text-[#d1d4dc] group-hover:text-[#ffffff] transition">
                  Calculate font size automatically for contents
                </span>
              </label>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-[#d1d4dc]">Max value calculation</span>
                <select
                  value={settings.maxValueCalculation}
                  onChange={(e) =>
                    setSettings({
                      maxValueCalculation: e.target.value as any,
                    })
                  }
                  className="w-40 bg-[#1e222d] border border-[#2a2e39] text-[#d1d4dc] text-xs rounded px-2 py-1.5 focus:border-[#00b4d8] focus:outline-none cursor-pointer"
                >
                  <option value="Daily">Daily</option>
                  <option value="Session">Session</option>
                  <option value="Visible range">Visible range</option>
                  <option value="Bar">Bar</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* IMBALANCES SUBTAB */}
        {activeSubTab === 'imbalances' && (
          <div className="space-y-4">
            {/* Section Header */}
            <div className="text-[11px] font-semibold text-[#00b4d8] uppercase tracking-wider">
              Footprint 1 - Imbalances
            </div>

            {/* General Imbalance Options Card (On top like before) */}
            <div className="p-3 rounded-lg bg-[#1e222d] border border-[#2a2e39] space-y-2.5">
              <label className="flex items-center space-x-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={Boolean(globalImb.skipZeroValues)}
                  onChange={(e) => setImbalanceGlobalSettings({ skipZeroValues: e.target.checked })}
                  className="w-4 h-4 rounded border-[#363a45] bg-[#161a25] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
                />
                <span className="text-xs text-[#d1d4dc] group-hover:text-[#ffffff] transition font-medium">
                  Skip Zero Values
                </span>
              </label>

              <label className="flex items-center space-x-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={globalImb.showStackedImbalances !== false}
                  onChange={(e) => setImbalanceGlobalSettings({ showStackedImbalances: e.target.checked })}
                  className="w-4 h-4 rounded border-[#363a45] bg-[#161a25] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
                />
                <span className="text-xs text-[#d1d4dc] group-hover:text-[#ffffff] transition font-medium">
                  Show Stacked Imbalances
                </span>
              </label>

              <label className="flex items-center space-x-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={globalImb.showMitigatedZones !== false}
                  onChange={(e) => setImbalanceGlobalSettings({ showMitigatedZones: e.target.checked })}
                  className="w-4 h-4 rounded border-[#363a45] bg-[#161a25] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
                />
                <span className="text-xs text-[#d1d4dc] group-hover:text-[#ffffff] transition font-medium">
                  Show Mitigated Zones
                </span>
              </label>

              <label className="flex items-center space-x-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={Boolean(globalImb.drawZoneBorders)}
                  onChange={(e) => setImbalanceGlobalSettings({ drawZoneBorders: e.target.checked })}
                  className="w-4 h-4 rounded border-[#363a45] bg-[#161a25] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#2962ff]"
                />
                <span className="text-xs text-[#d1d4dc] group-hover:text-[#ffffff] transition font-medium">
                  Draw Zone Borders
                </span>
              </label>
            </div>

            {/* Template / Customizer Panel (Shown by default) */}
            <div className="p-3 rounded-lg bg-[#1e222d] border border-[#2a2e39] space-y-3">
              <div className="text-[11px] font-semibold text-[#f0f3fa] uppercase tracking-wider flex items-center justify-between">
                <span>Imbalance Settings Template</span>
                <SlidersHorizontal size={13} className="text-[#00b4d8]" />
              </div>

              {/* Row 1: Imbalance % */}
              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-[#d1d4dc]">Imbalance %:</span>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    min={100}
                    max={2000}
                    step={25}
                    value={templatePercent}
                    onChange={(e) => setTemplatePercent(Math.max(100, parseInt(e.target.value) || 100))}
                    className="w-20 bg-[#161a25] border border-[#2a2e39] text-[#d1d4dc] text-xs rounded px-2 py-1 text-center font-mono focus:border-[#2962ff] focus:outline-none"
                  />
                  <div className="flex flex-col space-y-0.5">
                    <button
                      type="button"
                      onClick={() => setTemplatePercent((v) => Math.min(2000, v + 25))}
                      className="p-0.5 bg-[#161a25] hover:bg-[#2a2e39] border border-[#2a2e39] rounded text-[#787b86] hover:text-[#d1d4dc] flex items-center justify-center cursor-pointer"
                      title="Increase Imbalance %"
                    >
                      <ChevronUp size={10} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplatePercent((v) => Math.max(100, v - 25))}
                      className="p-0.5 bg-[#161a25] hover:bg-[#2a2e39] border border-[#2a2e39] rounded text-[#787b86] hover:text-[#d1d4dc] flex items-center justify-center cursor-pointer"
                      title="Decrease Imbalance %"
                    >
                      <ChevronDown size={10} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Row 2: Delta Filter */}
              <div className="flex items-center justify-between py-1">
                <span className="text-xs text-[#d1d4dc]">Delta Filter:</span>
                <div className="flex items-center space-x-2.5">
                  <div className="flex items-center space-x-1">
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      step={5}
                      value={templateDeltaFilter}
                      onChange={(e) => setTemplateDeltaFilter(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-16 bg-[#161a25] border border-[#2a2e39] text-[#d1d4dc] text-xs rounded px-2 py-1 text-center font-mono focus:border-[#2962ff] focus:outline-none"
                    />
                    <div className="flex flex-col space-y-0.5">
                      <button
                        type="button"
                        onClick={() => setTemplateDeltaFilter((v) => v + 5)}
                        className="p-0.5 bg-[#161a25] hover:bg-[#2a2e39] border border-[#2a2e39] rounded text-[#787b86] hover:text-[#d1d4dc] flex items-center justify-center cursor-pointer"
                        title="Increase Delta Filter"
                      >
                        <ChevronUp size={10} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setTemplateDeltaFilter((v) => Math.max(0, v - 5))}
                        className="p-0.5 bg-[#161a25] hover:bg-[#2a2e39] border border-[#2a2e39] rounded text-[#787b86] hover:text-[#d1d4dc] flex items-center justify-center cursor-pointer"
                        title="Decrease Delta Filter"
                      >
                        <ChevronDown size={10} />
                      </button>
                    </div>
                  </div>
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={templateDeltaFilterEnabled}
                      onChange={(e) => setTemplateDeltaFilterEnabled(e.target.checked)}
                      className="w-4 h-4 rounded border-[#363a45] bg-[#161a25] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
                    />
                    <span className="text-xs text-[#d1d4dc]">Enabled</span>
                  </label>
                </div>
              </div>

              {/* Row 3: Sell Imbalance */}
              <div className="flex items-center justify-between py-1 border-t border-[#2a2e39]/60">
                <span className="text-xs text-[#d1d4dc] font-medium">Sell Imbalance:</span>
                <div className="flex items-center space-x-2">
                  <ImbalanceSwatch
                    color={templateSellColor}
                    onChange={setTemplateSellColor}
                  />
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={templateSellDisplay}
                      onChange={(e) => setTemplateSellDisplay(e.target.checked)}
                      className="w-4 h-4 rounded border-[#363a45] bg-[#161a25] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
                    />
                    <span className="text-xs text-[#d1d4dc]">Display</span>
                  </label>
                </div>
              </div>

              {/* Row 4: Buy Imbalance */}
              <div className="flex items-center justify-between py-1 border-t border-[#2a2e39]/60">
                <span className="text-xs text-[#d1d4dc] font-medium">Buy Imbalance:</span>
                <div className="flex items-center space-x-2">
                  <ImbalanceSwatch
                    color={templateBuyColor}
                    onChange={setTemplateBuyColor}
                  />
                  <label className="flex items-center space-x-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={templateBuyDisplay}
                      onChange={(e) => setTemplateBuyDisplay(e.target.checked)}
                      className="w-4 h-4 rounded border-[#363a45] bg-[#161a25] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
                    />
                    <span className="text-xs text-[#d1d4dc]">Display</span>
                  </label>
                </div>
              </div>

              {/* Add to chart Button */}
              <button
                type="button"
                onClick={handleAddImbalanceToChart}
                className="w-full mt-2 flex items-center justify-center space-x-2 py-2 px-3 bg-[#2962ff] hover:bg-[#1e53e5] text-white rounded font-medium text-xs shadow-md transition cursor-pointer active:scale-[0.98]"
              >
                <Plus size={15} />
                <span>Add to chart</span>
              </button>
            </div>

            {/* Active Imbalances List (Presets shown right below button) */}
            <div className="space-y-2 pt-1">
              <div className="text-[11px] font-semibold text-[#00b4d8] uppercase tracking-wider">
                Active Imbalances ({imbalanceRules.length})
              </div>

              {imbalanceRules.length === 0 ? (
                <div className="p-4 rounded-lg bg-[#1e222d] border border-[#2a2e39] text-center text-xs text-[#787b86]">
                  No imbalance presets active. Configure settings above and click &quot;Add to chart&quot;.
                </div>
              ) : (
                imbalanceRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-2.5 rounded-lg bg-[#1e222d] border border-[#2a2e39] space-y-2 hover:border-[#363a45] transition"
                  >
                    {/* Top Row: Toggle, Title badge, Edit button, and Delete button */}
                    <div className="flex items-center justify-between pb-1 border-b border-[#2a2e39]/60">
                      <label className="flex items-center space-x-2 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) => updateImbalanceRule(rule.id, { enabled: e.target.checked })}
                          className="w-4 h-4 rounded border-[#363a45] bg-[#161a25] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
                        />
                        <span className="text-xs font-semibold text-[#f0f3fa] group-hover:text-[#ffffff] transition">
                          {rule.imbalancePercent}% Imbalance {rule.deltaFilterEnabled ? `• Δ ≥ ${rule.deltaFilter}` : ''}
                        </span>
                      </label>
                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          onClick={() => setEditingRuleId(editingRuleId === rule.id ? null : rule.id)}
                          className={`p-1 rounded transition cursor-pointer ${
                            editingRuleId === rule.id
                              ? 'text-[#2962ff] bg-[#2962ff]/20'
                              : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#2a2e39]'
                          }`}
                          title="Edit Imbalance % & Delta Filter"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteImbalanceRule(rule.id)}
                          className="p-1 text-[#787b86] hover:text-[#f23645] hover:bg-[#2a2e39] rounded transition cursor-pointer"
                          title="Delete Imbalance Setting"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Inline Edit Panel for Imbalance % & Delta Filter */}
                    {editingRuleId === rule.id && (
                      <div className="p-2 rounded bg-[#161a25] border border-[#2a2e39] space-y-2">
                        {/* Edit Imbalance % */}
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[#787b86]">Imbalance %:</span>
                          <div className="flex items-center space-x-1">
                            <input
                              type="number"
                              min={100}
                              max={2000}
                              step={25}
                              value={rule.imbalancePercent}
                              onChange={(e) => {
                                const val = Math.max(100, parseInt(e.target.value) || 100);
                                updateImbalanceRule(rule.id, {
                                  imbalancePercent: val,
                                  name: `${val}% • Delta ≥ ${rule.deltaFilter}`,
                                });
                              }}
                              className="w-16 bg-[#1e222d] border border-[#2a2e39] text-[#d1d4dc] text-xs rounded px-1.5 py-0.5 text-center font-mono focus:border-[#2962ff] focus:outline-none"
                            />
                            <div className="flex flex-col space-y-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const val = Math.min(2000, (rule.imbalancePercent || 300) + 25);
                                  updateImbalanceRule(rule.id, {
                                    imbalancePercent: val,
                                    name: `${val}% • Delta ≥ ${rule.deltaFilter}`,
                                  });
                                }}
                                className="p-0.5 bg-[#1e222d] hover:bg-[#2a2e39] border border-[#2a2e39] rounded text-[#787b86] hover:text-[#d1d4dc] flex items-center justify-center cursor-pointer"
                              >
                                <ChevronUp size={9} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const val = Math.max(100, (rule.imbalancePercent || 300) - 25);
                                  updateImbalanceRule(rule.id, {
                                    imbalancePercent: val,
                                    name: `${val}% • Delta ≥ ${rule.deltaFilter}`,
                                  });
                                }}
                                className="p-0.5 bg-[#1e222d] hover:bg-[#2a2e39] border border-[#2a2e39] rounded text-[#787b86] hover:text-[#d1d4dc] flex items-center justify-center cursor-pointer"
                              >
                                <ChevronDown size={9} />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Edit Delta Filter */}
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[#787b86]">Delta Filter:</span>
                          <div className="flex items-center space-x-2">
                            <div className="flex items-center space-x-1">
                              <input
                                type="number"
                                min={0}
                                max={10000}
                                step={5}
                                value={rule.deltaFilter}
                                onChange={(e) => {
                                  const val = Math.max(0, parseInt(e.target.value) || 0);
                                  updateImbalanceRule(rule.id, {
                                    deltaFilter: val,
                                    name: `${rule.imbalancePercent}% • Delta ≥ ${val}`,
                                  });
                                }}
                                className="w-16 bg-[#1e222d] border border-[#2a2e39] text-[#d1d4dc] text-xs rounded px-1.5 py-0.5 text-center font-mono focus:border-[#2962ff] focus:outline-none"
                              />
                              <div className="flex flex-col space-y-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const val = (rule.deltaFilter || 0) + 5;
                                    updateImbalanceRule(rule.id, {
                                      deltaFilter: val,
                                      name: `${rule.imbalancePercent}% • Delta ≥ ${val}`,
                                    });
                                  }}
                                  className="p-0.5 bg-[#1e222d] hover:bg-[#2a2e39] border border-[#2a2e39] rounded text-[#787b86] hover:text-[#d1d4dc] flex items-center justify-center cursor-pointer"
                                >
                                  <ChevronUp size={9} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const val = Math.max(0, (rule.deltaFilter || 0) - 5);
                                    updateImbalanceRule(rule.id, {
                                      deltaFilter: val,
                                      name: `${rule.imbalancePercent}% • Delta ≥ ${val}`,
                                    });
                                  }}
                                  className="p-0.5 bg-[#1e222d] hover:bg-[#2a2e39] border border-[#2a2e39] rounded text-[#787b86] hover:text-[#d1d4dc] flex items-center justify-center cursor-pointer"
                                >
                                  <ChevronDown size={9} />
                                </button>
                              </div>
                            </div>
                            <label className="flex items-center space-x-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={rule.deltaFilterEnabled !== false}
                                onChange={(e) =>
                                  updateImbalanceRule(rule.id, { deltaFilterEnabled: e.target.checked })
                                }
                                className="w-3.5 h-3.5 rounded border-[#363a45] bg-[#1e222d] text-[#2962ff] focus:ring-0 cursor-pointer accent-[#2962ff]"
                              />
                              <span className="text-[11px] text-[#787b86]">Enabled</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Compact Sell Imbalance styling */}
                    <div className="flex items-center justify-between text-xs py-0.5">
                      <span className="text-[#d1d4dc]">Sell Imbalance:</span>
                      <div className="flex items-center space-x-2">
                        <ImbalanceSwatch
                          color={rule.sellColor}
                          onChange={(val) => updateImbalanceRule(rule.id, { sellColor: val })}
                        />
                        <label className="flex items-center space-x-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={rule.sellDisplay !== false}
                            onChange={(e) => updateImbalanceRule(rule.id, { sellDisplay: e.target.checked })}
                            className="w-3.5 h-3.5 rounded border-[#363a45] bg-[#161a25] text-[#2962ff] accent-[#2962ff]"
                          />
                          <span className="text-xs text-[#d1d4dc]">Display</span>
                        </label>
                      </div>
                    </div>

                    {/* Compact Buy Imbalance styling */}
                    <div className="flex items-center justify-between text-xs py-0.5">
                      <span className="text-[#d1d4dc]">Buy Imbalance:</span>
                      <div className="flex items-center space-x-2">
                        <ImbalanceSwatch
                          color={rule.buyColor}
                          onChange={(val) => updateImbalanceRule(rule.id, { buyColor: val })}
                        />
                        <label className="flex items-center space-x-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={rule.buyDisplay !== false}
                            onChange={(e) => updateImbalanceRule(rule.id, { buyDisplay: e.target.checked })}
                            className="w-3.5 h-3.5 rounded border-[#363a45] bg-[#161a25] text-[#2962ff] accent-[#2962ff]"
                          />
                          <span className="text-xs text-[#d1d4dc]">Display</span>
                        </label>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* STATS SUBTAB */}
        {activeSubTab === 'stats' && (
          <div className="space-y-4">
            <div className="text-[11px] font-semibold text-[#00b4d8] uppercase tracking-wider">
              Footprint 1 - Stats
            </div>

            {/* Stats Enabled Switch */}
            <div className="flex items-center justify-between py-1 border-b border-[#2a2e39]/50">
              <span className="text-xs text-[#d1d4dc] font-medium">Enabled</span>
              <button
                type="button"
                onClick={() =>
                  setSettings({ showStats: settings.showStats === false ? true : false })
                }
                className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.showStats !== false ? 'bg-[#00b4d8]' : 'bg-[#2a2e39]'
                }`}
                title={settings.showStats !== false ? 'Disable Stats' : 'Enable Stats'}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    settings.showStats !== false ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {settings.showStats !== false && (
              <>
                {/* Position Selector */}
                <div className="flex items-center justify-between pb-2 border-b border-[#2a2e39]/60">
                  <span className="text-xs text-[#d1d4dc] font-medium">Position</span>
                  <select
                    value={settings.statsPosition || 'Below'}
                    onChange={(e) =>
                      setSettings({
                        statsPosition: e.target.value as any,
                      })
                    }
                    className="w-40 bg-[#1e222d] border border-[#2a2e39] text-[#d1d4dc] text-xs rounded px-2 py-1.5 focus:border-[#00b4d8] focus:outline-none cursor-pointer"
                  >
                    <option value="Below">Below</option>
                    <option value="Above">Above</option>
                    <option value="As per candle">As per candle</option>
                  </select>
                </div>

            {/* Stat Item 1: Total Delta */}
            <div className="p-2.5 rounded-lg bg-[#1e222d] border border-[#2a2e39] space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={settings.showDelta !== false}
                    onChange={(e) => setSettings({ showDelta: e.target.checked })}
                    className="w-4 h-4 rounded border-[#363a45] bg-[#161a25] text-[#00b4d8] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#00b4d8]"
                  />
                  <span className="text-xs font-semibold text-[#f0f3fa] group-hover:text-[#ffffff]">
                    Total Delta
                  </span>
                </label>
              </div>
              {settings.showDelta !== false && (
                <div className="pt-1 space-y-1 pl-6">
                  <ColorSwatch
                    label="Positive Color"
                    value={settings.deltaPositiveColor || '#089981'}
                    onChange={(val) => setSettings({ deltaPositiveColor: val })}
                  />
                  <ColorSwatch
                    label="Negative Color"
                    value={settings.deltaNegativeColor || '#f23645'}
                    onChange={(val) => setSettings({ deltaNegativeColor: val })}
                  />
                </div>
              )}
            </div>

            {/* Stat Item 2: Total Volume */}
            <div className="p-2.5 rounded-lg bg-[#1e222d] border border-[#2a2e39] space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.showTotalVolume)}
                    onChange={(e) => setSettings({ showTotalVolume: e.target.checked })}
                    className="w-4 h-4 rounded border-[#363a45] bg-[#161a25] text-[#00b4d8] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#00b4d8]"
                  />
                  <span className="text-xs font-semibold text-[#f0f3fa] group-hover:text-[#ffffff]">
                    Total Volume
                  </span>
                </label>
              </div>
              {settings.showTotalVolume && (
                <div className="pt-1 pl-6">
                  <ColorSwatch
                    label="Volume Color"
                    value={settings.totalVolumeColor || '#d1d4dc'}
                    onChange={(val) => setSettings({ totalVolumeColor: val })}
                  />
                </div>
              )}
            </div>

            {/* Stat Item 3: Delta % */}
            <div className="p-2.5 rounded-lg bg-[#1e222d] border border-[#2a2e39] space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.showDeltaPercent)}
                    onChange={(e) => setSettings({ showDeltaPercent: e.target.checked })}
                    className="w-4 h-4 rounded border-[#363a45] bg-[#161a25] text-[#00b4d8] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#00b4d8]"
                  />
                  <span className="text-xs font-semibold text-[#f0f3fa] group-hover:text-[#ffffff]">
                    Delta %
                  </span>
                </label>
              </div>
              {settings.showDeltaPercent && (
                <div className="pt-1 pl-6">
                  <ColorSwatch
                    label="Delta % Color"
                    value={settings.deltaPercentColor || '#ffb700'}
                    onChange={(val) => setSettings({ deltaPercentColor: val })}
                  />
                </div>
              )}
            </div>

            {/* Stat Item 4: Min / Max Delta */}
            <div className="p-2.5 rounded-lg bg-[#1e222d] border border-[#2a2e39] space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.showMinMaxDelta)}
                    onChange={(e) => setSettings({ showMinMaxDelta: e.target.checked })}
                    className="w-4 h-4 rounded border-[#363a45] bg-[#161a25] text-[#00b4d8] focus:ring-0 focus:ring-offset-0 cursor-pointer accent-[#00b4d8]"
                  />
                  <span className="text-xs font-semibold text-[#f0f3fa] group-hover:text-[#ffffff]">
                    Min / Max Delta
                  </span>
                </label>
              </div>
              {settings.showMinMaxDelta && (
                <div className="pt-1 space-y-1 pl-6">
                  <ColorSwatch
                    label="Min Delta Color"
                    value={settings.minDeltaColor || '#f23645'}
                    onChange={(val) => setSettings({ minDeltaColor: val })}
                  />
                  <ColorSwatch
                    label="Max Delta Color"
                    value={settings.maxDeltaColor || '#089981'}
                    onChange={(val) => setSettings({ maxDeltaColor: val })}
                  />
                </div>
              )}
            </div>
              </>
            )}
          </div>
        )}

        {/* VOLUME PROFILE SUBTAB */}
        {activeSubTab === 'volumeProfile' && (
          <div className="space-y-4">
            <div className="text-[11px] font-semibold text-[#00b4d8] uppercase tracking-wider">
              Footprint 1 - Vol Profile
            </div>

            {/* Mode Selector: Footprint only | Vol Profile only | Both | No candle */}
            <div className="py-1 border-b border-[#2a2e39]/50">
              <div className="grid grid-cols-4 gap-1 p-1 bg-[#161a25] border border-[#2a2e39] rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setSettings({ volProfileMode: 'footprint', volProfileEnabled: false });
                  }}
                  className={`px-1 py-1.5 text-[10px] sm:text-[11px] font-medium rounded transition-colors text-center cursor-pointer flex items-center justify-center leading-tight ${
                    (settings.volProfileMode === 'footprint' || (!settings.volProfileMode && !settings.volProfileEnabled))
                      ? 'bg-[#00b4d8] text-[#ffffff] font-semibold shadow-sm'
                      : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
                  }`}
                >
                  Footprint only
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSettings({ volProfileMode: 'profile', volProfileEnabled: true });
                    if (chartType !== 'footprint') {
                      setChartType('footprint');
                    }
                  }}
                  className={`px-1 py-1.5 text-[10px] sm:text-[11px] font-medium rounded transition-colors text-center cursor-pointer flex items-center justify-center leading-tight ${
                    (settings.volProfileMode === 'profile' || (!settings.volProfileMode && settings.volProfileEnabled))
                      ? 'bg-[#00b4d8] text-[#ffffff] font-semibold shadow-sm'
                      : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
                  }`}
                >
                  Vol Profile only
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSettings({ volProfileMode: 'both', volProfileEnabled: true });
                    if (chartType !== 'footprint') {
                      setChartType('footprint');
                    }
                  }}
                  className={`px-1 py-1.5 text-[10px] sm:text-[11px] font-medium rounded transition-colors text-center cursor-pointer flex items-center justify-center leading-tight ${
                    settings.volProfileMode === 'both'
                      ? 'bg-[#00b4d8] text-[#ffffff] font-semibold shadow-sm'
                      : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
                  }`}
                >
                  Both
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSettings({ volProfileMode: 'noCandle', volProfileEnabled: true });
                    if (chartType !== 'footprint') {
                      setChartType('footprint');
                    }
                  }}
                  className={`px-1 py-1.5 text-[10px] sm:text-[11px] font-medium rounded transition-colors text-center cursor-pointer flex items-center justify-center leading-tight ${
                    settings.volProfileMode === 'noCandle'
                      ? 'bg-[#00b4d8] text-[#ffffff] font-semibold shadow-sm'
                      : 'text-[#787b86] hover:text-[#d1d4dc] hover:bg-[#1e222d]'
                  }`}
                >
                  No candle
                </button>
              </div>
            </div>

            {/* Tick Interval Setting */}
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-[#d1d4dc]">Tick Interval:</span>
              <div className="flex items-center bg-[#161a25] border border-[#2a2e39] rounded px-2 py-0.5 w-[90px] justify-between">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={settings.volProfileTickInterval ?? 1}
                  onChange={(e) => {
                    const val = Math.max(1, parseInt(e.target.value) || 1);
                    setSettings({ volProfileTickInterval: val });
                  }}
                  className="w-12 bg-transparent text-xs text-[#d1d4dc] focus:outline-none font-mono text-center"
                />
                <div className="flex flex-col ml-1">
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({ volProfileTickInterval: (settings.volProfileTickInterval ?? 1) + 1 })
                    }
                    className="text-[#787b86] hover:text-[#d1d4dc] cursor-pointer"
                  >
                    <ChevronUp size={11} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({
                        volProfileTickInterval: Math.max(1, (settings.volProfileTickInterval ?? 1) - 1),
                      })
                    }
                    className="text-[#787b86] hover:text-[#d1d4dc] cursor-pointer"
                  >
                    <ChevronDown size={11} />
                  </button>
                </div>
              </div>
            </div>

            {/* POC Bar Color */}
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-[#d1d4dc]">POC Bar Color:</span>
              <div className="flex items-center space-x-3">
                <ImbalanceSwatch
                  color={settings.volProfilePocBarColor ?? '#d1d4dc'}
                  onChange={(val) => setSettings({ volProfilePocBarColor: val })}
                />
                <label className="flex items-center space-x-1.5 text-xs text-[#d1d4dc] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.volProfilePocBarEnabled ?? true}
                    onChange={(e) => setSettings({ volProfilePocBarEnabled: e.target.checked })}
                    className="rounded bg-[#161a25] border-[#2a2e39] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span>Enabled</span>
                </label>
              </div>
            </div>

            {/* Bar Color */}
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs text-[#d1d4dc]">Bar Color:</span>
              <ImbalanceSwatch
                color={settings.volProfileBarColor ?? '#50535e'}
                onChange={(val) => setSettings({ volProfileBarColor: val })}
              />
            </div>

            {/* Value Area Section */}
            <div className="pt-2 border-t border-[#2a2e39]/60">
              <div className="text-xs font-semibold text-[#d1d4dc] mb-2 pb-1 border-b border-[#2a2e39]/40">
                Value Area
              </div>
              <div className="flex items-center justify-end py-1">
                <label className="flex items-center space-x-2 text-xs text-[#d1d4dc] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.volProfileShowValueArea ?? true}
                    onChange={(e) => setSettings({ volProfileShowValueArea: e.target.checked })}
                    className="rounded bg-[#161a25] border-[#2a2e39] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                  />
                  <span className="font-medium">Show Value Area</span>
                </label>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs text-[#d1d4dc]">Range %:</span>
                <div className="flex items-center bg-[#161a25] border border-[#2a2e39] rounded px-2 py-0.5 w-[90px] justify-between">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    value={settings.volProfileValueAreaPercent ?? 70.0}
                    onChange={(e) => {
                      const val = Math.min(100, Math.max(1, parseFloat(e.target.value) || 70));
                      setSettings({ volProfileValueAreaPercent: val });
                    }}
                    className="w-12 bg-transparent text-xs text-[#d1d4dc] focus:outline-none font-mono text-center"
                  />
                  <div className="flex flex-col ml-1">
                    <button
                      type="button"
                      onClick={() =>
                        setSettings({
                          volProfileValueAreaPercent: Math.min(100, (settings.volProfileValueAreaPercent ?? 70) + 1),
                        })
                      }
                      className="text-[#787b86] hover:text-[#d1d4dc] cursor-pointer"
                    >
                      <ChevronUp size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSettings({
                          volProfileValueAreaPercent: Math.max(1, (settings.volProfileValueAreaPercent ?? 70) - 1),
                        })
                      }
                      className="text-[#787b86] hover:text-[#d1d4dc] cursor-pointer"
                    >
                      <ChevronDown size={11} />
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between py-1.5">
                <span className="text-xs text-[#d1d4dc]">Bar Color:</span>
                <div className="flex items-center space-x-3">
                  <ImbalanceSwatch
                    color={settings.volProfileValueAreaBarColor ?? '#787b86'}
                    onChange={(val) => setSettings({ volProfileValueAreaBarColor: val })}
                  />
                  <label className="flex items-center space-x-1.5 text-xs text-[#d1d4dc] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.volProfileValueAreaBarEnabled ?? true}
                      onChange={(e) => setSettings({ volProfileValueAreaBarEnabled: e.target.checked })}
                      className="rounded bg-[#161a25] border-[#2a2e39] text-[#2962ff] focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span>Enabled</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
};
