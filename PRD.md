# Product requirements

## Outcome

Consolidate the Google Sheets, market-data, and Revolut spending tools into one
TypeScript application with a single root package and one `src/` directory.
The root CLI orchestrates the monthly workflow while retaining independent
commands for each tool. It reads local Revolut spending HTML, fetches market
data on demand, and fills the month-numbered tab in the selected year's Google
Sheets spreadsheet without persisting account data or automating browser sign-in.

## Requirements

- **SHEETS-001 - Read spreadsheet ranges:** Read the requested spreadsheet ID and A1 range and return its cell matrix, using an empty matrix when the API has no values.
  **Verification:**
  - `tests/sheets-api.test.ts` tests tagged `PRD-001`.
  - Optional manual API smoke test:
    `tests/sheets-connection.integration.ts`, invoked with
    `npm run test:connection`.
  - `tests/sheets-connection-config.test.ts` verifies that the manual command
    loads the root `.env` file.
- **SHEETS-002 - Validate and write cell values:** Accept only non-empty matrices of non-empty rows with scalar cells. Updates use `USER_ENTERED`; appends use `USER_ENTERED` with `INSERT_ROWS`.
  **Verification:**
  - `tests/sheets-cli.test.ts` tests tagged `PRD-002`.
  - `tests/sheets-api.test.ts` tests tagged `PRD-002`.
- **SHEETS-003 - Resolve spreadsheet ID:** Accept the existing positional spreadsheet ID or, when omitted, use `GOOGLE_SHEETS_SPREADSHEET_ID` from a `.env` file in the working directory. If neither is available, prompt for the ID; reject an empty response.
  **Verification:**
  - `tests/sheets-cli.test.ts` tests tagged `SHEETS-003`.
- **SHEETS-004 - Fill monthly category spendings:** Provide a `fill-spendings` command requiring a valid `YYYY-MM` month and spending JSON supplied inline, from a file, or from stdin (`-`). The spreadsheet ID identifies the workbook for the requested year, and the month selects a sheet tab named exactly `MM` (the two-digit month). Resolve the optional spreadsheet ID from `--spreadsheet-id` or `GOOGLE_SHEETS_SPREADSHEET_ID` in the working-directory `.env`; fail without prompting if neither is available. Read category names from `A43:A70`, match category labels case-insensitively after trimming whitespace, and write numeric RON totals to the matching rows in column C (`RON (N)`) for profile N or column D (`RON (ZS)`) for profile Z (default). Categories present in the sheet but missing from the input receive `0`; input categories not present in the sheet are rejected rather than silently dropped. Do not persist spending input or sheet contents.
  **Verification:**
  - `tests/sheets-spendings.test.ts` tests tagged `SHEETS-004`.
  - `tests/sheets-cli.test.ts` tests tagged `SHEETS-004`.
- **MARKET-001 - Historical prices:** Fetch Yahoo Finance closing prices for a normalized ticker on one requested date; return only that date, normalized symbol, and close value, representing a non-finite close as `null`.
  **Verification:**
  - `tests/market-data-prices.test.ts` tests tagged `PRD-001`.
- **MARKET-002 - RON exchange rates:** Fetch requested currencies for every inclusive date from the BNR archive and normalize rates to RON per unit, including the archive's HUF-per-100 quote; report missing rates and reversed ranges.
  **Verification:**
  - `tests/market-data-bnr.test.ts` tests tagged `PRD-002`.
- **MARKET-003 - CLI output and dates:** Parse valid `YYYY-MM-DD` dates and accept one `--date` for stock-price requests. Price requests print only the close by default, formatted to two decimal places for EUR/USD and three for RON according to Yahoo Finance chart currency metadata; other currencies retain the numeric value's ordinary string representation. Non-finite closes print as `null`, and no quote prints as an empty JSON array. Explicit JSON/CSV formats include the date, symbol, and unrounded close. Exchange-rate CLI requests require identical `--start` and `--end` dates and exactly one `--currencies` code; rates come from the CursBNR archive and print only the parsed rate without decimal-place rounding by default, preserving source precision. Explicit JSON/CSV formats include the date, currency, and unrounded rate.
  **Verification:**
  - `tests/market-data-dates.test.ts` tests tagged `PRD-003`.
  - `tests/market-data-cli.test.ts` tests tagged `PRD-003`.
- **SPEND-001 - Import statement CSV:** Parse quoted CSV safely, use completed date or fall back to started date, and reject missing required columns, dates, or invalid amounts.
  **Verification:**
  - `tests/revolut-transactions.test.ts` tests tagged `PRD-001`.
- **SPEND-002 - Select spending:** Include only completed negative-amount transactions within inclusive date bounds; do not count credits, refunds, or pending transactions as spending.
  **Verification:**
  - `tests/revolut-transactions.test.ts` tests tagged `PRD-002`.
- **SPEND-003 - Summarize by currency:** Report counts and absolute spending totals independently for each currency in stable sorted order.
  **Verification:**
  - `tests/revolut-transactions.test.ts` tests tagged `PRD-003`.
- **SPEND-004 - Transaction and summary CLI:** Provide transaction and summary commands with JSON or CSV output, and reject invalid options or dates.
  **Verification:**
  - `tests/revolut-cli.test.ts` tests tagged `PRD-004`.
- **SPEND-005 - Extract HTML category breakdown:** Parse a local Revolut spending breakdown HTML file into category labels and non-negative numeric RON amounts, excluding the displayed minus sign, transaction counts, and percentages. Support JSON and CSV output, and report an error when no category breakdown can be parsed.
  **Verification:**
  - `tests/revolut-spending-html.test.ts` tests tagged `PRD-005`.
  - `tests/revolut-cli.test.ts` tests tagged `PRD-005`.
