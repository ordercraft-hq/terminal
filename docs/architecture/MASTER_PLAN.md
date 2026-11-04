# ORDERCRAFT — Master Architecture & Implementation Plan

> **Mission:** Build a 100% legal, free, open-source (MIT / Apache-2.0) financial charting, technical analysis, and scripting workstation (`ordercraft-hq/terminal`) that runs natively on Windows, macOS, and Linux via **Go + Wails**, and self-hosted in any browser via **Docker**.

---

## 1. Architecture & Specification Standards

To ensure this project maintains the highest open-source engineering standards, **all contributors and AI coding agents adhere to the following core principles**:

### 1.1 Permitted Inputs & Dependency Standards
1. **Permissive Open-Source Libraries:** Rely strictly on well-maintained, permissively licensed libraries (MIT, Apache-2.0, BSD).
2. **No Proprietary Binary Dumps or Code Copying:** Never copy, paste, or transpile obfuscated/minified code or proprietary charting terminal bundles.
3. **Independent Asset Standards:**
   - All branding, naming, and tooling use original project identifiers (**ORDERCRAFT**, **OrderScript**).
   - Use permissive open-source icon sets (**Lucide Icons**).
4. **User-Controlled Market Data:** Connect only to public, free APIs (e.g., Binance, Bybit, Coinbase, Yahoo Finance) or user-supplied credentials (Bring Your Own Key — BYOK).

### 1.2 First-Principles Implementation Workflow
All charting features, drawing tools, and indicator math are developed from first principles:
1. **Independent Behavioral Specification Modeling:**
   - Document mathematical and geometric specifications into Markdown files (`docs/specs/drawing-tools-spec.md`, `docs/specs/indicators-spec.md`, `docs/specs/workspace-ux-spec.md`, `docs/specs/orderscript-grammar.md`).
   - Example specification: *"A Fibonacci Retracement tool takes two anchor points `(t1, p1)` and `(t2, p2)`, computes horizontal price levels at ratios `[0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0]`, and fills the background between adjacent levels with semi-transparent color."*
2. **Original Implementations:**
   - Contributors and agents build directly from the specifications in `docs/specs/`, writing 100% original **Go** and **TypeScript** code on top of standard open-source libraries.

---

## 2. Core Technology Stack

Every dependency in this stack uses a permissive open-source license (**MIT**, **Apache-2.0**, or **BSD**).

### 2.1 Backend & Native Desktop Shell
* **Language:** **Go (Golang 1.23+)** — Goroutines and channels for multi-exchange WebSocket concurrency, real-time tick aggregation, indicator computation, and zero-CORS HTTP fetching.
* **Desktop Framework:** **Wails v3** (MIT) — Native OS windowing (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux), frameless custom titlebars, system tray background execution, and multi-monitor tear-off windows.
* **Transport Layer (Dual-Mode):**
  * *Control Plane:* Wails IPC bindings (with an automatic fallback to REST/JSON-RPC when running in Docker/Web mode).
  * *High-Frequency Data Plane:* Embedded localhost binary WebSocket server (`nhooyr.io/websocket` + **MessagePack** / **FlatBuffers**) capable of streaming 50,000+ orderbook/tick updates per second at 60–144fps without IPC JSON serialization bottlenecks.
* **Local Storage:**
  * **SQLite (`modernc.org/sqlite` — pure Go, no CGO required):** Stores saved multi-chart layouts, drawing objects, watchlists, alert rules, drawing templates, chart style templates, and authenticated **AES-256-GCM encrypted** broker API credentials (`data/ordercraft.db` with 0600 file permissions).
  * **Local Memory Cache & Planned Parquet Storage:** In-memory LRU cache (10s TTL) for active candle streams; cold storage (DuckDB / Parquet) planned alongside historical Bar Replay.

