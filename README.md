# rmz-budgeting-tools

A TypeScript monorepo that brings together the existing Google Sheets,
market-data, and Revolut spending tools for a future monthly budgeting workflow.
See [PRD.md](PRD.md) for requirements and [ARCHITECTURE.md](ARCHITECTURE.md)
for package boundaries.

This consolidation keeps the three CLIs independently usable. It does not yet
schedule a monthly run or automatically map the extracted values into a
budgeting sheet; that workflow needs a confirmed sheet schema, data mapping,
schedule, and credential flow.

## Packages

- [`packages/google-sheets`](packages/google-sheets/README.md): read and edit
  Google Sheets ranges using Application Default Credentials.
- [`packages/market-data`](packages/market-data/README.md): retrieve historical
  stock/ETF prices and RON exchange rates.
- [`packages/revolut-spending`](packages/revolut-spending/README.md): process
  local Revolut CSV statements and spending breakdown HTML, with an explicit
  opt-in browser capture command.

## Setup and checks

Requires Node.js 22 or later. From the repository root:

```sh
npm ci
npm run install:packages
npm run build
npm test
```

## Use

Build before running a CLI. Examples from the repository root:

```sh
npm run start:market-data -- prices AAPL --date 2024-01-02
npm run start:market-data -- exchange-rates \
  --start 2024-01-02 --end 2024-01-02 --currencies EUR

npm run start:revolut-spending -- transactions ./statement.csv
npm run start:revolut-spending -- summary ./statement.csv
npm run start:revolut-spending -- categories ./spending.html
npm run start:revolut-spending -- browser-login last

npm run start:sheets -- get SPREADSHEET_ID 'Sheet1!A1:C10'
```

The browser capture is manual and opt-in; it does not read, store, or handle
credentials. Keep account exports, saved spending HTML, spreadsheet contents,
and credential files outside Git. Google credentials must be configured
outside the repository.

## Optional browser snapshot

The public Revolut homepage snapshot is not part of standard pull-request CI.
Run it manually with:

```sh
node packages/revolut-spending/node_modules/playwright/cli.js install chromium
npm run test:browser-snapshot
```
