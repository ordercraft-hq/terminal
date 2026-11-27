# Changelog

All notable changes to **OrderCraft** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.3.0] - 2026-11-27

### Added
- **Level 2 Market Data Bridge (`DataBridgeProvider`):**
  - Implemented `L2DataProvider` WebSocket + HTTP streaming adapter (`internal/datafeed/providers/databridge.go`) supporting `TickData`, `OrderBookDepth`, `DeltaBar`, and live `FootprintBar` bid/ask price clusters.
  - Added server-side delta/tick aggregation (`internal/datafeed/aggregator.go`) and symbol alias resolution (`@NQ` / exchange tickers).
  - Enforced automatic chart-type capability checks (`frontend/src/utils/chartTypeSupport.ts`), gracefully guiding L1-only feeds vs. L2 feeds in multi-pane workspaces.
- **Footprint Charts & Orderflow L2 Suite (`OrderflowPanel` + `FootprintPrimitive`):**
  - Upgraded `FootprintPrimitive` with 4 display modes (**Footprint only**, **Vol Profile only**, **Both**, **No candle**), **Bid × Ask** and **Delta** cluster rendering, automatic candle fallback on dense zoom, and customizable Point of Control (**POC**) highlights.
  - Added **Per-Bar Volume Profile** with customizable tick intervals, **POC Bar** highlighting, and configurable **Value Area (70% default VAH/VAL)** shading (`volumeProfileCalc.ts`).
  - Added **Bar Statistics Header/Footer** displaying live Bar Delta, Delta %, Total Volume, and Min/Max Delta.
  - Built **Diagonal & Stacked Imbalances Engine** with SQLite-persisted CRUD rules (`imbalanceRules`), configurable imbalance ratio %, delta volume filters, buy/sell text/box highlights, stacked consecutive-level thresholds, zone borders, and mitigated-zone tracking.
- **Time Synchronization & Multi-Pane Precision:**
  - Added `/api/time` server-time synchronization (`frontend/src/utils/serverTime.ts`), live bar countdown (`PriceCountdownPrimitive`), IANA timezone switcher (`timezones.ts`), and `subscribeWithSelector`-powered per-pane orderflow/chart state in `syncStore`.
  - Added default Volume indicators on new chart panes and live candle merge/HUD performance optimizations with dedicated unit and stress tests.

### Security & Reliability
- **Credential & Host Protection:** Enforced fail-closed HTTP/WebSocket authentication checks for non-loopback bindings (`--token` / `ORDERCRAFT_AUTH_TOKEN`), strict `Host` header validation (`isAllowedHost`), WebSocket origin checks, and restrictive file ACLs for local AES-256-GCM keyfiles (`internal/security/acl_windows.go`, `acl_other.go`).
- **SSRF & Sandbox Hardening:** Added DNS-rebinding-resistant outbound IP validation (`SafeHTTPClient` in `internal/datafeed/httpclient.go` & `internal/security/permissions.go`), response-size caps across providers, and bounded Starlark execution steps (`ORDERCRAFT_SCRIPT_MAX_STEPS`).
- **Concurrency & CI Provenance:** Hardened `StreamHub` and `DataBridgeProvider` goroutine/mutex lifecycles under `-race`, resolved potential data races, and pinned GitHub Actions workflows cleanly.

---

## [0.2.0] - 2026-11-07

### Added
- **Wickra WebAssembly Streaming Runtime:**
  - Integrated pure-Go Wazero WASM runtime executing `wickra.wasm` with O(1) streaming updates in linear memory (~34.8M updates/sec).
  - Comprehensive suite of 515 indicators across 24 indicator families, completely offloading time-series math from the browser UI thread to the Go backend.
  - Extended market datafeed models: `TickData`, `DeltaBar`, and `FootprintBar` for real-time bid/ask orderflow delta computation.
  - New transport endpoints: `GET /api/indicators/catalog` (indicator schema metadata), `POST /api/indicators/eval` (historical batch coordinate calculation), and `/ws/indicators` (live tick streaming coordinate broadcast).
- **Universal Indicator Connector & Custom Primitives:**
  - Decoupled `UniversalIndicatorConnector.ts` managing multi-series rendering on `lightweight-charts` v5.
  - Custom Canvas primitives implementing `ISeriesPrimitive<Time>`:
    - `BandFillPrimitive`: HiDPI anti-aliased semi-transparent ribbon fills between dynamic bounds (e.g., Bollinger Bands, Keltner Channels, Donchian Channels).
    - `FootprintPrimitive`: Bid/ask volume cluster footprint and POC (Point of Control) visualization with customizable color gradients.
  - Support for multi-output indicators rendering combinations of lines, histograms, bands, and signal markers.
- **Virtualized Indicators Modal & Dynamic Settings:**
  - Upgraded `IndicatorsModal.tsx` featuring 8 category tabs, instant fuzzy filtering, category badges, and smooth virtualization for 500+ items.
  - Upgraded `IndicatorSettingsModal.tsx` dynamically rendering configuration inputs (integers, decimals, dropdowns, sources, colors, and line widths) directly driven by backend indicator schemas.
