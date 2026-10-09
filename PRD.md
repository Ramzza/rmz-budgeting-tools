# Product requirements

## Outcome

Consolidate the Google Sheets, market-data, and Revolut spending tools into one
TypeScript monorepo as a foundation for a future monthly budgeting workflow.
The existing tools remain independently usable. Scheduled end-to-end monthly
extraction and sheet updates are out of scope until the budgeting-sheet schema,
data mapping, schedule, and credential flow are specified.

## Requirements

- **SHEETS-001 - Read spreadsheet ranges:** Read the requested spreadsheet ID and A1 range and return its cell matrix, using an empty matrix when the API has no values.
  **Verification:**
  - `packages/google-sheets/tests/sheets.test.ts` tests tagged `PRD-001`.
  - Optional manual API smoke test:
    `packages/google-sheets/tests/connection.integration.ts`, invoked with
    `npm run test:connection --prefix packages/google-sheets`.
  - `packages/google-sheets/tests/connection-config.test.ts` verifies that the
    manual command loads the package-local `.env` file.
- **SHEETS-002 - Validate and write cell values:** Accept only non-empty matrices of non-empty rows with scalar cells. Updates use `USER_ENTERED`; appends use `USER_ENTERED` with `INSERT_ROWS`.
  **Verification:**
  - `packages/google-sheets/tests/cli.test.ts` tests tagged `PRD-002`.
  - `packages/google-sheets/tests/sheets.test.ts` tests tagged `PRD-002`.
- **MARKET-001 - Historical prices:** Fetch Yahoo Finance closing prices for a normalized ticker on one requested date; return only that date, normalized symbol, and close value, representing a non-finite close as `null`.
  **Verification:**
  - `packages/market-data/tests/prices.test.ts` tests tagged `PRD-001`.
- **MARKET-002 - RON exchange rates:** Fetch requested currencies for every inclusive date from the BNR archive and normalize rates to RON per unit, including the archive's HUF-per-100 quote; report missing rates and reversed ranges.
  **Verification:**
  - `packages/market-data/tests/bnr.test.ts` tests tagged `PRD-002`.
- **MARKET-003 - CLI output and dates:** Parse valid `YYYY-MM-DD` dates and accept one `--date` for stock-price requests. Price requests print only the close by default, formatted to two decimal places for EUR/USD and three for RON according to Yahoo Finance chart currency metadata; other currencies retain the numeric value's ordinary string representation. Non-finite closes print as `null`, and no quote prints as an empty JSON array. Explicit JSON/CSV formats include the date, symbol, and unrounded close. Exchange-rate CLI requests require identical `--start` and `--end` dates and exactly one `--currencies` code; rates come from the CursBNR archive and print only the parsed rate without decimal-place rounding by default, preserving source precision. Explicit JSON/CSV formats include the date, currency, and unrounded rate.
  **Verification:**
  - `packages/market-data/tests/dates.test.ts` tests tagged `PRD-003`.
  - `packages/market-data/tests/cli.test.ts` tests tagged `PRD-003`.
- **SPEND-001 - Import statement CSV:** Parse quoted CSV safely, use completed date or fall back to started date, and reject missing required columns, dates, or invalid amounts.
  **Verification:**
  - `packages/revolut-spending/tests/revolut.test.ts` tests tagged `PRD-001`.
- **SPEND-002 - Select spending:** Include only completed negative-amount transactions within inclusive date bounds; do not count credits, refunds, or pending transactions as spending.
  **Verification:**
  - `packages/revolut-spending/tests/revolut.test.ts` tests tagged `PRD-002`.
- **SPEND-003 - Summarize by currency:** Report counts and absolute spending totals independently for each currency in stable sorted order.
  **Verification:**
  - `packages/revolut-spending/tests/revolut.test.ts` tests tagged `PRD-003`.
- **SPEND-004 - Transaction and summary CLI:** Provide transaction and summary commands with JSON or CSV output, and reject invalid options or dates.
  **Verification:**
  - `packages/revolut-spending/tests/cli.test.ts` tests tagged `PRD-004`.
- **SPEND-005 - Extract HTML category breakdown:** Parse a local Revolut spending breakdown HTML file into category labels and non-negative numeric RON amounts, excluding the displayed minus sign, transaction counts, and percentages. Support JSON and CSV output, and report an error when no category breakdown can be parsed.
  **Verification:**
  - `packages/revolut-spending/tests/spending-html.test.ts` tests tagged `PRD-005`.
  - `packages/revolut-spending/tests/cli.test.ts` tests tagged `PRD-005`.
- **SPEND-006 - Opt-in spending capture:** Only an explicit `browser-login` command may launch visible Chromium at 1860 x 1000, open `https://revolut.com`, and click the public Login control by accessible role and name. The optional month accepts `last`, `current`, or case-insensitive `YYYY-mon` for any month, defaults to `current`, and rejects future months. The user authenticates manually; wait without a timeout for Analytics, reject cookies if offered, click Analytics, and move the period selector's left arrow once per month before clicking Spent and See all. The selector shows `This month` for the current month, a month abbreviation for another month in the current year, and month plus year for earlier years. Log each browser/capture step to stderr before and after it runs, report failed steps without account content, and save only the category-button container's outer HTML as `output/spending-YYYY-MM.html`. Apply five-minute timeouts to Chromium launch, initial navigation, and browser clicks, but not manual sign-in or browser close. Never read, fill, capture, or persist credentials or authentication state.
  **Verification:**
  - `packages/revolut-spending/tests/browser-login.test.ts` tests tagged `PRD-006`.
  - `packages/revolut-spending/tests/cli.test.ts` tests tagged `PRD-006`.
- **SPEND-007 - Optional public homepage snapshot:** A separate headless Chromium test visits `https://revolut.com` before any Login interaction, waits for fonts and images, and compares the 1900 x 910 screenshot with `tests/resources/01-revolut-homepage.png`. Run it only from an explicitly triggered optional workflow, not standard push or pull-request checks. Network, site-load, and visual-diff failures fail that workflow; it never enters credentials or accesses account data.
  **Verification:**
  - `packages/revolut-spending/tests/browser-snapshot-config.test.ts` tests tagged `PRD-007`.
- **SPEND-008 - Write category output to a file:** The `categories` command accepts `--output FILE` and writes the selected JSON or CSV output to that file instead of stdout. Without `--output`, preserve the existing stdout behavior. Reject missing output paths and use of the flag with other commands.
  **Verification:**
  - `packages/revolut-spending/tests/cli.test.ts` tests tagged `SPEND-008`.
- **MONOREPO-001 - Unified TypeScript monorepo:** Provide root commands to install, build, and test each package reproducibly while keeping each package's dependencies and CLI independent. Keep the existing tools' distinct input/output behavior available; do not couple monthly scheduling or persistence into this consolidation.
  **Verification:**
  - `tests/monorepo.test.ts` tests tagged `MONOREPO-001`.
