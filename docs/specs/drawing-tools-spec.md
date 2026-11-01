# docs/specs/drawing-tools-spec.md — Drawing Tools Specification Ledger & Geometric Specification

> **Behavioral Specification Ledger:** This file defines the pure mathematical formulas, logical anchor structures, hit-testing geometry, and UI interaction rules. All primitives in `frontend/src/primitives/` must implement `ISeriesPrimitive<Time>` in strict logical coordinates `(time, price)`.

---

## 1. Global Drawing Primitive Invariants

1. **Logical Anchor Storage:**
   ```ts
   export interface LogicalAnchor {
     time: number;  // Unix timestamp in seconds (UTC)
     price: number; // Floating-point price level
   }
   ```
2. **Hit-Testing Standard:**
   - Anchor Handle Hit-Test Radius: `6px` square handle centered at anchor coordinate.
   - Line Segment Hit-Test Tolerance: Point-to-segment Euclidean distance $\le 6px$:
     $$d = \frac{|(y_2 - y_1)x_0 - (x_2 - x_1)y_0 + x_2 y_1 - y_2 x_1|}{\sqrt{(y_2 - y_1)^2 + (x_2 - x_1)^2}}$$
3. **HiDPI Rendering:** All canvas drawing inside `PaneRenderer.draw(target)` must wrap in `target.useBitmapCoordinateSpace(scope => ...)` or `target.useMediaCoordinateSpace(scope => ...)`.

---

## Group A: Lines & Channels (OBL-DRAW-001 to OBL-DRAW-010)

### OBL-DRAW-001: Trend Line
- **Status:** [x] Implemented
- **Category:** Lines (`frontend/src/primitives/lines/TrendLinePrimitive.ts`)
- **Default Shortcut:** `Alt + T`
- **Logical Anchors:** 2 anchors: `A: { time: t1, price: p1 }`, `B: { time: t2, price: p2 }`
- **Options / State:**
  - `extendLeft`: boolean (extends line ray leftwards to chart edge)
  - `extendRight`: boolean (extends line ray rightwards to chart edge)
  - `showLabel`: boolean (optional center/end text note)
  - `showStats`: boolean (displays price delta, %, bar count, and angle in degrees)
- **Geometry:**
  - Screen Angle: $\theta = \operatorname{atan2}(-(y_2 - y_1), x_2 - x_1) \times \frac{180}{\pi}$
  - Angle constraint: Holding `Shift` snaps $\theta$ to increments of $45^\circ$ ($0^\circ, 45^\circ, 90^\circ, 135^\circ, 180^\circ$).

### OBL-DRAW-002: Ray
- **Status:** [x] Implemented
- **Category:** Lines (`frontend/src/drawings/tools/RayTool.ts`)
- **Logical Anchors:** 2 anchors: `A: { time: t1, price: p1 }`, `B: { time: t2, price: p2 }`
- **Geometry:** Originates at `A`, passes through `B`, and extends infinitely in the direction from $A \to B$ to canvas boundary.

### OBL-DRAW-003: Info Line
- **Status:** [x] Implemented
- **Category:** Lines (`frontend/src/drawings/tools/InfoLineTool.ts`)
- **Logical Anchors:** 2 anchors: `A: { time: t1, price: p1 }`, `B: { time: t2, price: p2 }`
- **Stats Floating Box (Centered between anchors):**
  - $\Delta \text{Price} = p_2 - p_1$
  - $\% \text{Change} = \frac{p_2 - p_1}{p_1} \times 100$
  - $\Delta \text{Bars} = |\text{barIndex}(t_2) - \text{barIndex}(t_1)|$
  - $\Delta \text{Time} = \text{formatDuration}(|t_2 - t_1|)$
  - Screen Angle $\theta$

### OBL-DRAW-005: Horizontal Line
- **Status:** [x] Implemented
- **Category:** Lines (`frontend/src/drawings/tools/HorizontalLineTool.ts`)
- **Default Shortcut:** `Alt + H`
- **Logical Anchors:** 1 anchor: `{ price: p1 }` (time-independent)
- **Visuals:** Spans full canvas width at $y = \text{priceToCoordinate}(p_1)$. Renders a price pill label on the right price scale.

### OBL-DRAW-006: Horizontal Ray
- **Status:** [x] Implemented
- **Category:** Lines (`frontend/src/drawings/tools/HorizontalRayTool.ts`)
- **Default Shortcut:** `Alt + J`
- **Logical Anchors:** 1 anchor: `{ time: t1, price: p1 }`
- **Geometry:** Starts at $x_1 = \text{timeToCoordinate}(t_1), y_1 = \text{priceToCoordinate}(p_1)$ and extends horizontally to the right edge.

