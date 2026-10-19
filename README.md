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

Copy `.env.example` to `.env` and set `GOOGLE_SHEETS_SPREADSHEET_ID` to the
spreadsheet for the year being processed, or pass that year's sheet ID on the
command line. Configure Google Application Default Credentials outside this
repository; the CLI does not save credentials.

### Google Sheets authentication (Windows/PowerShell)

The CLI uses Application Default Credentials (ADC). `gcloud auth login` alone
does not configure ADC for this application.

1. If needed, [install the Google Cloud CLI](https://cloud.google.com/sdk/docs/install).
2. Open PowerShell and run this command:

   ```powershell
   gcloud auth application-default login --scopes="https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/spreadsheets"
   ```

3. In the browser, sign in with a Google account that can access the target
   spreadsheet and approve the request. The command stores ADC outside this
   repository; do not copy credential files into the repository or commit them.
4. Retry the monthly command, for example:

   ```powershell
   npm start -- 2026-09 --sheet-id SPREADSHEET_ID
   ```

If Google blocks the default gcloud OAuth client with a “This app is blocked”
message, use your own OAuth client. In the Google Cloud project, enable the
Google Sheets API, configure the OAuth consent screen, add your account as a
test user if the app is in testing mode, then create a Desktop app OAuth client
ID and download its JSON file outside this repository. Replace the example
path below with that downloaded file's path and run:

```powershell
gcloud auth application-default login --client-id-file="C:\path\to\client_secret.json" --scopes="https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/spreadsheets"
```

If a Google Workspace policy blocks the OAuth client, ask your administrator to
allow it.

If the CLI reports `invalid_grant`, run the login command again to refresh
expired or revoked user credentials. If your setup uses service-account
credentials instead, repair that ADC source rather than using the local-user
login command.

## Monthly sheet convention

Keep a separate spreadsheet for each year, with worksheet tabs named exactly
`01` through `12`. The `YYYY-MM` month argument identifies the year through
the supplied spreadsheet ID and selects the corresponding two-digit `MM` tab.
The CLI scans columns `A:ZZ` of that tab. It discovers the spending table by
its headers; the current category header is on row 42, with category names in
`A43:A70`, and outputs in columns C (`RON (N)`) and D (`RON (ZS)`). Column B is
intentionally blank.

| Kategória |  | RON (N) | RON (ZS) |
| --- | --- | ---: | ---: |
| Groceries | | | |
| Transport | | | |

The current market-data layout uses fixed positions:

| Data | Input cells | Output cells |
| --- | --- | --- |
| Currency codes (EUR, USD, HUF) | `B16:B18` | RON-per-unit rates in `C16:C18` |
| Tickers | `F16:F30` | Closing prices in `G16:G30` |

Rows continue until the first blank key cell. The workflow also supports
existing workbooks using the prior header-based market tables. `DE.EUNL` and
`DE.SXR8` are EUR tickers, `TVBETETF` is RON, and other tickers are treated as
USD. Prices and rates use the latest available source date on or before the
month's last calendar day; the RON rate is always 1. Unknown spending
categories or unavailable data stop the workflow before any cells are
written. Spending totals go to `RON (ZS)` in column D; the standalone Sheets
command can write to the N profile with `--profile N`.

## Monthly workflow

The default month is the previous calendar month. Unless `--spending-file` is
provided, the monthly command first opens visible Revolut for manual sign-in,
captures the requested month's category breakdown to
`output/spending-YYYY-MM.html`, then reads the sheet, fetches prices and rates,
and writes the validated updates in one batch. Use `--spending-file` to process
another local HTML file without opening a browser.

```sh
npm start -- 2026-09 --sheet-id SPREADSHEET_ID
npm start -- --sheet-id SPREADSHEET_ID
npm start -- 2026-09 --spending-file ./spending.html
```

When `--sheet-id` is omitted, the CLI reads `GOOGLE_SHEETS_SPREADSHEET_ID`
from the working directory's `.env`; that ID must identify the spreadsheet for
the requested year. The monthly workflow reads the `MM` tab, analyzes its
tables, extracts the saved Revolut categories, fetches prices and exchange
rates, validates the complete result, and writes all output cells in one batch.
Browser capture requires manual authentication and saves only the category
container; pass `--spending-file` to skip capture and use existing local HTML.

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

For `fill-spendings`, use the ID for the spreadsheet containing the year in
`YYYY-MM`; the command targets the corresponding `MM` tab.

The categories command prints JSON or CSV by default. Use `--output FILE` to
write that format to a file instead; the destination directory must exist.
`browser-login` opens visible Chromium when explicitly invoked. The root
monthly command also runs this flow when `--spending-file` is omitted. Capture
requires manual sign-in and saves only the spending category container; never
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