- **SPEND-006 - Opt-in spending capture:** The explicit `browser-login` command and the root monthly CLI when `--spending-file` is omitted launch visible Chromium at 1860 x 1000, open `https://revolut.com`, and click the public Login control by accessible role and name. The monthly CLI captures the requested `YYYY-MM` month; the standalone command accepts `last`, `current`, or case-insensitive `YYYY-mon` for any month, defaults to `current`, and rejects future months. The user authenticates manually; wait without a timeout for Analytics, reject cookies if offered, click Analytics, and move the period selector's left arrow once per month before clicking Spent and See all. The selector shows `This month` for the current month, a month abbreviation for another month in the current year, and month plus year for earlier years. Log each browser/capture step to stderr before and after it runs, report failed steps without account content, and save only the category-button container's outer HTML as `output/spending-YYYY-MM.html`. Automatically close Chromium after saving and finish the command without waiting for the user to close the browser. Apply five-minute timeouts to Chromium launch, initial navigation, and browser clicks, but not manual sign-in or browser close. Never read, fill, capture, or persist credentials or authentication state.
  **Verification:**
  - `tests/revolut-browser-login.test.ts` tests tagged `PRD-006`.
  - `tests/revolut-cli.test.ts` tests tagged `PRD-006`.
  - `tests/main-cli.test.ts` tests tagged `SPEND-006` for default monthly capture and `--spending-file` bypass.
- **SPEND-007 - Optional public homepage snapshot:** A separate headless Chromium test visits `https://revolut.com` before any Login interaction, waits for fonts and images, and compares the 1900 x 910 screenshot with `tests/resources/01-revolut-homepage.png`. Run it only from an explicitly triggered optional workflow, not standard push or pull-request checks. Network, site-load, and visual-diff failures fail that workflow; it never enters credentials or accesses account data.
  **Verification:**
  - `tests/revolut-browser-snapshot-config.test.ts` tests tagged `PRD-007`.
- **SPEND-008 - Write category output to a file:** The `categories` command accepts `--output FILE` and writes the selected JSON or CSV output to that file instead of stdout. Without `--output`, preserve the existing stdout behavior. Reject missing output paths and use of the flag with other commands.
  **Verification:**
  - `tests/revolut-cli.test.ts` tests tagged `SPEND-008`.
- **MONOREPO-001 - Unified TypeScript project:** Keep all application source under root `src/`, use one root package manifest and lockfile, and provide root install, build, test, and start commands. Do not retain package-specific manifests, lockfiles, or setup documentation. Keep domain modules independently callable through the main CLI.
  **Verification:**
  - `tests/monorepo.test.ts` tests tagged `MONOREPO-001`.
- **APP-001 - Unified monthly CLI:** Accept an optional `YYYY-MM` and `--sheet-id ID`. The spreadsheet ID identifies the workbook for the requested year; the month selects its `MM` tab. The month defaults to the previous calendar month. Resolve the sheet ID from `--sheet-id` first, then `GOOGLE_SHEETS_SPREADSHEET_ID` in the current working directory's `.env`; fail clearly when neither is set.
  **Verification:**
  - `tests/main-cli.test.ts` tests tagged `APP-001`.
- **SHEETS-005 - Discover monthly sheet layout:** Read columns `A:ZZ` of the `MM` tab in the selected year's spreadsheet. Discover the spending table by its `Kategória` / `RON (N)` / `RON (ZS)` headers; in the current sheet, the header is on row 42, category keys occupy `A43:A70`, and the RON outputs are in columns C (N) and D (ZS). Support the current positional market layout with currency keys in `B16:B18` and rates in `C16:C18`, plus ticker keys in `F16:F30` and closing prices in `G16:G30`. Continue to support the prior header-based market tables (`Ticker` / `Share Price` / `Price Currency` / `Price Date` and `Currency` / `RON per Unit` / `Rate Date`). For all inputs, read rows in order until the first blank key and write only to their associated output cells.
  **Verification:**
  - `tests/sheet-layout.test.ts` tests tagged `SHEETS-005`.
- **SHEETS-006 - Diagnose rejected Google credentials:** When a Google Sheets request fails with `invalid_grant`, explain that Application Default Credentials were rejected and how to refresh local user credentials. Preserve unrelated API errors unchanged.
  **Verification:**
  - `tests/sheets-api.test.ts` tests tagged `SHEETS-006`.
- **APP-002 - Populate a monthly sheet:** When `--spending-file` is omitted, the root monthly CLI first runs the Revolut browser-login flow for the requested month and saves the category breakdown to `output/spending-YYYY-MM.html`; an explicit `--spending-file` uses that local HTML without launching a browser. Read category amounts from the resulting file, fetch the latest available closing price and exchange rate on or before the month's final calendar day for the ticker and currency inputs in the `MM` tab of the selected year's spreadsheet, and fill the supported sheet layout. In the positional market layout, write stock closing prices to column G and RON-per-unit rates to column C; ticker currency is EUR for `DE.EUNL` and `DE.SXR8`, RON for `TVBETETF`, and USD for other tickers. Write spending totals to the `RON (ZS)` output column (column D). Validate all input and provider data before writing, then submit all cell updates in one batch. The monthly-workflow module remains browser-free and consumes local HTML.
  **Verification:**
  - `tests/main-cli.test.ts` tests tagged `APP-002`.
  - `tests/monthly-workflow.test.ts` tests tagged `APP-002`.
- **APP-003 - Call modules separately:** Expose the existing Sheets, market-data, and Revolut spending commands through the root CLI without changing their domain-level behavior.
  **Verification:**
  - `tests/main-cli.test.ts` tests tagged `APP-003`.
