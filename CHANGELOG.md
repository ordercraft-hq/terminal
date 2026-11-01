# Changelog

All notable changes to **OrderCraft** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

