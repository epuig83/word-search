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
| 10 | `vendor/canvas-confetti.browser.js` | `globalThis.confetti` | Celebration animation |
| 11 | `app.js` | (IIFE, no export) | Orchestrator: wires controllers, owns `state`, localized metadata, sharing, and timer |

Modules use a UMD-style factory so they can also be `require()`-ed from Node for unit tests. Each `app-*.js` exports a `create*Controller(deps)` factory; `app.js` instantiates them and passes shared state/DOM refs.

### State

All mutable state lives in a single `state` object in `app.js`. It includes `puzzle`, found word/placement sets, colors, mode, active tab, custom samples, teacher PIN, visual preferences, timer fields, hints, student name, focused cell, and input mode. Puzzle-specific state is reset by `resetPuzzleProgress()`.

### Puzzle Generation (`core.js`)

`buildPuzzleData` runs randomized backtracking up to `MAX_GENERATION_ATTEMPTS` (180) times to place all words. If the longest word exceeds grid size it throws `WORD_TOO_LONG`; any other failure surfaces to the user as the generic `msg_puzzle_error` string. Available directions depend on difficulty (easy: →↓, medium: + ↘, hard: all 8). Empty cells filled with random letters afterwards.

### Word Selection (`app-board.js`)

Drag or two-tap: `buildSelectionPath` (in `app-helpers.js`) interpolates a straight/diagonal line between two cells; `checkMatch` (in `app-board.js`) looks up the resulting key in `state.puzzle.placements` (both forward and reverse). Pointer events are used for mouse+touch+pen.

### Persistence

- `word-search-custom-samples-v1` — user-created sample templates (per language). Corruption falls back to empty collection.
- `word-search-teacher-pin-v1` — teacher PIN. Fallback: `"1234"`.
- `word-search-theme-v1` — student-picked visual theme (`pergami`/`ocea`/`bosc`/`espai`). Fallback: `"pergami"`. Themes only retint palette vars; high-contrast mode overrides them.
- `word-search-progress-v1` — single most-recent student progress record `{ key, foundWordIds[], timerSecondsLeft, timerExpired, hintsRemaining }`. `key` is `puzzleProgressKey()` (the encoded share config, including grid snapshot and placement paths). `tryLoadFromUrl()` auto-resumes by word id when a shared link's key matches; `resetPuzzleProgress()` and completion clear it.

### URL Sharing

Full puzzle config is base64-encoded into a `?p=` query parameter (`encodePuzzleConfig`/`decodePuzzleConfig` in `core.js`, version `SHARED_PUZZLE_VERSION = 2`). Loaded at startup by `tryLoadFromUrl()`; on decode failure, rolls back to previous state and shows `msg_link_error`. Public language variants use generated `es.html` and `en.html` pages with localized server-rendered metadata; shared puzzle URLs keep their embedded language.

### i18n

HTML elements use `data-t="key"` attributes. `updateLanguage()` walks all such elements and replaces their text content with the current language's string from `WORD_SEARCH_I18N`; it also updates canonical, Open Graph, Twitter, and JSON-LD metadata. Strings may contain `{placeholder}` tokens (e.g., `{word}`, `{row}`).

## Tests

- **Unit** (`tests/unit/`): `node --test` on `core`, `core-edge`, `app-storage`, `app-logic`, `app-session`, `i18n`, `data`.
- **E2E** (`tests/e2e/`): Playwright (Chromium) on student flow, sharing/forms, responsive target sizes, file-protocol compatibility, and Axe accessibility states. Static server at `scripts/static-server.js` on `:4173`.

## Key Constraints

- No external runtime dependencies beyond the vendored `canvas-confetti`; the app must work offline from `file://`.
- `index.html` is the source for generated `es.html`/`en.html`; run `pnpm build:locales` after changing shared markup and `pnpm check:locales` to verify synchronization.
- **i18n invariant:** the three language blocks in `i18n.js` must have the **same set of keys** (currently 193 each for `es`/`ca`/`en`). Verify with:
  ```bash
  node -e "require('./i18n.js'); for (const [lang, values] of Object.entries(globalThis.WORD_SEARCH_I18N)) console.log(lang, Object.keys(values).length)"
  ```
- Word normalization (`normalizeWord` in `core.js`) strips accents and uppercases before placement; display keeps original casing.
- Module load order matters: controllers depend on earlier modules being present (see table above).