### 2.2 Frontend & Charting Engine
* **Framework:** **React 19 + TypeScript + Vite**
* **Core Chart Canvas:** **`lightweight-charts` v5** (**Apache-2.0 License**) — Provides hardware-accelerated HTML5 Canvas rendering, time/price scales, crosshair, zoom/pan, and multi-pane support legally out of the box.
* **Drawing & Overlay Engine:** Custom **Series/Pane Primitives (`ISeriesPrimitive` & `IPanePrimitive`)** written in TypeScript using the native HTML5 Canvas 2D context.
* **Multi-Chart Grid & Workspace Docking:** **Dockview (`dockview.dev` — MIT)** — Provides Pro-Terminal split grids (1x1, 2x2, 4x4, 8+ charts), draggable tabs, floating panels, and collapsible drawers (Watchlist, Script Editor, Strategy Tester).
* **State Management:** **Zustand** — Handles 60fps cross-chart synchronization (Crosshair sync, Symbol sync, Timeframe sync, Date-range sync).
* **Styling & UI Primitives:** **Tailwind CSS + Radix UI + Lucide Icons** + bundled **Inter** (UI) and **JetBrains Mono** (tabular numbers/prices) fonts so Windows, macOS, and Linux render identically.

---

## 3. Repository Structure

```text
ordercraft/
├── LICENSE                          # MIT License
├── NOTICE                           # Apache-2.0 attribution for lightweight-charts
├── DISCLAIMER.md                    # Financial risk & no-liability legal disclaimer
├── README.md                        # Workstation documentation & setup guide
├── CONTRIBUTING.md                  # Contribution guidelines
├── CODE_OF_CONDUCT.md               # Community code of conduct
├── SECURITY.md                      # Security policy & reporting
├── CHANGELOG.md                     # Release history
├── main.go                          # Entry point (boots Workstation server & embedded UI)
├── docs/                            # Documentation, architecture & specifications
│   ├── architecture/                # System design & master plan
│   │   └── MASTER_PLAN.md           # This architectural & roadmap document
│   ├── specs/                       # Behavioral specifications (NO proprietary code)
│   │   ├── drawing-tools-spec.md    # Anchor geometry & hit-testing math for 50+ drawing tools
│   │   ├── indicators-spec.md       # Mathematical formulas for 100+ technical indicators
│   │   ├── workspace-ux-spec.md     # Multi-pane grid, shortcut map, and sync mechanics
│   │   └── orderscript-grammar.md   # EBNF grammar for declarative indicator scripting
│   └── provider-setup/              # Market data provider configuration guides
├── internal/
│   ├── server/                      # Localhost REST & real-time WebSocket relay hub (with loopback & token auth)
│   ├── security/                    # AES-256-GCM authenticated cipher & local master key resolver
│   ├── datafeed/                    # Unified multi-provider market data engine
│   │   ├── provider.go              # DataProvider interface (GetHistory, Subscribe, Search)
│   │   ├── aggregator.go            # Real-time tick-to-custom-timeframe (1s, 5s, 15m, Range)
│   │   ├── synthetic.go             # Spread & ratio calculator (e.g., BINANCE:BTCUSDT / YAHOO:GC=F)
│   │   └── providers/
│   │       ├── binance.go           # Free Crypto Spot/Futures WebSockets & REST
│   │       ├── bybit.go             # Free Crypto WebSockets & REST
│   │       ├── hyperliquid.go       # Free DEX L1/L2 orderbook & candles
│   │       ├── yahoo.go             # Free Global Stocks, Forex, Indices, Commodities
│   │       ├── alpaca.go            # BYOK US Stocks & Options
│   │       └── csv_parquet.go       # Local file importer for offline backtesting
│   ├── indicators/                  # Pure Go vectorized math engine
│   │   ├── trend.go                 # SMA, EMA, WMA, RMA, SuperTrend, Ichimoku, VWAP
│   │   ├── oscillators.go           # RSI, MACD, Stochastic, CCI, Williams %R
│   │   ├── volatility.go            # Bollinger Bands, ATR, Keltner Channels, Donchian
│   │   └── volume_profile.go        # Fixed Range & Session Volume Profile (FRVP / SVR), TPO
│   ├── script/                      # OrderScript Lexer, AST Parser & Go VM
│   ├── replay/                      # Deterministic Bar & Tick Replay state machine
│   ├── alerts/                      # Background goroutine alert evaluator + OS/Webhook notifier
│   └── storage/                     # SQLite schema & queries (layouts, drawings, settings, cache)
└── frontend/
    ├── src/
    │   ├── transport/               # Unified client (auto-detects Wails IPC vs Browser WebSocket)
    │   ├── store/                   # Zustand stores (LayoutStore, SyncStore, DrawingStore)
    │   ├── components/
    │   │   ├── Titlebar/            # Custom frameless titlebar with workspace tabs & window controls
    │   │   ├── TopToolbar/          # Symbol search trigger, Timeframe picker, Chart type, Indicators
    │   │   ├── LeftDrawingBar/      # Drawing tool selector, Magnet mode, Lock/Hide toggles
    │   │   ├── WorkspaceGrid/       # Dockview multi-chart container (unlimited split panes)
    │   │   ├── ChartPane/           # Individual Lightweight Charts v5 wrapper + HUD legend
    │   │   ├── RightSidebar/        # Watchlist, Object Tree (layers), Alerts log, Data Window
    │   │   ├── BottomDrawer/        # Script Editor & Backtest Strategy Tester
    │   │   └── Modals/              # Command Palette (Cmd+K), Indicator Search, Provider API Keys
    │   └── primitives/              # Custom Lightweight Charts ISeriesPrimitive Canvas 2D plugins
    │       ├── core/                # BaseAnchorPrimitive, HitTestEngine, MagnetSnapper
    │       ├── lines/               # Trendline, Ray, ExtendedLine, HorizontalRay, CrossLine, Channel
    │       ├── fibonacci/           # FibRetracement, FibExtension, FibChannel, Pitchfork
    │       ├── shapes/              # Rectangle, RotatedRect, Circle, Triangle, Polyline, Brush
    │       ├── trading/             # LongPosition, ShortPosition (R:R calculator), PriceRange, DateRange
    │       └── orderflow/           # VolumeProfilePrimitive, FootprintClusterPrimitive
```

