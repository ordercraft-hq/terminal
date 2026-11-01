# ORDERCRAFT — Standard Shipped Indicators Specification

> **Technical Engineering Specification**  
> Permissive License: Apache-2.0 / MIT  
> Module: `frontend/src/indicators/` & `internal/indicators/`

---

## 1. Overview & Unified Indicator Protocol

All technical indicators in ORDERCRAFT adhere to the **Unified Indicator Protocol**.
An indicator consumes a time series of OHLCV bars:
- `time`: Unix timestamp in seconds (UTC)
- `open`: Floating-point opening price
- `high`: Floating-point highest price
- `low`: Floating-point lowest price
- `close`: Floating-point closing price
- `volume`: Floating-point traded volume

And emits one or more named plot series, reference levels, and optional shaded bands.

### 1.1 Category Classification
1. **Overlay Indicators:** Placed directly on the primary price chart (Pane 0). They share the price coordinate scale of the underlying asset.
2. **Sub-Pane Indicators (Oscillators):** Placed in a separate, vertically stacked chart pane (`paneIndex >= 1`) with an independent value scale (e.g. 0–100 for RSI/Stochastic, unbounded centered around 0 for MACD/CCI).

---

## 2. Standard Shipped Indicators Catalogue

### 2.1 Simple Moving Average (SMA)
- **Type:** Overlay
- **Formula:**
  $$\text{SMA}_t = \frac{1}{N} \sum_{i=0}^{N-1} \text{Price}_{t-i}$$
- **Default Inputs:** `length = 20`, `source = 'close'`
- **Warmup Period:** $N - 1$ bars
- **Plots:**
  - `plot`: Line, Color `#2962FF`, Width 2, Style Solid

### 2.2 Exponential Moving Average (EMA)
- **Type:** Overlay
- **Formula:**
  $$\alpha = \frac{2}{N + 1}$$
  $$\text{EMA}_t = \alpha \cdot \text{Price}_t + (1 - \alpha) \cdot \text{EMA}_{t-1}$$
- **Default Inputs:** `length = 20`, `source = 'close'`
- **Warmup Period:** $N$ bars
- **Plots:**
  - `plot`: Line, Color `#FF9800`, Width 2, Style Solid

### 2.3 Weighted Moving Average (WMA)
- **Type:** Overlay
- **Formula:**
  $$\text{WMA}_t = \frac{\sum_{i=0}^{N-1} (N - i) \cdot \text{Price}_{t-i}}{\frac{N(N+1)}{2}}$$
- **Default Inputs:** `length = 20`, `source = 'close'`
- **Warmup Period:** $N - 1$ bars
- **Plots:**
  - `plot`: Line, Color `#9C27B0`, Width 2, Style Solid

### 2.4 Hull Moving Average (HMA)
- **Type:** Overlay
- **Formula:**
  $$\text{HMA}_t = \text{WMA}\left(2 \cdot \text{WMA}_{N/2} - \text{WMA}_N, \; \lfloor\sqrt{N}\rfloor\right)$$
- **Default Inputs:** `length = 20`, `source = 'close'`
- **Warmup Period:** $N + \lfloor\sqrt{N}\rfloor$ bars
- **Plots:**
  - `plot`: Line, Color `#00BCD4`, Width 2, Style Solid

### 2.5 Volume Weighted Average Price (VWAP)
- **Type:** Overlay
- **Formula:**
  $$\text{Typical Price}_t = \frac{\text{High}_t + \text{Low}_t + \text{Close}_t}{3}$$
  $$\text{VWAP}_t = \frac{\sum (\text{Typical Price}_i \cdot \text{Volume}_i)}{\sum \text{Volume}_i}$$
- **Default Inputs:** `anchor = 'session'`
- **Plots:**
  - `plot`: Line, Color `#E91E63`, Width 2, Style Solid

### 2.6 Bollinger Bands (BB)
- **Type:** Overlay
- **Formula:**
  $$\text{Basis}_t = \text{SMA}_N(\text{Price})$$
  $$\sigma_t = \sqrt{\frac{1}{N} \sum_{i=0}^{N-1} (\text{Price}_{t-i} - \text{Basis}_t)^2}$$
  $$\text{Upper}_t = \text{Basis}_t + K \cdot \sigma_t$$
  $$\text{Lower}_t = \text{Basis}_t - K \cdot \sigma_t$$
- **Default Inputs:** `length = 20`, `multiplier = 2.0`, `source = 'close'`
- **Warmup Period:** $N - 1$ bars
- **Plots:**
  - `upper`: Line, Color `#2962FF`, Width 1, Style Solid
  - `basis`: Line, Color `#FF6D00`, Width 1, Style Solid
  - `lower`: Line, Color `#2962FF`, Width 1, Style Solid
- **Bands:**
  - Fill between `upper` and `lower`: Color `rgba(41, 98, 255, 0.08)`

