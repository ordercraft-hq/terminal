import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { LineStyle, type IChartApi, type ISeriesApi, type IPriceLine } from 'lightweight-charts';
import { useSyncStore } from '../../store/syncStore';
import type { UserDrawing, LogicalAnchor, DrawingToolType } from '../../store/syncStore';
import { transport } from '../../transport/client';
import type { Candle } from '../../transport/client';
import { getPriceDecimals, detectTickSizeFromCandles, snapPriceToTick } from '../../utils/priceFormatting';
import { drawingRegistry } from '../../drawings/registry';
import { isDrawingVisibleOnTimeframe } from '../../drawings/types';
import type { TrendlineOptions, FRVPOptions, AVPOptions, AnchoredVWAPOptions } from '../../drawings/types';
import { DrawingQuickToolbar } from '../../drawings/components/DrawingQuickToolbar';

const DrawingSettingsModal = React.lazy(() =>
  import('../../drawings/components/DrawingSettingsModal').then((m) => ({
    default: m.DrawingSettingsModal,
  }))
);
import {
  getPlotDimensions,
  snapToCandleOHLC as snapToCandleOHLCHelper,
  anchorToCanvas as anchorToCanvasHelper,
  canvasToAnchor as canvasToAnchorHelper,
} from '../../drawings/helpers/drawingCoordinates';
import { hitTestDrawing as hitTestDrawingHelper } from '../../drawings/helpers/drawingHitTest';
import { drawHandleCircle, drawFallbackSingle } from '../../drawings/helpers/fallbackRenderer';
import { FixedRangeVolumeProfileTool } from '../../drawings/tools/FixedRangeVolumeProfileTool';
import { AnchoredVWAPTool } from '../../drawings/tools/AnchoredVWAPTool';
import { AnchoredVolumeProfileTool } from '../../drawings/tools/AnchoredVolumeProfileTool';
import { drawMeasureOverlay, type MeasureState } from '../../drawings/helpers/measureRenderer';

