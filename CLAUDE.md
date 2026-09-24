# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

No build step — open `index.html` directly in a browser or serve with:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Scripts

```bash
pnpm test            # unit + E2E
pnpm lint            # ESLint static analysis
pnpm test:unit       # node --test tests/unit/*.test.js
pnpm test:e2e        # playwright test (uses scripts/static-server.js on :4173)
pnpm test:e2e:headed # E2E headed
pnpm build:offline  # regenerate content hashes after runtime edits (after build:locales when needed)
pnpm check:offline  # verify the checked-in offline manifest
```

Runtime dependency: only `canvas-confetti` (vendored under `vendor/`). ESLint, Playwright, and Axe are development-only quality tooling.

## Architecture

Single-page app. Files loaded in strict order by `index.html` (all with `defer`):

| Order | File | Exposes | Responsibility |
|------:|------|---------|----------------|
| 1 | `data.js` | `WORD_SEARCH_DATA` | Vocabulary library + built-in puzzle templates + definitions (ca/es/en) |
| 2 | `i18n.js` | `WORD_SEARCH_I18N` | UI, privacy, and metadata strings for ca/es/en; frozen at runtime |
| 3 | `core.js` | `WORD_SEARCH_CORE` | Puzzle generation, word normalization, URL encode/decode |
| 4 | `app-helpers.js` | `WORD_SEARCH_APP_HELPERS` | Formatters, `buildSelectionPath`, sample sanitization, share-URL fallback |
| 5 | `app-storage.js` | `WORD_SEARCH_APP_STORAGE` | `localStorage` wrapper for PIN, samples, language, progress, theme, and contrast |
| 6 | `app-modal.js` | `WORD_SEARCH_APP_MODAL` | `createModalController` — open/close, focus trap |
| 7 | `app-board.js` | `WORD_SEARCH_APP_BOARD` | `createBoardController` — accessible grid/list render, selection, hints, confetti |
| 8 | `app-teacher.js` | `WORD_SEARCH_APP_TEACHER` | `createTeacherController` — teacher form, vocabulary library, sample CRUD |
| 9 | `app-session.js` | `WORD_SEARCH_APP_SESSION` | `createSessionController` — ARIA tabs, PIN modal, student session, event binding |
| 10 | `app-offline.js` | `WORD_SEARCH_APP_OFFLINE` | Offline readiness and waiting-update status |
| 11 | `app-print.js` | `WORD_SEARCH_APP_PRINT` | Bounded variant generation, preview and isolated batch printing |
| 12 | `vendor/canvas-confetti.browser.js` | `globalThis.confetti` | Celebration animation |
| 13 | `app.js` | (IIFE, no export) | Orchestrator: wires controllers, owns `state`, localized metadata, sharing, and timer |

Modules use a UMD-style factory so they can also be `require()`-ed from Node for unit tests. Each `app-*.js` exports a `create*Controller(deps)` factory; `app.js` instantiates them and passes shared state/DOM refs.

### State

All mutable state lives in a single `state` object in `app.js`. It includes `puzzle`, found word/placement sets, colors, mode, active tab, custom samples, teacher PIN, visual preferences, timer fields, hints, student name, focused cell, and input mode. Transient board marks (`boardFlash`, `wrongCells`, `hintCell`) also live here because both render paths rewrite every cell's `className` — a class added with `classList.add` is wiped by the next render. Puzzle-specific state is reset by `resetPuzzleProgress()`.

### Puzzle Generation (`core.js`)

`buildPuzzleData` runs randomized backtracking up to `MAX_GENERATION_ATTEMPTS` (180) times to place all words. If the longest word exceeds grid size it throws `WORD_TOO_LONG`; any other failure surfaces to the user as the generic `msg_puzzle_error` string. Available directions depend on difficulty (easy: →↓, medium: + ↘, hard: all 8). Empty cells filled with random letters afterwards. Generation is bounded by `MAX_GENERATION_MS` (1500) as well as the attempt count, and `parseWords` caps a puzzle at `MAX_WORDS` (60) — both guard the main thread against an oversized word list.

### Word Selection (`app-board.js`)

Drag or two-tap: `buildSelectionPath` (in `app-helpers.js`) interpolates a straight/diagonal line between two cells; `checkMatch` (in `app-board.js`) matches the selected letters to an unfound word, preferring forward then reverse. Any occurrence counts once. `state.foundWordPaths` stores the selected cells without changing the original placements used for hints, answer keys and share identity. A miss sets `state.boardFlash` and `state.wrongCells`. Pointer events are used for mouse+touch+pen.

### Persistence

