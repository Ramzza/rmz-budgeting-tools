# AGENTS.md

## Project context
`rmz-google-sheets` is a TypeScript CLI for reading and editing Google Sheets; `src/cli.ts` handles commands and `src/sheets.ts` wraps the Sheets API, while `tests/` covers the CLI and API behavior. Shared instructions and CI live in the repository root `.github/`. See [ARCHITECTURE.md](ARCHITECTURE.md) and the [root PRD](../../PRD.md).

## Conventions
- Use Node.js 22+ and TypeScript ES modules.
- Keep command parsing and input validation in `src/cli.ts`; reuse the API wrapper in `src/sheets.ts`.
- Use Google Application Default Credentials configured outside the CLI.

## Scripts
- `npm run build` compiles TypeScript into `dist/`.
- `npm test` builds the project and runs the Node.js tests.

## Constraints
- Treat the [root PRD](../../PRD.md) as the requirements source of truth and follow the repository's root Copilot instructions for behavior changes and requirement-to-test mappings.
- Do not persist Google credentials or spreadsheet contents; the CLI accesses Sheets directly using external credentials.
- Edit `src/`, not the generated `dist/` output.
