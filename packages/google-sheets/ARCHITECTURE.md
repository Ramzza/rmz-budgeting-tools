# Architecture

`rmz-google-sheets` is a small TypeScript CLI over the Google Sheets v4 API. It has no local database or credential store.

## Components and flow

- `src/cli.ts` parses `get`, `update`, and `append` commands. For writes, it validates a non-empty matrix of scalar cell values read from JSON arguments or standard input.
- `src/sheets.ts` creates the Google API client and wraps the values endpoints. The client uses Google Application Default Credentials, configured outside the tool.
- The CLI passes the spreadsheet ID and A1 range to reads, then prints the returned cell matrix as JSON. For writes, it passes spreadsheet ID, A1 range, and values, then prints the update/append API response as JSON. Updates use `USER_ENTERED`; appends use `USER_ENTERED` with `INSERT_ROWS`.

All reads and writes go directly to Google Sheets; spreadsheet contents and credentials are not persisted by the CLI. The installed `rmz-sheets` command is compiled from `src/` to `dist/`.

Run `npm test` to build the TypeScript and execute the CLI tests.
