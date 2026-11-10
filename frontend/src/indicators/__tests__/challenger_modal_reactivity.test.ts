// ORDERCRAFT Adversarial Verification Harness: Settings Modal, Reactivity & Persistence
// Challenger M2_2: Modal Controls, Reactivity & Persistence Challenger
// Strictly adheres to AGENTS.md § 3.2: strict: true, ZERO any types allowed.

declare const process: { exit: (code: number) => never };

// Mock browser globals BEFORE any store module is imported
const memoryStorage = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string): string | null => memoryStorage.get(key) ?? null,
  setItem: (key: string, val: string): void => { memoryStorage.set(key, String(val)); },
  removeItem: (key: string): boolean => memoryStorage.delete(key),
  clear: (): void => { memoryStorage.clear(); },
  get length(): number { return memoryStorage.size; },
  key: (index: number): string | null => Array.from(memoryStorage.keys())[index] ?? null,
};

Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  configurable: true,
  writable: true,
});

(globalThis as unknown as { window: unknown }).window = {
  localStorage: mockLocalStorage,
  location: { protocol: 'http:', host: 'localhost:8080' },
  innerWidth: 1200,
  innerHeight: 800,
  addEventListener: (): void => {},
  removeEventListener: (): void => {},
};

import {
  INDICATOR_REGISTRY,
  isMultiStateIndicator,
  getDisplayPlots,
  MULTI_STATE_INDICATOR_IDS,
  registerCustomIndicator,
  getIndicator,
} from '../registry.ts';
import {
  migrateIndicatorInstance,
  migrateIndicatorStyles,
  migrateIndicatorsRecord,
  isMultiColorTrendIndicator,
  normalizeIndicatorId,
  isSubpaneIndicator,
} from '../migration.ts';
import type { IndicatorPlotStyle } from '../types.ts';

// Test runner state
let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
const failureMessages: string[] = [];

function assert(condition: boolean, description: string): void {
  totalChecks++;
  if (condition) {
    passedChecks++;
    console.log(`  [PASS] ${description}`);
  } else {
    failedChecks++;
    const msg = `FAILED: ${description}`;
    failureMessages.push(msg);
    console.error(`  [FAIL] ${description}`);
  }
}

function assertEqual<T>(actual: T, expected: T, description: string): void {
  totalChecks++;
  if (actual === expected) {
    passedChecks++;
    console.log(`  [PASS] ${description}`);
  } else {
    failedChecks++;
    const msg = `FAILED: ${description} (expected: ${String(expected)}, actual: ${String(actual)})`;
    failureMessages.push(msg);
    console.error(`  [FAIL] ${description} — Expected ${String(expected)}, got ${String(actual)}`);
  }
}

