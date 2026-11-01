# Interactive Brokers (TWS / Gateway) Setup Guide

This guide walks you through configuring **Interactive Brokers** Trader Workstation (TWS) or IB Gateway direct market access in **ORDERCRAFT**.

---

## Prerequisites

1. An active Interactive Brokers account (Paper or Live).
2. Trader Workstation (TWS) or IB Gateway installed and running locally.
3. In TWS / Gateway settings:
   - Go to **File** -> **Global Configuration** -> **API** -> **Settings**.
   - Check **Enable ActiveX and Socket Clients**.
   - Note the **Socket port** (default `7497` for TWS Paper, `7496` for TWS Live, `4002` for Gateway Paper, `4001` for Gateway Live).
   - Ensure `127.0.0.1` is in the **Trusted IP Addresses** list.

---

## Configuring in ORDERCRAFT

1. Open the **Data Providers & Feeds** panel from the right dock rail.
2. Under **Supported Integrations**, click **Configure** next to **Interactive Brokers (TWS)**.
3. Fill in:
   - **Account ID**: Your IBKR Account ID (e.g. `DU123456` or `U1234567`)
   - **API Key / Gateway Port**: `127.0.0.1:7497` (or socket port)
   - **Client ID / Secret**: `1` (or your client ID)
4. Click **Save Credential**.

