# rmz-budgeting-tools

A single TypeScript CLI for the monthly budgeting workflow, with independently
callable Google Sheets, market-data, and Revolut spending modules. See
[PRD.md](PRD.md) for requirements and [ARCHITECTURE.md](ARCHITECTURE.md) for
module boundaries.

## Setup

Requires Node.js 22 or later. Install, build, and test the single project:

```sh
npm ci
npm run build
npm test
```

Copy `.env.example` to `.env` and set `GOOGLE_SHEETS_SPREADSHEET_ID`, or pass a
sheet ID on the command line. Configure Google Application Default Credentials
outside this repository; the CLI does not save credentials.

## Monthly sheet convention

Create one worksheet tab per month named exactly `YYYY-MM`. The CLI scans the
columns `A:ZZ` of the tab for one table of each type below. Header text is
matched case-insensitively after trimming whitespace, and the tables may be
placed anywhere in that range.
Put input keys in the first column shown; rows continue until the first blank
key cell. The remaining columns are CLI outputs and must stay in the shown
order.

| Budget Category | Revolut Spend (RON) |
| --- | ---: |
| Groceries | |
| Transport | |

| Ticker | Share Price | Price Currency | Price Date |
| --- | ---: | --- | --- |
| AAPL | | | |

| Currency | RON per Unit | Rate Date |
| --- | ---: | --- |
| EUR | | |
| USD | | |

The spending categories must match the saved Revolut breakdown. Tickers and
currency codes are inputs; prices and rates use the latest available source
date on or before the month's last calendar day. The RON rate is always 1.
Missing or ambiguous tables, unknown spending categories, or unavailable data
stop the workflow before any cells are written.

## Monthly workflow

The default month is the previous calendar month. By default, spending is read
from `output/spending-YYYY-MM.html`; use `--spending-file` to choose another
local HTML file. Browser capture is always a separate explicit command.

```sh
npm start -- 2026-09 --sheet-id SPREADSHEET_ID
npm start -- --sheet-id SPREADSHEET_ID
npm start -- 2026-09 --spending-file ./spending.html
```

When `--sheet-id` is omitted, the CLI reads `GOOGLE_SHEETS_SPREADSHEET_ID`
from the working directory's `.env`. The monthly workflow reads the target
sheet tab, analyzes its tables, extracts the saved Revolut categories, fetches
prices and exchange rates, validates the complete result, and writes all
output cells in one batch.

## Call a module independently

The main CLI forwards module commands while preserving their existing options
and output formats:

```sh
npm start -- sheets get SPREADSHEET_ID 'Sheet1!A1:C10'
npm start -- sheets fill-spendings 2026-09 \
  --spending-input ./spendings.json --spreadsheet-id SPREADSHEET_ID
npm start -- market-data prices AAPL --date 2026-09-30
npm start -- market-data exchange-rates \
  --start 2026-09-30 --end 2026-09-30 --currencies EUR
npm start -- revolut transactions ./statement.csv
npm start -- revolut summary ./statement.csv
npm start -- revolut categories ./output/spending-2026-09.html
npm start -- revolut categories ./output/spending-2026-09.html --output ./categories.json
npm start -- revolut browser-login last
```

The categories command prints JSON or CSV by default. Use `--output FILE` to
write that format to a file instead; the destination directory must exist.
`browser-login` opens visible Chromium only after explicit invocation and
requires manual sign-in. It saves only the spending category container; never
commit account exports, saved spending HTML, sheet contents, credentials, or
authentication state.

## Optional checks

The live homepage snapshot is separate from standard CI and runs only when
manually requested:

```sh
node node_modules/playwright/cli.js install chromium
npm run test:browser-snapshot
```

Run the live Google Sheets connection smoke test with root `.env` configured:
`npm run test:connection`.
