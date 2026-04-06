# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

No build step — open `index.html` directly in a browser or serve with:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

There is no linter, test framework, or package manager configured.

## Architecture

Single-page app using 4 plain files loaded in order:

1. `styles.css` — all styling, including CSS custom properties for colors and responsive clamp-based sizing
2. `data.js` — exposes `WORD_SEARCH_DATA` global (vocabulary library + built-in sample puzzles, 3 languages)
3. `i18n.js` — exposes `WORD_SEARCH_I18N` global (all UI strings for `ca`/`es`/`en`); frozen at runtime
4. `app.js` — single IIFE containing all logic, state, and DOM manipulation

### State

All mutable state lives in a single `state` object in `app.js`:
- `puzzle` — current grid + word placements
- `foundWordIds` / `foundPlacementIds` / `foundWordColors` — interactive solving progress
- `mode` — `"teacher"` (solution visible) or `"student"`
- `customSamples` — user-created templates, mirrored to `localStorage`
- `teacherPin` — default `"1234"`, stored in `localStorage`

### Puzzle Generation (`buildPuzzle`)

Randomized backtracking: tries up to `MAX_GENERATION_ATTEMPTS` (180) times to place all words in the grid. Available directions depend on difficulty (easy: →↓, medium: + ↘, hard: all 8). Fills empty cells with random letters after placement succeeds.

### Word Selection

Drag or two-tap: `buildSelectionPath` interpolates a straight/diagonal line between two cells; `checkMatch` looks up the resulting key in `state.puzzle.placements` (both forward and reverse).

### Persistence

- `word-search-custom-samples-v1` — user-created sample templates (per language)
- `word-search-teacher-pin-v1` — teacher PIN

### URL Sharing

Full puzzle config is base64-encoded into a `?p=` query parameter. Loaded at startup if present.

### i18n

HTML elements use `data-t="key"` attributes. `updateLanguage()` walks all such elements and replaces their text content with the current language's string from `WORD_SEARCH_I18N`.

## Key Constraints

- No external dependencies — keep it that way; the app must work offline from a local file
- Three languages must stay in sync: any UI string added to `i18n.js` needs `ca`, `es`, and `en` entries
- Word normalization (`normalizeWord`) strips accents and uppercases before placement; display uses original casing
