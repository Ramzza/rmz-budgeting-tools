# Architecture

`rmz-revolut-spending` is a TypeScript CLI for processing exported Revolut statement CSV files and saved spending breakdown HTML files. Those file-processing commands remain local. The opt-in `browser-login` command opens the public Login page in a temporary visible browser, waits for manual sign-in, then saves only the spending category container from Analytics. An optional, manually triggered CI workflow checks the public homepage screenshot; neither flow handles credentials or persists authentication state.

## Components and flow

- `src/cli.ts` parses the command, date limits, requested Analytics month, output format, and optional category output path; it reads the selected CSV or HTML file and coordinates parsing and output.
- `src/csv.ts` parses quoted CSV fields and serializes tabular results.
- `src/revolut.ts` maps statement columns into typed transactions, selects completed negative-amount transactions within the inclusive date range, and aggregates totals independently by currency.
- `src/spending-html.ts` extracts category labels and non-negative numeric RON amounts from the transaction-breakdown buttons in local Revolut spending HTML.
- `src/browser-login.ts` is a concise orchestration entry point (at most 100 lines) that calls readable browser-step wrappers in `src/browser-login-flow.ts`. Those steps launch non-persistent visible Chromium at 1860 x 1000, wait for manual sign-in, select the requested Analytics month, and save only the category-button container. `src/browser-login-month.ts` parses month arguments and formats selector labels.
- The CLI emits transaction rows, spending summaries, or category totals as JSON or CSV. Category output goes to stdout by default and can be written to a user-selected local file. Browser capture output is written locally to `output/spending-YYYY-MM.html`; it stores no database, cache, or authentication state.

Input CSV supports the statement's completed/started date, description, amount, currency, state, category, and type columns. The `categories` command reads local HTML files and omits transaction counts, percentages, and the displayed minus sign. Refunds and credits are not netted against outflows; CSV totals are grouped by currency.

Run `npm test` for the CSV and HTML parsers, filtering, summaries, CLI behavior, and browser-login orchestration. `npm run build` compiles the executable to `dist/`. The separate `npm run test:browser-snapshot` check launches headless Chromium against the public homepage and compares it with the reviewed baseline in `tests/resources/`; run it locally or through the manually triggered `Optional browser homepage snapshot` workflow. This live-site check is not part of standard push or pull-request CI, and failures stop only the optional snapshot run.
