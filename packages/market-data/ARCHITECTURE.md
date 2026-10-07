# Architecture

`rmz-market-data` exposes both a TypeScript library and a command-line interface. It fetches data from Yahoo Finance and the CursBNR archive; it does not persist results.

## Components and flow

- `src/cli.ts` defines the `prices` and `exchange-rates` commands and serializes results as JSON or CSV.
- `src/dates.ts` parses and validates single dates and inclusive date ranges. `src/errors.ts` defines the domain error used for invalid input and CursBNR source failures; Yahoo Finance errors propagate from its client.
- `src/prices.ts` queries Yahoo Finance for one date, filters out other days, and maps the result to a close-only `PriceQuote`.
- `src/bnr.ts` fetches one archive page per requested date, parses the rate table with Cheerio, and maps rates to RON per one currency unit. In particular, it normalizes the archive's HUF-per-100 quote.
- `src/index.ts` exports the public library functions and types.

The CLI and library share the same source modules: the CLI formats provider results for stdout, while library consumers call `fetchStockPrices` or `fetchExchangeRates` directly. Network access is required when fetching data; there is no cache or local data store.

Run `npm test` for the module tests and `npm run build` to compile the CLI and library into `dist/`.