### 2.7 Keltner Channels (KC)
- **Type:** Overlay
- **Formula:**
  $$\text{Basis}_t = \text{EMA}_{\text{emaLength}}(\text{Price})$$
  $$\text{TR}_t = \max(\text{High}_t - \text{Low}_t, \; |\text{High}_t - \text{Close}_{t-1}|, \; |\text{Low}_t - \text{Close}_{t-1}|)$$
  $$\text{ATR}_t = \text{EMA}_{\text{atrLength}}(\text{TR})$$
  $$\text{Upper}_t = \text{Basis}_t + M \cdot \text{ATR}_t$$
  $$\text{Lower}_t = \text{Basis}_t - M \cdot \text{ATR}_t$$
- **Default Inputs:** `emaLength = 20`, `atrLength = 10`, `multiplier = 2.0`, `source = 'close'`
- **Warmup Period:** $\max(\text{emaLength}, \text{atrLength})$
- **Plots:**
  - `upper`: Line, Color `#00897B`, Width 1, Style Solid
  - `basis`: Line, Color `#26A69A`, Width 1, Style Solid
  - `lower`: Line, Color `#00897B`, Width 1, Style Solid
- **Bands:**
  - Fill between `upper` and `lower`: Color `rgba(0, 137, 123, 0.08)`

### 2.8 SuperTrend
- **Type:** Overlay
- **Formula:**
  $$\text{Basic Upper} = \frac{\text{High} + \text{Low}}{2} + M \cdot \text{ATR}_N$$
  $$\text{Basic Lower} = \frac{\text{High} + \text{Low}}{2} - M \cdot \text{ATR}_N$$
  Calculated with directional flip logic:
  - If Close crosses above previous Final Upper: Direction becomes Bullish (+1), SuperTrend line traces Final Lower.
  - If Close crosses below previous Final Lower: Direction becomes Bearish (-1), SuperTrend line traces Final Upper.
- **Default Inputs:** `atrPeriod = 10`, `multiplier = 3.0`
- **Plots:**
  - `trend`: Line, Width 2, Dynamic Color (`#089981` bullish, `#F23645` bearish)

### 2.9 Parabolic SAR (PSAR)
- **Type:** Overlay
- **Formula:**
  $$\text{SAR}_{t+1} = \text{SAR}_t + \alpha \cdot (\text{EP} - \text{SAR}_t)$$
  $$\alpha_{t+1} = \min(\alpha_t + \text{step}, \; \text{maximum})$$
- **Default Inputs:** `start = 0.02`, `increment = 0.02`, `maximum = 0.20`
- **Plots:**
  - `sar`: Circles / Cross Markers, Color `#2196F3`, Size 3

### 2.10 Relative Strength Index (RSI)
- **Type:** Sub-Pane
- **Formula:**
  $$\Delta_t = \text{Price}_t - \text{Price}_{t-1}$$
  $$U_t = \max(\Delta_t, 0), \quad D_t = \max(-\Delta_t, 0)$$
  $$\text{AvgU}_t = \text{WilderSmooth}_N(U), \quad \text{AvgD}_t = \text{WilderSmooth}_N(D)$$
  $$\text{RS}_t = \frac{\text{AvgU}_t}{\text{AvgD}_t}$$
  $$\text{RSI}_t = 100 - \frac{100}{1 + \text{RS}_t}$$
- **Default Inputs:** `length = 14`, `source = 'close'`
- **Warmup Period:** $N$ bars
- **Scale Range:** 0 to 100
- **Levels:**
  - `70`: Upper Band, Color `#787B86`, Style Dashed
  - `50`: Middle Line, Color `#434651`, Style Dotted
  - `30`: Lower Band, Color `#787B86`, Style Dashed
- **Plots:**
  - `rsi`: Line, Color `#7E57C2`, Width 2, Style Solid
- **Bands:**
  - Fill between level 30 and 70: Color `rgba(126, 87, 194, 0.08)`

### 2.11 Moving Average Convergence Divergence (MACD)
- **Type:** Sub-Pane
- **Formula:**
  $$\text{MACD Line}_t = \text{EMA}_{\text{fast}}(\text{Price}) - \text{EMA}_{\text{slow}}(\text{Price})$$
  $$\text{Signal Line}_t = \text{EMA}_{\text{signal}}(\text{MACD Line})$$
  $$\text{Histogram}_t = \text{MACD Line}_t - \text{Signal Line}_t$$
- **Default Inputs:** `fastLength = 12`, `slowLength = 26`, `signalLength = 9`, `source = 'close'`
- **Warmup Period:** $\text{slowLength} + \text{signalLength}$ bars
- **Levels:**
  - `0`: Zero Line, Color `#434651`, Style Solid
- **Plots:**
  - `macd`: Line, Color `#2962FF`, Width 1.5, Style Solid
  - `signal`: Line, Color `#FF6D00`, Width 1.5, Style Solid
  - `hist`: Histogram, Width 2, Dynamic Colors:
    - Positive & Rising: `#089981`
    - Positive & Falling: `#26A69A`
    - Negative & Falling: `#F23645`
    - Negative & Rising: `#EF5350`

