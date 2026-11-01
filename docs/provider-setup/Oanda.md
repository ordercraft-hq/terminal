# OANDA v20 REST & Streaming API Setup Guide

This guide walks you through setting up institutional-grade Forex, Commodities, Global CFD, and Precious Metals market data in **ORDERCRAFT** using the official **OANDA v20 API**.

---

## Why OANDA?

OANDA provides institutional-grade market data for:
- **Major, Minor & Exotic Forex Pairs**: `EUR_USD`, `GBP_USD`, `USD_JPY`, `AUD_USD`, `EUR_GBP`, etc.
- **Precious Metals**: `XAU_USD` (Gold Spot), `XAG_USD` (Silver Spot), Platinum, Palladium.
- **Global Stock Indices (CFDs)**: `NAS100_USD` (Nasdaq 100), `SPX500_USD` (S&P 500), `US30_USD` (Dow 30), `DE30_EUR` (DAX), `UK100_GBP` (FTSE 100), `JP225_USD` (Nikkei 225).
- **Commodities & Energy**: `BCO_USD` (Brent Crude), `WTICO_USD` (WTI Crude), `NATGAS_USD` (Natural Gas).

---

## Prerequisites (100% Free Practice Account)

You **do not** need a funded or live trading account. OANDA provides free, perpetual **v20 Practice (Demo) Accounts** with unlimited real-time market data.

1. Go to [OANDA's Demo Account Registration](https://www.oanda.com/apply/demo/).
2. Fill out your name, email, and choose your account base currency (e.g. `USD`).
3. Confirm your email address. You will receive immediate login credentials for the OANDA portal.

---

## Step 1: Generate Your Personal Access Token

1. Log in to the [OANDA Account Management Portal](https://trade.oanda.com/).
2. In the navigation menu, go to **Manage API Access** (or navigate to **My Account** -> **API Access**).
3. Click the **Generate** button next to **Personal Access Token**.
4. A 64-character hexadecimal token will appear (e.g. `a1b2c3d4e5f60718293a4b5c6d7e8f90-1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d`).
5. **Copy this token** and store it securely.

> [!NOTE]
> For security, OANDA only displays the full token once when generated. If you misplace it, simply click Revoke and generate a new one.

---

## Step 2: Locate Your v20 Account ID

1. In the OANDA web portal, look at the top-left account selector or under **Account Summary**.
2. Your v20 Account ID follows the format:
   ```
   101-00X-XXXXXXXX-001
   ```
   *(For example: `101-001-1234567-001`)*
3. Copy your Account ID.

---

## Step 3: Configure ORDERCRAFT

You can configure OANDA in ORDERCRAFT through either the interactive UI or via your `.env` file:

### Method A: Via the ORDERCRAFT User Interface (Recommended)

1. Launch ORDERCRAFT and open the **Data Providers & Feeds** panel from the right dock rail (click the `Radio` / antenna icon).
2. Scroll to the **Supported Integrations** section.
3. Click the **Configure** button on the **OANDA v20 Rest & Stream** card.
4. Fill in the three fields:
   - **Account ID**: Enter your v20 Account ID (e.g. `101-001-1234567-001`).
   - **API Key / Token**: Paste your 64-character Personal Access Token.
   - **Secret / Environment**: Enter `practice` (for demo accounts) or `live` (for real funded accounts).
5. Click **Save Credential**.
6. The OANDA card will immediately activate and move to the **Connected Feeds** section with a green operational badge!

### Method B: Via the `.env` Configuration File

Open or create `.env` in the root of your `ordercraft` folder and set:

```env
# OANDA Broker Credentials
OANDA_ACCESS_TOKEN=your_64_character_token_here
OANDA_ACCOUNT_ID=101-xxx-xxxxxxx-001
OANDA_ENVIRONMENT=practice
OANDA_BASE_URL=https://api-fxpractice.oanda.com
OANDA_STREAM_URL=https://stream-fxpractice.oanda.com
```

Restart the ORDERCRAFT backend:
```bash
./ordercraft.exe
```

---

## Step 4: Verify Live Charting & Feeds

Once connected, search for any OANDA instrument in the chart symbol search bar (`Ctrl + K`):

- `OANDA:EUR_USD` — Euro / US Dollar
- `OANDA:GBP_USD` — British Pound / US Dollar
- `OANDA:USD_JPY` — US Dollar / Japanese Yen
- `OANDA:XAU_USD` — Gold Spot / USD
- `OANDA:NAS100_USD` — US Wall Street Tech 100 Index
- `OANDA:SPX500_USD` — US S&P 500 Index

---

## Troubleshooting

- **HTTP 401 Unauthorized**: Ensure your token has no leading or trailing whitespace. Verify whether your account is `practice` or `live`. Practice tokens will not authenticate against `api-fxtrade.oanda.com`.
- **HTTP 400 Invalid Account**: Confirm that the Account ID matches the token owner.
- **Market Hours**: Forex and CFDs trade 24/5 from Sunday 5:00 PM EST through Friday 5:00 PM EST. When markets are closed for the weekend, live streaming ticks pause until Sunday reopen.

