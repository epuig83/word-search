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
pnpm test:unit       # node --test tests/unit/*.test.js
pnpm test:e2e        # playwright test (uses scripts/static-server.js on :4173)
pnpm test:e2e:headed # E2E headed
```

No linter configured. Runtime deps: only `canvas-confetti` (vendored under `vendor/`).

## Architecture

Single-page app. Files loaded in strict order by `index.html` (all with `defer`):

| Order | File | LOC | Exposes | Responsibility |
|------:|------|----:|---------|----------------|
| 1 | `data.js`        | 879 | `WORD_SEARCH_DATA` | Vocabulary library + built-in puzzle templates + definitions (ca/es/en) |
| 2 | `i18n.js`        | 469 | `WORD_SEARCH_I18N` | UI strings for ca/es/en; frozen at runtime |
| 3 | `core.js`        | 353 | `WORD_SEARCH_CORE` | Puzzle generation, word normalization, URL encode/decode |
| 4 | `app-helpers.js` | 134 | `WORD_SEARCH_APP_HELPERS` | Formatters, `buildSelectionPath`, sample sanitization, share-URL fallback |
| 5 | `app-storage.js` | 97  | `WORD_SEARCH_APP_STORAGE` | `localStorage` wrapper for PIN and custom samples |
| 6 | `app-modal.js`   | 79  | `WORD_SEARCH_APP_MODAL` | `createModalController` — open/close, focus trap |
| 7 | `app-board.js`   | 453 | `WORD_SEARCH_APP_BOARD` | `createBoardController` — grid render, drag/keyboard selection, hints, confetti |
| 8 | `app-teacher.js` | 430 | `WORD_SEARCH_APP_TEACHER` | `createTeacherController` — teacher form, vocabulary library, sample CRUD |
| 9 | `app-session.js` | 289 | `WORD_SEARCH_APP_SESSION` | `createSessionController` — tab switching, PIN modal, global event binding |
| 10 | `vendor/canvas-confetti.browser.js` | — | `globalThis.confetti` | Celebration animation |
| 11 | `app.js`         | 911 | (IIFE, no export) | Orchestrator: wires controllers, owns `state`, handles URL sharing and timer |

Modules use a UMD-style factory so they can also be `require()`-ed from Node for unit tests. Each `app-*.js` exports a `create*Controller(deps)` factory; `app.js` instantiates them and passes shared state/DOM refs.

### State

All mutable state lives in a single `state` object in `app.js` (~L273). ~27 properties including `puzzle`, `foundWordIds`, `foundPlacementIds`, `prevFoundPlacementIds`, `foundWordColors`, `mode` (`"teacher"`/`"student"`), `activeTab`, `customSamples`, `teacherPin` (default `"1234"`), timer fields, hints, `studentName`, `focusedCell`, `lastBoardInputMode`. Reset by `resetPuzzleProgress()` (~L313).

### Puzzle Generation (`core.js`)

`buildPuzzleData` runs randomized backtracking up to `MAX_GENERATION_ATTEMPTS` (180) times to place all words. If the longest word exceeds grid size it throws `WORD_TOO_LONG`; any other failure surfaces to the user as the generic `msg_puzzle_error` string. Available directions depend on difficulty (easy: →↓, medium: + ↘, hard: all 8). Empty cells filled with random letters afterwards.

### Word Selection (`app-board.js`)

Drag or two-tap: `buildSelectionPath` (in `app-helpers.js`) interpolates a straight/diagonal line between two cells; `checkMatch` (in `app-board.js`) looks up the resulting key in `state.puzzle.placements` (both forward and reverse). Pointer events are used for mouse+touch+pen.

### Persistence

- `word-search-custom-samples-v1` — user-created sample templates (per language). Corruption falls back to empty collection.
- `word-search-teacher-pin-v1` — teacher PIN. Fallback: `"1234"`.

### URL Sharing

Full puzzle config is base64-encoded into a `?p=` query parameter (`encodePuzzleConfig`/`decodePuzzleConfig` in `core.js`, version `SHARED_PUZZLE_VERSION = 2`). Loaded at startup by `tryLoadFromUrl()`; on decode failure, rolls back to previous state and shows `msg_link_error`.

### i18n

HTML elements use `data-t="key"` attributes. `updateLanguage()` walks all such elements and replaces their text content with the current language's string from `WORD_SEARCH_I18N`. Strings may contain `{placeholder}` tokens (e.g., `{word}`, `{row}`).

## Tests

- **Unit** (`tests/unit/`): `node --test` on `core`, `core-edge`, `app-storage`, `app-logic`, `app-session`, `i18n`, `data`.
- **E2E** (`tests/e2e/`): Playwright (Chromium) on `student-flow.spec.js` and `share-hint-form.spec.js`. Static server at `scripts/static-server.js` on `:4173`.

## Key Constraints

- No external runtime dependencies beyond the vendored `canvas-confetti`; the app must work offline from `file://`.
- **i18n invariant:** the three language blocks in `i18n.js` must have the **same set of keys** (currently 153 each for `es`/`ca`/`en`). Verify with:
  ```bash
  grep -cE '^\s+[a-z_]+:\s' i18n.js   # 459 total = 153 × 3
  ```
- Word normalization (`normalizeWord` in `core.js`) strips accents and uppercases before placement; display keeps original casing.
- Module load order matters: controllers depend on earlier modules being present (see table above).