### OBL-DRAW-007: Vertical Line
- **Status:** [x] Implemented
- **Category:** Lines (`frontend/src/drawings/tools/VerticalLineTool.ts`)
- **Default Shortcut:** `Alt + V`
- **Logical Anchors:** 1 anchor: `{ time: t1 }` (price-independent)
- **Visuals:** Full-height vertical line across chart and synced sub-panes at $x = \text{timeToCoordinate}(t_1)$. Displays time pill on bottom timescale.

### OBL-DRAW-008: Cross Line
- **Status:** [x] Implemented
- **Category:** Lines (`frontend/src/primitives/lines/CrossLinePrimitive.ts`)
- **Default Shortcut:** `Alt + C`
- **Logical Anchors:** 1 anchor: `{ time: t1, price: p1 }`
- **Visuals:** Full horizontal line through $p_1$ and vertical line through $t_1$, intersecting at anchor with dual timescale and price scale labels.

### OBL-DRAW-009: Parallel Channel
- **Status:** [x] Implemented
- **Category:** Lines (`frontend/src/primitives/lines/ParallelChannelPrimitive.ts`)
- **Logical Anchors:** 3 anchors:
  1. Base Line Point 1: `{ time: t1, price: p1 }`
  2. Base Line Point 2: `{ time: t2, price: p2 }`
  3. Channel Height / Offset Point: `{ time: t3, price: p3 }`
- **Geometry:**
  - Base vector: $\vec{v} = (x_2 - x_1, y_2 - y_1)$
  - Parallel channel offset line: Line passing through $(x_3, y_3)$ parallel to $\vec{v}$.
  - Midline: Line parallel to $\vec{v}$ at midpoint distance ($0.5$).
  - Background fill between baseline and parallel line with semi-transparent accent color (`rgba(41, 98, 255, 0.15)`).

---

## Group B: Fibonacci & Pitchforks (OBL-DRAW-011 to OBL-DRAW-018)

### OBL-DRAW-011: Fibonacci Retracement
- **Status:** [x] Implemented
- **Category:** Fibonacci (`frontend/src/primitives/fibonacci/FibRetracementPrimitive.ts`)
- **Default Shortcut:** `Alt + F`
- **Logical Anchors:** 2 anchors: `A: { time: t1, price: p1 }`, `B: { time: t2, price: p2 }`
- **Standard Ratios:** `[0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0, 1.618, 2.618, 3.618, 4.236]`
- **Calculation:**
  - Linear Scale:
    $$\text{levelPrice}(r) = p_1 + (p_2 - p_1) \times r$$
  - Logarithmic Scale (when chart log scale is enabled):
    $$\text{levelPrice}_{\log}(r) = p_1 \times \left(\frac{p_2}{p_1}\right)^r$$
- **Visuals:** Horizontal lines spanning from $x_1$ to $x_2$ (or extended right to infinity if `extendRight: true`), with semi-transparent gradient zone fills between adjacent ratio levels.

### OBL-DRAW-012: Trend-Based Fibonacci Extension
- **Status:** [x] Implemented
- **Category:** Fibonacci (`frontend/src/primitives/fibonacci/FibExtensionPrimitive.ts`)
- **Logical Anchors:** 3 anchors:
  - `A: { time: t1, price: p1 }` (Swing origin)
  - `B: { time: t2, price: p2 }` (Impulse swing peak)
  - `C: { time: t3, price: p3 }` (Retracement swing low)
- **Calculation:**
  $$\text{levelPrice}(r) = p_3 + (p_2 - p_1) \times r$$

### OBL-DRAW-013: Pitchfork (Andrews, Schiff, Modified Schiff, Inside)
- **Status:** [ ] Unimplemented
- **Category:** Fibonacci (`frontend/src/primitives/fibonacci/PitchforkPrimitive.ts`)
- **Logical Anchors:** 3 anchors:
  - `P0: { time: t0, price: p0 }` (Pivot)
  - `P1: { time: t1, price: p1 }` (Swing point 1)
  - `P2: { time: t2, price: p2 }` (Swing point 2)
- **Geometry:**
  - Midpoint: $M = \frac{P_1 + P_2}{2}$
  - Median Line: Ray from $P_0$ through $M$.
  - Upper / Lower Prongs: Rays originating at $P_1$ and $P_2$ parallel to the Median Line.

---

## Group C: Trading & Measurement (OBL-DRAW-019 to OBL-DRAW-026)

### OBL-DRAW-019: Long Position (Risk/Reward Calculator)
- **Status:** [x] Implemented
- **Category:** Trading (`frontend/src/primitives/trading/LongPositionPrimitive.ts`)
- **Logical Anchors:**
  1. `entry`: `{ time: t1, price: entryPrice }`
  2. `end`: `{ time: t2, price: entryPrice }` (controls width)
  3. `targetPrice`: `{ price: takeProfitPrice }` (Take Profit handle, $p_{\text{target}} > p_{\text{entry}}$)
  4. `stopPrice`: `{ price: stopLossPrice }` (Stop Loss handle, $p_{\text{stop}} < p_{\text{entry}}$)
