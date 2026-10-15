# Architecture

`rmz-budgeting-tools` is one Node.js 22+ TypeScript application. It has one
root `package.json`, lockfile, TypeScript configuration, and `src/` tree; the
three domain modules do not have separate project setup or package manifests.

## Source layout

- `src/cli.ts` is the main executable. It runs the monthly workflow by default
  and forwards `sheets`, `market-data`, and `revolut` commands to their module
  CLIs. For a monthly run without `--spending-file`, it first invokes the
  Revolut browser-login command for the selected month.
- `src/monthly-workflow.ts` coordinates sheet reads, local spending parsing,
  historical price and rate lookups, and one batch write. It validates the
  complete update set before writing and never launches a browser.
- `src/google-sheets/` owns the Sheets API adapter, its module CLI, monthly
  category input logic, and monthly sheet layout analysis.
- `src/market-data/` owns Yahoo Finance and CursBNR providers, date handling,
  errors, and the independently callable market-data CLI.
- `src/revolut-spending/` owns local CSV and saved-HTML parsing, the explicit
  browser capture flow, and its independently callable CLI.
- `tests/` contains all unit, integration-configuration, requirement, and
  optional browser snapshot tests. `playwright.config.ts` configures only the
  manually triggered public homepage snapshot.

## Monthly workflow

Each year has a separate spreadsheet with worksheet tabs named `01` through
`12`. The requested `YYYY-MM` identifies the year-specific spreadsheet through
the supplied spreadsheet ID and selects the corresponding `MM` tab. The
workflow reads `A:ZZ` and discovers the spending table by the exact trimmed,
case-insensitive headers documented in [README.md](README.md). Current market
inputs use the positional ranges `B16:B18` for
currencies and `F16:F30` for tickers, with rates written to `C16:C18` and
closing prices to `G16:G30`. Existing header-based market tables remain
supported. Spending categories use the `Kategória` key, with profile outputs
`RON (N)` and `RON (ZS)`; the monthly workflow writes to the ZS column. Inputs
stop at the first blank key, and only associated output cells are changed.

The source date is the last calendar day of the selected month. Yahoo Finance
and CursBNR data use the latest available date on or before that date. The
root CLI captures the selected month's category breakdown to
`output/spending-YYYY-MM.html` through visible browser login when
`--spending-file` is omitted; this requires manual sign-in and saves only the
category container. An explicit `--spending-file` skips browser capture. The
monthly-workflow module parses its local HTML input, and provider data and
category matches must all validate before one Sheets batch update is sent.

## Data and credential boundaries

- Google authentication uses Application Default Credentials configured
  outside the repository. Spreadsheet contents are read only for the selected
  tab and are not persisted.
- Saved Revolut HTML and CSV statements are local inputs. Browser capture is
  explicitly requested by the default monthly CLI or the standalone
  `browser-login` command, is visible, and requires manual sign-in; it saves
  only the category container and never stores credentials or authentication
  state.
- Historical market requests are made on demand and are not cached or
  persisted. Provider/network failures stop the monthly write.
- `PRD.md` is the requirements source of truth. Requirement tests run in the
  standard root test command; only the live public homepage visual check is
  excluded from standard CI.
