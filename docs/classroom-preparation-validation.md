# Classroom preparation validation

Validated locally on 2026-09-22, on `main` with the classroom-preparation changes in the working tree. No publication is included in this validation.

## Results

`pnpm test` completed successfully on the final implementation:

- ESLint, generated locale checks and offline manifest integrity checks passed.
- **141 unit tests passed.**
- **251 browser tests passed** across Chrome, WebKit and the dedicated iPad WebKit profile, including the CI regression fixes below.
- `git diff --check` passed.

The new coverage verifies complete-cache readiness, interrupted first installation and retry, missing cached files, nonresponding legacy workers, waiting updates and preservation of the previous offline release. Batch tests cover every language and 2–4 versions, matching keys, one A4 page per sheet, large automatic grids, readable type sizes, repeat printing, pupil-state preservation, cancellation, overflow handling, keyboard focus, narrow screens, high contrast and local files.

The tablet tests use taps, rotate the viewport, recover progress and hints, and check the new controls have touch targets at least 44 CSS pixels high. Closing the versions dialog returns focus to its launch button in both browser engines.

## Offline CI regression validation

The Linux CI run exposed an assumption in two tests: blocking network requests does not guarantee that `navigator.onLine` reports `false` after navigation. Offline integration checks now verify that an uncached request succeeds before disconnection and fails after reload, while the app remains ready and preserves its activity. Two additional cases control the browser's advisory signal and assert the exact status text after reload and connection events, with real requests still blocked.

Update tests also observe an installation already started by the app's `online` handler. The interrupted-installation test waits for the worker to become redundant before restoring downloads and retrying, avoiding a transient startup status.

Local validation passed: **24/24 offline browser executions**, covering all eight scenarios three times with four workers and no retries (`pnpm test:e2e tests/e2e/offline-updates.spec.js --project=chromium --workers=4 --retries=0 --repeat-each=3 --reporter=line`). ESLint and `git diff --check` also passed. This follow-up changes tests and documentation only.

## WebKit CI regression validation

CI traces showed the combined iPad journey exhausting its 30-second test budget after many successful touch actions and an Axe scan. Pupil interaction/recovery and teacher print preparation now run as separate, isolated tests in every language, retaining the standard timeout, real taps, rotation checks, Axe scan, screenshot and dialog-close checks. Existing print-variant tests retain coverage of found words and hints surviving preparation.

The board's reduced-motion style now disables its reveal transition entirely: WebKit had intermittently retained the blocked opacity after the blocking class was removed despite the previous 0.01ms transition. Normal-motion styles are unchanged.

The typeface check waits for the form to be visibly laid out before inspecting its font, avoiding stale initial computed styles in WebKit while retaining the Andika and font-file assertions.

Local validation passed: **39/39 iPad and responsive-board executions**, covering all thirteen scenarios three times, plus **10/10 typeface executions**, with four workers and no retries.

## Review artifacts

The tests produce PDFs and screenshots in `test-results/`, with PDFs also attached to the Playwright report. These are generated artifacts and will be replaced by future test runs.

- [Spanish batch with matching answer keys](../test-results/print-variants-es-prints-2-44b91-and-their-exact-answer-keys-chromium/models-es-2-with-keys.pdf)
- [Spanish versions dialog on the iPad profile](../test-results/tablet-es-iPad-profile-pre-335da-e-print-variants-with-touch-ipad-webkit/ipad-es-variants.png)

Desktop and tablet screenshots and a rendered A4 worksheet were visually reviewed. The 8×8 worksheets use 18pt grid letters; large automatic boards use at least 10pt. Browser PDF tests run with background graphics disabled and verify page counts and corresponding sheet content.

## Physical-device follow-up

**Pending:** native Safari on a physical iPad. WebKit emulation does not establish physical drag behaviour, virtual-keyboard ergonomics or system print-sheet behaviour. Follow the [iPad classroom check](ipad-classroom-check.md) when a device is available.
