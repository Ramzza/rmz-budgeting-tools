# Architecture

`rmz-budgeting-tools` is a TypeScript monorepo with three independent packages
and separate lockfiles. The root package provides reproducible dependency
installation, build/test orchestration, shared CI, and product documentation;
it does not add a cross-package data pipeline or persistence layer.

## Packages

- `packages/google-sheets` contains the `rmz-sheets` CLI and Google Sheets API
  wrapper. It uses Google Application Default Credentials configured outside
  the repository and does not store credentials or spreadsheet contents.
- `packages/market-data` contains the `rmz-market-data` CLI and library. It
  fetches Yahoo Finance closing prices and CursBNR exchange rates on demand;
  results are not cached or persisted.
- `packages/revolut-spending` contains the `rmz-revolut-spending` CLI. CSV and
  saved HTML processing stays local. Only the explicit `browser-login` command
  opens a visible browser after user invocation and manual authentication; it
  saves only the selected category container and never persists credentials or
  authentication state.

Each package owns its source, tests, lockfile, and domain documentation. Root
npm scripts invoke each package by path, avoiding workspace symlinks on shared
filesystems while keeping dependency installs reproducible. The root PRD maps
each requirement to its package tests. The optional public homepage snapshot
has a separate manually triggered workflow.

The Google Sheets CLI supports a manual monthly category fill from the JSON
output of the Revolut spending package. It reads the category rows from the
month-named tab and updates one profile column; JSON keeps the packages
independent without adding a cross-package dependency or persistence layer.
Scheduled extraction, market-data imports, and automatic sheet updates remain
future work.
