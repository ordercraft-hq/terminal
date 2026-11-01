# docs/specs/workspace-ux-spec.md — Workspace UX & Interaction Mechanics Specification

> **Behavioral Specification Ledger:** Defines direct type-to-search interaction states, magnet mode snapping algorithms, drawing modifiers, and multi-chart workspace synchronization behavior.

---

## 1. Direct Type-to-Search State Machine

When keyboard focus is on any chart canvas (and not inside an active text input or Monaco editor):

1. **Alpha Key Press (`[A-Za-z]`):**
   - Intercept keydown event.
   - Prevent default scroll behavior.
   - Open Command Palette / Symbol Search Modal.
   - Pre-fill the search input with the typed character and place cursor at end.

2. **Numeric Key Press (`[0-9]`):**
   - Intercept keydown event.
   - Open compact **Timeframe Pill** dialog at the top/center of the chart pane.
   - Auto-format input:
     - `15` + `Enter` $\to$ Switch resolution to `15m`
     - `1` + `Enter` $\to$ Switch resolution to `1m`
     - `4h` + `Enter` $\to$ Switch resolution to `4h`
     - `1D` + `Enter` $\to$ Switch resolution to `1D`
     - `30s` + `Enter` $\to$ Switch resolution to `30s`
   - `Escape` cancels and closes the pill without changing timeframe.

---

## 2. Magnet Mode Snapping Math

The chart manager provides a `MagnetSnapper` service that queries visible candle coordinates:

```ts
export interface CandleCoordinates {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  x: number;
  yOpen: number;
  yHigh: number;
  yLow: number;
  yClose: number;
}
```

1. **Weak Magnet (`magnetMode === 'weak'`):**
   - Identify candle column at cursor $X$:
     $$|x - \text{candle.x}| \le \frac{\text{barSpacing}}{2}$$
   - Calculate Euclidean distances to each of the 4 price levels:
     $$d_k = \sqrt{(x - \text{candle.x})^2 + (y - y_k)^2}, \quad k \in \{\text{Open}, \text{High}, \text{Low}, \text{Close}\}$$
   - If $\min(d_k) \le 24\text{px}$, snap target coordinate to the nearest candle level:
     $$(x_{\text{snapped}}, y_{\text{snapped}}) = (\text{candle.x}, y_{k_{\min}})$$
   - Otherwise, retain raw cursor coordinate.

2. **Strong Magnet (`magnetMode === 'strong'`):**
   - Locate the candle column nearest to cursor $X$.
   - Vertically snap to the nearest of $\{y_{\text{Open}}, y_{\text{High}}, y_{\text{Low}}, y_{\text{Close}}\}$ regardless of vertical distance from the cursor.

3. **Modifier Override:**
   - Holding `Ctrl` (or `Cmd` on macOS) while dragging an anchor temporarily toggles Magnet Mode on/off.

---

## 3. Keyboard Shortcuts & Modifier Invariants

| Action / Tool | Shortcut | Behavior |
| :--- | :--- | :--- |
| **Trend Line** | `Alt + T` | Activates 2-point Trendline creation mode |
| **Horizontal Line** | `Alt + H` | Creates instant full-width Horizontal Line at cursor price |
| **Horizontal Ray** | `Alt + J` | Creates Horizontal Ray extending rightwards from cursor |
| **Vertical Line** | `Alt + V` | Creates full-height Vertical Line at cursor time |
| **Cross Line** | `Alt + C` | Creates horizontal & vertical crosshair line at cursor |
| **Fib Retracement** | `Alt + F` | Activates 2-point Fibonacci Retracement tool |
| **Rectangle** | `Alt + Shift + R` | Activates 2-point Rectangle box tool |
| **Angle Constraint** | `Shift` (Hold) | While placing/dragging line anchors, constrains angle to $0^\circ, 45^\circ, 90^\circ$ increments |
| **Proportional Scale** | `Shift` (Hold) | While resizing shapes (Circle/Rectangle), constrains aspect ratio to 1:1 |
| **Cancel Creation** | `Escape` | Aborts pending drawing anchor placement |
| **Delete Selected** | `Delete` / `Backspace` | Removes currently selected drawing primitive from store |
| **Duplicate Selected** | `Ctrl + Drag` / `Alt + Drag` | Duplicates the active drawing primitive |

---

## 4. Multi-Chart Synchronization Invariants

In multi-pane grids (`1x1`, `2x1`, `2x2`, `3x3`, `4x4`), Zustand manages synchronization flags:

```ts
export interface ChartSyncState {
  symbolLock: boolean;       // Syncs symbol across all panes
  intervalLock: boolean;     // Syncs timeframe/resolution across all panes
  crosshairLock: boolean;    // Renders synchronized crosshair at exact timestamp across panes
  dateRangeLock: boolean;    // Syncs visible timescale zoom/pan range
  trackTimeLock: boolean;    // Syncs bar index scrolling
}
```

- When `crosshairLock: true`, moving the mouse over Chart A emits `onCrosshairMove(time)`. Linked charts update their internal crosshair position to the matching timestamp without firing circular events.

---

## 5. Right Sidebar & Trading Terminal Dock Specification

The workstation right-hand margin houses an icon dock rail and an expandable drawer panel container:

### 5.1 Dock Rail Dimensions & Layout
- **Width:** Fixed `44px`.
- **Background:** `#131722` (primary terminal dark), border-left: `1px solid #2a2e39`.
- **Top Group:**
  - `Bookmark`: Watchlist & Quote Details
  - `Clock`: Alerts Manager & Trigger Logs
  - `Layers`: Object Tree & Data Window Inspector
- **Center Group:**
  - `Sparkles`: Top Movers Screener (Gainers, Losers, Volume)
  - `Newspaper`: Financial News Flow (RSS aggregator)
  - `Calendar`: Economic Calendar (ForexFactory feed)
  - `Radio`: Data Providers & Stream Health Diagnostics
  - `Bell`: Notifications & Alert Trigger Badges
- **Bottom Group:**
  - `HelpCircle`: Keyboard Shortcuts & Documentation

### 5.2 Drawer Behavior & Drag-to-Resize
- **Width:** Resizable between `280px` (min) and `600px` (max), default `340px`.
- **Resize Handle:** Left border with `col-resize` cursor and non-blocking mouse tracking.
- **Persistence:** Tab selection and width persisted in `ordercraft_workspace_sync_v2` local store.
- **Toggle Behavior:** Clicking an already active tab collapses the drawer to 0px (hidden), expanding chart canvas to maximum screen estate.

### 5.3 Backend API Integration & Caching Invariants
- **Economic Calendar:** Cached hourly in `internal/calendar/service.go` from `https://nfs.faireconomy.media/ff_calendar_thisweek.json` and exposed at `GET /api/calendar`.
- **Financial News:** Cached 15 minutes in `internal/news/service.go` from Google News RSS feeds and exposed at `GET /api/news`.
- **Market Movers Screener:** Cached 30 seconds in `internal/screener/service.go` from Binance 24hr ticker API and exposed at `GET /api/movers`.
- **Providers Health:** Exposed at `GET /api/providers/status` for connection state and latency telemetry.