- **Math:**
  - $\text{Risk} = |p_{\text{entry}} - p_{\text{stop}}|$
  - $\text{Reward} = |p_{\text{target}} - p_{\text{entry}}|$
  - $\text{Risk/Reward Ratio} = \frac{\text{Reward}}{\text{Risk}}$
  - $\%\Delta_{\text{Target}} = \frac{p_{\text{target}} - p_{\text{entry}}}{p_{\text{entry}}} \times 100$
  - $\%\Delta_{\text{Stop}} = \frac{p_{\text{stop}} - p_{\text{entry}}}{p_{\text{entry}}} \times 100$
- **Visual Zones:**
  - Profit Zone: Rectangle $(x_1, y_{\text{entry}})$ to $(x_2, y_{\text{target}})$ filled with `rgba(8, 153, 129, 0.2)` and border `#089981`.
  - Loss Zone: Rectangle $(x_1, y_{\text{entry}})$ to $(x_2, y_{\text{stop}})$ filled with `rgba(242, 54, 69, 0.2)` and border `#F23645`.

### OBL-DRAW-020: Short Position (Risk/Reward Calculator)
- **Status:** [x] Implemented
- **Category:** Trading (`frontend/src/primitives/trading/ShortPositionPrimitive.ts`)
- **Logical Anchors:** Mirror of Long Position with $p_{\text{target}} < p_{\text{entry}}$ and $p_{\text{stop}} > p_{\text{entry}}$.

### OBL-DRAW-021: Price Range Ruler
- **Status:** [x] Implemented
- **Category:** Trading (`frontend/src/primitives/trading/PriceRangePrimitive.ts`)
- **Logical Anchors:** 2 anchors: `(t1, p1)` and `(t2, p2)`
- **Pill Stats:** $\Delta \text{Price}$, Percentage Change, and Pip/Tick count.

### OBL-DRAW-022: Date Range Ruler
- **Status:** [x] Implemented
- **Category:** Trading (`frontend/src/primitives/trading/DateRangePrimitive.ts`)
- **Logical Anchors:** 2 anchors: `(t1, p1)` and `(t2, p2)`
- **Pill Stats:** Bar count in range, Duration (days, hours, minutes), and Volume sum in range.

### OBL-DRAW-023: Date and Price Range Combined Ruler
- **Status:** [x] Implemented
- **Category:** Trading (`frontend/src/primitives/trading/DatePriceRangePrimitive.ts`)
- **Logical Anchors:** 2 diagonal anchors forming a bounding box with combined $\Delta\text{Price}$ and $\Delta\text{Date}$ statistics.

---

## Group D: Shapes & Annotations (OBL-DRAW-027 to OBL-DRAW-036)

### OBL-DRAW-027: Rectangle
- **Status:** [x] Implemented
- **Category:** Shapes (`frontend/src/primitives/shapes/RectanglePrimitive.ts`)
- **Default Shortcut:** `Alt + Shift + R`
- **Logical Anchors:** 2 diagonal corners `(t1, p1)` and `(t2, p2)`
- **Options:** Optional dashed midline at $y_{\text{mid}} = \frac{p_1 + p_2}{2}$ and customizable background fill opacity.

### OBL-DRAW-028: Rotated Rectangle
- **Status:** [ ] Unimplemented
- **Category:** Shapes (`frontend/src/primitives/shapes/RotatedRectPrimitive.ts`)
- **Logical Anchors:** 3 anchors (Base point 1, Base point 2, Perpendicular height)

### OBL-DRAW-029: Path / Polyline
- **Status:** [ ] Unimplemented
- **Category:** Shapes (`frontend/src/primitives/shapes/PolylinePrimitive.ts`)
- **Logical Anchors:** $N$ sequential anchors `[{ time, price }, ...]` terminated on double-click.

### OBL-DRAW-030: Circle / Ellipse
- **Status:** [x] Implemented
- **Category:** Shapes (`frontend/src/primitives/shapes/CirclePrimitive.ts`)
- **Logical Anchors:** Center anchor `(t1, p1)` + Perimeter radius anchor `(t2, p2)`

### OBL-DRAW-033: Freehand Brush & Highlighter
- **Status:** [ ] Unimplemented
- **Category:** Shapes (`frontend/src/primitives/shapes/BrushPrimitive.ts`)
- **Logical Anchors:** Array of continuous mouse points converted to logical coordinates and rendered with a smoothed Catmull-Rom spline.

---

## Group E: Volume-Based Tools (OBL-DRAW-037 to OBL-DRAW-039)

