## Description
<!-- Provide a concise summary of the changes made and the motivation behind them. -->

## Type of Change
- [ ] 🐛 Bug fix (non-breaking change fixing an issue)
- [ ] 🚀 New feature (non-breaking change adding functionality)
- [ ] 📈 New indicator or drawing tool primitive
- [ ] 🔌 New market data provider integration
- [ ] 📚 Documentation update
- [ ] 🎨 UI/UX styling polish

## Quality & Verification Checklist
- [ ] My code conforms to the project's architecture invariants in `docs/architecture/MASTER_PLAN.md`.
- [ ] All new drawing primitives implement `ISeriesPrimitive<Time>` in logical `(time, price)` coordinates.
- [ ] Vectorized indicator math calculations are computed off-thread with numerical verification tests.
- [ ] Frontend typecheck passes cleanly (`npm run typecheck` $\rightarrow$ 0 errors).
- [ ] Frontend production build succeeds (`npm run build`).
- [ ] Go tests and static analysis pass (`go vet ./...` and `go test -race ./...`).
- [ ] Zero hardcoded API keys, private tokens, or personal file paths.
- [ ] Permissive open-source compliance (MIT / Apache-2.0 only).

## Testing Performed
<!-- Describe how you verified these changes (unit tests, browser interaction, live streaming tests). -->

