# rmz-market-data

A TypeScript library and CLI for retrieving historical stock and ETF prices
from Yahoo Finance and RON exchange rates from the [CursBNR archive](https://www.cursbnr.ro/arhiva-curs-bnr).

See the [root PRD](../../PRD.md) for the product requirements and test mappings.

Licensed under the [MIT License](LICENSE).

## Requirements and installation

Requires Node.js 22 or later.

```sh
npm ci
npm run install:packages
npm run build --prefix packages/market-data
```

From the repository root, run the CLI with
`npm run start:market-data --`.
The examples below use that package command from its own directory.

## Usage

Dates use `YYYY-MM-DD`. Stock-price requests accept one date; the
exchange-rates CLI requires matching `--start` and `--end` dates. Yahoo Finance
requires internet access and may not provide data for every ticker or date.

```sh
npm start -- prices AAPL --date 2024-01-02
npm start -- prices AAPL --date 2024-01-02 --format json
npm start -- prices SPY --date 2024-01-02 --format csv

npm start -- exchange-rates --start 2024-01-02 --end 2024-01-02 --currencies EUR
npm start -- exchange-rates --start 2024-01-02 --end 2024-01-02 \
  --currencies EUR --format csv
```

Price results contain the date, normalized symbol, and daily close. Exchange-
rate results are fetched from the CursBNR archive page for each requested date
and report RON per one unit of each currency. CursBNR lists HUF per 100
forints, so the tool normalizes that quote to RON per one HUF. Requests use the
exact requested dates; missing archive data is reported rather than replaced
with another day's rate.

The `prices` command prints only the close by default, using Yahoo Finance's
chart currency: two decimal places for EUR/USD and three for RON. Other
currencies are printed without additional rounding. Use `--format json` or
`--format csv` to include the date and symbol with the unrounded close.
Non-finite closes print as `null`; when no quote is returned, the default
output is an empty JSON array.

The `exchange-rates` command prints only the rate at its published precision
by default, without rounding it to two decimal places. Its date endpoints must
match, and exactly one currency must be supplied; explicit JSON/CSV output
includes the date and currency. The library function continues to support
inclusive date ranges and multiple currencies.

The same operations are available as TypeScript functions:

```ts
import { fetchExchangeRates, fetchStockPrices } from "rmz-market-data";

const prices = await fetchStockPrices("AAPL", new Date("2024-01-02"));
const rates = await fetchExchangeRates(new Date("2024-01-02"), new Date("2024-01-05"));
```

## Development

```sh
npm test --prefix packages/market-data
npm run build --prefix packages/market-data
```
