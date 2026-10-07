Read the root `PRD.md` before changing behavior. Keep it as the single
requirements source, map every stable ID to executable tests, and write or
update tests before behavior changes. Preserve package boundaries described in
`ARCHITECTURE.md`; use the root commands `npm run install:packages`,
`npm run build`, and `npm test`.

Keep Revolut exports, saved spending HTML, Google credentials, and spreadsheet
contents out of Git. Google credentials must remain external to the repository;
the browser capture remains explicit, manual, and non-persistent.