- `word-search-custom-samples-v1` — user-created sample templates (per language). Corruption falls back to empty collection. Title comparison uses `normalizeSampleTitle` (NFC, trimmed/collapsed spaces, lowercase), not puzzle-letter normalization.
- `word-search-teacher-pin-v1` — teacher PIN. Fallback: `"1234"`.
- `word-search-theme-v1` — student-picked visual theme (`pergami`/`ocea`/`bosc`/`espai`). Fallback: `"pergami"`. Themes only retint palette vars; high-contrast mode overrides them.
- `word-search-progress-v1` — single most-recent student progress record `{ key, foundWordIds[], foundWordPaths?, timerSecondsLeft, timerExpired, hintsRemaining, started, hintStages }`. `foundWordPaths` maps word IDs to serialized cell paths, validated against geometry and letters on restoration; old/invalid entries fall back to original placements. `key` is `puzzleProgressKey()` (the unchanged share config and snapshot). `tryLoadPuzzle()` restores matching progress; the start overlay offers Continue or New pupil. Reset clears progress, selected paths and result-submission identity.
- `word-search-draft-v1` — incomplete teacher form, settings, and UI language. Saved automatically from both typed and programmatic edits. Does not contain pupil names or the teacher PIN.
- `word-search-activity-v1` — latest puzzle snapshot, the form used to generate it, and the last active tab. Normal visits restore it without regenerating the board. Explicit shared URLs take precedence; editing or regenerating locally removes the old shared URL parameter so reloads recover the draft.
- `state.generatedForm` tracks the generated activity separately from the draft. Pending changes block opening/sharing/printing until regenerated or reverted. `state.formTemplate` belongs to the generated activity, not the live input.
- `state.hintStages` tracks the highest revealed clue per word (1 = first letter, 2 = direction). New clues consume limited hints; repeats are free. The picker preserves word definitions as separate actions.
- Printable versions are temporary controller state, never persisted over the classroom activity. A is the current puzzle; B–D use the same words, actual size and difficulty with different placements. Printing uses its own DOM container and does not switch game mode; the single worksheet and answer key reuse the same sheet (`printSheet`), and answer keys ring each word with an SVG outline instead of shading cells. Closing or cancelling a print clears only the print container; models remain reusable until the activity changes or the page reloads.

### URL Sharing

Full puzzle config is base64-encoded into a `?p=` query parameter (`encodePuzzleConfig`/`decodePuzzleConfig` in `core.js`, version `SHARED_PUZZLE_VERSION = 2`). Loaded at startup by `tryLoadPuzzle()`; on decode failure, rolls back to previous state and shows `msg_link_error`. Public language variants use generated `es.html` and `en.html` pages with localized server-rendered metadata; shared puzzle URLs keep their embedded language.

### i18n

HTML elements use `data-t="key"` attributes. `updateLanguage()` walks all such elements and replaces their text content with the current language's string from `WORD_SEARCH_I18N`; it also updates canonical, Open Graph, Twitter, and JSON-LD metadata. Strings may contain `{placeholder}` tokens (e.g., `{word}`, `{row}`).

## Tests

- **Unit** (`tests/unit/`): `node --test` on `core`, `core-edge`, `app-storage`, `app-logic`, `app-modal`, `app-session`, `i18n`, `data`.
- **E2E** (`tests/e2e/`): Playwright Chrome and WebKit on student flow, sharing/forms, responsive target sizes, file-protocol compatibility, and Axe accessibility states. PDF and service-worker tests are Chromium-only. Static server at `scripts/static-server.js` on `:4173`; update tests use isolated in-memory release servers.
- **Tablet**: `ipad-webkit` runs `tablet.spec.js` with an iPad profile, tap input and portrait/landscape viewports. This is emulation; native Safari keyboard, physical dragging and system printing still require the [physical iPad check](docs/ipad-classroom-check.md).

### Offline Releases

`scripts/generate-offline-manifest.js` owns the shell asset list and generates `offline-manifest.js` with SHA-256 integrity per file and a revision that also includes `sw.js`. The worker verifies downloads before installing a revision-specific cache, then serves only that revision. It neither skips waiting nor claims already loaded pages. Updates activate after every controlled tab closes. Register with `updateViaCache: "none"` so imported manifests are checked too. Cleanup preserves caches outside this app's scoped prefix, except its known `word-search-vN` legacy caches. Never return arbitrary network versions for a cached shell file or replace the active cache during revalidation.

`OFFLINE_STATUS` requests use a transferred message port. The active worker returns `{ revision, complete }` after checking the presence of all its cached assets, without fetching or repairing them. The panel treats missing files, inaccessible caches and a three-second timeout (including legacy workers) as unconfirmed. A waiting update is an independent notice; a failed candidate must not turn a complete active release into an error.

## Key Constraints

- No external runtime dependencies beyond the vendored `canvas-confetti`; the app must work offline from `file://`.
- `index.html` is the source for generated `es.html`/`en.html`; run `pnpm build:locales` after changing shared markup and `pnpm check:locales` to verify synchronization.
- **i18n invariant:** the three language blocks in `i18n.js` must have the **same set of keys** for `es`/`ca`/`en`. Verify with:
  ```bash
  node -e "require('./i18n.js'); for (const [lang, values] of Object.entries(globalThis.WORD_SEARCH_I18N)) console.log(lang, Object.keys(values).length)"
  ```
- Word normalization (`normalizeWord` in `core.js`) strips accents and uppercases before placement; display keeps original casing.
- Module load order matters: controllers depend on earlier modules being present (see table above).
