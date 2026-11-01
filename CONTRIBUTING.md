# Contributing to OrderCraft

Thank you for your interest in contributing to **OrderCraft**! We are building a high-performance, open-source financial charting workstation for traders and quantitative developers worldwide.

---

## 🛠️ Prerequisites

Before you begin, ensure you have the following installed on your machine:
- **Go 1.23+**: [https://golang.org/dl/](https://golang.org/dl/)
- **Node.js 20+ & npm**: [https://nodejs.org/](https://nodejs.org/)
- **Git**: [https://git-scm.com/](https://git-scm.com/)

---

## 💻 Local Development Setup

### 1. Clone the Repository
```bash
git clone https://github.com/ordercraft-hq/terminal.git
cd terminal
```

### 2. Run Backend in Development Mode
In your first terminal window:
```bash
# Downloads dependencies and starts the Go server on http://127.0.0.1:8448
go run main.go --port 8448 --no-browser
```

### 3. Run Frontend with Vite HMR
In your second terminal window:
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser. Vite automatically proxies `/api` and `/ws` requests to `http://127.0.0.1:8448`.

---

## 📐 Code Style & Architecture Guidelines

1. **Strict TypeScript Typing:**
   - `strict: true` in `tsconfig.json`. Zero `any` types allowed in production paths.
   - Run `npm run typecheck` before committing.
2. **Drawing Coordinate Invariance:**
   - All drawing tools must implement the `ISeriesPrimitive<Time>` interface in logical `(time, price)` coordinates. Never store transient screen pixel `(x, y)` values.
3. **Off-Thread Math Invariant:**
   - Compute heavy indicator series and aggregations in pure Go (`internal/indicators/` and `internal/datafeed/`) to ensure the frontend maintains 60–144fps smooth rendering.
4. **CGO-Free Go Compilation:**
   - Keep `CGO_ENABLED=0` compatibility across all packages so cross-compiling to Windows, Linux, and macOS works out of the box. Use `modernc.org/sqlite` for database access.

---

## 🔌 Adding a Market Data Provider

To add a new market data provider (e.g. `KRAKEN`, `HYPERLIQUID`, `POLYGON`):
1. **Implement the `DataProvider` interface** in `internal/datafeed/providers/<name>.go`:
   - `Name() string`
   - `GetHistory(ctx context.Context, symbol, resolution string, from, to int64, count int) ([]datafeed.Candle, error)`
   - `Subscribe(ctx context.Context, symbol, resolution string, onCandle func(c datafeed.Candle)) error`
   - `Search(ctx context.Context, query string) ([]datafeed.SymbolInfo, error)`
2. **Write unit and mock tests** in `internal/datafeed/providers/<name>_test.go`.
3. **Register the provider** in `internal/server/server.go` inside `NewServer()` on the `Coordinator`.
4. **Register supported intervals** in `frontend/src/utils/timeframeSupport.ts`.
5. For comprehensive instructions and sample code, see **[Provider Integration Guide](docs/provider-guide.md)**.

---

## 📈 Adding a Technical Indicator

1. **Document Mathematical Formulas:**
   - Review or append mathematical definitions and warm-up requirements in `docs/specs/indicators-spec.md`.
2. **Implement Indicator Calculations:**
   - Implement the calculation in `internal/indicators/` (or `frontend/src/indicators/calculator.ts` for lightweight client-side overlays).
3. **Write Deterministic Tests:**
   - Write table-driven numerical verification tests verifying output values within `1e-6` tolerance against reference data.
4. **Register in Indicator Catalog:**
   - Register the indicator in `frontend/src/indicators/registry.ts` with default inputs, plot styles, and category metadata.

---

## 🚀 Submitting Pull Requests

1. **Fork & Branch:** Create a feature branch from `main`:
   ```bash
   git checkout -b feat/my-new-feature
   ```
2. **Run Verification Suite:**
   Ensure all tests and builds pass cleanly:
   ```bash
   # Go verification
   go vet ./...
   go test -v -race ./...

   # Frontend verification
   cd frontend
   npm run typecheck
   npm run build
   cd ..
   ```
3. **Commit Cleanly:** Follow standard Conventional Commits:
   - `feat: add Stochastic RSI indicator`
   - `fix: resolve horizontal ray anchor drift on zoom`
   - `docs: update Alpaca broker setup instructions`
4. **Open a PR:** Open a Pull Request targeting `ordercraft-hq/terminal:main`. Include clear reproduction or testing steps in the PR description.

