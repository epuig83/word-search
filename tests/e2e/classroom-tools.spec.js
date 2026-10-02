const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const core = require("../../core.js");
const { generatePuzzle, installPausedClock, startStudentSession, solvePlacement } = require("./helpers");

const FORM = "https://docs.google.com/forms/d/e/ABC/viewform?entry.1=n&entry.2=c&entry.3=r&entry.4=t";

// "sol" has a teacher definition with a comma that overrides the library's; "luna" keeps the library's.
function sharedPath(overrides = {}) {
  return `/es.html?p=${encodeURIComponent(core.encodePuzzleConfig({
    version: 2, title: "Ciencias", words: "sol: Estrella que nos da luz, y calor.\nluna", difficulty: "easy",
    size: "8", lang: "es", timer: 0, hints: -1, formTemplate: FORM,
    gridRows: ["SOLXXXXX", "LUNAXXXX", ...Array(6).fill("XXXXXXXX")],
    placementPaths: ["0.0,0.1,0.2", "1.0,1.1,1.2,1.3"], ...overrides,
  }))}`;
}

const SOL = { cells: [{ row: 0, col: 0 }, { row: 0, col: 2 }] };
const LUNA = { cells: [{ row: 1, col: 0 }, { row: 1, col: 3 }] };

function stubSpeech(page, voices) {
  return page.addInitScript(list => {
    window.__spoken = [];
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => list,
        speak: utterance => window.__spoken.push({ text: utterance.text, lang: utterance.lang, voice: utterance.voice?.name }),
        cancel() {},
        addEventListener() {},
      },
    });
  }, voices);
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("untimed play time survives a reload and reaches the form with the hints used", async ({ page }) => {
  await installPausedClock(page);
  await page.addInitScript(() => { window.__opened = []; window.open = url => { window.__opened.push(url); return null; }; });
  await page.goto(sharedPath());
  await startStudentSession(page);

  await page.locator("#hint-button").click();
  await page.locator("#hint-word-select").selectOption("SOL");
  await page.locator("#hint-start-button").click();
  await solvePlacement(page, SOL);
  await page.clock.runFor(30_000);
  await page.reload();
  await page.locator("#student-start-button").click();
  await page.clock.runFor(40_000);
  await solvePlacement(page, LUNA);

  await expect(page.locator("#completion-time")).toHaveText("Tiempo: 01:10");
  await page.locator("#send-results-button").click();
  await expect(page.locator("#student-name-text")).toHaveText("Escribe tu nombre para enviar tu resultado.");
  await page.locator("#student-nom-input").fill("Ada");
  await page.locator("#student-name-modal button[type=submit]").click();

  const opened = await page.evaluate(() => window.__opened);
  expect(new URL(opened[0]).searchParams.get("entry.3")).toBe("2/2 · 01:10 · 1 pista");
  await expect(page.locator("#board-status")).toHaveText(/Pulsa «Enviar»/);
});

test("a teacher definition from a shared link wins over the library's", async ({ page }) => {
  await page.goto(sharedPath());
  await startStudentSession(page);
  await expect(page.locator("#word-list")).toContainText("sol");
  await expect(page.locator("#word-list")).not.toContainText("Estrella");

  await page.getByRole("button", { name: "sol" }).click();
  await expect(page.locator("#word-definition-text")).toHaveText("Estrella que nos da luz, y calor.");
  await page.locator("#word-definition-close").click();
  await page.getByRole("button", { name: "luna" }).click();
  await expect(page.locator("#word-definition-text")).toHaveText("Satélite que gira alrededor de la Tierra.");
});

test("teacher definitions keep library chips marked and survive regenerating", async ({ page }) => {
  await generatePuzzle(page, { words: "gat: Animal que miola, petit i suau.\ngos\nvaca", timer: "0", openStudent: false });
  await expect(page.locator(".lib-word-chip", { hasText: /^gat$/ })).toHaveClass(/is-added/);
  await expect(page.locator("#words-count")).toContainText("3");
  await expect(page.locator("#words-feedback")).not.toContainText("gat");

  await page.reload();
  await page.locator("#teacher-open-student-button").click();
  await startStudentSession(page);
  await page.getByRole("button", { name: "gat" }).click();
  await expect(page.locator("#word-definition-text")).toHaveText("Animal que miola, petit i suau.");
});

test("Listen reads the word and definition with a voice in the puzzle's language", async ({ page }) => {
  await stubSpeech(page, [
    { lang: "es-ES", name: "Grandpa (Spanish (Spain))", localService: true },
    { lang: "es-ES", name: "Mónica", localService: true },
    { lang: "en-GB", name: "Daniel", localService: true },
  ]);
  await page.goto(sharedPath());
  await startStudentSession(page);
  await page.getByRole("button", { name: "sol" }).click();
  await expect(page.locator("#word-definition-listen")).toBeVisible();
  const results = await new AxeBuilder({ page }).include("#word-definition-modal").analyze();
  expect(results.violations).toEqual([]);

  await page.locator("#word-definition-listen").click();
  expect(await page.evaluate(() => window.__spoken)).toEqual([
    { text: "sol. Estrella que nos da luz, y calor.", lang: "es-ES", voice: "Mónica" },
  ]);
});

test("Listen stays hidden without a voice for the puzzle's language", async ({ page }) => {
  await stubSpeech(page, [{ lang: "en-GB", name: "Daniel", localService: true }]);
  await page.goto(sharedPath());
  await startStudentSession(page);
  await page.getByRole("button", { name: "sol" }).click();
  await expect(page.locator("#word-definition-text")).toBeVisible();
  await expect(page.locator("#word-definition-listen")).toBeHidden();
});

test("full screen hides the tabs and gives the board the room @chromium", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Fullscreen API checks run in Chromium");
  await page.setViewportSize({ width: 1366, height: 768 });
  await generatePuzzle(page, { timer: "0" });
  await startStudentSession(page);
  const before = await page.locator("#puzzle-grid").boundingBox();

  await page.locator("#fullscreen-toggle").click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await expect(page.locator("#fullscreen-toggle")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".main-tabs")).toBeHidden();
  expect((await page.locator("#puzzle-grid").boundingBox()).width).toBeGreaterThanOrEqual(before.width);

  await page.locator("#fullscreen-toggle").click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  await expect(page.locator(".main-tabs")).toBeVisible();
});