---

## 4. Core Architectural Designs

### 4.1 The Dual-Mode Transport Layer (Desktop Wails + Docker Web)
To make the repository useful to both desktop traders and self-hosted/cloud developers without duplicating code:
* **Go Backend:** Starts an internal HTTP + Binary WebSocket server on `127.0.0.1:0` (random free port in desktop mode, or `:8448` in standalone/Docker mode with automatic port probing fallback).
* **Frontend Client (`frontend/src/transport/client.ts`):**
  * Window management actions (Minimize, Maximize, Tear-off Window, System Tray) check `if (window.runtime)` and invoke Wails APIs.
  * Market data subscriptions, historical candle fetches, indicator calculations, and SQLite layout saves route over the binary WebSocket connection.

### 4.2 Multi-Provider Data Engine & Explicit Ticker Router
Every symbol in the platform uses a `PROVIDER:SYMBOL` namespace:
* **Active Native Feeds:**
  * `BINANCE:BTCUSDT` -> Routes to `BinanceProvider` (Free Crypto Spot/Futures)
  * `BYBIT:BTCUSDT` -> Routes to `BybitProvider` (Free Crypto v5)
  * `COINBASE:BTC-USD` -> Routes to `CoinbaseProvider` (Advanced Trade)
  * `ALPACA:AAPL` -> Routes to `AlpacaProvider` (BYOK US Stocks & Crypto)
  * `OANDA:EUR_USD` -> Routes to `OandaProvider` (BYOK Forex & CFD v20)
* **Planned Provider Feeds (Marked "Coming Soon"):**
  * `TWELVEDATA:AAPL` -> Planned feed adapter (integration stub in development)
  * `IBKR:AAPL` -> Planned Gateway/TWS adapter
  * `YAHOO:AAPL` -> Currently powers Watchlist Quotes & Movers; direct candle streaming feed planned