### 2.12 Stochastic Oscillator (Stoch)
- **Type:** Sub-Pane
- **Formula:**
  $$\%K = \frac{\text{Close} - \text{LowestLow}_N}{\text{HighestHigh}_N - \text{LowestLow}_N} \cdot 100$$
  $$\%D = \text{SMA}_M(\%K)$$
- **Default Inputs:** `kLength = 14`, `kSmoothing = 1`, `dSmoothing = 3`
- **Levels:** `80` (Overbought), `20` (Oversold)
- **Plots:**
  - `k`: Line, Color `#2962FF`, Width 1.5, Style Solid
  - `d`: Line, Color `#FF6D00`, Width 1.5, Style Solid

### 2.13 Stochastic RSI (Stoch RSI)
- **Type:** Sub-Pane
- **Formula:**
  $$\text{StochRSI} = \frac{\text{RSI} - \text{LowestRSI}_M}{\text{HighestRSI}_M - \text{LowestRSI}_M} \cdot 100$$
  $$\%K = \text{SMA}_{K}(\text{StochRSI}), \quad \%D = \text{SMA}_{D}(\%K)$$
- **Default Inputs:** `rsiLength = 14`, `stochLength = 14`, `k = 3`, `d = 3`, `source = 'close'`
- **Levels:** `80`, `20`
- **Plots:**
  - `k`: Line, Color `#2962FF`, Width 1.5
  - `d`: Line, Color `#FF6D00`, Width 1.5

### 2.14 Average True Range (ATR)
- **Type:** Sub-Pane
- **Formula:**
  $$\text{TR}_t = \max(\text{High}_t - \text{Low}_t, \; |\text{High}_t - \text{Close}_{t-1}|, \; |\text{Low}_t - \text{Close}_{t-1}|)$$
  $$\text{ATR}_t = \text{RMA}_N(\text{TR})$$
- **Default Inputs:** `length = 14`
- **Plots:**
  - `atr`: Line, Color `#AB47BC`, Width 2, Style Solid

### 2.15 Commodity Channel Index (CCI)
- **Type:** Sub-Pane
- **Formula:**
  $$\text{TP} = \frac{\text{High} + \text{Low} + \text{Close}}{3}$$
  $$\text{MeanDev} = \frac{1}{N} \sum_{i=0}^{N-1} |\text{TP}_{t-i} - \text{SMA}_N(\text{TP})|$$
  $$\text{CCI} = \frac{\text{TP} - \text{SMA}_N(\text{TP})}{0.015 \cdot \text{MeanDev}}$$
- **Default Inputs:** `length = 20`
- **Levels:** `+100`, `-100`
- **Plots:**
  - `cci`: Line, Color `#FF9800`, Width 1.5

### 2.16 Williams %R
- **Type:** Sub-Pane
- **Formula:**
  $$\%R = \frac{\text{HighestHigh}_N - \text{Close}}{\text{HighestHigh}_N - \text{LowestLow}_N} \cdot (-100)$$
- **Default Inputs:** `length = 14`
- **Levels:** `-20` (Overbought), `-80` (Oversold)
- **Plots:**
  - `williams`: Line, Color `#26C6DA`, Width 1.5

### 2.17 Average Directional Index (ADX)
- **Type:** Sub-Pane
- **Formula:**
  $$+\text{DM} = \text{High}_t - \text{High}_{t-1}, \quad -\text{DM} = \text{Low}_{t-1} - \text{Low}_t$$
  Smoothed with Wilder's RMA over `diLength` to compute $+\text{DI}$ and $-\text{DI}$.
  $$\text{DX} = \frac{|+\text{DI} - -\text{DI}|}{+\text{DI} + -\text{DI}} \cdot 100$$
  $$\text{ADX} = \text{RMA}_{\text{adxLength}}(\text{DX})$$
- **Default Inputs:** `adxLength = 14`, `diLength = 14`
- **Levels:** `25` (Strong Trend Level, Color `#787B86`, Style Dotted)
- **Plots:**
  - `adx`: Line, Color `#E91E63`, Width 2
  - `plusDi`: Line, Color `#089981`, Width 1
  - `minusDi`: Line, Color `#F23645`, Width 1

### 2.18 On-Balance Volume (OBV)
- **Type:** Sub-Pane
- **Formula:**
  $$\text{OBV}_t = \begin{cases} \text{OBV}_{t-1} + \text{Volume}_t & \text{if } \text{Close}_t > \text{Close}_{t-1} \\ \text{OBV}_{t-1} - \text{Volume}_t & \text{if } \text{Close}_t < \text{Close}_{t-1} \\ \text{OBV}_{t-1} & \text{if } \text{Close}_t = \text{Close}_{t-1} \end{cases}$$
- **Default Inputs:** None
- **Plots:**
  - `obv`: Line, Color `#2962FF`, Width 1.5