### OBL-DRAW-037: Anchored VWAP (Volume-Weighted Average Price)
- **Status:** [x] Implemented
- **Category:** Volume (`frontend/src/drawings/tools/AnchoredVWAPTool.ts`)
- **Logical Anchors:** 1 anchor: `{ time: t0, price: p0 }`
- **Calculation:**
  - Forward accumulation from anchor bar $k_0$ to bar $N-1$:
    $$\text{CumVol}_t = \sum_{i=k_0}^t V_i, \quad \text{CumPV}_t = \sum_{i=k_0}^t P_i \cdot V_i$$
    $$\text{VWAP}_t = \frac{\text{CumPV}_t}{\text{CumVol}_t}$$
  - Standard Deviation Bands:
    $$\sigma_t = \sqrt{\max\left(0, \frac{\sum_{i=k_0}^t V_i \cdot P_i^2}{\text{CumVol}_t} - \text{VWAP}_t^2\right)}$$
    $$\text{Upper}_t^{(b)} = \text{VWAP}_t + M_b \cdot \sigma_t, \quad \text{Lower}_t^{(b)} = \text{VWAP}_t - M_b \cdot \sigma_t$$
- **Visuals:**
  - Interactive circular anchor handle at candle $(t_0, p_0)$
  - Primary VWAP line with customizable color, width, and style
  - Up to 3 configurable standard deviation or percentage bands with shaded polygon fill between Upper and Lower Band #1
  - Price label pill on the price scale and floating action toolbar

### OBL-DRAW-038: Fixed Range Volume Profile (FRVP)
- **Status:** [x] Implemented
- **Category:** Volume (`frontend/src/drawings/tools/FixedRangeVolumeProfileTool.ts`)
- **Logical Anchors:** 2 anchors: `A: { time: t1, price: p1 }`, `B: { time: t2, price: p2 }`
- **Calculation:**
  - Range window: $t_{\text{start}} = \min(t_1, t_2)$, $t_{\text{end}} = \text{extendRight} ? \max(t_{\text{start}}, t_{\text{live}}) : \max(t_1, t_2)$
  - Price bounds: $P_{\min} = \min_{i} (\text{low}_i), \quad P_{\max} = \max_{i} (\text{high}_i)$
  - Row binning: $N = \text{rowSize}$ rows (default: 24), price step $\Delta P = (P_{\max} - P_{\min}) / N$
  - Volume distribution: proportional candle overlap over price bins
  - Point of Control (POC): $k_{\text{poc}} = \arg\max_k (V_k^{\text{total}})$
  - 70% Value Area: Steidlmayer two-sided volumetric expansion from POC defining Value Area High (VAH) and Value Area Low (VAL)
- **Visuals:**
  - Shaded histogram background box covering $[x_{\text{left}}, x_{\text{right}}] \times [y_{\text{top}}, y_{\text{bottom}}]$
  - Horizontal volume profile bars with customizable Up/Down and Value Area color coding
  - POC line across profile window (no price scale labels)
  - Clean unselected presentation (no vertical boundary lines, no diagonal guidelines, no anchor point handles when unselected)
  - Interactive selection handles and continuous live-bar updates when `extendRight` is enabled

### OBL-DRAW-039: Anchored Volume Profile
- **Status:** [x] Complete
- **Category:** Volume (`frontend/src/drawings/tools/AnchoredVolumeProfileTool.ts`)
- **Logical Anchors:** 1 anchor: `{ time: t0, price: p0 }`
- **Mathematical Specification:**
  - Start time: $t_0 = \text{anchor}[0].\text{time}$, End time: $t_{\text{live}} = \text{candles}[\text{last}].\text{time}$
  - Price range: $P_{\min} = \min_{t \ge t_0}(L_i)$, $P_{\max} = \max_{t \ge t_0}(H_i)$
  - Row binning: $N = \text{rowSize}$ rows (default: 24), price step $\Delta P = (P_{\max} - P_{\min}) / N$
  - Volume distribution: proportional candle overlap over price bins
  - Point of Control (POC): $k_{\text{poc}} = \arg\max_k (V_k^{\text{total}})$
  - 70% Value Area: Steidlmayer volumetric expansion from POC defining Value Area High (VAH) and Value Area Low (VAL)
- **Visuals:**
  - Shaded histogram background box covering $[x_0, x_{\text{live}}] \times [y_{\text{top}}, y_{\text{bottom}}]$
  - Right-aligned horizontal volume profile histogram bars (default: 30% width of box) with Up/Down and Value Area color coding
  - Point of Control (POC) line across profile window with native black price scale badge (`2,328.xx`)
  - Native bottom timescale badge at anchor point $t_0$
  - Single-click interactive placement and 1-handle re-anchoring to any bar

