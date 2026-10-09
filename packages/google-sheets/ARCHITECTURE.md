# Architecture

`rmz-google-sheets` is a small TypeScript CLI over the Google Sheets v4 API. It has no local database or credential store.

## Components and flow

- `src/cli.ts` parses `get`, `update`, `append`, and `fill-spendings` commands. It resolves spreadsheet IDs for the first three commands from the optional positional argument, the working-directory `.env`, or an interactive prompt. The monthly spending command accepts JSON text, a JSON file, or standard input and requires an explicit spreadsheet ID or one in `.env`.
- `src/sheets.ts` creates the Google API client and wraps the values endpoints. The client uses Google Application Default Credentials, configured outside the tool.
- `src/spendings.ts` validates monthly spending JSON, reads category labels from rows 43-70 of the `YYYY-MM` tab, aligns `category`/`ron` entries to those labels, and fills missing totals with zero. Profile N writes column C; profile Z (the default) writes column D.
- The CLI passes the spreadsheet ID and A1 range to reads, then prints the returned cell matrix as JSON. For writes, it passes spreadsheet ID, A1 range, and values, then prints the update/append API response as JSON. Updates use `USER_ENTERED`; appends use `USER_ENTERED` with `INSERT_ROWS`.

All reads and writes go directly to Google Sheets; spreadsheet contents, credentials, and spending input are not persisted by the CLI. The installed `rmz-sheets` command is compiled from `src/` to `dist/`.

Run `npm test` to build the TypeScript and execute the CLI tests.
