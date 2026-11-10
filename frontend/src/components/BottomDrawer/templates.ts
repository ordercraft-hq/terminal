export interface OrderScriptTemplate {
  id: string;
  name: string;
  description: string;
  code: string;
}

export const ORDERSCRIPT_TEMPLATES: OrderScriptTemplate[] = [
  {
    id: 'hma_ema_cvd',
    name: 'Fast HMA + Slow EMA + CVD Delta',
    description: 'Hull moving average cross with exponential moving average and orderflow volume delta',
    code: `# Fast HMA + Slow EMA + CVD Delta
def main(ctx):
    # 1. Moving average trend signals
    fast = ta.hma(ctx.close, 14)
    slow = ta.ema(ctx.close, 50)

    # 2. Market microstructure orderflow delta
    delta = ctx.orderflow.delta
    cvd = ctx.orderflow.cum_delta

    return [
        plot.line(fast, color="#2962FF", title="Fast HMA 14"),
        plot.line(slow, color="#FF9800", title="Slow EMA 50"),
        plot.histogram(delta, color="#089981", color_down="#F23645", title="Volume Delta"),
        plot.line(cvd, color="#FFD700", title="CVD", overlay=False)
    ]
`,
  },
  {
    id: 'bollinger_bands',
    name: 'Bollinger Bands & Mean Reversion',
    description: 'Dynamic volatility bands with semi-transparent channel fill',
    code: `# Bollinger Bands
def main(ctx):
    bb = ta.bollinger(ctx.close, 20, 2.0)

    return [
        plot.band(bb.upper, bb.lower, fill_color="rgba(41, 98, 255, 0.15)", title="Bollinger Band"),
        plot.line(bb.middle, color="#787B86", title="Basis", line_style="dashed"),
        plot.line(bb.upper, color="#2962FF", title="Upper"),
        plot.line(bb.lower, color="#2962FF", title="Lower")
    ]
`,
  },
  {
    id: 'macd_oscillator',
    name: 'MACD Momentum Oscillator',
    description: 'Standard MACD (12, 26, 9) with subpane histogram',
    code: `# MACD (12, 26, 9)
def main(ctx):
    macd = ta.macd(ctx.close, 12, 26, 9)

    return [
        plot.line(macd.macd, color="#2962FF", title="MACD", overlay=False),
        plot.line(macd.signal, color="#FF9800", title="Signal", overlay=False),
        plot.histogram(macd.histogram, color="#089981", color_down="#F23645", title="Histogram", overlay=False)
    ]
`,
  },
  {
    id: 'rsi_divergence',
    name: 'RSI Momentum & Extremes',
    description: 'Relative Strength Index (14) for identifying overbought/oversold momentum',
    code: `# Relative Strength Index
def main(ctx):
    rsi = ta.rsi(ctx.close, 14)

    return [
        plot.line(rsi, color="#9C27B0", title="RSI 14", overlay=False)
    ]
`,
  },
  {
    id: 'orderflow_imbalance',
    name: 'Orderflow Microstructure Delta',
    description: 'Intra-bar bid/ask volume imbalance and cumulative volume delta',
    code: `# Orderflow Microstructure
def main(ctx):
    delta = ctx.orderflow.delta
    cvd = ctx.orderflow.cum_delta

    return [
        plot.histogram(delta, color="#089981", color_down="#F23645", title="Bar Delta", overlay=False),
        plot.line(cvd, color="#2962FF", title="Cumulative Delta", overlay=False)
    ]
`,
  },
];

export const DEFAULT_SCRIPT_TEMPLATE = ORDERSCRIPT_TEMPLATES[0].code;