interface DrawingCanvasProps {
  chart: IChartApi | null;
  series: ISeriesApi<'Candlestick'> | null;
  candles: Candle[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  paneSymbol?: string;
  paneId?: string;
  isActive?: boolean;
  isGrid?: boolean;
}

export const CANVAS_PADDING = 12;
export const CANVAS_PADDING_BOTTOM = 32;

export const DrawingCanvas: React.FC<DrawingCanvasProps> = React.memo(({
  chart,
  series,
  candles,
  containerRef,
  paneSymbol,
  paneId,
  isActive = false,
  isGrid = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeTool = useSyncStore((s) => s.activeTool);
  const setActiveTool = useSyncStore((s) => s.setActiveTool);
  const drawings = useSyncStore(
    useShallow((s) => {
      if (s.syncDrawingsAcrossCharts) return s.drawings;
      return s.drawings.filter((d) => {
        if (d.paneId && paneId) {
          return d.paneId === paneId && (!d.symbol || d.symbol === (paneSymbol || s.symbol));
        }
        return !d.symbol || d.symbol === (paneSymbol || s.symbol);
      });
    })
  );
  const loadDrawingsForSymbol = useSyncStore((s) => s.loadDrawingsForSymbol);
  const addDrawing = useSyncStore((s) => s.addDrawing);
  const updateDrawing = useSyncStore((s) => s.updateDrawing);
  const deleteDrawing = useSyncStore((s) => s.deleteDrawing);
  const selectedDrawingId = useSyncStore((s) => s.selectedDrawingId);
  const setSelectedDrawingId = useSyncStore((s) => s.setSelectedDrawingId);
  const drawingsHidden = useSyncStore((s) => s.drawingsHidden);
  const drawingsLocked = useSyncStore((s) => s.drawingsLocked);
  const layoutId = useSyncStore((s) => s.layoutId);
  const symbol = useSyncStore((s) => s.symbol);
  const magnetMode = useSyncStore((s) => s.magnetMode);
  const cursorType = useSyncStore((s) => s.cursorType);
  const setActivePaneId = useSyncStore((s) => s.setActivePaneId);

  const globalTimeframe = useSyncStore((s) => s.timeframe);
  const paneTimeframe = useSyncStore((s) => (paneId ? s.panes[paneId]?.timeframe : undefined));
  const currentTimeframe = paneTimeframe || globalTimeframe || '15m';

  const globalTimezone = useSyncStore((s) => s.timezone);
  const paneTimezone = useSyncStore((s) => (paneId ? s.panes[paneId]?.timezone : undefined));
  const currentTimezone = paneTimezone || globalTimezone || 'UTC-4';

  const currentSymbol = paneSymbol || symbol;
  const priceDecimals = React.useMemo(() => {
    const lastPrice = candles && candles.length > 0 ? candles[candles.length - 1].close : undefined;
    return getPriceDecimals(currentSymbol, lastPrice);
  }, [currentSymbol, candles]);

  // Filter drawings strictly for this chart pane's symbol (or global untagged drawings) and active timeframe visibility
  const syncDrawingsAcrossCharts = useSyncStore((s) => s.syncDrawingsAcrossCharts);
  const currentPaneId = paneId || 'pane-1';
  const targetPaneId = !syncDrawingsAcrossCharts ? currentPaneId : undefined;

  const visibleDrawings = React.useMemo(() => {
    return drawings.filter((d) => {
      if (d.symbol && d.symbol !== currentSymbol) return false;
      if (!isDrawingVisibleOnTimeframe(d, currentTimeframe)) return false;
      // Replicate/sync drawings across charts: show on all charts with matching ticker
      if (syncDrawingsAcrossCharts) return true;
      const drawingPaneId = d.paneId || 'pane-1';
      return drawingPaneId === currentPaneId;
    });
  }, [drawings, currentSymbol, currentTimeframe, currentPaneId, syncDrawingsAcrossCharts]);

  // In-progress drafting state: refs avoid full React component re-renders on mousemove!
  const [draftAnchors, setDraftAnchors] = useState<LogicalAnchor[]>([]);
  const currentMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const isCtrlPressedRef = useRef<boolean>(false);
  const snapPointRef = useRef<{ x: number; y: number } | null>(null);
  const transientAnchorsRef = useRef<LogicalAnchor[] | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Measure Tool State (Shift + Click or Ruler shortcut)
  const [measureState, setMeasureState] = useState<MeasureState | null>(null);
  const measureStateRef = useRef<MeasureState | null>(null);
  measureStateRef.current = measureState;
  const isShiftPressedRef = useRef(false);

  // Ctrl + Drag clone interaction state
  interface CloneOnDragState {
    isClone: boolean;
    clonedId: string | null;
    sourceDrawing: UserDrawing;
    startScreenPoint: { x: number; y: number };
    startAnchor: LogicalAnchor;
    initialAnchors: LogicalAnchor[];
  }
  const cloneOnDragRef = useRef<CloneOnDragState | null>(null);

  // Load drawings from backend SQLite when symbol or layout changes
  useEffect(() => {
    let isCurrent = true;
    const cacheKey = `${layoutId}:${currentSymbol}`;
    if (useSyncStore.getState().isSymbolLoaded(cacheKey)) {
      return;
    }
    useSyncStore.getState().markSymbolLoading(cacheKey);

    transport
      .getDrawings(layoutId, currentSymbol)
      .then((records) => {
        if (!isCurrent) return;
        const loaded: UserDrawing[] = records
          .map((r) => {
            try {
              const d = JSON.parse(r.data) as UserDrawing;
              if (!d.symbol) d.symbol = r.symbol || currentSymbol;
              return d;
            } catch {
              return null;
            }
          })
          .filter((d): d is UserDrawing => d !== null);
        loadDrawingsForSymbol(currentSymbol, loaded, cacheKey);
      })
      .catch((err) => {
        console.warn('Failed to load drawings:', err);
      });
    return () => {
      isCurrent = false;
    };
  }, [layoutId, currentSymbol, loadDrawingsForSymbol]);

  // Synchronize crosshair lines and price/time scale pills on chart during drafting or dragging
  const updateChartCrosshair = useCallback(
    (anchor: LogicalAnchor, x: number, y: number) => {
      if (!chart || !series) return;
      if (isNaN(anchor.price) || isNaN(anchor.time)) return;

      try {
        const chartObj = chart as any;
        const chartWidget = chartObj._private__chartWidget;
        const seriesMap = chartObj._private__seriesMap;
        if (chartWidget && seriesMap) {
          const s = seriesMap.get(series);
          if (s) {
            const pane = chartWidget._internal_model()._internal_paneForSource(s);
            if (pane) {
              chartWidget._internal_model()._internal_setAndSaveCurrentPosition(x, y, null, pane, true);
              if (useSyncStore.getState().crosshairLock) {
                useSyncStore.getState().setSyncCrosshair({
                  sourceId: paneId || 'main',
                  time: anchor.time,
                  price: anchor.price,
                });
              }
              return;
            }
          }
        }
        // Standard public lightweight-charts API fallback
        chart.setCrosshairPosition(anchor.price, anchor.time as any, series);
        if (useSyncStore.getState().crosshairLock) {
          useSyncStore.getState().setSyncCrosshair({
            sourceId: paneId || 'main',
            time: anchor.time,
            price: anchor.price,
          });
        }
      } catch {
        try {
          chart.setCrosshairPosition(anchor.price, anchor.time as any, series);
        } catch {}
      }
    },
    [chart, series, paneId]
  );

  const clearChartCrosshair = useCallback(() => {
    if (!chart) return;
    try {
      chart.clearCrosshairPosition();
      if (useSyncStore.getState().crosshairLock) {
        useSyncStore.getState().setSyncCrosshair(null);
      }
    } catch {}
  }, [chart]);

  // Clear draft & snap states and synthetic crosshair when tool switches to cursor or when all drawings are cleared
  useEffect(() => {
    if (activeTool === 'cursor' || drawings.length === 0) {
      setDraftAnchors((prev) => (prev.length === 0 ? prev : []));
      snapPointRef.current = null;
      clearChartCrosshair();
    }
  }, [activeTool, drawings.length, clearChartCrosshair]);

  // Clean up synthetic crosshair on unmount
  useEffect(() => {
    return () => {
      clearChartCrosshair();
    };
  }, [clearChartCrosshair]);

  // Interaction states: dragging a handle vs dragging the whole drawing
  const [draggedHandle, setDraggedHandle] = useState<{
    drawingId: string;
    handleIndex: number;
    startAnchor?: LogicalAnchor;
    initialAnchors?: LogicalAnchor[];
  } | null>(null);
  const [draggedDrawing, setDraggedDrawing] = useState<{
    drawingId: string;
    startAnchor: LogicalAnchor;
    initialAnchors: LogicalAnchor[];
  } | null>(null);
  const [hoveredDrawingId, setHoveredDrawingId] = useState<string | null>(null);
  const hoveredDrawingIdRef = useRef<string | null>(null);
  hoveredDrawingIdRef.current = hoveredDrawingId;

  // Stable refs for hot loops (0 React re-renders during mouse interactions)
  const drawingsRef = useRef(drawings);
  drawingsRef.current = drawings;
  const candlesRef = useRef(candles);
  candlesRef.current = candles;
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const draggedHandleRef = useRef(draggedHandle);
  draggedHandleRef.current = draggedHandle;
  const draggedDrawingRef = useRef(draggedDrawing);
  draggedDrawingRef.current = draggedDrawing;

  const renderCanvasRef = useRef<() => void>(() => {});
  const pendingRafRef = useRef<number | null>(null);
  const scheduleRender = useCallback(() => {
    if (pendingRafRef.current === null) {
      pendingRafRef.current = requestAnimationFrame(() => {
        pendingRafRef.current = null;
        renderCanvasRef.current();
      });
    }
  }, []);

  // Keyboard listener for Ctrl / Meta key for on-demand snapping
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta' || e.ctrlKey || e.metaKey) {
        isCtrlPressedRef.current = true;
        const container = containerRef.current;
        if (container && hoveredDrawingIdRef.current && !drawingsLocked) {
          container.style.cursor = 'copy';
          container.setAttribute('data-active-cursor', 'copy');
        }
        if (activeToolRef.current !== 'cursor' || draggedHandleRef.current || draggedDrawingRef.current) {
          scheduleRender();
        }
      }
      if (e.key === 'Shift') {
        isShiftPressedRef.current = true;
      }
      if (e.key === 'Escape' && measureStateRef.current) {
        setMeasureState(null);
        clearChartCrosshair();
        scheduleRender();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta' || (!e.ctrlKey && !e.metaKey)) {
        isCtrlPressedRef.current = false;
        const container = containerRef.current;
        if (container && hoveredDrawingIdRef.current && !drawingsLocked) {
          container.style.cursor = 'grab';
          container.setAttribute('data-active-cursor', 'grab');
        }
        if (activeToolRef.current !== 'cursor' || draggedHandleRef.current || draggedDrawingRef.current) {
          scheduleRender();
        }
      }
      if (e.key === 'Shift') {
        isShiftPressedRef.current = false;
      }
    };
    const handleReset = () => {
      isCtrlPressedRef.current = false;
      isShiftPressedRef.current = false;
      if (activeToolRef.current !== 'cursor' || draggedHandleRef.current || draggedDrawingRef.current) {
        scheduleRender();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleReset);
    window.addEventListener('focus', handleReset);
    document.addEventListener('visibilitychange', handleReset);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleReset);
      window.removeEventListener('focus', handleReset);
      document.removeEventListener('visibilitychange', handleReset);
    };
  }, [scheduleRender]);

  // Plotting area size (strictly excluding right price scale and bottom time scale)
  const [plotSize, setPlotSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const plotSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  // Helper: Retrieve exact plot area dimensions (strictly excluding right price scale and bottom time scale)
  const getExactPlotDimensions = useCallback((): { width: number; height: number } => {
    return getPlotDimensions(chart, containerRef.current, plotSizeRef.current);
  }, [chart, containerRef]);

  useEffect(() => {
    const updateSize = () => {
      const { width: newW, height: newH } = getExactPlotDimensions();
      if (newW > 0 && newH > 0) {
        setPlotSize((prev) => {
          if (Math.abs(prev.width - newW) < 1 && Math.abs(prev.height - newH) < 1) {
            return prev;
          }
          plotSizeRef.current = { width: newW, height: newH };
          return { width: newW, height: newH };
        });
      }
    };

    updateSize();

    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current) {
      resizeObserver = new ResizeObserver(() => updateSize());
      resizeObserver.observe(containerRef.current);
    }

    if (chart) {
      try {
        chart.timeScale().subscribeSizeChange(updateSize);
      } catch {}
    }

    return () => {
      resizeObserver?.disconnect();
      if (chart) {
        try {
          chart.timeScale().unsubscribeSizeChange(updateSize);
        } catch {}
      }
    };
  }, [containerRef, chart, getExactPlotDimensions]);

  // Helper: Snap coordinates and anchor to Candle Open, High, Low, or Close
  const snapToCandleOHLC = useCallback(
    (
      rawAnchor: LogicalAnchor,
      mouseX: number,
      mouseY: number,
      isCtrlHeld: boolean
    ): { anchor: LogicalAnchor; snapCoord: { x: number; y: number } | null } => {
      return snapToCandleOHLCHelper(
        rawAnchor,
        mouseX,
        mouseY,
        isCtrlHeld,
        magnetMode,
        chart,
        series,
        candles
      );
    },
    [magnetMode, chart, series, candles]
  );

  // Helper: Convert LogicalAnchor (time, price) to Canvas Coordinates (x, y)
  const anchorToCanvas = useCallback(
    (anchor: LogicalAnchor): { x: number; y: number } | null => {
      return anchorToCanvasHelper(anchor, chart, series, candles);
    },
    [chart, series, candles]
  );

  // Helper: Convert Canvas Coordinates (x, y) to LogicalAnchor (time, price)
  const canvasToAnchor = useCallback(
    (x: number, y: number): LogicalAnchor | null => {
      return canvasToAnchorHelper(x, y, chart, series, candles);
    },
    [chart, series, candles]
  );

  // Hit test drawings on coordinate (px, py)
  const hitTestDrawing = useCallback(
    (px: number, py: number): { drawingId: string; handleIndex: number } | null => {
      return hitTestDrawingHelper(px, py, {
        drawingsHidden,
        visibleDrawings,
        selectedDrawingId,
        chart,
        series,
        candles,
        plotSize,
        priceDecimals,
        canvas: canvasRef.current,
        currentTimezone,
        anchorToCanvas,
        canvasToAnchor,
      });
    },
    [
      drawingsHidden,
      visibleDrawings,
      selectedDrawingId,
      chart,
      series,
      candles,
      plotSize,
      priceDecimals,
      currentTimezone,
      anchorToCanvas,
      canvasToAnchor,
    ]
  );

  // In cursor mode, detect clicking on drawings from the container to select or drag them
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleContainerPointerDown = (e: PointerEvent) => {
      // Only process primary mouse button (left click)
      if (e.button !== 0) return;

      // Ignore clicks on UI elements (floating toolbar, context menu, controls, buttons)
      const target = e.target as HTMLElement | null;
      if (target && target.closest('.floating-drawing-toolbar, button, input, select, [role="button"]')) {
        return;
      }

      const isShift = Boolean(e.shiftKey || isShiftPressedRef.current);
      const isMeasureTool = activeTool === 'price_range' || activeTool === 'date_price_range';

      // 1. If a measurement is already placed, clicking anywhere (without shift) dismisses it
      if (measureStateRef.current?.isPlaced) {
        if (!isShift && !isMeasureTool) {
          e.stopPropagation();
          e.preventDefault();
          setMeasureState(null);
          clearChartCrosshair();
          scheduleRender();
          return;
        }
        setMeasureState(null);
      }

      // 2. If in click-move-click measurement mode (second click locks and places measurement)
      if (measureStateRef.current && !measureStateRef.current.isPlaced && !measureStateRef.current.isDragging) {
        e.stopPropagation();
        e.preventDefault();
        setMeasureState((prev) => (prev ? { ...prev, isPlaced: true } : null));
        if (isMeasureTool) {
          setActiveTool('cursor');
        }
        scheduleRender();
        return;
      }

      // 3. If Shift is pressed or Measure tool is active: start a new measurement!
      if (isShift || isMeasureTool) {
        e.stopPropagation();
        e.preventDefault();

        if (paneId) {
          setActivePaneId(paneId);
        }

        const rect = container.getBoundingClientRect();
        const { width, height } = getExactPlotDimensions();
        if (width <= 0 || height <= 0) return;

        const rawX = e.clientX - rect.left;
        const rawY = e.clientY - rect.top;
        const x = Math.max(0, Math.min(width, rawX));
        const y = Math.max(0, Math.min(height, rawY));

        const rawAnchor = canvasToAnchor(x, y);
        if (rawAnchor) {
          const isCtrl = Boolean(e.ctrlKey || e.metaKey);
          const { anchor, snapCoord } = snapToCandleOHLC(rawAnchor, x, y, isCtrl);
          const targetX = snapCoord ? snapCoord.x : x;
          const targetY = snapCoord ? snapCoord.y : y;
          setMeasureState({
            startAnchor: anchor,
            currentAnchor: anchor,
            isPlaced: false,
            startPoint: { x: targetX, y: targetY },
            currentPoint: { x: targetX, y: targetY },
            isDragging: true,
          });
          updateChartCrosshair(anchor, targetX, targetY);
          scheduleRender();
        }
        return;
      }

      // When a drawing tool is drafting, canvas handles pointer events
      if (activeTool !== 'cursor') return;

      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const hit = hitTestDrawing(x, y);
      if (hit) {
        e.stopPropagation();
        e.preventDefault();

        if (paneId) {
          setActivePaneId(paneId);
        }
        setSelectedDrawingId(hit.drawingId);

        const targetDrawing = visibleDrawings.find((d) => d.id === hit.drawingId);
        const isLocked = drawingsLocked || !!targetDrawing?.locked;

        if (!isLocked && targetDrawing) {
          const rawAnchor = canvasToAnchor(x, y);
          if (rawAnchor) {
            const isCtrl = Boolean(e.ctrlKey || e.metaKey || isCtrlPressedRef.current);
            if (isCtrl) {
              cloneOnDragRef.current = {
                isClone: true,
                clonedId: null,
                sourceDrawing: targetDrawing,
                startScreenPoint: { x: e.clientX, y: e.clientY },
                startAnchor: rawAnchor,
                initialAnchors: targetDrawing.anchors.map((a) => ({ ...a })),
              };
              setDraggedDrawing({
                drawingId: hit.drawingId,
                startAnchor: rawAnchor,
                initialAnchors: targetDrawing.anchors.map((a) => ({ ...a })),
              });
            } else if (hit.handleIndex >= 0) {
              cloneOnDragRef.current = null;
              setDraggedHandle({
                drawingId: hit.drawingId,
                handleIndex: hit.handleIndex,
                startAnchor: rawAnchor,
                initialAnchors: [...targetDrawing.anchors],
              });
            } else {
              cloneOnDragRef.current = null;
              setDraggedDrawing({
                drawingId: hit.drawingId,
                startAnchor: rawAnchor,
                initialAnchors: [...targetDrawing.anchors],
              });
            }
          }
        }
      } else {
        cloneOnDragRef.current = null;
        if (selectedDrawingId) {
          setSelectedDrawingId(null);
        }
      }
    };

    let moveRafId: number | null = null;
    let pendingMoveEvent: { clientX: number; clientY: number; target: EventTarget | null } | null = null;

    const processPointerMove = () => {
      moveRafId = null;
      if (!pendingMoveEvent) return;
      if (activeTool !== 'cursor' || draggedHandle || draggedDrawing) return;

      const target = pendingMoveEvent.target as HTMLElement | null;
      if (target && target.closest('.floating-drawing-toolbar, button, input, select, [role="button"]')) {
        if (container.style.cursor !== '') container.style.cursor = '';
        if (container.hasAttribute('data-active-cursor')) container.removeAttribute('data-active-cursor');
        setHoveredDrawingId(null);
        return;
      }

      const rect = container.getBoundingClientRect();
      const x = pendingMoveEvent.clientX - rect.left;
      const y = pendingMoveEvent.clientY - rect.top;

      const hit = hitTestDrawing(x, y);
      const newHoveredId = hit ? hit.drawingId : null;
      setHoveredDrawingId((prev) => (prev === newHoveredId ? prev : newHoveredId));

      if (hit) {
        const targetDrawing = visibleDrawings.find((d) => d.id === hit.drawingId);
        const isLocked = drawingsLocked || !!targetDrawing?.locked;
        let cur = 'move';
        if (isLocked) {
          cur = 'pointer';
        } else if (isCtrlPressedRef.current) {
          cur = 'copy';
        } else if (targetDrawing && (targetDrawing.type === 'long_position' || targetDrawing.type === 'short_position')) {
          if (hit.handleIndex === 1 || hit.handleIndex === 2) {
            cur = 'ns-resize';
          } else if (hit.handleIndex === 3) {
            cur = 'ew-resize';
          } else if (hit.handleIndex === 0) {
            cur = 'move';
          } else {
            cur = 'grab';
          }
        } else {
          cur = hit.handleIndex >= 0 ? 'move' : 'grab';
        }
        if (container.style.cursor !== cur) container.style.cursor = cur;
        if (container.getAttribute('data-active-cursor') !== cur) {
          container.setAttribute('data-active-cursor', cur);
        }
      } else {
        if (container.style.cursor !== '') container.style.cursor = '';
        if (container.hasAttribute('data-active-cursor')) {
          container.removeAttribute('data-active-cursor');
        }
      }
    };

    const handleContainerPointerMove = (e: PointerEvent) => {
      if (activeTool !== 'cursor' || draggedHandle || draggedDrawing) return;
      pendingMoveEvent = { clientX: e.clientX, clientY: e.clientY, target: e.target };
      if (moveRafId === null) {
        moveRafId = requestAnimationFrame(processPointerMove);
      }
    };

    const handleContainerPointerLeave = () => {
      if (moveRafId !== null) {
        cancelAnimationFrame(moveRafId);
        moveRafId = null;
      }
      pendingMoveEvent = null;
      setHoveredDrawingId(null);
      if (container.style.cursor !== '') container.style.cursor = '';
      if (container.hasAttribute('data-active-cursor')) {
        container.removeAttribute('data-active-cursor');
      }
    };

    const handleContainerDblClick = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest('.floating-drawing-toolbar, button, input, select, [role="button"]')) {
        return;
      }
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hit = hitTestDrawing(x, y);
      if (hit) {
        e.stopPropagation();
        e.preventDefault();
        setSelectedDrawingId(hit.drawingId);
        setIsSettingsModalOpen(true);
      }
    };

    container.addEventListener('pointerdown', handleContainerPointerDown, { capture: true });
    container.addEventListener('pointermove', handleContainerPointerMove);
    container.addEventListener('pointerleave', handleContainerPointerLeave);
    container.addEventListener('dblclick', handleContainerDblClick);
    return () => {
      if (moveRafId !== null) {
        cancelAnimationFrame(moveRafId);
        moveRafId = null;
      }
      container.removeEventListener('pointerdown', handleContainerPointerDown, { capture: true });
      container.removeEventListener('pointermove', handleContainerPointerMove);
      container.removeEventListener('pointerleave', handleContainerPointerLeave);
      container.removeEventListener('dblclick', handleContainerDblClick);
      container.style.cursor = '';
      container.removeAttribute('data-active-cursor');
    };
  }, [
    containerRef,
    activeTool,
    hitTestDrawing,
    paneId,
    drawingsLocked,
    canvasToAnchor,
    visibleDrawings,
    selectedDrawingId,
    setActivePaneId,
    setSelectedDrawingId,
    setIsSettingsModalOpen,
  ]);

  // Window pointer listeners while a measurement is active (in-progress)
  useEffect(() => {
    if (!measureState || measureState.isPlaced) return;

    const handleMeasurePointerMove = (e: PointerEvent) => {
      const container = containerRef.current;
      if (!container || !chart || !series) return;
      const rect = container.getBoundingClientRect();
      const { width, height } = getExactPlotDimensions();
      if (width <= 0 || height <= 0) return;

      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;
      const x = Math.max(0, Math.min(width, rawX));
      const y = Math.max(0, Math.min(height, rawY));

      const rawAnchor = canvasToAnchor(x, y);
      if (!rawAnchor) return;

      const isCtrl = Boolean(e.ctrlKey || e.metaKey);
      const { anchor, snapCoord } = snapToCandleOHLC(rawAnchor, x, y, isCtrl);
      const targetX = snapCoord ? snapCoord.x : x;
      const targetY = snapCoord ? snapCoord.y : y;

      setMeasureState((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          currentAnchor: anchor,
          currentPoint: { x: targetX, y: targetY },
        };
      });
      updateChartCrosshair(anchor, targetX, targetY);
      scheduleRender();
    };

    const handleMeasurePointerUp = () => {
      setMeasureState((prev) => {
        if (!prev || prev.isPlaced) return prev;
        const startPt = prev.startPoint || { x: 0, y: 0 };
        const currentPt = prev.currentPoint || startPt;
        const dist = Math.hypot(currentPt.x - startPt.x, currentPt.y - startPt.y);

        // If dragged more than 5px, lock and place measurement on pointerup!
        if (dist > 5) {
          if (activeToolRef.current === 'price_range' || activeToolRef.current === 'date_price_range') {
            setActiveTool('cursor');
          }
          return {
            ...prev,
            isPlaced: true,
            isDragging: false,
          };
        }
        // Otherwise click-move-click mode: keep measuring until next click!
        return {
          ...prev,
          isDragging: false,
        };
      });
      scheduleRender();
    };

    window.addEventListener('pointermove', handleMeasurePointerMove);
    window.addEventListener('pointerup', handleMeasurePointerUp);
    return () => {
      window.removeEventListener('pointermove', handleMeasurePointerMove);
      window.removeEventListener('pointerup', handleMeasurePointerUp);
    };
  }, [
    measureState?.isPlaced,
    chart,
    series,
    getExactPlotDimensions,
    canvasToAnchor,
    snapToCandleOHLC,
    updateChartCrosshair,
    scheduleRender,
    setActiveTool,
    containerRef,
  ]);

  const hasDrawnRef = useRef(false);

  // Redraw all drawings onto HTML5 Canvas
  const renderCanvas = useCallback(() => {
    try {
      const canvas = canvasRef.current;
      if (!canvas || !chart || !series) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const isDrafting = activeTool !== 'cursor' && draftAnchors.length > 0;
      const hasSnap = snapPointRef.current !== null;
      const hasHandleDrag = draggedHandleRef.current !== null || draggedDrawingRef.current !== null;
      const hasDrawings = visibleDrawings.some((d) => !d.hidden);
      const hasMeasure = measureStateRef.current !== null;

      // Blank Canvas Resource Pooling: If there are no drawings, drafts, or active handles,
      // release the underlying GPU texture back to 1x1 (4 bytes) to eliminate multi-chart VRAM overhead.
      if (!hasDrawings && !isDrafting && !hasSnap && !hasHandleDrag && !hasMeasure) {
        if (hasDrawnRef.current) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          canvas.width = 1;
          canvas.height = 1;
          hasDrawnRef.current = false;
        }
        return;
      }

      hasDrawnRef.current = true;
      const baseDpr = window.devicePixelRatio || 1;
      // In multi-pane grid mode, clamp DPR to 1.25 to save up to 75% VRAM per pane
      const dpr = isGrid ? Math.min(baseDpr, 1.25) : baseDpr;
      const { width, height } = getExactPlotDimensions();
      if (width <= 0 || height <= 0) return;

      const totalWidth = width + CANVAS_PADDING * 2;
      const totalHeight = height + CANVAS_PADDING + CANVAS_PADDING_BOTTOM;

      const targetWidth = Math.round(totalWidth * dpr);
      const targetHeight = Math.round(totalHeight * dpr);

      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);
      ctx.translate(CANVAS_PADDING, CANVAS_PADDING);

    if (drawingsHidden) {
      ctx.restore();
      return;
    }

    // Queue handles to draw in unclipped layer afterwards
    const handlesToDraw: { x: number; y: number; isSelected: boolean; customColor?: string }[] = [];
    const drawHandle = (x: number, y: number, isSelected: boolean, customColor?: string) => {
      // Only draw handles that are on screen or on the boundary divider (margin of 6px for handle radius)
      if (x >= -6 && x <= width + 6 && y >= -6 && y <= height + 6) {
        handlesToDraw.push({ x, y, isSelected, customColor });
      }
    };

    const drawSingle = (
      type: DrawingToolType,
      anchors: LogicalAnchor[],
      isSelected: boolean,
      color = '#2962ff',
      isDraft = false,
      customLineWidth?: number,
      customLineStyle?: 'solid' | 'dashed' | 'dotted'
    ) => {
      drawFallbackSingle({
        ctx,
        type,
        anchors,
        isSelected,
        color,
        isDraft,
        customLineWidth,
        customLineStyle,
        width,
        height,
        series,
        candles,
        priceDecimals,
        anchorToCanvas,
        drawHandle,
      });
    };

    // Strictly clip drawing paths, fills, and labels so they don't spill onto scales
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(width, 0);
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.clip();

    const currentHandle = draggedHandleRef.current;
    const currentDrag = draggedDrawingRef.current;
    const activeDraggedId = currentHandle?.drawingId || currentDrag?.drawingId;
    const transient = transientAnchorsRef.current;

    // 1. Draw existing committed drawings for this chart's symbol
    visibleDrawings.forEach((d) => {
      if (d.hidden) return;
      const isSelected = isActive && d.id === selectedDrawingId;
      const isHovered = isActive && d.id === hoveredDrawingId;
      const drawingToRender = (activeDraggedId === d.id && transient) ? { ...d, anchors: transient } : d;
      if (drawingRegistry.has(d.type)) {
        drawingRegistry.get(d.type)!.render(
          {
            ctx,
            chart,
            series,
            candles,
            width,
            height,
            priceDecimals,
            isSelected,
            isHovered,
            isDraft: false,
            pixelRatio: dpr,
            anchorToCoordinates: anchorToCanvas,
            canvasToAnchor,
            timezone: currentTimezone,
          },
          drawingToRender
        );
      } else {
        drawSingle(
          drawingToRender.type,
          drawingToRender.anchors,
          isSelected,
          drawingToRender.color || '#2962ff',
          false,
          drawingToRender.lineWidth,
          drawingToRender.lineStyle
        );
      }
    });

    // 2. Draw in-progress draft drawing
    const currentMousePos = currentMousePosRef.current;
    const snapPoint = snapPointRef.current;
    const isCtrlPressed = isCtrlPressedRef.current;

    if (activeTool !== 'cursor' && draftAnchors.length > 0 && currentMousePos) {
      const mouseAnchor = canvasToAnchor(currentMousePos.x, currentMousePos.y);
      if (mouseAnchor) {
        const { anchor: snappedAnchor } = snapToCandleOHLC(
          mouseAnchor,
          currentMousePos.x,
          currentMousePos.y,
          isCtrlPressed
        );
        let finalDraftAnchor = snappedAnchor;
        if (activeTool === 'parallel_channel' && draftAnchors.length === 2) {
          const a1 = draftAnchors[0];
          const a2 = draftAnchors[1];
          const dt = a2.time - a1.time;
          const pBase =
            dt !== 0
              ? a1.price + ((a2.price - a1.price) / dt) * (snappedAnchor.time - a1.time)
              : a1.price;
          const dp = snappedAnchor.price - pBase;
          finalDraftAnchor = { time: a2.time, price: a2.price + dp };
        }
        if (drawingRegistry.has(activeTool)) {
          const tool = drawingRegistry.get(activeTool)!;
          const draftColor = activeTool === 'rotated_rectangle' ? '#089981' : '#2962ff';
          const draftDrawing = tool.createDefaultDrawing(
            'draft',
            [...draftAnchors, finalDraftAnchor],
            currentSymbol,
            paneId,
            draftColor
          );
          tool.render(
            {
              ctx,
              chart,
              series,
              candles,
              width,
              height,
              priceDecimals,
              isSelected: true,
              isDraft: true,
              pixelRatio: dpr,
              anchorToCoordinates: anchorToCanvas,
              canvasToAnchor,
              timezone: currentTimezone,
            },
            draftDrawing
          );
        } else {
          drawSingle(activeTool, [...draftAnchors, snappedAnchor], true, '#2962ff', true);
        }
      }
    }

    // 3. Draw snap indicator reticle when snapping to a candle OHLC point
    if (snapPoint && (activeTool !== 'cursor' || hasHandleDrag)) {
      ctx.save();
      ctx.strokeStyle = '#00e5ff';
      ctx.fillStyle = 'rgba(0, 229, 255, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(snapPoint.x, snapPoint.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(snapPoint.x - 3, snapPoint.y);
      ctx.lineTo(snapPoint.x + 3, snapPoint.y);
      ctx.moveTo(snapPoint.x, snapPoint.y - 3);
      ctx.lineTo(snapPoint.x, snapPoint.y + 3);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore(); // End line clip

    // 2.5. Render active or placed Measure overlay (unclipped so stats badge can render above/below without clipping)
    const currentMeasure = measureStateRef.current;
    if (currentMeasure) {
      drawMeasureOverlay({
        ctx,
        startAnchor: currentMeasure.startAnchor,
        currentAnchor: currentMeasure.currentAnchor,
        width,
        height,
        candles,
        priceDecimals,
        anchorToCanvas,
        isPlaced: currentMeasure.isPlaced,
        drawHandle,
      });
    }

    // 3.5. Render time scale badges directly on bottom time scale (unclipped)
    visibleDrawings.forEach((d) => {
      if (d.hidden) return;
      const opts = (d.options as TrendlineOptions) || {};
      if (
        (d.type === 'vertical_line' || d.type === 'cross_line' || d.type === 'anchored_volume_profile') &&
        opts.showTimeLabel !== false &&
        d.anchors &&
        d.anchors.length >= 1
      ) {
        const tool = drawingRegistry.get(d.type);
        if (tool && (tool as any).renderTimeLabel) {
          (tool as any).renderTimeLabel(
            {
              ctx,
              chart,
              series,
              candles,
              width,
              height,
              priceDecimals,
              isSelected: isActive && d.id === selectedDrawingId,
              isDraft: false,
              pixelRatio: dpr,
              anchorToCoordinates: anchorToCanvas,
              canvasToAnchor,
              timezone: currentTimezone,
            },
            d
          );
        }
      }
    });

    // Also draw draft time label if drafting vertical_line or cross_line
    if (
      (activeTool === 'vertical_line' || activeTool === 'cross_line') &&
      draftAnchors.length > 0 &&
      currentMousePos
    ) {
      const mouseAnchor = canvasToAnchor(currentMousePos.x, currentMousePos.y);
      if (mouseAnchor) {
        const { anchor: snappedAnchor } = snapToCandleOHLC(
          mouseAnchor,
          currentMousePos.x,
          currentMousePos.y,
          isCtrlPressed
        );
        const tool = drawingRegistry.get(activeTool);
        if (tool && (tool as any).renderTimeLabel) {
          const draftDrawing = tool.createDefaultDrawing(
            'draft',
            [...draftAnchors, snappedAnchor],
            currentSymbol,
            paneId,
            '#2962ff'
          );
          (tool as any).renderTimeLabel(
            {
              ctx,
              chart,
              series,
              candles,
              width,
              height,
              priceDecimals,
              isSelected: true,
              isDraft: true,
              pixelRatio: dpr,
              anchorToCoordinates: anchorToCanvas,
              canvasToAnchor,
              timezone: currentTimezone,
            },
            draftDrawing
          );
        }
      }
    }

    // 4. Render all handles in unclipped canvas space (handles on boundaries render without being sliced!)
    for (const h of handlesToDraw) {
      drawHandleCircle(ctx, h.x, h.y, h.isSelected, h.customColor);
    }

    ctx.restore(); // Restore base transform & translate
  } catch {
    // Gracefully ignore calls if chart or series was disposed
  }
  }, [
    chart,
    series,
    candles,
    drawings,
    drawingsHidden,
    selectedDrawingId,
    hoveredDrawingId,
    activeTool,
    draftAnchors,
    anchorToCanvas,
    canvasToAnchor,
    snapToCandleOHLC,
    plotSize,
    getExactPlotDimensions,
    isGrid,
  ]);

  renderCanvasRef.current = renderCanvas;

  // Hook to redraw whenever chart timeScale pans, zooms, or price scales
  useEffect(() => {
    if (!chart) return;
    const timeScale = chart.timeScale();
    const handleRangeChange = () => {
      scheduleRender();
    };

    timeScale.subscribeVisibleTimeRangeChange(handleRangeChange);
    timeScale.subscribeVisibleLogicalRangeChange(handleRangeChange);

    const container = containerRef.current;
    let isDragging = false;

    const onPointerMove = () => {
      if (isDragging) {
        scheduleRender();
      }
    };

    const onPointerUp = () => {
      isDragging = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      scheduleRender();
    };

    const onPointerDown = () => {
      isDragging = true;
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    };

    const onWheel = () => {
      scheduleRender();
    };

    if (container) {
      container.addEventListener('pointerdown', onPointerDown);
      container.addEventListener('wheel', onWheel, { passive: true });
    }

    scheduleRender();

    return () => {
      try {
        timeScale.unsubscribeVisibleTimeRangeChange(handleRangeChange);
        timeScale.unsubscribeVisibleLogicalRangeChange(handleRangeChange);
      } catch {}
      if (container) {
        container.removeEventListener('pointerdown', onPointerDown);
        container.removeEventListener('wheel', onWheel);
      }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [chart, containerRef, scheduleRender]);

  // Redraw canvas whenever drawings, selection, active tool, or drafting/snap changes
  useEffect(() => {
    scheduleRender();
    return () => {
      if (pendingRafRef.current !== null) {
        cancelAnimationFrame(pendingRafRef.current);
        pendingRafRef.current = null;
      }
    };
  }, [scheduleRender, renderCanvas, candles]);

  const commitPath = useCallback(
    (anchorsToCommit: LogicalAnchor[]) => {
      if (anchorsToCommit.length < 2) return;
      const id = `draw_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
      const tool = drawingRegistry.get('path');
      const newDrawing: UserDrawing = tool
        ? tool.createDefaultDrawing(id, anchorsToCommit, currentSymbol, targetPaneId, '#2962ff')
        : {
            id,
            type: 'path',
            anchors: anchorsToCommit,
            color: '#2962ff',
            symbol: currentSymbol,
            paneId: targetPaneId,
          };
      addDrawing(newDrawing);
      if (paneId) {
        setActivePaneId(paneId);
      }
      setSelectedDrawingId(newDrawing.id);
      setActiveTool('cursor');
      setDraftAnchors([]);
      snapPointRef.current = null;
      currentMousePosRef.current = null;

      transport
        .saveDrawing({
          id: newDrawing.id,
          layout_id: layoutId,
          tool_type: newDrawing.type,
          symbol: currentSymbol,
          data: JSON.stringify(newDrawing),
        })
        .catch(console.error);
    },
    [currentSymbol, paneId, targetPaneId, addDrawing, setActivePaneId, setSelectedDrawingId, setActiveTool, layoutId]
  );

  // Pointer event handlers on Canvas
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    if (!canvasRef.current || !chart || !series) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const { width, height } = getExactPlotDimensions();
    if (width <= 0 || height <= 0) return;

    const rawX = e.clientX - (rect.left + CANVAS_PADDING);
    const rawY = e.clientY - (rect.top + CANVAS_PADDING);
    // Allow clicking within CANVAS_PADDING of edges (e.g. edge handles, border clicks, bottom timescale)
    if (rawX < -CANVAS_PADDING || rawX > width + CANVAS_PADDING || rawY < -CANVAS_PADDING || rawY > height + CANVAS_PADDING_BOTTOM) return;

    if (paneId) {
      setActivePaneId(paneId);
    }

    // Clamp coordinates to plot bounds for anchor placement
    const x = Math.max(0, Math.min(width, rawX));
    const y = Math.max(0, Math.min(height, rawY));

    const rawAnchor = canvasToAnchor(x, y);
    if (!rawAnchor) return;

    const isCtrl = Boolean(e.ctrlKey || e.metaKey);
    isCtrlPressedRef.current = isCtrl;
    const { anchor, snapCoord } = snapToCandleOHLC(rawAnchor, x, y, isCtrl);
    const targetX = snapCoord ? snapCoord.x : x;
    const targetY = snapCoord ? snapCoord.y : y;

    const isShift = Boolean(e.shiftKey || isShiftPressedRef.current);
    const isMeasureTool = activeTool === 'price_range' || activeTool === 'date_price_range';

    // If a measurement is placed, clicking dismisses it
    if (measureStateRef.current?.isPlaced) {
      if (!isShift && !isMeasureTool) {
        setMeasureState(null);
        clearChartCrosshair();
        scheduleRender();
        return;
      }
      setMeasureState(null);
    }

    // If measuring in click-move-click mode, second click locks and places measurement
    if (measureStateRef.current && !measureStateRef.current.isPlaced && !measureStateRef.current.isDragging) {
      setMeasureState((prev) => (prev ? { ...prev, isPlaced: true } : null));
      if (isMeasureTool) {
        setActiveTool('cursor');
      }
      scheduleRender();
      return;
    }

    // If Shift is pressed or Measure tool is active: start a new measurement!
    if (isShift || isMeasureTool) {
      setMeasureState({
        startAnchor: anchor,
        currentAnchor: anchor,
        isPlaced: false,
        startPoint: { x: targetX, y: targetY },
        currentPoint: { x: targetX, y: targetY },
        isDragging: true,
      });
      updateChartCrosshair(anchor, targetX, targetY);
      scheduleRender();
      return;
    }

    // A. If drawing tool is active:
    if (activeTool !== 'cursor') {
      const singleClickTools: DrawingToolType[] = [
        'horizontal_line',
        'vertical_line',
        'cross_line',
        'horizontal_ray',
        'long_position',
        'short_position',
        'anchored_vwap',
        'anchored_volume_profile',
      ];

      if (singleClickTools.includes(activeTool)) {
        if (activeTool === 'long_position' || activeTool === 'short_position') {
          const barDt =
            candles.length >= 2
              ? Math.max(1, candles[candles.length - 1].time - candles[candles.length - 2].time)
              : 60;
          const t1 = anchor.time;
          // Compact default width: 12 bars instead of 30 bars
          const t2 = t1 + 12 * barDt;
          const pEntry = anchor.price;
          const isLong = activeTool === 'long_position';

          let pTarget = 0;
          let pStop = 0;

          // 1. Preferred: Pixel-proportional sizing from active chart series so it fits comfortably within view (~55px target, ~28px stop)
          if (series) {
            const yEntry = series.priceToCoordinate(pEntry);
            if (yEntry !== null && !isNaN(yEntry)) {
              const targetY = isLong ? yEntry - 60 : yEntry + 60;
              const stopY = isLong ? yEntry + 30 : yEntry - 30;
              const calcTarget = series.coordinateToPrice(targetY as any);
              const calcStop = series.coordinateToPrice(stopY as any);
              if (
                calcTarget !== null &&
                calcStop !== null &&
                !isNaN(calcTarget) &&
                !isNaN(calcStop) &&
                calcTarget > 0 &&
                calcStop > 0
              ) {
                pTarget = calcTarget;
                pStop = calcStop;
              }
            }
          }

          // 2. Fallback: Recent candle volatility (average candle range * 2.0 for target, * 1.0 for stop)
          if (!pTarget || !pStop) {
            const recentCandles = candles.slice(-15);
            const avgBarRange =
              recentCandles.length > 0
                ? recentCandles.reduce((acc, c) => acc + Math.abs(c.high - c.low), 0) / recentCandles.length
                : pEntry * 0.0015;
            const targetDelta = Math.max(avgBarRange * 2.0, pEntry * 0.002);
            const stopDelta = Math.max(avgBarRange * 1.0, pEntry * 0.001);
            pTarget = isLong ? pEntry + targetDelta : pEntry - targetDelta;
            pStop = isLong ? pEntry - stopDelta : pEntry + stopDelta;
          }

          // Snap target and stop to the symbol's tick size
          const tick = detectTickSizeFromCandles(candles, currentSymbol);
          pTarget = snapPriceToTick(pTarget, tick);
          pStop = snapPriceToTick(pStop, tick);

          const defaultOpts = drawingRegistry.has(activeTool)
            ? drawingRegistry.get(activeTool)!.getDefaultOptions()
            : {};

          const newDrawing: UserDrawing = {
            id: `draw_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            type: activeTool,
            anchors: [
              { time: t1, price: pEntry },
              { time: t2, price: pTarget },
              { time: t2, price: pStop },
            ],
            color: isLong ? '#089981' : '#f23645',
            lineWidth: 1.5,
            lineStyle: 'solid',
            symbol: currentSymbol,
            paneId: targetPaneId,
            options: {
              ...defaultOpts,
              entryPrice: pEntry,
              profitLevelPrice: pTarget,
              stopLevelPrice: pStop,
            },
          };
          addDrawing(newDrawing);
          if (paneId) {
            setActivePaneId(paneId);
          }
          setSelectedDrawingId(newDrawing.id);
          setActiveTool('cursor');
          setDraftAnchors([]);
          snapPointRef.current = null;
          currentMousePosRef.current = null;

          transport
            .saveDrawing({
              id: newDrawing.id,
              layout_id: layoutId,
              tool_type: newDrawing.type,
              symbol: currentSymbol,
              data: JSON.stringify(newDrawing),
            })
            .catch(console.error);

          return;
        }

        let initialAnchor = anchor;
        if (activeTool === 'anchored_vwap' && candles.length > 0) {
          let closestCandle = candles[0];
          let minDiff = Math.abs(candles[0].time - anchor.time);
          for (let i = 1; i < candles.length; i++) {
            const diff = Math.abs(candles[i].time - anchor.time);
            if (diff < minDiff) {
              minDiff = diff;
              closestCandle = candles[i];
            }
          }
          const p = (closestCandle.high + closestCandle.low + closestCandle.close) / 3;
          initialAnchor = { time: closestCandle.time, price: p };
        } else if (activeTool === 'anchored_volume_profile' && candles.length > 0) {
          let closestCandle = candles[0];
          let minDiff = Math.abs(candles[0].time - anchor.time);
          for (let i = 1; i < candles.length; i++) {
            const diff = Math.abs(candles[i].time - anchor.time);
            if (diff < minDiff) {
              minDiff = diff;
              closestCandle = candles[i];
            }
          }
          initialAnchor = { time: closestCandle.time, price: anchor.price };
        }

        const newDrawing: UserDrawing = drawingRegistry.has(activeTool)
          ? drawingRegistry.get(activeTool)!.createDefaultDrawing(
              `draw_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
              [initialAnchor],
              currentSymbol,
              targetPaneId,
              '#2962ff'
            )
          : {
              id: `draw_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
              type: activeTool,
              anchors: [initialAnchor],
              color: '#2962ff',
              symbol: currentSymbol,
              paneId: targetPaneId,
            };
        addDrawing(newDrawing);
        if (paneId) {
          setActivePaneId(paneId);
        }
        setSelectedDrawingId(newDrawing.id);
        setActiveTool('cursor');
        setDraftAnchors([]);
        snapPointRef.current = null;
        currentMousePosRef.current = null;

        transport
          .saveDrawing({
            id: newDrawing.id,
            layout_id: layoutId,
            tool_type: newDrawing.type,
            symbol: currentSymbol,
            data: JSON.stringify(newDrawing),
          })
          .catch(console.error);

        return;
      }

      // Three-click tools (Parallel Channel, Trend Fib Extension, Rotated Rectangle)
      const threeClickTools: DrawingToolType[] = ['parallel_channel', 'fib_extension', 'rotated_rectangle'];
      if (threeClickTools.includes(activeTool)) {
        if (draftAnchors.length === 0) {
          setDraftAnchors([anchor]);
        } else if (draftAnchors.length === 1) {
          setDraftAnchors([draftAnchors[0], anchor]);
        } else {
          let finalThirdAnchor = anchor;
          if (activeTool === 'parallel_channel') {
            const a1 = draftAnchors[0];
            const a2 = draftAnchors[1];
            const dt = a2.time - a1.time;
            const pBase =
              dt !== 0
                ? a1.price + ((a2.price - a1.price) / dt) * (anchor.time - a1.time)
                : a1.price;
            const dp = anchor.price - pBase;
            finalThirdAnchor = { time: a2.time, price: a2.price + dp };
          }

          const id = `draw_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
          const defaultColor = activeTool === 'rotated_rectangle' ? '#089981' : '#2962ff';
          const newDrawing: UserDrawing = drawingRegistry.has(activeTool)
            ? drawingRegistry.get(activeTool)!.createDefaultDrawing(
                id,
                [draftAnchors[0], draftAnchors[1], finalThirdAnchor],
                currentSymbol,
                targetPaneId,
                defaultColor
              )
            : {
                id,
                type: activeTool,
                anchors: [draftAnchors[0], draftAnchors[1], finalThirdAnchor],
                color: defaultColor,
                symbol: currentSymbol,
                paneId: targetPaneId,
              };
          addDrawing(newDrawing);
          if (paneId) {
            setActivePaneId(paneId);
          }
          setSelectedDrawingId(newDrawing.id);
          setActiveTool('cursor');
          setDraftAnchors([]);
          snapPointRef.current = null;
          currentMousePosRef.current = null;

          transport
            .saveDrawing({
              id: newDrawing.id,
              layout_id: layoutId,
              tool_type: newDrawing.type,
              symbol: currentSymbol,
              data: JSON.stringify(newDrawing),
            })
            .catch(console.error);
        }
        return;
      }

      // Multi-point Path tool
      if (activeTool === 'path') {
        if (draftAnchors.length === 0) {
          setDraftAnchors([anchor]);
        } else {
          // If clicked point is right on top of the last anchor (distance < 6px), finalize the path
          const last = draftAnchors[draftAnchors.length - 1];
          const pLast = anchorToCanvas(last);
          const pCur = anchorToCanvas(anchor);
          if (pLast && pCur && Math.hypot(pCur.x - pLast.x, pCur.y - pLast.y) < 6) {
            if (draftAnchors.length >= 2) {
              commitPath(draftAnchors);
            }
            return;
          }
          setDraftAnchors((prev) => [...prev, anchor]);
        }
        return;
      }

      // Two-click tools
      if (draftAnchors.length === 0) {
        setDraftAnchors([anchor]);
      } else {
        const defaultColor =
          activeTool === 'trendline' ||
          activeTool === 'ray' ||
          activeTool === 'info_line'
            ? '#2962ff'
            : activeTool === 'date_range'
            ? '#9c27b0'
            : '#2962ff';

        let finalAnchors = [draftAnchors[0], anchor];
        if (activeTool === 'fixed_range_volume_profile') {
          const tool = drawingRegistry.get('fixed_range_volume_profile') as FixedRangeVolumeProfileTool | undefined;
          const profile = tool?.computeProfile?.(finalAnchors, candles, {});
          if (profile) {
            const tStart = Math.min(finalAnchors[0].time, finalAnchors[1].time);
            const tEnd = Math.max(finalAnchors[0].time, finalAnchors[1].time);
            finalAnchors = [
              { time: tStart, price: profile.maxPrice },
              { time: tEnd, price: profile.minPrice },
            ];
          }
        }

        const id = `draw_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        let newDrawing: UserDrawing;
        if (drawingRegistry.has(activeTool)) {
          newDrawing = drawingRegistry.get(activeTool)!.createDefaultDrawing(
            id,
            finalAnchors,
            currentSymbol,
            targetPaneId,
            defaultColor
          );
        } else {
          newDrawing = {
            id,
            type: activeTool,
            anchors: finalAnchors,
            color: defaultColor,
            symbol: currentSymbol,
            paneId: targetPaneId,
          };
        }
        addDrawing(newDrawing);
        if (paneId) {
          setActivePaneId(paneId);
        }
        setSelectedDrawingId(newDrawing.id);
        setActiveTool('cursor');
        setDraftAnchors([]);
        snapPointRef.current = null;
        currentMousePosRef.current = null;

        transport
          .saveDrawing({
            id: newDrawing.id,
            layout_id: layoutId,
            tool_type: newDrawing.type,
            symbol: currentSymbol,
            data: JSON.stringify(newDrawing),
          })
          .catch(console.error);
      }
      return;
    }

    // B. Cursor mode: Selection, handle dragging, or entire drawing dragging
    const hit = hitTestDrawing(rawX, rawY);
    if (hit) {
      if (paneId) {
        setActivePaneId(paneId);
      }
      setSelectedDrawingId(hit.drawingId);
      const targetDrawing = visibleDrawings.find((d) => d.id === hit.drawingId);
      const isLocked = drawingsLocked || !!targetDrawing?.locked;

      if (targetDrawing && !isLocked) {
        const isCtrl = Boolean(e.ctrlKey || e.metaKey || isCtrlPressedRef.current);
        if (isCtrl) {
          cloneOnDragRef.current = {
            isClone: true,
            clonedId: null,
            sourceDrawing: targetDrawing,
            startScreenPoint: { x: e.clientX, y: e.clientY },
            startAnchor: anchor,
            initialAnchors: targetDrawing.anchors.map((a) => ({ ...a })),
          };
          setDraggedDrawing({
            drawingId: hit.drawingId,
            startAnchor: anchor,
            initialAnchors: targetDrawing.anchors.map((a) => ({ ...a })),
          });
        } else if (hit.handleIndex >= 0) {
          cloneOnDragRef.current = null;
          // Drag individual handle
          setDraggedHandle({
            drawingId: hit.drawingId,
            handleIndex: hit.handleIndex,
            startAnchor: anchor,
            initialAnchors: targetDrawing.anchors.map((a) => ({ ...a })),
          });
        } else {
          cloneOnDragRef.current = null;
          // Drag entire drawing
          setDraggedDrawing({
            drawingId: hit.drawingId,
            startAnchor: anchor,
            initialAnchors: targetDrawing.anchors.map((a) => ({ ...a })),
          });
        }
      }
    } else {
      cloneOnDragRef.current = null;
      setSelectedDrawingId(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const { width, height } = getExactPlotDimensions();
    if (width <= 0 || height <= 0) return;
    const rawX = e.clientX - (rect.left + CANVAS_PADDING);
    const rawY = e.clientY - (rect.top + CANVAS_PADDING);
    const x = Math.max(0, Math.min(width, rawX));
    const y = Math.max(0, Math.min(height, rawY));

    // When dragging a handle or drawing, window listener exclusively handles the drag loop
    if (draggedHandle || draggedDrawing) {
      return;
    }

    const isCtrl = Boolean(e.ctrlKey || e.metaKey);
    isCtrlPressedRef.current = isCtrl;

    // Update active measurement box while measuring
    if (measureStateRef.current && !measureStateRef.current.isPlaced) {
      const rawAnchor = canvasToAnchor(x, y);
      if (rawAnchor) {
        const { anchor, snapCoord } = snapToCandleOHLC(rawAnchor, x, y, isCtrl);
        const targetX = snapCoord ? snapCoord.x : x;
        const targetY = snapCoord ? snapCoord.y : y;
        setMeasureState((prev) => (prev ? { ...prev, currentAnchor: anchor, currentPoint: { x: targetX, y: targetY } } : null));
        updateChartCrosshair(anchor, targetX, targetY);
        scheduleRender();
      }
      return;
    }

    // Update snap point preview and chart crosshair while drafting
    if (activeTool !== 'cursor') {
      currentMousePosRef.current = { x, y };
      const rawAnchor = canvasToAnchor(x, y);
      if (rawAnchor) {
        const { anchor, snapCoord } = snapToCandleOHLC(rawAnchor, x, y, isCtrl);
        snapPointRef.current = snapCoord;
        const targetX = snapCoord ? snapCoord.x : x;
        const targetY = snapCoord ? snapCoord.y : y;
        updateChartCrosshair(anchor, targetX, targetY);
      }
      scheduleRender();
    } else {
      currentMousePosRef.current = null;
      snapPointRef.current = null;
    }
  };

  const handlePointerLeave = useCallback(() => {
    currentMousePosRef.current = null;
    snapPointRef.current = null;
    if (activeToolRef.current !== 'cursor') {
      clearChartCrosshair();
      scheduleRender();
    }
  }, [clearChartCrosshair, scheduleRender]);

  const finalizeDrawingRelease = useCallback((drawing: UserDrawing | undefined) => {
    if (!drawing) return;
    let finalDrawing = drawing;
    if (drawing.type === 'fixed_range_volume_profile' && drawing.anchors.length >= 2) {
      const tool = drawingRegistry.get('fixed_range_volume_profile') as FixedRangeVolumeProfileTool | undefined;
      const profile = tool?.computeProfile?.(drawing.anchors, candlesRef.current, (drawing.options as FRVPOptions) || {});
      if (profile) {
        const tStart = Math.min(drawing.anchors[0].time, drawing.anchors[1].time);
        const tEnd = Math.max(drawing.anchors[0].time, drawing.anchors[1].time);
        const snapped = [
          { time: tStart, price: profile.maxPrice },
          { time: tEnd, price: profile.minPrice },
        ];
        updateDrawing(drawing.id, { anchors: snapped });
        finalDrawing = { ...drawing, anchors: snapped };
      }
    }
    transport
      .saveDrawing({
        id: finalDrawing.id,
        layout_id: layoutId,
        tool_type: finalDrawing.type,
        symbol: currentSymbol,
        data: JSON.stringify(finalDrawing),
      })
      .catch(console.error);
  }, [layoutId, currentSymbol, updateDrawing]);

  // Window listeners for dragging handles or drawings smoothly across canvas/container bounds
  const isDragging = Boolean(draggedHandle || draggedDrawing);

  useEffect(() => {
    if (!isDragging) return;

    let pendingDragEvent: PointerEvent | null = null;
    let dragRafId: number | null = null;

    const processDrag = () => {
      dragRafId = null;
      if (!pendingDragEvent || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const { width, height } = getExactPlotDimensions();
      if (width <= 0 || height <= 0) return;
      const rawX = pendingDragEvent.clientX - (rect.left + CANVAS_PADDING);
      const rawY = pendingDragEvent.clientY - (rect.top + CANVAS_PADDING);
      const x = Math.max(0, Math.min(width, rawX));
      const y = Math.max(0, Math.min(height, rawY));

      const isCtrl = Boolean(pendingDragEvent.ctrlKey || pendingDragEvent.metaKey);
      isCtrlPressedRef.current = isCtrl;

      // Handle Ctrl+Drag clone instantiation once user drags past 3px threshold
      if (cloneOnDragRef.current?.isClone && !cloneOnDragRef.current.clonedId) {
        const dist = Math.hypot(
          pendingDragEvent.clientX - cloneOnDragRef.current.startScreenPoint.x,
          pendingDragEvent.clientY - cloneOnDragRef.current.startScreenPoint.y
        );
        if (dist < 3) {
          // Has not moved far enough yet; do not move source drawing or spawn clone
          return;
        }
        const source = cloneOnDragRef.current.sourceDrawing;
        const newId = `draw_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
        const cloned: UserDrawing = {
          ...source,
          id: newId,
          anchors: cloneOnDragRef.current.initialAnchors.map((a) => ({ ...a })),
          options: source.options ? JSON.parse(JSON.stringify(source.options)) : undefined,
        };
        addDrawing(cloned);
        setSelectedDrawingId(newId);
        cloneOnDragRef.current.clonedId = newId;

        const newDragState = {
          drawingId: newId,
          startAnchor: cloneOnDragRef.current.startAnchor,
          initialAnchors: cloneOnDragRef.current.initialAnchors.map((a) => ({ ...a })),
        };
        draggedDrawingRef.current = newDragState;
        setDraggedDrawing(newDragState);
      }

      const currentHandle = draggedHandleRef.current;
      const currentDrawing = draggedDrawingRef.current;
      const curDrawings = useSyncStore.getState().drawings;
      const curCandles = candlesRef.current;

      if (currentHandle && !drawingsLocked) {
        const rawAnchor = canvasToAnchor(x, y);
        if (rawAnchor) {
          const { anchor, snapCoord } = snapToCandleOHLC(rawAnchor, x, y, isCtrl);
          snapPointRef.current = snapCoord;
          const targetX = snapCoord ? snapCoord.x : x;
          const targetY = snapCoord ? snapCoord.y : y;
          updateChartCrosshair(anchor, targetX, targetY);

          const drawing = curDrawings.find((d) => d.id === currentHandle.drawingId);
          if (drawing && !drawing.locked) {
            const init = currentHandle.initialAnchors || drawing.anchors;
            const start = currentHandle.startAnchor || init[0];
            const nextAnchors = init.map((a) => ({ ...a }));

            if (drawing.type === 'long_position' || drawing.type === 'short_position') {
              if (currentHandle.handleIndex === 1) {
                // Resize Target Price: ONLY adjust Target price. Keep duration/width and Stop price untouched!
                nextAnchors[1] = { time: init[1].time, price: anchor.price };
              } else if (currentHandle.handleIndex === 2) {
                // Resize Stop Price: ONLY adjust Stop price. Keep duration/width and Target price untouched!
                nextAnchors[2] = { time: init[2].time, price: anchor.price };
              } else if (currentHandle.handleIndex === 3) {
                // Resize Duration / Width: Adjust end time of target and stop, keeping both prices untouched!
                const barDt =
                  curCandles.length >= 2
                    ? Math.max(1, curCandles[curCandles.length - 1].time - curCandles[curCandles.length - 2].time)
                    : 60;
                const minTime = init[0].time + barDt;
                const newEndTime = Math.max(minTime, anchor.time);
                nextAnchors[1] = { time: newEndTime, price: init[1].price };
                nextAnchors[2] = { time: newEndTime, price: init[2].price };
              } else if (currentHandle.handleIndex === 0) {
                // Move whole position from Entry line or handle smoothly via delta from startAnchor
                const dt = anchor.time - start.time;
                const dp = anchor.price - start.price;
                nextAnchors[0] = { time: init[0].time + dt, price: init[0].price + dp };
                if (init[1]) nextAnchors[1] = { time: init[1].time + dt, price: init[1].price + dp };
                if (init[2]) nextAnchors[2] = { time: init[2].time + dt, price: init[2].price + dp };
              }
            } else if (drawing.type === 'rectangle' && init.length >= 2) {
              const a0 = init[0];
              const a1 = init[1];
              const tMin = Math.min(a0.time, a1.time);
              const tMax = Math.max(a0.time, a1.time);
              const pMin = Math.min(a0.price, a1.price);
              const pMax = Math.max(a0.price, a1.price);

              let newTMin = tMin;
              let newTMax = tMax;
              let newPMin = pMin;
              let newPMax = pMax;

              if (currentHandle.handleIndex === 0) {
                newTMin = anchor.time;
                newPMax = anchor.price;
              } else if (currentHandle.handleIndex === 1) {
                newTMax = anchor.time;
                newPMax = anchor.price;
              } else if (currentHandle.handleIndex === 2) {
                newTMax = anchor.time;
                newPMin = anchor.price;
              } else if (currentHandle.handleIndex === 3) {
                newTMin = anchor.time;
                newPMin = anchor.price;
              } else if (currentHandle.handleIndex === 4) {
                newPMax = anchor.price;
              } else if (currentHandle.handleIndex === 5) {
                newTMax = anchor.time;
              } else if (currentHandle.handleIndex === 6) {
                newPMin = anchor.price;
              } else if (currentHandle.handleIndex === 7) {
                newTMin = anchor.time;
              }

              nextAnchors[0] = {
                time: a0.time <= a1.time ? newTMin : newTMax,
                price: a0.price >= a1.price ? newPMax : newPMin,
              };
              nextAnchors[1] = {
                time: a1.time >= a0.time ? newTMax : newTMin,
                price: a1.price <= a0.price ? newPMin : newPMax,
              };
            } else if (drawing.type === 'rotated_rectangle' && init.length >= 2) {
              if (currentHandle.handleIndex === 0) {
                const dt = anchor.time - init[0].time;
                const dp = anchor.price - init[0].price;
                nextAnchors[0] = anchor;
                if (init[2]) nextAnchors[2] = { time: init[2].time + dt, price: init[2].price + dp };
              } else if (currentHandle.handleIndex === 1) {
                nextAnchors[1] = anchor;
              } else {
                nextAnchors[2] = anchor;
              }
            } else if (drawing.type === 'parallel_channel') {
              const a1 = init[0];
              const a2 = init[1];
              const a3 = init[2] || { time: a2.time, price: a2.price };
              const currentDp = a3.price - a2.price;

              if (currentHandle.handleIndex === 0) {
                nextAnchors[0] = anchor;
                nextAnchors[2] = { time: nextAnchors[1].time, price: nextAnchors[1].price + currentDp };
              } else if (currentHandle.handleIndex === 1) {
                nextAnchors[1] = anchor;
                nextAnchors[2] = { time: anchor.time, price: anchor.price + currentDp };
              } else if (currentHandle.handleIndex === 2 || currentHandle.handleIndex === 3 || currentHandle.handleIndex === 5) {
                const dt = a2.time - a1.time;
                const pBase =
                  dt !== 0
                    ? a1.price + ((a2.price - a1.price) / dt) * (anchor.time - a1.time)
                    : a1.price;
                const newDp = anchor.price - pBase;
                nextAnchors[2] = { time: nextAnchors[1].time, price: nextAnchors[1].price + newDp };
              } else if (currentHandle.handleIndex === 4) {
                const dt = anchor.time - start.time;
                const dp = anchor.price - start.price;
                nextAnchors[0] = { time: init[0].time + dt, price: init[0].price + dp };
                nextAnchors[1] = { time: init[1].time + dt, price: init[1].price + dp };
                nextAnchors[2] = { time: init[2].time + dt, price: init[2].price + dp };
              }
            } else if (drawing.type === 'anchored_vwap') {
              if (curCandles.length > 0) {
                let closestCandle = curCandles[0];
                let minDiff = Math.abs(curCandles[0].time - anchor.time);
                for (let i = 1; i < curCandles.length; i++) {
                  const diff = Math.abs(curCandles[i].time - anchor.time);
                  if (diff < minDiff) {
                    minDiff = diff;
                    closestCandle = curCandles[i];
                  }
                }
                const src = (drawing.options as any)?.source || 'hlc3';
                let p = (closestCandle.high + closestCandle.low + closestCandle.close) / 3;
                if (src === 'close') p = closestCandle.close;
                else if (src === 'open') p = closestCandle.open;
                else if (src === 'high') p = closestCandle.high;
                else if (src === 'low') p = closestCandle.low;
                else if (src === 'hl2') p = (closestCandle.high + closestCandle.low) / 2;
                else if (src === 'ohlc4') p = (closestCandle.open + closestCandle.high + closestCandle.low + closestCandle.close) / 4;

                nextAnchors[0] = { time: closestCandle.time, price: p };
              } else {
                nextAnchors[0] = anchor;
              }
            } else if (drawing.type === 'anchored_volume_profile') {
              if (curCandles.length > 0) {
                let closestCandle = curCandles[0];
                let minDiff = Math.abs(curCandles[0].time - anchor.time);
                for (let i = 1; i < curCandles.length; i++) {
                  const diff = Math.abs(curCandles[i].time - anchor.time);
                  if (diff < minDiff) {
                    minDiff = diff;
                    closestCandle = curCandles[i];
                  }
                }
                nextAnchors[0] = { time: closestCandle.time, price: anchor.price };
              } else {
                nextAnchors[0] = anchor;
              }
            } else if (drawing.type === 'fixed_range_volume_profile' && init.length >= 2) {
              if (currentHandle.handleIndex === 0) {
                nextAnchors[0] = anchor;
              } else {
                nextAnchors[1] = anchor;
              }
            } else {
              nextAnchors[currentHandle.handleIndex] = anchor;
            }

            transientAnchorsRef.current = nextAnchors;
            scheduleRender();
          }
        }
        return;
      }

      if (currentDrawing && !drawingsLocked) {
        const currentAnchor = canvasToAnchor(x, y);
        if (currentAnchor) {
          const drawing = curDrawings.find((d) => d.id === currentDrawing.drawingId);
          if (drawing?.type === 'anchored_volume_profile' && curCandles.length > 0) {
            const dt = currentAnchor.time - currentDrawing.startAnchor.time;
            const dp = currentAnchor.price - currentDrawing.startAnchor.price;
            const targetTime = currentDrawing.initialAnchors[0].time + dt;
            let closestCandle = curCandles[0];
            let minDiff = Math.abs(curCandles[0].time - targetTime);
            for (let i = 1; i < curCandles.length; i++) {
              const diff = Math.abs(curCandles[i].time - targetTime);
              if (diff < minDiff) {
                minDiff = diff;
                closestCandle = curCandles[i];
              }
            }
            transientAnchorsRef.current = [{ time: closestCandle.time, price: currentDrawing.initialAnchors[0].price + dp }];
            scheduleRender();
          } else if (drawing?.type === 'anchored_vwap' && curCandles.length > 0) {
            const dt = currentAnchor.time - currentDrawing.startAnchor.time;
            const targetTime = currentDrawing.initialAnchors[0].time + dt;
            let closestCandle = curCandles[0];
            let minDiff = Math.abs(curCandles[0].time - targetTime);
            for (let i = 1; i < curCandles.length; i++) {
              const diff = Math.abs(curCandles[i].time - targetTime);
              if (diff < minDiff) {
                minDiff = diff;
                closestCandle = curCandles[i];
              }
            }
            const src = (drawing.options as any)?.source || 'hlc3';
            let p = (closestCandle.high + closestCandle.low + closestCandle.close) / 3;
            if (src === 'close') p = closestCandle.close;
            else if (src === 'open') p = closestCandle.open;
            else if (src === 'high') p = closestCandle.high;
            else if (src === 'low') p = closestCandle.low;
            else if (src === 'hl2') p = (closestCandle.high + closestCandle.low) / 2;
            else if (src === 'ohlc4') p = (closestCandle.open + closestCandle.high + closestCandle.low + closestCandle.close) / 4;

            transientAnchorsRef.current = [{ time: closestCandle.time, price: p }];
            scheduleRender();
          } else {
            const dt = currentAnchor.time - currentDrawing.startAnchor.time;
            const dp = currentAnchor.price - currentDrawing.startAnchor.price;
            const nextAnchors = currentDrawing.initialAnchors.map((a) => ({
              time: a.time + dt,
              price: a.price + dp,
            }));
            transientAnchorsRef.current = nextAnchors;
            updateChartCrosshair(currentAnchor, x, y);
            scheduleRender();
          }
        }
      }
    };

    const handleWindowPointerMove = (e: PointerEvent) => {
      pendingDragEvent = e;
      if (dragRafId === null) {
        dragRafId = requestAnimationFrame(processDrag);
      }
    };

    const handleWindowPointerUp = () => {
      if (dragRafId !== null) {
        cancelAnimationFrame(dragRafId);
        dragRafId = null;
      }
      if (pendingDragEvent) {
        processDrag();
      }
      snapPointRef.current = null;

      const currentHandle = draggedHandleRef.current;
      const currentDrawing = draggedDrawingRef.current;
      const finalAnchors = transientAnchorsRef.current;
      transientAnchorsRef.current = null;

      const cloneInfo = cloneOnDragRef.current;
      cloneOnDragRef.current = null;

      if (currentHandle) {
        const drawing = useSyncStore.getState().drawings.find((d) => d.id === currentHandle.drawingId);
        setDraggedHandle(null);
        if (drawing) {
          if (finalAnchors) {
            updateDrawing(drawing.id, { anchors: finalAnchors });
            finalizeDrawingRelease({ ...drawing, anchors: finalAnchors });
          } else {
            finalizeDrawingRelease(drawing);
          }
        }
      }

      if (currentDrawing) {
        setDraggedDrawing(null);
        if (cloneInfo?.isClone && !cloneInfo.clonedId) {
          // Clone gesture was started but released without moving past threshold (simple click):
          // No clone was created; leave source drawing completely unmodified
        } else {
          const drawing = useSyncStore.getState().drawings.find((d) => d.id === currentDrawing.drawingId);
          if (drawing) {
            if (finalAnchors) {
              updateDrawing(drawing.id, { anchors: finalAnchors });
              finalizeDrawingRelease({ ...drawing, anchors: finalAnchors });
            } else {
              finalizeDrawingRelease(drawing);
            }
          }
        }
      }

      if (activeToolRef.current === 'cursor') {
        clearChartCrosshair();
      }
      scheduleRender();
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      if (dragRafId !== null) {
        cancelAnimationFrame(dragRafId);
        dragRafId = null;
      }
    };
  }, [
    isDragging,
    drawingsLocked,
    canvasToAnchor,
    snapToCandleOHLC,
    getExactPlotDimensions,
    scheduleRender,
    updateChartCrosshair,
    clearChartCrosshair,
    updateDrawing,
    finalizeDrawingRelease,
  ]);

  const handlePointerUp = () => {
    if (measureStateRef.current && !measureStateRef.current.isPlaced) {
      const prev = measureStateRef.current;
      const startPt = prev.startPoint || { x: 0, y: 0 };
      const currentPt = prev.currentPoint || startPt;
      const dist = Math.hypot(currentPt.x - startPt.x, currentPt.y - startPt.y);
      if (dist > 5) {
        setMeasureState({
          ...prev,
          isPlaced: true,
          isDragging: false,
        });
        if (activeToolRef.current === 'price_range' || activeToolRef.current === 'date_price_range') {
          setActiveTool('cursor');
        }
      } else {
        setMeasureState({
          ...prev,
          isDragging: false,
        });
      }
      scheduleRender();
      return;
    }

    snapPointRef.current = null;
    currentMousePosRef.current = null;
    if (activeToolRef.current === 'cursor') {
      clearChartCrosshair();
    }
    scheduleRender();
  };

  // Keyboard shortcut listener (Delete / Backspace / Escape) - scoped to active pane
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Never delete drawing or trigger shortcuts if user is typing in any input/textarea
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          (typeof target.closest === 'function' && (target.closest('input') || target.closest('textarea'))))
      ) {
        return;
      }

      // Also ignore if settings modal is open so modal typing never deletes the drawing
      if (isSettingsModalOpen) {
        return;
      }

      if (e.key === 'Enter' && activeTool === 'path' && draftAnchors.length >= 2) {
        commitPath(draftAnchors);
        return;
      }

      if (e.key === 'Escape') {
        if (activeTool === 'path' && draftAnchors.length >= 2) {
          commitPath(draftAnchors);
          return;
        }
        setDraftAnchors([]);
        setActiveTool('cursor');
        setSelectedDrawingId(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId && !drawingsLocked) {
        const target = visibleDrawings.find((d) => d.id === selectedDrawingId);
        if (target?.locked) return;
        deleteDrawing(selectedDrawingId);
        transport.deleteDrawing(selectedDrawingId).catch(console.error);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, activeTool, draftAnchors, commitPath, selectedDrawingId, drawingsLocked, deleteDrawing, setActiveTool, setSelectedDrawingId, isSettingsModalOpen]);

  // Native price scale labels using lightweight-charts createPriceLine
  // Pinned directly to the hardware-accelerated price scale canvas (144fps lockstep sync)
  const priceLinesMapRef = useRef<Map<string, IPriceLine[]>>(new Map());

  useEffect(() => {
    if (!series) return;

    const currentMap = priceLinesMapRef.current;
    const activeDrawingIds = new Set<string>();

    if (!drawingsHidden) {
      visibleDrawings.forEach((d) => {
        if (d.hidden || !d.anchors || d.anchors.length < 1) return;

        // Anchored VWAP: attaches latest VWAP price to the price scale directly like other drawings
        if (d.type === 'anchored_vwap') {
          const vwapOpts = (d.options as AnchoredVWAPOptions) || {};
          if (vwapOpts.showPriceLabel !== false) {
            activeDrawingIds.add(d.id);
            const tool = drawingRegistry.get('anchored_vwap') as AnchoredVWAPTool | undefined;
            let latestPrice = d.anchors[0].price;
            if (tool && candles && candles.length > 0) {
              const data = tool.computeVWAPData(d.anchors[0], candles, vwapOpts);
              if (data.length > 0) {
                latestPrice = data[data.length - 1].vwap;
              }
            }

            const labelColor = d.color || vwapOpts.color || '#2962ff';
            const lines = currentMap.get(d.id);

            if (lines && lines.length === 1) {
              lines[0].applyOptions({
                price: latestPrice,
                color: labelColor,
                axisLabelColor: labelColor,
                axisLabelTextColor: '#ffffff',
                lineVisible: false,
                axisLabelVisible: true,
              });
            } else {
              if (lines) {
                lines.forEach((l) => {
                  try {
                    series.removePriceLine(l);
                  } catch {}
                });
              }
              const newLine = series.createPriceLine({
                price: latestPrice,
                color: labelColor,
                lineWidth: 1,
                lineStyle: LineStyle.Solid,
                lineVisible: false,
                axisLabelVisible: true,
                axisLabelColor: labelColor,
                axisLabelTextColor: '#ffffff',
              });
              currentMap.set(d.id, [newLine]);
            }
          }
          return;
        }

        // Anchored Volume Profile: attaches POC price badge to price scale when showPriceLabels !== false
        if (d.type === 'anchored_volume_profile') {
          const avpOpts = (d.options as AVPOptions) || {};
          if (avpOpts.showPriceLabels !== false && avpOpts.showPOC !== false) {
            const tool = drawingRegistry.get('anchored_volume_profile') as AnchoredVolumeProfileTool | undefined;
            if (tool && candles && candles.length > 0) {
              const profile = tool.computeProfile(d.anchors, candles, avpOpts);
              if (profile) {
                activeDrawingIds.add(d.id);
                const pocPrice = profile.pocPrice;
                const pocColor = avpOpts.pocColor || '#000000';
                const lines = currentMap.get(d.id);

                if (lines && lines.length === 1) {
                  lines[0].applyOptions({
                    price: pocPrice,
                    color: pocColor,
                    axisLabelColor: pocColor,
                    axisLabelTextColor: '#ffffff',
                    lineVisible: false,
                    axisLabelVisible: true,
                  });
                } else {
                  if (lines) {
                    lines.forEach((l: any) => {
                      try {
                        series.removePriceLine(l);
                      } catch {}
                    });
                  }
                  const newLine = series.createPriceLine({
                    price: pocPrice,
                    color: pocColor,
                    lineWidth: 1,
                    lineStyle: LineStyle.Solid,
                    lineVisible: false,
                    axisLabelVisible: true,
                    axisLabelColor: pocColor,
                    axisLabelTextColor: '#ffffff',
                  });
                  currentMap.set(d.id, [newLine]);
                }
              }
            }
          }
          return;
        }

        // Fixed Range Volume Profile does not create price scale labels
        if (d.type === 'fixed_range_volume_profile') {
          return;
        }

        const opts = (d.options as TrendlineOptions) || {};
        if (opts.showPriceLabels) {
          activeDrawingIds.add(d.id);
          const lines = currentMap.get(d.id);
          const getAnchorLabelColor = (idx: number) => {
            if (d.type === 'long_position' || d.type === 'short_position') {
              if (idx === 1) return '#089981';
              if (idx === 2) return '#f23645';
              return '#434651';
            }
            if (d.type === 'horizontal_line' || d.type === 'horizontal_ray' || d.type === 'cross_line') {
              return d.color || '#2962ff';
            }
            return '#434651';
          };

          if (lines && lines.length === d.anchors.length) {
            d.anchors.forEach((a, idx) => {
              lines[idx].applyOptions({
                price: a.price,
                color: d.color || '#2962ff',
                axisLabelColor: getAnchorLabelColor(idx),
                axisLabelTextColor: '#ffffff',
                lineVisible: false,
                axisLabelVisible: true,
              });
            });
          } else {
            if (lines) {
              lines.forEach((l) => {
                try {
                  series.removePriceLine(l);
                } catch {}
              });
            }
            const newLines = d.anchors.map((a, idx) =>
              series.createPriceLine({
                price: a.price,
                color: d.color || '#2962ff',
                lineWidth: 1,
                lineStyle: LineStyle.Solid,
                lineVisible: false,
                axisLabelVisible: true,
                axisLabelColor: getAnchorLabelColor(idx),
                axisLabelTextColor: '#ffffff',
              })
            );
            currentMap.set(d.id, newLines);
          }
        }
      });
    }

    // Clean up price lines for drawings that are deleted, hidden, or showPriceLabels toggled off
    for (const [id, lines] of currentMap.entries()) {
      if (!activeDrawingIds.has(id)) {
        lines.forEach((l) => {
          try {
            series.removePriceLine(l);
          } catch {}
        });
        currentMap.delete(id);
      }
    }
  }, [series, visibleDrawings, drawingsHidden, candles]);

  useEffect(() => {
    const map = priceLinesMapRef.current;
    return () => {
      if (series && map) {
        for (const lines of map.values()) {
          lines.forEach((l) => {
            try {
              series.removePriceLine(l);
            } catch {}
          });
        }
        map.clear();
      }
    };
  }, [series]);

  // Determine if canvas should capture pointer events
  const shouldCapturePointer =
    activeTool !== 'cursor' ||
    draggedHandle !== null ||
    draggedDrawing !== null ||
    (measureState !== null && !measureState.isPlaced);

  // Selected drawing object for this pane
  const selectedDrawingObj = visibleDrawings.find((d) => d.id === selectedDrawingId);

  const priceScaleWidth = chart ? (chart.priceScale('right')?.width() || 65) : 65;
  const timeScaleHeight = chart ? (chart.timeScale()?.height() || 26) : 26;

  const handleCanvasDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (activeTool === 'path' && draftAnchors.length >= 2) {
        let finalAnchors = [...draftAnchors];
        if (finalAnchors.length > 2) {
          const a1 = anchorToCanvas(finalAnchors[finalAnchors.length - 1]);
          const a2 = anchorToCanvas(finalAnchors[finalAnchors.length - 2]);
          if (a1 && a2 && Math.hypot(a1.x - a2.x, a1.y - a2.y) < 8) {
            finalAnchors.pop();
          }
        }
        commitPath(finalAnchors);
        return;
      }

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const px = e.clientX - (rect.left + CANVAS_PADDING);
      const py = e.clientY - (rect.top + CANVAS_PADDING);
      const hit = hitTestDrawing(px, py);
      if (hit) {
        setSelectedDrawingId(hit.drawingId);
        setIsSettingsModalOpen(true);
      }
    },
    [activeTool, draftAnchors, anchorToCanvas, commitPath, hitTestDrawing, setSelectedDrawingId]
  );

  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{
        left: `-${CANVAS_PADDING}px`,
        top: `-${CANVAS_PADDING}px`,
        width: plotSize.width > 0 ? `${plotSize.width + CANVAS_PADDING * 2}px` : `calc(100% - ${priceScaleWidth}px + ${CANVAS_PADDING * 2}px)`,
        height: plotSize.height > 0 ? `${plotSize.height + CANVAS_PADDING + CANVAS_PADDING_BOTTOM}px` : `calc(100% - ${timeScaleHeight}px + ${CANVAS_PADDING + CANVAS_PADDING_BOTTOM}px)`,
        overflow: 'visible',
      }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onDoubleClick={handleCanvasDoubleClick}
        className={`drawing-canvas-overlay w-full h-full select-none ${
          shouldCapturePointer ? 'pointer-events-auto' : 'pointer-events-none'
        } ${
          isShiftPressedRef.current || measureState !== null || activeTool === 'price_range' || activeTool === 'date_price_range'
            ? 'cursor-crosshair'
            : activeTool !== 'cursor'
            ? 'cursor-crosshair'
            : (selectedDrawingObj?.locked || drawingsLocked)
            ? 'cursor-pointer'
            : draggedHandle
            ? draggedHandle.handleIndex === 1 || draggedHandle.handleIndex === 2
              ? 'cursor-ns-resize'
              : draggedHandle.handleIndex === 3
              ? 'cursor-ew-resize'
              : 'cursor-move'
            : draggedDrawing
            ? cloneOnDragRef.current?.isClone
              ? 'cursor-copy'
              : 'cursor-grabbing'
            : selectedDrawingId
            ? 'cursor-pointer'
            : cursorType === 'dot'
            ? 'cursor-dot'
            : cursorType === 'arrow'
            ? 'cursor-default'
            : 'cursor-crosshair'
        }`}
      />

      {/* Floating Quick Settings Toolbar for Selected Drawing */}
      {isActive && selectedDrawingId && selectedDrawingObj && !selectedDrawingObj.hidden && !drawingsHidden && !isDragging && (
        <DrawingQuickToolbar
          drawing={selectedDrawingObj}
          initialCoords={(() => {
            if (selectedDrawingObj.anchors.length > 2) {
              const pts = selectedDrawingObj.anchors
                .map((a) => anchorToCanvas(a))
                .filter((p): p is { x: number; y: number } => p !== null && !isNaN(p.x) && !isNaN(p.y));
              if (pts.length > 0) {
                let minX = Infinity;
                let maxX = -Infinity;
                let minY = Infinity;
                for (const pt of pts) {
                  if (pt.x < minX) minX = pt.x;
                  if (pt.x > maxX) maxX = pt.x;
                  if (pt.y < minY) minY = pt.y;
                }
                return {
                  x: (minX + maxX) / 2,
                  y: minY,
                };
              }
            }
            if (selectedDrawingObj.type === 'fixed_range_volume_profile') {
              const p0 = anchorToCanvas(selectedDrawingObj.anchors[0]);
              const p1 = selectedDrawingObj.anchors[1] ? anchorToCanvas(selectedDrawingObj.anchors[1]) : null;
              if (p0 && p1) {
                const tool = drawingRegistry.get('fixed_range_volume_profile') as FixedRangeVolumeProfileTool | undefined;
                const profile = tool?.computeProfile?.(selectedDrawingObj.anchors, candles, (selectedDrawingObj.options as FRVPOptions) || {});
                let topY = Math.min(p0.y, p1.y);
                if (profile && series) {
                  try {
                    const yMinBox = series.priceToCoordinate(profile.maxPrice);
                    const yMaxBox = series.priceToCoordinate(profile.minPrice);
                    if (yMinBox !== null && yMaxBox !== null) {
                      topY = Math.min(topY, yMinBox, yMaxBox);
                    }
                  } catch {}
                }
                return {
                  x: (p0.x + p1.x) / 2,
                  y: topY,
                };
              }
            }
            if (selectedDrawingObj.type === 'anchored_volume_profile') {
              const p0 = anchorToCanvas(selectedDrawingObj.anchors[0]);
              if (p0) {
                const tool = drawingRegistry.get('anchored_volume_profile') as AnchoredVolumeProfileTool | undefined;
                const profile = tool?.computeProfile?.(selectedDrawingObj.anchors, candles, (selectedDrawingObj.options as AVPOptions) || {});
                let bottomY = p0.y;
                if (profile && series) {
                  try {
                    const yMinBox = series.priceToCoordinate(profile.maxPrice);
                    const yMaxBox = series.priceToCoordinate(profile.minPrice);
                    if (yMinBox !== null && yMaxBox !== null) {
                      bottomY = Math.max(yMinBox, yMaxBox);
                    }
                  } catch {}
                }
                const lastCandle = candles.length > 0 ? candles[candles.length - 1] : null;
                const xLive = lastCandle
                  ? (anchorToCanvas({ time: lastCandle.time, price: selectedDrawingObj.anchors[0].price })?.x ?? p0.x + 100)
                  : p0.x + 100;
                return {
                  x: (p0.x + xLive) / 2,
                  y: bottomY + 30,
                };
              }
            }
            const p0 = anchorToCanvas(selectedDrawingObj.anchors[0]);
            const p1 = selectedDrawingObj.anchors[1] ? anchorToCanvas(selectedDrawingObj.anchors[1]) : null;
            if (p0 && p1) {
              return {
                x: (p0.x + p1.x) / 2,
                y: Math.min(p0.y, p1.y),
              };
            }
            return p0 ? { x: p0.x, y: p0.y } : undefined;
          })()}
          containerBounds={plotSize}
          onUpdate={(updates) => {
            if (selectedDrawingId) {
              if (updates.hidden === true) {
                const idToHide = selectedDrawingId;
                setSelectedDrawingId(null);
                updateDrawing(idToHide, updates);
                scheduleRender();
                const updatedObj = visibleDrawings.find((d) => d.id === idToHide);
                if (updatedObj) {
                  transport
                    .saveDrawing({
                      id: updatedObj.id,
                      layout_id: layoutId,
                      tool_type: updatedObj.type,
                      symbol: currentSymbol,
                      data: JSON.stringify({
                        ...updatedObj,
                        ...updates,
                      }),
                    })
                    .catch(console.error);
                }
                return;
              }
              updateDrawing(selectedDrawingId, updates);
              scheduleRender();
              const updatedObj = visibleDrawings.find((d) => d.id === selectedDrawingId);
              if (updatedObj) {
                const mergedOptions = {
                  ...(updatedObj.options || {}),
                  ...(updates.options || {}),
                };
                transport
                  .saveDrawing({
                    id: updatedObj.id,
                    layout_id: layoutId,
                    tool_type: updatedObj.type,
                    symbol: currentSymbol,
                    data: JSON.stringify({
                      ...updatedObj,
                      ...updates,
                      options: mergedOptions,
                    }),
                  })
                  .catch(console.error);
              }
            }
          }}
          onDelete={() => {
            if (selectedDrawingId) {
              const idToDelete = selectedDrawingId;
              deleteDrawing(idToDelete);
              setSelectedDrawingId(null);
              scheduleRender();
              transport.deleteDrawing(idToDelete).catch(console.error);
            }
          }}
          onDuplicate={() => {
            if (selectedDrawingId) {
              const original = visibleDrawings.find((d) => d.id === selectedDrawingId);
              if (original) {
                const newId = `draw_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
                const clonedAnchors = original.anchors.map((a) => {
                  const coord = anchorToCanvas(a);
                  if (coord) {
                    const shifted = canvasToAnchor(coord.x + 24, coord.y + 24);
                    if (shifted) return shifted;
                  }
                  const priceDiff = Math.abs(original.anchors[0].price - (original.anchors[1]?.price ?? original.anchors[0].price));
                  const deltaPrice = priceDiff > 0 ? priceDiff * 0.15 : original.anchors[0].price * 0.002;
                  return {
                    time: a.time + 60,
                    price: a.price - deltaPrice,
                  };
                });
                const cloned: UserDrawing = {
                  ...original,
                  id: newId,
                  paneId: targetPaneId,
                  anchors: clonedAnchors,
                };
                addDrawing(cloned);
                setSelectedDrawingId(newId);
                scheduleRender();
                transport
                  .saveDrawing({
                    id: cloned.id,
                    layout_id: layoutId,
                    tool_type: cloned.type,
                    symbol: currentSymbol,
                    data: JSON.stringify(cloned),
                  })
                  .catch(console.error);
              }
            }
          }}
          onOpenSettings={() => setIsSettingsModalOpen(true)}
        />
      )}

      {/* Main Drawing Settings Modal */}
      {isSettingsModalOpen && selectedDrawingObj && (
        <React.Suspense fallback={null}>
          <DrawingSettingsModal
            isOpen={isSettingsModalOpen}
            drawing={selectedDrawingObj}
            priceDecimals={priceDecimals}
            onClose={() => setIsSettingsModalOpen(false)}
            onSave={(updated, commitToDb = false) => {
              updateDrawing(updated.id, updated);
              if (commitToDb) {
                transport
                  .saveDrawing({
                    id: updated.id,
                    layout_id: layoutId,
                    tool_type: updated.type,
                    symbol: currentSymbol,
                    data: JSON.stringify(updated),
                  })
                  .catch(console.error);
              }
            }}
          />
        </React.Suspense>
      )}
    </div>
  );
});