* **Explicit Routing & Fail-Fast:** If a symbol prefix specifies an unconfigured or unsupported provider (e.g. `TWELVEDATA:AAPL`), the coordinator immediately returns an explicit error (`provider "TWELVEDATA" is not configured or supported`) rather than silently falling back to a default crypto provider. Unprefixed symbols (`BTCUSDT`) continue to route to the default crypto provider.
* **Synthetic Expressions (Planned):** If a user enters `BINANCE:BTCUSDT / BINANCE:ETHUSDT` or `YAHOO:SPY - YAHOO:QQQ`, the Go `SyntheticEngine` subscribes to both underlying feeds concurrently, aligns timestamps in memory, evaluates the expression, and streams the synthetic OHLCV bars to the chart.
* **Custom Second & Tick Timeframes:** Because Go receives raw live trades from WebSockets, the `Aggregator` builds `1s`, `5s`, `10s`, `30s`, or custom tick-bar candles (`100T`, `500T`) locally—providing features that normally require expensive subscriptions for free.

### 4.3 The Custom Drawing Engine (`ISeriesPrimitive` Architecture)
`lightweight-charts` v5 provides coordinate conversion APIs:
* `timeScale().timeToCoordinate(time)` <-> `coordinateToTime(x)`
* `series.priceToCoordinate(price)` <-> `coordinateToPrice(y)`

We build a single **Interactive Drawing Manager** in TypeScript:
1. **Anchor System:** Every drawing tool is defined purely by an array of logical anchors `[{ time, price }, ...]` and a `style` JSON object. Because anchors are stored in `(time, price)` space rather than pixel space, drawings automatically scale and move when the user zooms, pans, or switches timeframes.
2. **Magnet Mode (OHLC Snap):** When Magnet Mode is active, moving the cursor near a candle queries the candle's `{open, high, low, close}` pixel coordinates and snaps the anchor to the nearest wick or body edge.
3. **Hit-Testing & Selection Handles:** Each primitive implements a `hitTest(x, y)` method using point-to-line-segment distance math, displaying draggable resize handles when hovered or selected.
4. **SQLite Auto-Save:** Every drag-end or creation event debounces a save call to Go, storing the drawing tied to `(symbol, layout_id)` in SQLite.

### 4.4 Security, Credential Encryption & Network Isolation
* **AES-256-GCM Credential Encryption:** API keys, secrets, and tokens stored in SQLite (`api_keys` table) are automatically encrypted using authenticated AES-256-GCM (`internal/security/crypto.go`). Raw credentials never touch disk in plaintext. A unique 32-byte master key is stored with strict `0600` permissions (`data/.ordercraft.key`) or derived from the `ORDERCRAFT_ENCRYPTION_KEY` environment variable.
* **Loopback Host Isolation:** OrderCraft binds by default to `127.0.0.1` and restricts WebSocket / CORS origin patterns strictly to local loopback (`localhost`, `127.0.0.1`, `::1`).
* **Non-Loopback Security Advisory:** Binding to non-loopback interfaces (e.g. `--host 0.0.0.0`) without authentication triggers an immediate high-visibility security warning banner at startup.
* **Token Authentication:** For remote, headless, or Docker deployments, passing `--token=<secret>` or setting `ORDERCRAFT_AUTH_TOKEN` activates bearer token authentication on all `/api/` endpoints and `/ws` WebSocket streams (via header or `?token=<secret>`), permitting authenticated remote browser origins while keeping health probes accessible.

---

## 5. Step-by-Step Implementation Roadmap

