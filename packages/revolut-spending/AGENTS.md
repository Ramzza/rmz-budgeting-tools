# AGENTS.md

## Project context
`rmz-revolut-spending` is a local TypeScript CLI for exported Revolut CSV statements and saved spending HTML; `src/` contains the CLI and parsing modules, while `tests/` covers parsing and output behavior. Shared instructions and CI live in the repository root `.github/`. See [ARCHITECTURE.md](ARCHITECTURE.md) and the [root PRD](../../PRD.md).

## Conventions
- Use Node.js 22+ and TypeScript ES modules.
- Keep CLI orchestration in `src/cli.ts`; reuse `src/csv.ts`, `src/revolut.ts`, and `src/spending-html.ts` for their respective parsing and domain logic.
- Keep CSV and saved-HTML processing local. The explicit `browser-login` command may continue from the public Login page after manual sign-in to capture only the spending category container, saving it under `output/`; never read, fill, or capture credentials or persist authentication state. The optional homepage snapshot is the only other network path.

## Scripts
- `npm run build` compiles the CLI into `dist/`.
- `npm test` runs the TypeScript tests with Node.js's test runner.
- `npm run test:browser-snapshot` runs the optional live homepage comparison; install Chromium with `node packages/revolut-spending/node_modules/playwright/cli.js install chromium` first. The root `Optional browser homepage snapshot` workflow runs it only when manually triggered.
- `npm start -- <command> [options]` runs the compiled CLI; build first.

## Constraints
- Treat the [root PRD](../../PRD.md) as the requirements source of truth and follow the root Copilot instructions for behavior changes and requirement-to-test mappings.
- Keep exported statements and saved spending HTML local; do not commit account exports, credentials, or other private account data.
- Edit `src/`, not the generated `dist/` output.
