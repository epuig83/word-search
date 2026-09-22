# Word Search Generator for Primary School

Small dependency-free web app for creating word search activities for primary school students.

## Usage

1. Open `index.html` in the laptop browser.
2. Enter a topic and a list of words, or use the side library to add vocabulary.
3. Click `Create and review activity`, check the `Activity ready` summary, then open the student area, share, or print.
4. Students can solve the puzzle with mouse, touch, or keyboard (`arrow keys` + `Enter`; `H` opens the hint picker while focus is inside the grid).
5. On phones, the timer, pause, and hint controls stay available in the bottom game bar.

New activities start with the **First steps** preset: an 8×8 grid, words running right or down, no timer, and unlimited hints. Each language includes a six-animal example for getting started. Changing presets keeps the vocabulary you have entered; words can be as short as two letters.

## Editable Data

- Built-in vocabulary and guided examples live in `data.js`.
- Translated UI copy lives in `i18n.js`.
- Pure puzzle generation and sharing logic lives in `core.js`.
- Shared app-side helpers live in `app-helpers.js`.
- Browser storage and modal helpers live in `app-storage.js` and `app-modal.js`.
- Offline readiness and printable batches live in `app-offline.js` and `app-print.js`.
- Board rendering and interaction logic lives in `app-board.js`.
- Teacher examples, saved samples, and library interactions live in `app-teacher.js`.
- Student session, tab switching, and modal flows live in `app-session.js`.
- DOM behavior and app interaction logic live in `app.js`.

## Teacher-Saved Examples

- `Save` does not write back to `data.js`.
- Custom examples are stored in the laptop browser with `localStorage`.
- That means they stay available after refreshing the page on the same computer.
- To move them to another laptop, use `Export JSON` and `Import JSON`.
- Titles retain numbers, punctuation, accents and word boundaries: `Tema 1` and `Tema 2` are separate examples. Equivalent titles ignore case and extra spaces; replacing one keeps its existing identifier.

## Classroom Flow

- The creation form saves incomplete drafts automatically in this browser. Reloading restores the last activity with its exact board, timer, progress, and hint usage; student names are not saved.
- Editing a generated activity shows a pending-changes message and disables opening, sharing, and printing until it is generated again. Reverting the edits re-enables the actions.
- A saved game offers **Continue** or **New pupil: start fresh**. Starting fresh keeps the same puzzle and resets the score, timer, hints, and any result-submission name. Completed and expired games can also be reviewed or restarted.
- Hints let students choose an unsolved word, reveal its first letter, then request its direction. Each new clue consumes one hint when hints are limited; repeating a revealed clue is free. Opening or dismissing the picker does not spend a hint.
- The `Activity ready` card sits directly below the creation form and receives focus after a successful creation or example load. Its actions lead to the student area, sharing, and printing.
- Shared links rebuild the exact same puzzle when opened.
- Any straight occurrence of a listed word counts, in either direction, even when it is not the generator's original placement. Each word counts once, and the selected cells remain highlighted after reopening. Hints and answer keys use the original placements.
- Invalid shared paths are rejected without overwriting an existing teacher draft. Older progress records remain readable and use the original positions when no valid selection path was saved.
- The student start overlay shows the timer and available hints before the activity begins.
- A first/last-letter example explains how to select a word. Words marked with a book icon open a definition.
- On phones, the word list appears above the grid and the activity actions below it.
- Printable worksheets include the word list and a short vocabulary follow-up. Teachers can also print an answer key.
- If you configure Google Forms, students are asked for a name or alias only when they press `Send results`, and see which data will be submitted; surnames are optional and the dialog can be dismissed.
- The teacher PIN is a local classroom lock stored in the browser on that laptop; it is not server-backed authentication.

## Offline Updates

The teacher panel reports **Ready to use offline** only after the active service worker confirms that all files in its installed revision are still cached. This also works on the first visit, before the current page is controlled. Connection status alone does not establish readiness. Interrupted installation, missing cache entries, denied storage or an older worker without the status protocol show an unconfirmed state and a **Check again** action. Opening the app from disk shows **Local file**.

When an update is waiting, the panel explains how to activate it after class. An unsuccessful update does not remove the readiness of the previous complete version.

After a successful online visit has installed the offline files, the app can reopen without a connection. Each installed version contains a complete, integrity-checked set of HTML, scripts, styles and assets. A failed or inconsistent download leaves the previous version available.

Updates download in the background and wait until **all tabs or installed-app windows for this app are closed**. Open the app again to use the new version; refreshing a tab alone does not force an update. Drafts, examples and student progress are retained. First installation takes control on the next navigation, without replacing resources in a page that is already open.

The repository includes `offline-manifest.js`, generated from the single asset list in `scripts/generate-offline-manifest.js`. After editing runtime files, regenerate it; after shared HTML changes, regenerate localized pages first:

```bash
pnpm build:locales
pnpm build:offline
pnpm check:offline
```

Generation is a development step, not a requirement for running the app or opening `index.html` from `file://`. CI checks the manifest against the actual file contents. Service-worker cache cleanup is scoped to this app and its known legacy caches.

## Printable Versions