### Phase 1: Foundation, Dual-Mode Shell & Live Multi-Provider Charting (Weeks 1–2)
- [x] **Step 1.1:** Initialize project with React 19 + TypeScript + Vite + Tailwind CSS and bundle `Inter` and `JetBrains Mono` fonts.
- [x] **Step 1.2:** Configure frameless window and build the custom Dark-Mode Titlebar (`#131722` palette) with window controls and layout tabs.
- [x] **Step 1.3:** Implement the Go SQLite storage layer (`internal/storage`) with tables for `layouts`, `drawings`, `watchlists`, and `api_keys`.
- [x] **Step 1.4:** Build the Go `DataProvider` interface and implement the first free provider (**Binance Spot/Perps** REST historical klines).
- [x] **Step 1.5:** Embed `lightweight-charts` v5 inside a `ChartPane` component with full OHLCV candlestick + volume histogram rendering, dynamic historical loading, and live crosshair HUD legend.
- [x] **Step 1.6:** Build the global Command Palette (`Cmd/Ctrl + K` or typing directly on the chart) for instant symbol and timeframe switching (`1s`, `1m`, `5m`, `15m`, `1h`, `4h`, `1D`, `1W`).
- [x] **Step 1.7:** Implement **AES-256-GCM Credential Encryption & Network Security Hardening** (transparent SQLite key encryption, startup auto-migration, non-loopback security warning banners, and optional token auth for remote/Docker setups).

### Phase 2: Multi-Chart Workspace Grids & Cross-Chart Sync (Weeks 3–4)
- [x] **Step 2.1:** Implement dynamic multi-chart grid layouts (1x1, 2v, 2h, 3v, 3h, 3top, 3left, 4 grid, 4v, 4h, 6, 8) with focused active pane tracking and pane maximize/restore.
- [x] **Step 2.2:** Build the Zustand **Cross-Chart Sync Engine**:
  - **Symbol Sync:** Synchronizes symbol changes across all charts, or toggles independent symbols per pane.
  - **Crosshair Sync:** Moving the mouse on Chart A renders a synchronized dashed crosshair line & HUD at the exact timestamp across all charts.
  - **Timeframe & Visible Range Sync:** Panning or zooming one chart optionally pans/zooms linked charts in real-time.
- [x] **Step 2.3:** Implement full **Layout Persistence** in SQLite (save, load, rename, duplicate, and auto-restore workspace states with Ctrl+S).
- [ ] **Step 2.4:** Build the Right Sidebar **Watchlist** *(Deferred by user request — will add later when needed)*.

### Phase 3: The Drawing Tools Suite (Weeks 5–7)
- [x] **Step 3.1:** Write `docs/specs/drawing-tools-spec.md` documenting exact anchor counts, geometry, and label rules for each drawing tool.
- [x] **Step 3.2:** Build the core `BaseDrawingPrimitive` / Drawing Manager in TypeScript (`ISeriesPrimitive` & Canvas Overlay), including:
  - Mouse down / move / up state machine for placing anchors.
  - Weak & Strong **Magnet Mode** (snapping to candle High/Low/Open/Close with reticle preview).
  - Floating context toolbar (color picker, line thickness, dashed/dotted style, duplicate, lock, delete).
- [x] **Step 3.3:** Implement the **Core Drawing Primitives**:
  1. *Lines:* Trendline, Ray, Info Line, Extended Line, Horizontal Line, Horizontal Ray, Vertical Line, Cross Line, Parallel Channel.
  2. *Fibonacci:* Fib Retracement (customizable levels & background fills), Trend-Based Fib Extension.
  3. *Shapes & Annotations:* Rectangle, Circle.
  4. *Trading & Measurement:* **Long Position & Short Position (Risk/Reward Ratio Calculator with TP/SL zones & dynamic R:R ratio)**, Price Range Ruler, Date Range Ruler, Date & Price Range Ruler.
  5. *Volume-Based:* **Anchored VWAP** (customizable stdev & percentage bands, shaded fills, interactive curve handles, and native price scale labels), **Fixed Range Volume Profile (FRVP)** (24-row histogram, POC, 70% Value Area, shaded background box, clean unselected presentation, and continuous live bar updates with Extend Right).
