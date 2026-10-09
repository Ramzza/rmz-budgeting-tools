# AGENTS.md

## Project context
`rmz-budgeting-tools` is a Node.js 22+ TypeScript monorepo for a manual monthly budgeting workflow. Root npm scripts manage the three independently usable package CLIs:
- `packages/google-sheets/`: `rmz-sheets` CLI and Sheets API wrapper, including JSON-based monthly category imports.
- `packages/market-data/`: library and CLI for Yahoo Finance prices and CursBNR RON exchange rates.
- `packages/revolut-spending/`: CLI for local Revolut CSV statements and saved spending HTML, plus an explicit browser capture command.
- `tests/`: monorepo checks and PRD requirement tests; package tests live in each package's `tests/` directory.
- `.github/`: GitHub Actions workflows.

See [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [PRD.md](PRD.md). Scheduled extraction, market-data imports, and automatic sheet updates are out of scope.

## Conventions
- Use Node.js 22+ and TypeScript ES modules; follow each package's `tsconfig.json`. No repository linter or formatter is configured.
- In `packages/google-sheets/`, keep command parsing and input validation in `src/cli.ts`; reuse `src/sheets.ts` for the Sheets API.
- In `packages/market-data/`, keep public exports in `src/index.ts`, CLI commands and JSON/CSV serialization in `src/cli.ts`, and provider, date, and error logic in `src/prices.ts`, `src/bnr.ts`, `src/dates.ts`, and `src/errors.ts`. Use `MarketDataError` for invalid input and CursBNR source failures; let Yahoo Finance client errors propagate.
- In `packages/revolut-spending/`, keep CLI orchestration in `src/cli.ts` and reuse `src/csv.ts`, `src/revolut.ts`, and `src/spending-html.ts` for parsing and domain logic.

## Scripts
- From the repository root, install root dependencies with `npm ci` and package dependencies with `npm run install:packages`.
- Build all packages with `npm run build`; run all package and requirement tests with `npm test`. Run only the root requirement tests with `npm run test:requirements`.
- After building, invoke package CLIs from the root with `npm run start:sheets -- <command> [options]`, `npm run start:market-data -- <command> [options]`, or `npm run start:revolut-spending -- <command> [options]`.
- `npm run test:browser-snapshot` is an optional live check run manually; install Chromium first with `node packages/revolut-spending/node_modules/playwright/cli.js install chromium`.

## Constraints
- Treat `PRD.md` as the requirements source of truth. Map requirements to explicit tests; write or update behavior tests before production changes and verify they fail against unchanged behavior (use a controlled mutation when the behavior already exists).
- Read `ARCHITECTURE.md` before changing module boundaries. Edit package `src/` files, not build-generated `dist/` output.
- Do not persist Google credentials, spreadsheet contents, or spending input. Configure Google Application Default Credentials outside the CLI and repository.
- Market-data requests require network access and are not cached or persisted. Preserve inclusive date ranges, exact-date and missing-rate behavior, and CursBNR HUF-per-100 normalization.
- Keep Revolut CSV and saved-HTML processing local. Only the explicit `browser-login` command may open the public login flow after user invocation and manual sign-in; never read, fill, capture, or persist credentials or authentication state. Save only the spending category container under `output/`. The separate public homepage snapshot is optional and its workflow is manually triggered.
- Never commit account exports, saved spending HTML, credentials, or other private account data.
