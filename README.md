# Word Search Generator for Primary School

Small dependency-free web app for creating word search activities for primary school students.

## Usage

1. Open `index.html` in the laptop browser.
2. Enter a topic and a list of words, or use the side library to add vocabulary.
3. Click `Generate new puzzle` in the teacher view, or `Generate and open student view` to jump straight into the student area.
4. Students can solve the puzzle with mouse, touch, or keyboard (`arrow keys` + `Enter`).
5. When the activity is ready, use `Share` or `Print / PDF`.

## Editable Data

- Built-in vocabulary and guided examples live in `data.js`.
- Translated UI copy lives in `i18n.js`.
- Pure puzzle generation and sharing logic lives in `core.js`.
- Shared app-side helpers live in `app-helpers.js`.
- Browser storage and modal helpers live in `app-storage.js` and `app-modal.js`.
- Board rendering and interaction logic lives in `app-board.js`.
- Teacher examples, saved samples, and library interactions live in `app-teacher.js`.
- Student session, tab switching, and modal flows live in `app-session.js`.
- DOM behavior and app interaction logic live in `app.js`.

## Teacher-Saved Examples

- `Save` does not write back to `data.js`.
- Custom examples are stored in the laptop browser with `localStorage`.
- That means they stay available after refreshing the page on the same computer.
- To move them to another laptop, use `Export JSON` and `Import JSON`.

## Classroom Flow

- The `Activity ready` card summarizes the current puzzle and gives quick access to the student area, sharing, and printing.
- Shared links rebuild the exact same puzzle when opened.
- The student start overlay shows the timer and available hints before the activity begins.
- If you configure Google Forms, students can submit their result from the student view after finishing.
- The teacher PIN is a local classroom lock stored in the browser on that laptop; it is not server-backed authentication.

## If the Browser Shows Warnings with `file://`

Some browsers add extra restrictions when a local HTML file is opened with a double click. If you see warnings in the console, start a very simple local server:

```bash
cd /Users/edgardpuig/repos/rachel_exercises
python3 -m http.server 8000
```

Then open `http://localhost:8000` in the browser.

## Features

- Automatic grid generation.
- Easy, medium, and hard difficulty levels.
- Mouse, touch, and keyboard solving.
- Direct launch into the student area after generation.
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
```

2. Run unit tests:

```bash
pnpm test:unit
```

3. Run headless E2E tests:

```bash
pnpm test:e2e
```

4. Run the full test suite:

```bash
pnpm test
```

### Coverage

- `tests/unit/*`: puzzle logic, app helper logic, translation integrity, and data consistency.
- `tests/e2e/student-flow.spec.js`: real teacher/student flow, start overlay, timer, reset, and return from teacher view.
- `tests/e2e/share-hint-form.spec.js`: shared links, hints, student form flow, and malformed shared URLs.

## CI

- GitHub Actions runs unit and E2E tests on every `push` to `main` or `master` and on every `pull request`.
- The workflow lives in `.github/workflows/test.yml`.