- [x] **Step 3.4:** Build the **Object Tree** (search drawings, toggle visibility, lock layers, duplicate, delete per drawing, and sync across charts of the same symbol).

### Phase 4: Technical Indicators & Standard Shipped Catalogue (Weeks 8–9)
- [x] **Step 4.1:** Write `docs/specs/indicators-spec.md` with exact mathematical definitions, inputs, default parameters, and warm-up periods.
- [x] **Step 4.2 (Part 1 — Standard Shipped Indicators):** Full production-grade standard technical indicator suite:
  - **Overlay Indicators:** SMA, EMA, WMA, HMA, VWAP (Session/Week/Month), Bollinger Bands (Upper/Basis/Lower + Shaded fill), Keltner Channels, SuperTrend (dynamic Bull/Bear color flip), Parabolic SAR.
  - **Sub-Pane Oscillators:** RSI (with 70/50/30 reference levels), MACD (Fast/Slow/Signal line + 4-color momentum histogram), Stochastic Oscillator, Stochastic RSI, ATR, CCI, Williams %R, ADX / DMI (+DI, -DI), OBV.
  - **Indicators Modal:** Pro dark-mode modal with quick search, tab filtering (*All*, *Overlays & Trend*, *Oscillators*, *Favorites*, *Active on Chart*), favorite stars, and 1-click addition.
  - **Chart HUD Indicator Legend:** Top-left legend displaying active indicators, parameters, live streaming value readouts, eye visibility toggle, settings gear, and remove button.
  - **Indicator Settings Dialog:** Deep customization modal with **Inputs** (periods, multipliers, price sources) and **Style** (swatches, line width 1-4px, styles, plot toggles).
- [ ] **Step 4.2 (Part 2 — Custom User Indicator Framework):** *(Postponed to later phase per user instruction to prioritize rapid delivery).*
- [x] **Step 4.3:** **Pro Volume Profile Primitives:** Fixed Range Volume Profile (FRVP with POC, 70% Value Area & live bar updates) and Anchored VWAP (completed in Step 3.3).

### Phase 5: Bar Replay, Local Alerts & Scripting Engine (Weeks 10–12)
- [ ] **Step 5.1:** Build the **Unlimited Bar Replay Engine**:
  - Visual "Jump to Bar" scissor cursor.
  - Play / Pause / Step Forward (0.5x to 50x speed).
  - Multi-chart synchronized replay (step forward on a 5m chart and a 1h chart simultaneously without future-data leakage).
  - Simulated Paper Trading buttons (Buy Market, Sell Market, Flatten) during Replay mode to practice manual trading.
- [ ] **Step 5.2:** Build the **Background Alert Engine**:
  - Price crossing levels, trendline touch alerts, and indicator condition alerts evaluated in Go goroutines.
  - Triggers native OS desktop notifications, custom audio chimes, Discord/Telegram webhooks, and System Tray popups.
- [ ] **Step 5.3:** Build the **Bottom Drawer Script Editor & OrderScript Engine**:
  - Embed script editor with syntax highlighting and autocomplete.
  - Build an AST parser in Go that evaluates declarative indicator scripts (`ema()`, `rsi()`, `plot()`, `fill()`, `hline()`) and renders outputs directly onto the chart.

---

## 6. Architecture & Engineering Guidelines

1. **Strict Module Isolation:** Each drawing tool primitive in `frontend/src/drawings/` and each indicator in `internal/indicators/` must be a self-contained file with unit tests so parallel contributors can build features simultaneously without merge conflicts.
2. **Coordinate Invariance Test:** Every drawing primitive must pass a test verifying that serializing to `(timestamp, price)` JSON and re-hydrating produces the exact same visual coordinates after zooming and panning.
3. **Indicator Math Accuracy Test:** Every Go indicator in `internal/indicators/` must include a deterministic table-driven test (`_test.go`) against known reference OHLCV datasets to verify floating-point accuracy to `1e-6`.
4. **Zero External Telemetry:** The app must never phone home or include analytics trackers. All user data remains 100% local in SQLite.