- **Monaco OrderScript Bottom Drawer & Hermetic Sandbox:**
  - Integrated docked bottom drawer hosting Monaco Editor with syntax highlighting, auto-completion, and live error diagnostics for custom Python-syntax OrderScript indicators.
  - Pure-Go hermetic execution sandbox using Google Starlark-Go with builtins for technical analysis (`ta.*`), execution context (`ctx.*`), and plot definitions (`plot.line`, `plot.histogram`, `plot.band`).
  - Capability-gated security validator restricting access to external networks (`ctx.http`) or IPC (`ctx.ipc`) with explicit permission enforcement.
  - Local SQLite persistence for custom user indicator scripts in `user_indicators` table.

### Changed
- **Legacy Indicator Deprecation & Migration:**
  - Completely deprecated and removed legacy client-side indicator calculation engine (`frontend/src/indicators/calculator.ts`).
  - Replaced static 19-indicator union with dynamic string identifiers and asynchronous backend catalog querying in `frontend/src/indicators/registry.ts`.
  - Added deterministic migration mapping in `frontend/src/store/syncStore.ts` automatically migrating legacy saved chart indicators to their corresponding `wickra.*` equivalents without layout loss.

---

## [0.1.2] - 2026-11-06

### Added
- **Chart Watermark Customization:**
  - Integrated native `createTextWatermark` into Chart Settings under the Canvas tab.
  - Multi-option watermark display supporting Ticker, Interval, or both.
  - Full color and opacity customization with live reactivity.
- **Dynamic Versioning & Update Checker:**
  - Automated compile-time version injection from `package.json` (`__APP_VERSION__`).
  - Added backend version endpoint `/api/version` and health check version metadata.
  - Non-blocking startup check against GitHub latest release API with 1-hour cache.
  - Status indicator and manual check button in the Help & Shortcuts drawer, with 'NEW' notification badge.

---

## [0.1.1] - 2026-11-04

### Security & Fixes
- Added AES-256-GCM encryption for stored API keys in SQLite.
- Local loopback network binding hardening.
- Provider fallback stubs and validation improvements.

---

## [0.1.0] - 2026-11-01

### Added
- **Core Charting & Time-Series Engine:**
  - Hardware-accelerated Canvas rendering via `lightweight-charts` v5 (Apache-2.0).
  - High-precision time and price coordinate transformations with crosshair HUD.
  - Granular interval support: `1s`, `1m`, `5m`, `15m`, `30m`, `1h`, `4h`, `1D`, `1W`, `1M`.
  - Bar style transformers: Regular Candlesticks, Line, Hollow Candles, and Volume overlay.
- **Multi-Chart Workspaces & Layout Persistence:**
  - Dynamic multi-pane grid docking (1x1, 2-split, 3-split, 4-grid).
  - Cross-chart state synchronization: synchronized crosshair timestamps, linked symbol changes, and synced visible time ranges.
  - Full workspace persistence in local SQLite (`layouts`, `chart_templates`, `drawings`).
- **Market Data Feeds & Real-Time Aggregator:**
  - Zero-config public feeds: **Binance Spot & Futures**, **Bybit v5**, and **Coinbase Advanced**.
  - BYOK broker integrations: **Alpaca Markets** (US Equities & Crypto) and **OANDA v20** (Forex & CFDs).
  - High-frequency local tick-to-bar aggregator for sub-minute timeframes.
- **Coordinate-Invariant Drawing Tools Suite:**
  - Drawing persistence in logical `(time, price)` coordinates to prevent zoom/pan drift.
  - Interactive tools: Trendline, Ray, Horizontal Line, Horizontal Ray, Vertical Line, Cross Line, Parallel Channel, Rectangle, and Circle.
  - Advanced tools: Fibonacci Retracement, Trend-Based Fibonacci Extension, Long/Short Position Tool with real-time Risk/Reward ratios.
  - Pro Volume Profile: **Fixed Range Volume Profile (FRVP)** with Point of Control (POC), 70% Value Area (VAH/VAL), and continuous live bar extension.
  - **Anchored VWAP** with standard deviation bands and interactive anchor placement.
  - Magnet Mode snapping to candle Open, High, Low, and Close prices.
  - Drawing quick toolbar for styling, color picking, layer locking, and deletion.
  - Drawing template save, load, and deletion management.
- **Technical Indicators Suite:**
  - Shipped overlays: SMA, EMA, WMA, HMA, VWAP, Bollinger Bands, Keltner Channels, SuperTrend, Parabolic SAR.
  - Shipped oscillators: RSI, MACD (with 4-color momentum), Stochastic Oscillator, Stochastic RSI, ATR, CCI, Williams %R, ADX/DMI, OBV.
  - Parameter customization modal (Inputs, Styles, Plots) and quick HUD toggles.
- **Standalone Binary & PWA Deployment:**
  - Single-binary execution with embedded React frontend bundle (`//go:embed`).
  - Command line flags: `--port`, `--host`, `--no-browser`, `--app-mode`, `--db`.
  - PWA manifest configuration for standalone desktop/mobile installation.
  - Local-first architecture with zero external telemetry.

