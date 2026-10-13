# AGENTS.md

## Project
Node.js 22+ TypeScript ES modules in one root project. All application code
lives under `src/`; shared unit and requirement tests live under `tests/`.
`PRD.md` is the single requirements source and `ARCHITECTURE.md` describes
module boundaries.

## Modules
- `src/cli.ts` owns the main CLI, monthly defaults, and module dispatch.
- `src/monthly-workflow.ts` coordinates the month tab read, local spending
  extraction, market lookups, and validated batch update.
- `src/google-sheets/` owns API access, Sheets CLI behavior, and dynamic table
  analysis. Reuse `sheets.ts` for API operations.
- `src/market-data/` owns provider, date, error, serialization, and CLI logic.
  Use `MarketDataError` for invalid input and CursBNR failures; let Yahoo
  Finance errors propagate.
- `src/revolut-spending/` owns CSV/HTML parsing and explicit browser capture.
  Never launch browser capture from the monthly workflow.

## Validation
- Install with `npm ci`; build with `npm run build`; run all tests with
  `npm test`; run the manual API smoke test with `npm run test:connection`.
- `npm run test:browser-snapshot` is optional and live; install Chromium first
  with `node node_modules/playwright/cli.js install chromium`.
- Keep the root lockfile authoritative. Do not add package-level manifests,
  locks, or setup guides.
- Before behavior changes, update `PRD.md`, add tests first, and verify the
  expected assertion fails against unchanged behavior. Every PRD requirement
  must map to a named test included in standard CI, except the optional
  manually triggered public homepage snapshot.
- Edit source under `src/`, never generated `dist/` output.

## Data safety
- Configure Google Application Default Credentials outside the repository.
  Never persist credentials, sheet contents, account exports, or spending
  inputs.
- Market data is fetched on demand and not cached. Preserve exact-date CLI
  behavior, inclusive date ranges, missing-rate errors, and HUF-per-100
  normalization.
- Keep Revolut CSV and saved-HTML processing local. The explicit visible
  `browser-login` command is the only action that opens the public login flow;
  the user signs in manually. Never read, fill, capture, or persist credentials
  or authentication state. Save only the spending category container under
  `output/`.
