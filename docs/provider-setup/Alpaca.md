# Alpaca Markets Provider Setup Guide

This guide walks you through setting up real-time US Equities, ETFs, and Crypto market data in **ORDERCRAFT** using the official **Alpaca Markets API**.

---

## Why Alpaca?

Alpaca is a modern developer-first broker that provides:
- **US Equities & ETFs**: Real-time tick and minute bars for over 10,000+ US stocks (`AAPL`, `TSLA`, `NVDA`, `SPY`, `QQQ`, `MSFT`, `AMD`).
- **Free Real-Time IEX Feed**: Free instant market data directly from the Investors Exchange (IEX).
- **Consolidated SIP Feed**: Optional Level-1 full consolidated feed from all US stock exchanges (CTA/UTP).
- **24/7 Crypto Markets**: Spot cryptocurrency pricing for `BTC/USD`, `ETH/USD`, `SOL/USD`, and more.

---

## Prerequisites (100% Free Paper Account)

Alpaca provides instant, free **Paper Trading** accounts that require no funding:

1. Sign up for a free account at [Alpaca Markets](https://app.alpaca.markets/signup).
2. Complete your email verification.
3. Log in to the [Alpaca Dashboard](https://app.alpaca.markets/).

---

## Step 1: Generate Your API Keys

1. In the top navigation bar of the Alpaca Dashboard, switch the environment selector to **Paper Trading** (recommended for testing and free data).
2. On the right-hand overview panel, find the section titled **API Keys** (or **Your API Keys**).
3. Click **Generate New Key** (or **View Keys** if you already generated one).
4. A popup will display:
   - **API Key ID**: Starts with `PK...` for Paper Trading (or `AK...` for Live). Example: `PKTESTSAMPLE1234567890ABCDEF`.
   - **Secret Key**: A 40-character secret token. Example: `sample_mock_secret_key_0123456789abcdef01`.
5. **Copy both keys immediately** and save them in a secure place.

> [!WARNING]
> Alpaca only displays the **Secret Key** once. If you close the window without copying it, you must generate a new key pair.

---

## Step 2: Configure ORDERCRAFT

You can configure Alpaca in ORDERCRAFT through either the interactive UI or via your `.env` file:

### Method A: Via the ORDERCRAFT User Interface (Recommended)

1. Launch ORDERCRAFT and open the **Data Providers & Feeds** panel from the right dock rail (click the `Radio` / antenna icon).
2. Scroll to the **Supported Integrations** section.
3. Click the **Configure** button on the **Alpaca Markets** card.
4. Fill in the three fields:
   - **Account ID**: (Optional) Enter your Alpaca Account Number (e.g. `PA...` or leave as default).
   - **API Key / Token**: Enter your Alpaca **API Key ID** (`PK...`).
   - **Secret**: Enter your Alpaca **Secret Key**.
5. Click **Save Credential**.
6. The Alpaca card will immediately move to the **Connected Feeds** section with a green operational badge!

### Method B: Via the `.env` Configuration File

Open or create `.env` in the root of your `ordercraft` folder and set:

```env
# Alpaca Markets Credentials
ALPACA_API_KEY=PK...your_api_key_id_here
ALPACA_API_SECRET=your_secret_key_here
ALPACA_BASE_URL=https://paper-api.alpaca.markets/v2
ALPACA_DATA_URL=https://data.alpaca.markets/v2
ALPACA_STREAM_URL=wss://stream.data.alpaca.markets/v2/iex
ALPACA_FEED=iex
```

Restart the ORDERCRAFT backend:
```bash
./ordercraft.exe
```

---

## Step 3: Verify Live Charting & Feeds

Once connected, search for any US equity or crypto asset in the chart symbol search bar (`Ctrl + K`):

- `ALPACA:AAPL` — Apple Inc.
- `ALPACA:TSLA` — Tesla Inc.
- `ALPACA:NVDA` — NVIDIA Corp.
- `ALPACA:SPY` — SPDR S&P 500 ETF Trust
- `ALPACA:QQQ` — Invesco QQQ Trust
- `ALPACA:BTC/USD` — Bitcoin / US Dollar
- `ALPACA:ETH/USD` — Ethereum / US Dollar

---

## Troubleshooting

- **HTTP 401 Unauthorized / Invalid Key**: Ensure you are using Paper keys with the `paper-api.alpaca.markets` endpoint, or Live keys with `api.alpaca.markets`.
- **Feed Parameter**: The free tier requires `ALPACA_FEED=iex`. Setting `feed=sip` requires an active paid Alpaca market data subscription.
- **US Stock Market Hours**: US stock exchanges trade Monday through Friday, 9:30 AM to 4:00 PM EST (with extended pre-market and after-hours). Live streaming ticks for equities will update during market hours.

