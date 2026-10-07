# Plan: opt-in Revolut spending capture and homepage snapshot

## Status and scope

This plan specifies an explicit browser workflow for local spending-category capture and a separate, optional headless homepage snapshot. Statement and saved-HTML processing remains local.

- Add an explicitly invoked `browser-login` CLI command that launches visible Chromium at 1860 x 1000, rejects cookies when offered, navigates to `https://revolut.com`, and clicks the public Login control. The user signs in manually; after Analytics appears, the command selects the requested month by moving backward with the period selector's left arrow, then clicks Spent and See all and saves only the category-button container as `output/spending-YYYY-MM.html`. The optional month argument accepts `last`, `current`, or case-insensitive `YYYY-mon` and defaults to `current`. Keep the browser open until the user closes it.
- Add a separate headless visual snapshot test of the public homepage to an optional, manually triggered CI workflow. Compare the captured homepage against `tests/resources/01-revolut-homepage.png`. This test runs before any Login click and never enters credentials or accesses an account.
- The snapshot is not part of the standard push or pull-request checks. When manually triggered, a network/site failure or screenshot mismatch fails the optional workflow. The homepage and its required assets need to be reachable from the build runner.

The browser command is a narrow, opt-in network exception to the current local-only product rule. It may capture only the selected spending category container after manual sign-in; it must not read, fill, or capture credentials or persist credentials or authentication state. The snapshot remains limited to the public homepage.

## Current repository context

- The project is a Node.js 22+ TypeScript ES-module CLI. CLI orchestration lives in `src/cli.ts`; existing commands process local CSV or saved HTML.
- `PRD.md` defines PRD-001 through PRD-007. PRD-006 covers the opt-in spending capture flow and PRD-007 covers the optional snapshot. `tests/prd-requirements.test.ts` maps IDs to named `.test.ts` and `.spec.ts` tests. Standard CI runs the build and Node test suite on Node 22; the Playwright snapshot is an optional manual workflow.
- Playwright is pinned by `package-lock.json`; `src/browser-login.ts` provides the interactive flow and `tests/browser-snapshot.spec.ts` provides the separate headless check.
- `tests/resources/01-revolut-homepage.png` is the reviewed 1900 x 910 baseline committed with the implementation.

## Browser framework comparison

| Option | Fit for this request | Trade-off |
| --- | --- | --- |
| **Playwright (recommended)** | TypeScript/Node support, semantic locators with built-in waiting, screenshot assertions, and direct browser/page lifecycle APIs suit both the interactive flow and CI snapshot. It also leaves a path to other browser engines if needed. | Adds a managed-browser install and browser-test tooling. Start with Chromium only. |
| Puppeteer | Strong, straightforward option for Chromium-focused automation and a viable lighter choice for the interactive command. | Playwright's locator/waiting model and screenshot-test tooling are a better fit for the visual baseline. |
| Selenium/WebDriver | Broad browser and language ecosystem. | Driver and WebDriver setup is more machinery than this Node CLI's browser flow needs. |
| Cypress | Effective for end-to-end testing of applications under development. | Its test-runner model is not a good fit for a standalone CLI automating an external site. |

Use Playwright with headful Chromium for the manual login command; do not silently fall back to headless mode. The CI snapshot is a separate, explicitly headless test.

## Headless homepage snapshot

- Use `tests/resources/01-revolut-homepage.png` as the reviewed visual baseline.
- Add a dedicated Playwright Test visual assertion (for example, `toHaveScreenshot`) and a separate `npm run test:browser-snapshot` script so the existing Node test runner remains in place. Configure the snapshot baseline path to use the provided image.
- In CI, launch headless Chromium at a fixed 1900 x 910 viewport and device scale factor 1. Pin the Playwright/browser version through the lockfile and install that Chromium version in the workflow. Fix browser locale, color scheme, and reduced-motion settings; wait for fonts and images before capturing.
- Capture the homepage before any login interaction. Compare the full viewport to the baseline with a small, explicit visual-diff tolerance. Do not auto-update the baseline; review and intentionally update it when the public page's design is accepted to have changed.
- Run the live snapshot only through a `workflow_dispatch`-triggered workflow, separate from the standard build pipeline. A page-load/network error, unexpected page state, or visual mismatch fails that optional workflow. Keep command orchestration tests deterministic with local fixtures or browser stubs.
- Verify the visual assertion detects a controlled screenshot change; setup or network failures alone do not demonstrate that the snapshot comparison works.

## Implementation sequence

1. **Define requirements and tests first.** Update PRD-006 for the manual-login spending capture flow while retaining PRD-007 for the optional headless homepage snapshot. Add named PRD-006 tests before production behavior and verify the expected assertions fail against unchanged code.
2. **Implement the interactive command.** Keep `src/browser-login.ts` under 100 lines as a readable orchestration entry point, and put human-readable browser-step wrappers in a flow module. Accept an optional case-insensitive `last`, `current`, or `YYYY-mon` argument (default `current`); after Analytics opens, move backward with the period selector's left arrow until the requested month appears. Launch visible Chromium at 1860 x 1000, reject cookies when offered, navigate over HTTPS to `https://revolut.com`, and locate Login by accessible role/name. Wait without a timeout for Analytics after manual sign-in, navigate through Spent and See all, and save only the category-button container to `output/spending-YYYY-MM.html`. Use no persistent profile or storage export; report launch, navigation, locator, and file-write failures explicitly.
3. **Add the visual snapshot check.** Add `@playwright/test` as a development dependency and create a dedicated snapshot test/script. Commit the provided PNG baseline, configure the fixed headless environment, compare the live homepage against it, and install Chromium in a manually triggered workflow separate from standard CI. Keep command behavior tests separate and deterministic.
4. **Update requirements and documentation.** Revise `PRD.md`, `ARCHITECTURE.md`, `README.md`, `AGENTS.md`, and this plan to describe the opt-in spending capture, manual credential boundary, and optional live-site snapshot workflow. Map each PRD ID to named tests.
5. **Verify and release.** Run focused browser tests, `npm test`, and `npm run build`. Run the live headless snapshot only through its optional manual workflow. Review baseline changes intentionally. On a feature branch, commit only task files, push, and open a PR with a rendered Markdown description.

## Acceptance criteria

- Only explicit `browser-login` invocation opens a visible 1860 x 1000 browser; it rejects cookies when offered, reaches the public Login control, waits for manual sign-in, selects the requested Analytics month by moving backward with the period selector's left arrow, captures the category-button container to a `spending-YYYY-MM.html` file, and waits for the user to close the window.
- The headless snapshot test visits `https://revolut.com`, captures the homepage at the baseline viewport, and compares it to `tests/resources/01-revolut-homepage.png`.
- The optional snapshot workflow fails on live-site navigation errors or screenshot differences beyond the documented tolerance when manually run.
- The browser command does not handle credentials or persist authentication state; its only account-page capture is the selected spending category container. The snapshot does not access account data.
- Existing local CSV/HTML commands remain offline and unchanged.

## Risks and considerations

- The optional visual check depends on Revolut's availability and may fail on legitimate page, localization, regional-content, font, or imagery changes. It does not block standard CI; baseline updates require review.
- Match locale/region behavior to the supplied image where the site supports it. If CI receives different regional content, the screenshot should fail visibly rather than silently masking a different page.
