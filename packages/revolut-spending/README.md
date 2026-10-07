# rmz-revolut-spending

A local TypeScript CLI for extracting completed outflows from Revolut CSV
account statements and saved spending HTML. Statement and HTML processing stays
on your machine. An explicitly invoked browser command can open the public
Revolut Login page and save the spending category breakdown after you sign in
manually.

See the [root PRD](../../PRD.md) for the product requirements and test mappings.

## Requirements

Node.js 22 or later.

```sh
npm ci
npm run install:packages
npm run build --prefix packages/revolut-spending
```

Export an account statement as CSV from Revolut for transaction processing. To
extract category totals, save the Revolut spending breakdown as an HTML file.
Then run the examples below from this package directory. From the repository
root, use `npm run start:revolut-spending --`.

```sh
npm start -- transactions ./statement.csv
npm start -- summary ./statement.csv

# Extract category totals from a Revolut spending breakdown HTML file:
npm start -- categories ./spending.html

# Save a spending category breakdown through a visible browser:
npm start -- browser-login
npm start -- browser-login last
npm start -- browser-login 2025-aug

# Optional inclusive date limits (YYYY-MM-DD):
npm start -- transactions ./statement.csv --from 2025-01-01 --to 2025-01-31

# JSON output is the default; CSV is also supported:
npm start -- transactions ./statement.csv --format csv
npm start -- categories ./spending.html --format csv
```

The `transactions` command outputs completed, negative-amount rows only.
Positive credits and non-completed transactions (such as pending or reverted
items) are excluded. The `summary` command totals those outflows by currency;
it does not combine different currencies or net refunds against purchases.
Date filtering uses the completed date when present and otherwise the started
date. The importer recognizes Revolut statement columns such as `Completed
Date`, `Started Date`, `Description`, `Amount`, `Currency`, `State`, `Category`,
and `Type`. The `categories` command reads the category breakdown buttons in a
locally saved Revolut spending HTML file and outputs each category with its
absolute numeric RON amount; transaction counts and percentages are omitted.
The `browser-login` command saves this HTML format to
`output/spending-YYYY-MM.html`, using the selected Analytics period.

## Account access

Revolut personal accounts do not expose a general-purpose personal transaction
API for this CLI to use directly. For personal accounts, export the statement
from the Revolut app or website and pass its CSV file to the tool, or save the
spending breakdown page as HTML for category extraction. Do not give the CLI
your Revolut password or upload statement files to this repository. The
`browser-login` is an opt-in workflow that opens a temporary visible Chromium
window at 1860 x 1000, rejects cookies when offered, and clicks the public
Login control. Sign in manually in the browser; when Analytics appears, the CLI
selects the requested period by moving backward with the selector's left
arrow, then opens Analytics > Spent > See all and saves only the category-button
container to `output/spending-YYYY-MM.html`. The optional period argument
defaults to `current` and accepts `last` or a case-insensitive `YYYY-mon`
value, such as `2025-aug`; months in the current year display without a year,
while earlier years display the month and year. The `categories` command can
read the saved file. Each browser and capture step, including its completion
or failure, is logged to stderr so a stalled step is visible without logging
account content. Chromium launch, initial navigation, and browser clicks each
have a five-minute timeout; waiting for manual sign-in or for you to close the
browser does not time out. The CLI never reads, fills, or captures credentials,
or persists credentials or authentication state. Direct automated access for
personal accounts requires an Open Banking provider. Revolut's Business API
is a separate product and is not used here.

Install the managed browser before the first use:

```sh
node packages/revolut-spending/node_modules/playwright/cli.js install chromium
```

## Development

```sh
npm test --prefix packages/revolut-spending
npm run build --prefix packages/revolut-spending
node packages/revolut-spending/node_modules/playwright/cli.js install chromium
npm run test:browser-snapshot
```

The browser snapshot is an optional live-site check against
`tests/resources/01-revolut-homepage.png`. Run it locally with the command
above or manually from GitHub Actions using the `Optional browser homepage
snapshot` workflow. It runs headlessly before any Login interaction and fails
if Revolut is unavailable or the homepage changes beyond the configured visual
tolerance; it does not block the standard push or pull-request checks. Review
homepage changes before intentionally replacing the baseline.
