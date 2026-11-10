import React, { useRef, useEffect } from 'react';
import Editor, { type OnMount, type Monaco } from '@monaco-editor/react';

interface MonacoEditorPaneProps {
  code: string;
  onChange: (value: string) => void;
  onRun?: () => void;
  error?: string | null;
}

type EditorInstance = Parameters<OnMount>[0];
type CompletionProvider = Parameters<Monaco['languages']['registerCompletionItemProvider']>[1];
type ProvideCompletionItems = NonNullable<CompletionProvider['provideCompletionItems']>;
type ITextModel = Parameters<ProvideCompletionItems>[0];
type IPosition = Parameters<ProvideCompletionItems>[1];
type ICompletionItem = NonNullable<Awaited<ReturnType<ProvideCompletionItems>>>['suggestions'][number];

export const MonacoEditorPane: React.FC<MonacoEditorPaneProps> = ({
  code,
  onChange,
  onRun,
  error,
}) => {
  const editorRef = useRef<EditorInstance | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Define OrderCraft dark theme
    monaco.editor.defineTheme('ordercraft-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '787B86', fontStyle: 'italic' },
        { token: 'keyword', foreground: '2962FF', fontStyle: 'bold' },
        { token: 'string', foreground: '089981' },
        { token: 'number', foreground: 'FF9800' },
        { token: 'identifier', foreground: 'D1D4DC' },
        { token: 'delimiter', foreground: '787B86' },
      ],
      colors: {
        'editor.background': '#131722',
        'editor.foreground': '#D1D4DC',
        'editor.lineHighlightBackground': '#1E222D',
        'editor.selectionBackground': '#2962FF44',
        'editorCursor.foreground': '#2962FF',
        'editorLineNumber.foreground': '#434651',
        'editorLineNumber.activeForeground': '#D1D4DC',
        'editorIndentGuide.background': '#2A2E39',
        'editorIndentGuide.activeBackground': '#363A45',
        'editorWidget.background': '#1E222D',
        'editorWidget.border': '#2A2E39',
      },
    });

    monaco.editor.setTheme('ordercraft-dark');

    // Register OrderScript autocompletion provider for Python language
    monaco.languages.registerCompletionItemProvider('python', {
      triggerCharacters: ['.', '('],
      provideCompletionItems: (model: ITextModel, position: IPosition) => {
        const lineContent = model.getLineContent(position.lineNumber);
        const textUntilPosition = lineContent.substring(0, position.column - 1);

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const suggestions: ICompletionItem[] = [];

        // 1. ta.* suggestions
        if (/\bta\.\w*$/.test(textUntilPosition)) {
          const taItems = [
            {
              label: 'sma',
              insertText: 'sma(${1:ctx.close}, ${2:14})',
              detail: 'Simple Moving Average',
              documentation: 'Calculates the arithmetic moving average over a specified period.',
            },
            {
              label: 'ema',
              insertText: 'ema(${1:ctx.close}, ${2:20})',
              detail: 'Exponential Moving Average',
              documentation: 'Calculates the exponential moving average with alpha = 2 / (period + 1).',
            },
            {
              label: 'hma',
              insertText: 'hma(${1:ctx.close}, ${2:14})',
              detail: 'Hull Moving Average',
              documentation: 'Calculates the responsive Hull Moving Average using weighted moving averages.',
            },
            {
              label: 'wma',
              insertText: 'wma(${1:ctx.close}, ${2:14})',
              detail: 'Weighted Moving Average',
              documentation: 'Calculates linearly weighted moving average.',
            },
            {
              label: 'rma',
              insertText: 'rma(${1:ctx.close}, ${2:14})',
              detail: "Running / Wilder's MA",
              documentation: 'Exponential moving average with alpha = 1 / period.',
            },
            {
              label: 'rsi',
              insertText: 'rsi(${1:ctx.close}, ${2:14})',
              detail: 'Relative Strength Index',
              documentation: 'Measures momentum and overbought/oversold levels on a scale of 0-100.',
            },
            {
              label: 'macd',
              insertText: 'macd(${1:ctx.close}, ${2:12}, ${3:26}, ${4:9})',
              detail: 'Moving Average Convergence Divergence',
              documentation: 'Returns struct with macd, signal, and histogram vectors.',
            },
            {
              label: 'atr',
              insertText: 'atr(${1:14})',
              detail: 'Average True Range',
              documentation: 'Measures market volatility based on the true range.',
            },
            {
              label: 'bollinger',
              insertText: 'bollinger(${1:ctx.close}, ${2:20}, ${3:2.0})',
              detail: 'Bollinger Bands',
              documentation: 'Returns upper, middle, and lower bands based on standard deviation.',
            },
            {
              label: 'stoch',
              insertText: 'stoch(${1:ctx.high}, ${2:ctx.low}, ${3:ctx.close}, ${4:14}, ${5:3}, ${6:3})',
              detail: 'Stochastic Oscillator',
              documentation: 'Returns %K and %D lines.',
            },
            {
              label: 'cumsum',
              insertText: 'cumsum(${1:series})',
              detail: 'Cumulative Sum',
              documentation: 'Returns running cumulative total across all bars.',
            },
            {
              label: 'diff',
              insertText: 'diff(${1:series})',
              detail: 'First Difference',
              documentation: 'Returns bar-over-bar difference (series[i] - series[i-1]).',
            },
            {
              label: 'change',
              insertText: 'change(${1:series}, ${2:1})',
              detail: 'Change over N bars',
              documentation: 'Returns series[i] - series[i-length].',
            },
            {
              label: 'highest',
              insertText: 'highest(${1:series}, ${2:14})',
              detail: 'Highest High in Period',
              documentation: 'Returns highest value over the past N periods.',
            },
            {
              label: 'lowest',
              insertText: 'lowest(${1:series}, ${2:14})',
              detail: 'Lowest Low in Period',
              documentation: 'Returns lowest value over the past N periods.',
            },
            {
              label: 'crossover',
              insertText: 'crossover(${1:a}, ${2:b})',
              detail: 'Crossover Signal',
              documentation: 'Returns 1.0 where a crosses above b, 0.0 otherwise.',
            },
            {
              label: 'crossunder',
              insertText: 'crossunder(${1:a}, ${2:b})',
              detail: 'Crossunder Signal',
              documentation: 'Returns 1.0 where a crosses below b, 0.0 otherwise.',
            },
            {
              label: 'call',
              insertText: 'call("${1:wickra.supertrend}", {"${2:period}": ${3:10}})',
              detail: 'Catalog Bridge Call',
              documentation: 'Invokes any of the 500+ pre-compiled catalog algorithms.',
            },
          ];

          for (const item of taItems) {
            suggestions.push({
              label: item.label,
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: item.insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: item.detail,
              documentation: item.documentation,
              range,
            });
          }
          return { suggestions };
        }

        // 2. ctx.orderflow.* suggestions
        if (/\bctx\.orderflow\.\w*$/.test(textUntilPosition)) {
          const ofItems = [
            { label: 'delta', detail: 'Per-bar net bid/ask aggressor volume' },
            { label: 'cum_delta', detail: 'Cumulative volume delta (CVD) running total' },
            { label: 'bid_volume', detail: 'Aggressor sell volume hitting the bid' },
            { label: 'ask_volume', detail: 'Aggressor buy volume lifting the ask' },
          ];
          for (const it of ofItems) {
            suggestions.push({
              label: it.label,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: it.label,
              detail: it.detail,
              range,
            });
          }
          return { suggestions };
        }

        // 3. ctx.* suggestions
        if (/\bctx\.\w*$/.test(textUntilPosition)) {
          const ctxItems = [
            { label: 'open', detail: 'Open price vector []float' },
            { label: 'high', detail: 'High price vector []float' },
            { label: 'low', detail: 'Low price vector []float' },
            { label: 'close', detail: 'Close price vector []float' },
            { label: 'volume', detail: 'Volume vector []float' },
            { label: 'time', detail: 'Unix timestamps []int64' },
            { label: 'orderflow', detail: 'Orderflow microstructure context' },
            { label: 'symbol', detail: 'Current chart symbol string' },
            { label: 'resolution', detail: 'Current chart resolution string' },
            { label: 'http', detail: 'Capability-gated HTTP proxy client' },
            { label: 'ipc', detail: 'Capability-gated local IPC client' },
          ];
          for (const it of ctxItems) {
            suggestions.push({
              label: it.label,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: it.label,
              detail: it.detail,
              range,
            });
          }
          return { suggestions };
        }

        // 4. plot.* suggestions
        if (/\bplot\.\w*$/.test(textUntilPosition)) {
          const plotItems = [
            {
              label: 'line',
              insertText: 'line(${1:series}, color="${2:#2962FF}", title="${3:Line}")',
              detail: 'Plot Line Series',
            },
            {
              label: 'histogram',
              insertText: 'histogram(${1:series}, color="${2:#089981}", color_down="${3:#F23645}", title="${4:Histogram}")',
              detail: 'Plot Histogram Series',
            },
            {
              label: 'band',
              insertText: 'band(${1:upper}, ${2:lower}, fill_color="${3:rgba(41, 98, 255, 0.2)}", title="${4:Band}")',
              detail: 'Plot Shaded Band Fill',
            },
            {
              label: 'signal',
              insertText: 'signal(${1:series}, title="${2:Signal}", shape="${3:triangle_up}", color="${4:#089981}", text="${5:BUY}")',
              detail: 'Plot Signal Marker',
            },
            {
              label: 'stepline',
              insertText: 'stepline(${1:series}, color="${2:#2962FF}", title="${3:StepLine}")',
              detail: 'Plot Step Line Series',
            },
            {
              label: 'circles',
              insertText: 'circles(${1:series}, color="${2:#2962FF}", title="${3:Circles}")',
              detail: 'Plot Circles Points Series',
            },
          ];
          for (const it of plotItems) {
            suggestions.push({
              label: it.label,
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: it.insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              detail: it.detail,
              range,
            });
          }
          return { suggestions };
        }

        return { suggestions: [] };
      },
    });

    // Add Ctrl+Enter shortcut to Run script
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onRun?.();
    });
  };

  // Update error squiggle markers when error changes
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) return;
    const monaco = monacoRef.current;
    const model = editorRef.current.getModel();
    if (!model) return;

    if (!error) {
      monaco.editor.setModelMarkers(model, 'orderscript', []);
      return;
    }

    const lineMatch = error.match(/[:\s](\d+):(\d+):/);
    if (lineMatch) {
      const line = parseInt(lineMatch[1], 10);
      const col = parseInt(lineMatch[2], 10) || 1;
      monaco.editor.setModelMarkers(model, 'orderscript', [
        {
          startLineNumber: line,
          startColumn: col,
          endLineNumber: line,
          endColumn: model.getLineMaxColumn(line),
          message: error,
          severity: monaco.MarkerSeverity.Error,
        },
      ]);
    } else {
      monaco.editor.setModelMarkers(model, 'orderscript', [
        {
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: 1,
          endColumn: model.getLineMaxColumn(1),
          message: error,
          severity: monaco.MarkerSeverity.Error,
        },
      ]);
    }
  }, [error]);

  return (
    <div className="w-full h-full">
      <Editor
        height="100%"
        defaultLanguage="python"
        theme="ordercraft-dark"
        value={code}
        onChange={(val) => onChange(val || '')}
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
          insertSpaces: true,
          renderLineHighlight: 'all',
          padding: { top: 8, bottom: 8 },
          suggestOnTriggerCharacters: true,
          wordWrap: 'on',
        }}
      />
    </div>
  );
};