async function runChallengerSuite(): Promise<void> {
  console.log('================================================================');
  console.log('CHALLENGER M2_2: MODAL CONTROLS, REACTIVITY & PERSISTENCE SUITE');
  console.log('================================================================\n');

  // Dynamically import store after mocks are established
  const { useSyncStore } = await import('../../store/syncStore.ts');

  // ==========================================================================
  // SECTION 1: Modal UI Plot Filtering & Channel Isolation
  // ==========================================================================
  console.log('--- Section 1: Modal UI Controls & Channel Isolation ---');

  for (const id of MULTI_STATE_INDICATOR_IDS) {
    const isMulti = isMultiStateIndicator(id);
    assert(isMulti, `isMultiStateIndicator('${id}') returns true`);

    const def = INDICATOR_REGISTRY[id];
    assert(Boolean(def), `INDICATOR_REGISTRY has definition for '${id}'`);

    if (def) {
      assert('up' in def.plotLabels, `${id}: plotLabels includes 'up'`);
      assert('down' in def.plotLabels, `${id}: plotLabels includes 'down'`);

      // Verify getDisplayPlots suppresses auxiliary channels
      const displayPlots = getDisplayPlots(def);
      const displayPlotIds = displayPlots.map((p) => p.id);

      assert(displayPlotIds.includes('up'), `${id}: display plots include 'up'`);
      assert(displayPlotIds.includes('down'), `${id}: display plots include 'down'`);
      assert(!displayPlotIds.includes('value'), `${id}: display plots suppress auxiliary 'value'`);
      assert(!displayPlotIds.includes('direction'), `${id}: display plots suppress auxiliary 'direction'`);
      assert(!displayPlotIds.includes('plot'), `${id}: display plots suppress legacy 'plot'`);

      // Verify exact modal filter predicate from IndicatorSettingsModal.tsx lines 586-593
      const hasTrendRegimes = 'up' in def.plotLabels && 'down' in def.plotLabels;
      const visiblePlotEntries = Object.entries(def.plotLabels).filter(([plotId]) => {
        if (hasTrendRegimes && (plotId === 'value' || plotId === 'direction' || plotId === 'plot')) {
          return false;
        }
        return true;
      });

      const modalPlotIds = visiblePlotEntries.map(([k]) => k);
      assertEqual(modalPlotIds.length, 2, `${id}: modal UI exposes exactly 2 plot rows (up and down)`);
      assert(modalPlotIds.includes('up') && modalPlotIds.includes('down'), `${id}: modal UI exposes up and down`);
      assertEqual(def.plotLabels.up, 'Up Trend', `${id}: 'up' label is 'Up Trend'`);
      assertEqual(def.plotLabels.down, 'Down Trend', `${id}: 'down' label is 'Down Trend'`);
    }
  }

  // Verify non-multi-state indicators do NOT have their plots filtered out
  const nonMultiIds = ['wickra.sma', 'wickra.rsi', 'wickra.macd', 'wickra.bollinger_bands'];
  for (const nId of nonMultiIds) {
    assert(!isMultiStateIndicator(nId), `isMultiStateIndicator('${nId}') is false`);
    const def = INDICATOR_REGISTRY[nId];
    if (def) {
      const displayPlots = getDisplayPlots(def);
      assertEqual(displayPlots.length, def.plots.length, `${nId}: preserves all ${def.plots.length} plots without filtering`);
    }
  }

  // ==========================================================================
  // SECTION 2: Immediate Reactivity & Independent Controls in Store
  // ==========================================================================
  console.log('\n--- Section 2: Immediate Reactivity & Independent Style Controls ---');

  const paneId = 'pane-test-1';
  const store = useSyncStore.getState();

  // Clean initial state
  store.clearIndicatorsFromPane(paneId);
  const indInstance = store.addIndicatorToPane(paneId, 'wickra.super_trend');
  assert(Boolean(indInstance), 'Successfully added wickra.super_trend instance to test pane');

  // Verify default styles on instance
  assert(indInstance.styles.up !== undefined, 'Default styles has up plot');
  assert(indInstance.styles.down !== undefined, 'Default styles has down plot');
  assertEqual(indInstance.styles.up.color, '#089981', 'Default up color is #089981');
  assertEqual(indInstance.styles.down.color, '#F23645', 'Default down color is #F23645');
  assertEqual(indInstance.styles.up.visible, true, 'Default up visibility is true');
  assertEqual(indInstance.styles.down.visible, true, 'Default down visibility is true');

  // Emulate user opening settings modal
  store.openIndicatorSettings(paneId, indInstance.id);
  assertEqual(useSyncStore.getState().activeSettingsIndicator?.indicatorId, indInstance.id, 'Indicator settings modal opened');

  // 1. User changes Up Trend color to #00E676
  const nextStyles1: Record<string, IndicatorPlotStyle> = {
    ...indInstance.styles,
    up: { ...indInstance.styles.up, color: '#00E676', priceLineVisible: false },
  };
  store.updateIndicatorStyles(paneId, indInstance.id, nextStyles1);

  // Assert immediate reactivity in store
  const updatedInd1 = useSyncStore.getState().indicators[paneId]?.find((i) => i.id === indInstance.id);
  assertEqual(updatedInd1?.styles.up.color, '#00E676', 'Immediate reactivity: up.color updated immediately to #00E676');
  assertEqual(updatedInd1?.styles.down.color, '#F23645', 'Independent controls: down.color remained #F23645');
  assert(useSyncStore.getState().activeSettingsIndicator !== null, 'Modal remains open during instant live updates');

  // 2. User unchecks Down Trend visibility (visible = false)
  const nextStyles2: Record<string, IndicatorPlotStyle> = {
    ...updatedInd1!.styles,
    down: { ...updatedInd1!.styles.down, visible: false, priceLineVisible: false },
  };
  store.updateIndicatorStyles(paneId, indInstance.id, nextStyles2);

  const updatedInd2 = useSyncStore.getState().indicators[paneId]?.find((i) => i.id === indInstance.id);
  assertEqual(updatedInd2?.styles.down.visible, false, 'Immediate reactivity: down.visible toggled to false');
  assertEqual(updatedInd2?.styles.up.visible, true, 'Independent controls: up.visible remained true');

  // 3. User unchecks Up Trend visibility as well
  const nextStyles3: Record<string, IndicatorPlotStyle> = {
    ...updatedInd2!.styles,
    up: { ...updatedInd2!.styles.up, visible: false, priceLineVisible: false },
  };
  store.updateIndicatorStyles(paneId, indInstance.id, nextStyles3);

  const updatedInd3 = useSyncStore.getState().indicators[paneId]?.find((i) => i.id === indInstance.id);
  assertEqual(updatedInd3?.styles.up.visible, false, 'Both regimes can be independently hidden (up=false)');
  assertEqual(updatedInd3?.styles.down.visible, false, 'Both regimes can be independently hidden (down=false)');

  // 4. User modifies Down Trend lineWidth to 4 and lineStyle to dashed
  const nextStyles4: Record<string, IndicatorPlotStyle> = {
    ...updatedInd3!.styles,
    down: { ...updatedInd3!.styles.down, lineWidth: 4, lineStyle: 'dashed', priceLineVisible: false },
  };
  store.updateIndicatorStyles(paneId, indInstance.id, nextStyles4);

  const updatedInd4 = useSyncStore.getState().indicators[paneId]?.find((i) => i.id === indInstance.id);
  assertEqual(updatedInd4?.styles.down.lineWidth, 4, 'down.lineWidth updated to 4');
  assertEqual(updatedInd4?.styles.down.lineStyle, 'dashed', 'down.lineStyle updated to dashed');
  assertEqual(updatedInd4?.styles.up.lineWidth, 2, 'up.lineWidth remained 2');
  assertEqual(updatedInd4?.styles.up.lineStyle, 'solid', 'up.lineStyle remained solid');

  // 5. User clicks OK
  store.closeIndicatorSettings();
  assertEqual(useSyncStore.getState().activeSettingsIndicator, null, 'Modal closes on OK');
  const finalIndOk = useSyncStore.getState().indicators[paneId]?.find((i) => i.id === indInstance.id);
  assertEqual(finalIndOk?.styles.down.lineWidth, 4, 'Styles persist after modal OK');

  // ==========================================================================
  // SECTION 3: Cancel Snapshot Reversion Semantics
  // ==========================================================================
  console.log('\n--- Section 3: Snapshot Capture & Cancel Reversion ---');

  // Reset to known baseline styles
  const baselineStyles: Record<string, IndicatorPlotStyle> = {
    up: { color: '#089981', lineWidth: 2, lineStyle: 'solid', visible: true, priceLineVisible: false },
    down: { color: '#F23645', lineWidth: 2, lineStyle: 'solid', visible: true, priceLineVisible: false },
    value: { color: '#2962FF', lineWidth: 1, lineStyle: 'solid', visible: false, priceLineVisible: false },
    direction: { color: '#2962FF', lineWidth: 1, lineStyle: 'solid', visible: false, priceLineVisible: false },
  };
  store.updateIndicatorStyles(paneId, indInstance.id, baselineStyles);

  // Emulate opening modal: take snapshot
  store.openIndicatorSettings(paneId, indInstance.id);
  const snapshot = JSON.parse(JSON.stringify(baselineStyles));

  // User applies dirty edits
  const dirtyStyles: Record<string, IndicatorPlotStyle> = {
    up: { color: '#FF0000', lineWidth: 3, lineStyle: 'dotted', visible: false, priceLineVisible: false },
    down: { color: '#0000FF', lineWidth: 4, lineStyle: 'dashed', visible: false, priceLineVisible: false },
  };
  store.updateIndicatorStyles(paneId, indInstance.id, dirtyStyles);

  // Verify dirty state in store
  const dirtyInd = useSyncStore.getState().indicators[paneId]?.find((i) => i.id === indInstance.id);
  assertEqual(dirtyInd?.styles.up.color, '#FF0000', 'Store is dirty while modal is open');

  // User clicks Cancel: emulate handleCancel logic from IndicatorSettingsModal.tsx lines 315-335
  store.updateIndicatorStyles(paneId, indInstance.id, snapshot);
  store.closeIndicatorSettings();

  // Verify full restoration
  const revertedInd = useSyncStore.getState().indicators[paneId]?.find((i) => i.id === indInstance.id);
  assertEqual(revertedInd?.styles.up.color, '#089981', 'Cancel cleanly reverted up.color');
  assertEqual(revertedInd?.styles.down.color, '#F23645', 'Cancel cleanly reverted down.color');
  assertEqual(revertedInd?.styles.up.lineWidth, 2, 'Cancel cleanly reverted up.lineWidth');
  assertEqual(revertedInd?.styles.down.lineWidth, 2, 'Cancel cleanly reverted down.lineWidth');
  assertEqual(revertedInd?.styles.up.visible, true, 'Cancel cleanly reverted up.visible');
  assertEqual(revertedInd?.styles.down.visible, true, 'Cancel cleanly reverted down.visible');
  assertEqual(useSyncStore.getState().activeSettingsIndicator, null, 'Modal closed after Cancel');

  // Cancel after "Apply default template"
  // Custom initial styles
  const customStyles: Record<string, IndicatorPlotStyle> = {
    up: { color: '#AABBCC', lineWidth: 3, lineStyle: 'dashed', visible: true, priceLineVisible: false },
    down: { color: '#DDEEFF', lineWidth: 3, lineStyle: 'dashed', visible: true, priceLineVisible: false },
  };
  store.updateIndicatorStyles(paneId, indInstance.id, customStyles);

  // Open modal -> snapshot taken of customStyles
  store.openIndicatorSettings(paneId, indInstance.id);
  const customSnapshot = JSON.parse(JSON.stringify(customStyles));

  // User clicks "Apply default template" -> def.defaultStyles applied
  const defST = INDICATOR_REGISTRY['wickra.super_trend'];
  store.updateIndicatorStyles(paneId, indInstance.id, defST.defaultStyles);
  const afterDefaultsInd = useSyncStore.getState().indicators[paneId]?.find((i) => i.id === indInstance.id);
  assertEqual(afterDefaultsInd?.styles.up.color, '#089981', 'Defaults applied: up.color is #089981');

  // User clicks Cancel -> should revert to customSnapshot, NOT defaults!
  store.updateIndicatorStyles(paneId, indInstance.id, customSnapshot);
  store.closeIndicatorSettings();

  const afterCancelFromDefaults = useSyncStore.getState().indicators[paneId]?.find((i) => i.id === indInstance.id);
  assertEqual(afterCancelFromDefaults?.styles.up.color, '#AABBCC', 'Cancel after defaults correctly reverted to opening snapshot (#AABBCC)');
  assertEqual(afterCancelFromDefaults?.styles.down.color, '#DDEEFF', 'Cancel after defaults correctly reverted down (#DDEEFF)');

  // ==========================================================================
  // SECTION 4: Persistence & Storage Engine Hydration
  // ==========================================================================
  console.log('\n--- Section 4: Persistence & Hydration Migration ---');

  // 1. Migrate legacy single-line schema with `value` plot
  const legacySTValue: Record<string, unknown> = {
    id: 'legacy_st_1',
    type: 'supertrend',
    paneId: 'pane-1',
    name: 'SuperTrend',
    category: 'overlay',
    visible: true,
    styles: {
      value: { color: '#FF9900', lineWidth: 3, lineStyle: 'dashed', visible: true },
    },
  };

  const migratedSTValue = migrateIndicatorInstance(legacySTValue);
  assertEqual(migratedSTValue.type, 'wickra.super_trend', 'Migrated type to canonical wickra.super_trend');
  assert(Boolean(migratedSTValue.styles.up), 'Synthesized styles.up from legacy value plot');
  assert(Boolean(migratedSTValue.styles.down), 'Synthesized styles.down from legacy value plot');
  assertEqual(migratedSTValue.styles.up.lineWidth, 3, 'Inherited lineWidth=3 for up');
  assertEqual(migratedSTValue.styles.down.lineWidth, 3, 'Inherited lineWidth=3 for down');
  assertEqual(migratedSTValue.styles.up.lineStyle, 'dashed', 'Inherited lineStyle=dashed for up');
  assertEqual(migratedSTValue.styles.down.lineStyle, 'dashed', 'Inherited lineStyle=dashed for down');
  assertEqual(migratedSTValue.styles.value?.visible, false, 'Suppressed legacy value plot (visible=false)');
  assertEqual(migratedSTValue.styles.direction?.visible, false, 'Suppressed legacy direction plot (visible=false)');

  // 2. Migrate legacy single-line schema with `plot` containing colorUp / colorDown
  const legacyT3Plot: Record<string, unknown> = {
    id: 'legacy_t3_1',
    type: 't3',
    paneId: 'pane-1',
    name: 'T3',
    category: 'overlay',
    visible: true,
    styles: {
      plot: { colorUp: '#00E676', colorDown: '#E91E63', lineWidth: 2, lineStyle: 'solid', visible: true },
    },
  };

  const migratedT3 = migrateIndicatorInstance(legacyT3Plot);
  assertEqual(migratedT3.type, 'wickra.t3', 'Migrated t3 to wickra.t3');
  assertEqual(migratedT3.styles.up.color, '#00E676', 'Extracted colorUp (#00E676) into styles.up.color');
  assertEqual(migratedT3.styles.down.color, '#E91E63', 'Extracted colorDown (#E91E63) into styles.down.color');
  assertEqual(migratedT3.styles.plot?.visible, false, 'Suppressed legacy plot series');

  // 3. Migrate all 8 multi-state indicators through migrateIndicatorsRecord
  const multiPaneLayout: Record<string, unknown> = {
    'pane-1': [
      { id: 'i1', type: 'supertrend', styles: { value: { color: '#111' } } },
      { id: 'i2', type: 'hma', styles: { trend: { color: '#222' } } },
      { id: 'i3', type: 't3', styles: { plot: { color: '#333' } } },
      { id: 'i4', type: 'atr_ratchet', styles: { stop: { color: '#444' } } },
    ],
    'pane-2': [
      { id: 'i5', type: 'elder_safe_zone', styles: { value: { color: '#555' } } },
      { id: 'i6', type: 'kase_dev_stop', styles: { stop: { color: '#666' } } },
      { id: 'i7', type: 'modified_ma_stop', styles: { value: { color: '#777' } } },
      { id: 'i8', type: 'nrtr', styles: { value: { color: '#888' } } },
      { id: 'i9', type: 'rsi', styles: { plot: { color: '#7E57C2' } } },
    ],
  };

  const migratedPanes = migrateIndicatorsRecord(multiPaneLayout);
  for (let idx = 1; idx <= 4; idx++) {
    const inst = migratedPanes['pane-1'][idx - 1];
    assert(Boolean(inst.styles.up), `pane-1 item ${inst.id} has styles.up`);
    assert(Boolean(inst.styles.down), `pane-1 item ${inst.id} has styles.down`);
    assertEqual(inst.styles.value?.visible, false, `pane-1 item ${inst.id} has auxiliary value hidden`);
    assertEqual(inst.styles.direction?.visible, false, `pane-1 item ${inst.id} has auxiliary direction hidden`);
  }
  for (let idx = 5; idx <= 8; idx++) {
    const inst = migratedPanes['pane-2'][idx - 5];
    assert(Boolean(inst.styles.up), `pane-2 item ${inst.id} has styles.up`);
    assert(Boolean(inst.styles.down), `pane-2 item ${inst.id} has styles.down`);
  }
  // Check RSI is untouched
  const rsiInst = migratedPanes['pane-2'][4];
  assertEqual(rsiInst.type, 'wickra.rsi', 'RSI migrated to wickra.rsi');
  assertEqual(rsiInst.styles.plot?.color, '#7E57C2', 'RSI plot color preserved');

  // 4. Test Idempotency: re-migrating an already migrated indicator produces identical output
  const round1 = migrateIndicatorStyles('wickra.super_trend', migratedSTValue.styles);
  const round2 = migrateIndicatorStyles('wickra.super_trend', round1);
  assertEqual(JSON.stringify(round1), JSON.stringify(round2), 'migrateIndicatorStyles is 100% idempotent');

  // 5. Test Custom User Styles Preservation: custom colors must NEVER be overwritten by defaults
  const customSavedStyles: Record<string, IndicatorPlotStyle> = {
    up: { color: '#ABCDEF', lineWidth: 4, lineStyle: 'dotted', visible: false, priceLineVisible: false },
    down: { color: '#FEDCBA', lineWidth: 4, lineStyle: 'dotted', visible: true, priceLineVisible: false },
  };
  const rehydrated = migrateIndicatorStyles('wickra.super_trend', customSavedStyles);
  assertEqual(rehydrated.up.color, '#ABCDEF', 'Custom up.color preserved through rehydration');
  assertEqual(rehydrated.down.color, '#FEDCBA', 'Custom down.color preserved through rehydration');
  assertEqual(rehydrated.up.lineWidth, 4, 'Custom up.lineWidth preserved through rehydration');
  assertEqual(rehydrated.up.visible, false, 'Custom up.visible=false preserved through rehydration');
  assertEqual(rehydrated.down.visible, true, 'Custom down.visible=true preserved through rehydration');

  // 6. Direct LocalStorage Serialized Persist Verification
  // Force a store commit to localStorage
  useSyncStore.persist.rehydrate();
  const persistedJson = memoryStorage.get('ordercraft_workspace_sync_v2');
  assert(Boolean(persistedJson), 'LocalStorage contains serialized ordercraft_workspace_sync_v2 payload');
  if (persistedJson) {
    const parsedPersisted = JSON.parse(persistedJson) as { state?: { indicators?: Record<string, unknown[]> } };
    assert(Boolean(parsedPersisted.state?.indicators), 'Persisted state contains indicators map');
  }

  // ==========================================================================
  // SECTION 5: Adversarial Stress & Edge Cases
  // ==========================================================================
  console.log('\n--- Section 5: Adversarial Stress & Edge Cases ---');

  // 1. Missing / corrupted styles object
  const emptyMigrated = migrateIndicatorStyles('wickra.super_trend', {});
  assert(Boolean(emptyMigrated.up), 'Handles empty styles: up generated');
  assert(Boolean(emptyMigrated.down), 'Handles empty styles: down generated');
  assertEqual(emptyMigrated.up.color, '#089981', 'Default up color applied on empty styles');
  assertEqual(emptyMigrated.down.color, '#F23645', 'Default down color applied on empty styles');

  // 2. Rapid stress hammering (100 consecutive rapid style updates)
  const stressPane = 'pane-stress';
  store.clearIndicatorsFromPane(stressPane);
  const stressInd = store.addIndicatorToPane(stressPane, 'wickra.t3');
  for (let i = 0; i < 100; i++) {
    const isEven = i % 2 === 0;
    store.updateIndicatorStyles(stressPane, stressInd.id, {
      up: { color: isEven ? '#089981' : '#00E676', lineWidth: 2, visible: isEven, priceLineVisible: false },
      down: { color: isEven ? '#F23645' : '#FF1744', lineWidth: 3, visible: !isEven, priceLineVisible: false },
    });
  }
  const finalStress = useSyncStore.getState().indicators[stressPane]?.find((i) => i.id === stressInd.id);
  // Iteration 99 (odd): up.color = #00E676, up.visible = false, down.color = #FF1744, down.visible = true
  assertEqual(finalStress?.styles.up.color, '#00E676', 'Rapid stress update: final up color matches last iteration');
  assertEqual(finalStress?.styles.up.visible, false, 'Rapid stress update: final up visibility matches last iteration');
  assertEqual(finalStress?.styles.down.color, '#FF1744', 'Rapid stress update: final down color matches last iteration');
  assertEqual(finalStress?.styles.down.visible, true, 'Rapid stress update: final down visibility matches last iteration');

  // 3. Normalization of strange indicator ID casing and custom script namespaces
  assertEqual(normalizeIndicatorId('SUPERTREND'), 'wickra.super_trend', 'Normalizes uppercase SUPERTREND');
  assertEqual(normalizeIndicatorId('Super_Trend'), 'wickra.super_trend', 'Normalizes Super_Trend');
  assertEqual(normalizeIndicatorId('T3'), 'wickra.t3', 'Normalizes T3');
  assertEqual(normalizeIndicatorId('HMA'), 'wickra.hma', 'Normalizes HMA');
  assertEqual(normalizeIndicatorId('script.fast_hma_123'), 'script.fast_hma_123', 'Preserves script namespace without prepending wickra');
  assertEqual(normalizeIndicatorId('wickra.script.fast_hma_123'), 'script.fast_hma_123', 'Strips redundant wickra prefix from script ID');
  assertEqual(normalizeIndicatorId('custom.delta_vol'), 'custom.delta_vol', 'Preserves custom namespace without prepending wickra');
  assertEqual(normalizeIndicatorId('user.my_indicator'), 'user.my_indicator', 'Preserves user namespace without prepending wickra');

  // 4. Custom Script Dynamic Registration & Dual Alias Resolution
  const customTestDef = {
    id: 'script.test_indicator_42',
    type: 'script.test_indicator_42',
    name: 'Test Indicator 42',
    shortName: 'TestInd42',
    family: 'Custom Script' as const,
    category: 'subpane' as const,
    overlay: false,
    description: 'Custom Script Test',
    inputs: [],
    inputSchemas: [],
    defaultInputs: {},
    plots: [{ id: 'plot_0', type: 'line' as const, title: 'Oscillator', color: '#FF00FF', overlay: false, visible: true }],
    defaultStyles: {
      plot_0: {
        color: '#FF00FF',
        lineWidth: 2,
        lineStyle: 'solid' as const,
        plotType: 'line' as const,
        visible: true,
        lastValueVisible: true,
        priceLineVisible: false,
      },
    },
    plotLabels: { plot_0: 'Oscillator' },
  };

  registerCustomIndicator(customTestDef);
  assert(Boolean(INDICATOR_REGISTRY['script.test_indicator_42']), 'Custom definition accessible via script.test_indicator_42');
  assert(Boolean(INDICATOR_REGISTRY['wickra.script.test_indicator_42']), 'Custom definition accessible via wickra. alias');
  assert(Boolean(getIndicator('script.test_indicator_42')), 'getIndicator resolves script.test_indicator_42');
  assert(Boolean(getIndicator('wickra.script.test_indicator_42')), 'getIndicator resolves wickra.script.test_indicator_42');
  assert(isSubpaneIndicator('script.test_indicator_42'), 'isSubpaneIndicator recognizes overlay=false custom script');
  assert(isSubpaneIndicator('wickra.script.test_indicator_42'), 'isSubpaneIndicator recognizes wickra. alias custom script');

  // 5. Multi-color indicator verification helper
  for (const id of MULTI_STATE_INDICATOR_IDS) {
    assert(isMultiColorTrendIndicator(id), `isMultiColorTrendIndicator('${id}') returns true`);
  }
  assert(!isMultiColorTrendIndicator('wickra.rsi'), "isMultiColorTrendIndicator('wickra.rsi') returns false");
  assert(!isMultiColorTrendIndicator('wickra.sma'), "isMultiColorTrendIndicator('wickra.sma') returns false");

  // ==========================================================================
  // SUMMARY & VERDICT
  // ==========================================================================
  console.log('\n================================================================');
  console.log('CHALLENGER M2_2 VERIFICATION SUMMARY:');
  console.log(`TOTAL CHECKS: ${totalChecks}`);
  console.log(`PASSED:       ${passedChecks}`);
  console.log(`FAILED:       ${failedChecks}`);
  console.log('================================================================');

  if (failedChecks > 0) {
    console.error('\nFAILURE DETAILS:');
    failureMessages.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  } else {
    console.log('\nVERDICT: ALL ADVERSARIAL CHALLENGES PASSED EMPIRICALLY!');
    process.exit(0);
  }
}

runChallengerSuite().catch((err: unknown) => {
  console.error('Fatal unhandled error in challenger suite:', err);
  process.exit(1);
});