After creating an activity, choose **Prepare versions** in the teacher's activity card:

1. Select **2, 3 or 4 versions** (default: 2). Answer keys are included by default.
2. Prepare and review the grids. Version A is the exact reviewed board; B–D keep its words, size and difficulty with different word placements.
3. Choose **Print / PDF**. The document contains the worksheets first, then their matching answer keys, labelled A–D. Make as many copies of each model as needed.

Each worksheet and answer key occupies one A4 page. A content-fit check blocks printing if a sheet would overflow at readable type sizes. The dialog explains how to reduce the content; it never silently clips the sheet. Answer cells remain marked when browser background graphics are disabled.

Preparing or cancelling a batch leaves the activity, saved draft and pupil progress intact. Models remain available for repeat printing while the page holds the same activity; generating or loading another activity invalidates the batch. A reload clears the temporary batch. Preparation yields between attempts, supports cancellation, and stops after three attempts per new model or a six-second generation budget. A failed batch cannot be printed partially. The existing single worksheet and answer-key actions remain available.

## If the Browser Shows Warnings with `file://`

Some browsers add extra restrictions when a local HTML file is opened with a double click. If you see warnings in the console, start a very simple local server:

```bash
cd word-search
python3 -m http.server 8000
```

Then open `http://localhost:8000` in the browser.

## Features

- Automatic grid generation.
- Easy, medium, and hard difficulty levels.
- Mouse, touch, and keyboard solving.
- Review step before opening the student area, sharing, or printing.
- Category-first vocabulary library and grouped advanced settings.
- Locally hosted Andika typeface for clear classroom reading.
- Teacher view with visible solution and quick actions.
- Optional timer and hint system.
- Shareable links that preserve the exact puzzle.
- Print or save as PDF from the browser.
- Optional Google Forms result submission.
- Catalan, Spanish, and English UI.

## Tests

1. Install dependencies:

```bash
pnpm install
pnpm exec playwright install chrome webkit
```

2. Run unit tests:

```bash
pnpm test:unit
```

3. Run static analysis:

```bash
pnpm lint
```

4. Verify the generated Spanish and English pages:

```bash
pnpm check:locales
pnpm check:offline
```

5. Run headless E2E tests:

```bash
pnpm test:e2e
```

The suite runs Chrome and Playwright WebKit, including keyboard, touch, responsive and accessibility cases. A dedicated `ipad-webkit` project tests an iPad device profile in portrait and landscape. WebKit is engine coverage, not a test on a physical iPad or the branded Safari app. PDF generation and service-worker-specific tests run on Chromium only. Use `--project=chromium`, `--project=webkit` or `--project=ipad-webkit` to select a project. Physical Safari verification is **pending**; use the [iPad classroom check](docs/ipad-classroom-check.md) when a device is available.

6. Run the full quality suite:

```bash
pnpm test
```

### Coverage

- `tests/unit/*`: puzzle logic, app helper logic, modal focus trapping, translation integrity, and data consistency.
- `tests/e2e/accessibility.spec.js`: Axe checks for teacher, active student, and completion states, each modal while open, plus tab keyboard behavior.
- `tests/e2e/student-flow.spec.js`: real teacher/student flow, start overlay, timer, reset, and return from teacher view.
- `tests/e2e/share-hint-form.spec.js`: shared links, hints, student form flow, and malformed shared URLs.
- `tests/e2e/beginner-flow.spec.js`: beginner examples in all three languages, exact shared puzzles, small screens, and two-letter selection with touch and keyboard.
- `tests/e2e/classroom-print.spec.js`: A4 worksheet and answer-key PDFs for 8×8 and 16×16 grids in all three languages, each checked for a single page.
- `tests/e2e/design-polish.spec.js`: compact progress through completion, responsive board sizing with long titles, and keyboard navigation from successful creation or validation errors.
- `tests/e2e/recovery-hints.spec.js`: incomplete drafts, pending changes, exact local recovery, pupil handoff, staged hints, storage failures, and accessibility of the new states.
- `tests/e2e/audit-regressions.spec.js`: numbered examples, alternate word occurrences and inverse words, exact selection recovery, older/invalid progress, malformed links and clearing invalid input.
- `tests/e2e/offline-updates.spec.js`: two incompatible releases served from an isolated in-memory server, waiting for every tab, offline reopening, interrupted downloads, integrity failures, retries, progress retention and preservation of other applications' caches.
- `tests/e2e/print-variants.spec.js`: 2–4 versions in all languages, paired answer keys, A4 PDFs, repeat printing, unchanged pupil progress, cancellation/failure, overflow handling, narrow screens, accessibility and local files.
- `tests/e2e/tablet.spec.js`: iPad WebKit profile with real tap input, viewport orientation changes, hints, exact progress recovery and the versions dialog in all three languages. These checks do not emulate the native virtual keyboard, physical finger dragging or Safari's system print sheet.

## CI

- GitHub Actions audits high-severity dependencies, then runs ESLint, generated-page/manifest checks, unit tests, and Chrome/WebKit E2E/accessibility tests on every `push` to `main` or `master` and on every `pull request`.
- The workflow lives in `.github/workflows/test.yml`.
