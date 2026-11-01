# ORDERCRAFT — Data Provider Setup Guides

Welcome to the data provider configuration hub for **ORDERCRAFT**.

ORDERCRAFT features a modular, pluggable market data architecture supporting direct WebSocket streams, institutional REST endpoints, and local bridging:

### 1. Zero-Configuration Public Feeds (Connected by Default)
These providers do not require credentials and connect out-of-the-box when you first launch ORDERCRAFT:
- **Binance Public Spot & Futures**: Real-time crypto order book & kline streaming.
- **Bybit v5 Public & Derivatives**: Real-time perpetuals, inverse, and spot crypto data.
- **Coinbase Advanced**: Institutional crypto spot and perpetuals data.

---

### 2. External Broker & Exchange Integrations (Require Credentials)
These integrations are located in the **Supported Integrations** section of the Data Providers panel. Click **Configure** and follow the step-by-step guides below:

- [OANDA v20 Rest & Stream Setup Guide](Oanda.md) — Institutional Forex, Precious Metals, Global CFDs & Commodities.
- [Alpaca Markets Setup Guide](Alpaca.md) — US Equities, ETFs, IEX/SIP data, and Crypto.
- [Twelve Data Setup Guide](TwelveData.md) — Multi-asset global market data API.
- [Interactive Brokers (TWS / Gateway) Setup Guide](InteractiveBrokers.md) — Direct market access via TWS socket.

