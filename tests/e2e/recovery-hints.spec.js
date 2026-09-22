const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const core = require("../../core.js");
const { generatePuzzle, installPausedClock, startStudentSession, solvePlacement, getGridLetters, unlockTeacherView } = require("./helpers");

const wordsText = "gat\ngos\npeix";
function placements() {
  return core.buildPuzzleData(core.parseWords(wordsText).words, "8", "easy", {}, { random: () => 0 }).placements;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Math.random = () => 0;
    window.__sharedUrl = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async text => { window.__sharedUrl = text; } },
    });
  });
});

for (const lang of ["ca", "es", "en"]) {
  test(`an incomplete draft survives reload in ${lang}`, async ({ page }) => {
    await page.goto(`/index.html?lang=${lang}`);
    await page.locator("#title-input").fill("La classe");
    // Incomplete and invalid lines still belong to the teacher's draft.
    await page.locator("#words-input").fill("gat\ng\n");
    await page.locator('[data-preset="mitja"]').click();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.locator("#title-input")).toHaveValue("La classe");
    await expect(page.locator("#words-input")).toHaveValue("gat\ng\n");
    await expect(page.locator("#size-input")).toHaveValue("12");
    await expect(page.locator("#hints-input")).toHaveValue("3");
    await expect(page.locator("#draft-status")).toBeVisible();
    await expect(page.locator("#teacher-ready-card")).toBeHidden();
  });
}

test("pending edits block stale actions, survive reload, and clear after regeneration", async ({ page }) => {
  await generatePuzzle(page, { words: wordsText, size: "8", timer: "0", openStudent: false });
  await page.locator("#title-input").fill("Fruites");
  await page.locator("#words-input").fill("pera\npoma\nkiwi");
  await expect(page.locator("#teacher-pending-changes")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  for (const id of ["teacher-share-button", "teacher-print-button", "teacher-print-solution-button", "teacher-open-student-button"]) {
    await expect(page.locator(`#${id}`)).toBeDisabled();
  }
  const studentTab = page.locator("#tab-student");
  await expect(studentTab).toBeDisabled();
  await studentTab.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#section-teacher")).toBeVisible();
  await expect(studentTab).toBeFocused();
  await page.reload();
  await expect(page.locator("#title-input")).toHaveValue("Fruites");
  await expect(page.locator("#teacher-ready-topic")).toHaveText("Animals del mar");
  await expect(page.locator("#teacher-pending-changes")).toBeVisible();
  await page.locator("#generate-button").click();
  await expect(page.locator("#teacher-pending-changes")).toBeHidden();
  await page.locator("#teacher-share-button").click();
  const shared = await page.evaluate(() => window.__sharedUrl);
  const config = core.decodePuzzleConfig(new URL(shared).searchParams.get("p"));
  expect(config.title).toBe("Fruites");
  expect(config.words).toBe("pera\npoma\nkiwi");
});

test("library, presets and form settings also mark a generated activity as pending", async ({ page }) => {
  await generatePuzzle(page, { words: wordsText, size: "8", timer: "0", openStudent: false });
  await page.locator("#title-input").fill("Changed");
  await page.locator("#title-input").fill("Animals del mar");
  await expect(page.locator("#teacher-pending-changes")).toBeHidden();
  await page.locator("#lib-results button:not([disabled])").first().click();
  await expect(page.locator("#teacher-pending-changes")).toBeVisible();
  await page.locator("#generate-button").click();
  await page.locator('[data-preset="facil"]').click();
  await expect(page.locator("#teacher-pending-changes")).toBeVisible();
  await page.locator("#generate-button").click();
  await page.locator("#form-config-details summary").click();
  await page.locator("#form-template-input").fill("https://docs.google.com/forms/d/e/test/viewform?entry.1=Name&entry.2=Score");
  await expect(page.locator("#teacher-share-button")).toBeDisabled();
});

test("a local game resumes the exact grid, time and hints, then starts fresh for another pupil", async ({ page }) => {
  await installPausedClock(page);
  await generatePuzzle(page, { words: wordsText, size: "8", timer: "300", hints: "3" });
  await startStudentSession(page);
  const grid = await getGridLetters(page);
  await solvePlacement(page, placements()[0]);
  await page.locator("#hint-button").click();
  await page.locator("#hint-word-select").selectOption(placements()[1].wordId);
  await page.locator("#hint-start-button").click();
  await page.clock.runFor(10000);
  await page.reload();
  await expect(page.locator("#student-start-button")).toHaveText("Continuar");
  await expect(page.locator("#new-student-button")).toBeVisible();
  await expect(page.locator("#student-start-timer")).toHaveText("04:50");
  await expect(page.locator("#student-start-hints")).toHaveText("2");
  await expect(page.locator("#progress-text")).toHaveText("1 / 3");
  expect(await getGridLetters(page)).toEqual(grid);
  await startStudentSession(page);
  await expect(page.locator("#hint-button")).toContainText("2");
  await page.clock.runFor(2000);
  await expect(page.locator("#timer-display")).toHaveText("04:48");
  await page.reload();
  await page.locator("#new-student-button").click();
  await expect(page.locator("#student-start-overlay")).toBeHidden();
  await expect(page.locator("#progress-text")).toHaveText("0 / 3");
  await expect(page.locator("#timer-display")).toHaveText("05:00");
  await expect(page.locator("#hint-button")).toContainText("3");
  expect(await getGridLetters(page)).toEqual(grid);
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem("word-search-progress-v1")));
  expect(progress.hintStages).toEqual({});
});

test("hints guide a chosen word in two stages and do not charge for repeating clues", async ({ page }) => {
  await page.clock.install();
  await generatePuzzle(page, { words: wordsText, size: "8", timer: "0", hints: "3" });
  await startStudentSession(page);
  const target = placements()[1];
  await page.locator('[data-row="7"][data-col="7"]').click();
  await expect(page.locator(".grid-cell.is-anchor")).toHaveCount(1);
  await page.locator("#hint-button").click();
  await page.locator("#hint-word-select").selectOption(target.wordId);
  await expect(page.locator("#hint-direction-button")).toBeDisabled();
  await page.locator("#hint-start-button").click();
  await expect(page.locator(".grid-cell.is-anchor")).toHaveCount(0);
  await expect(page.locator(".grid-cell.is-hint")).toHaveCount(1);
  await expect(page.locator("#board-status")).toContainText(target.display);
  await expect(page.locator("#hint-button")).toContainText("2");
  await page.clock.runFor(4100);
  await page.locator("#hint-button").click();
  await expect(page.locator("#hint-word-select")).toHaveValue(target.wordId);
  await page.locator("#hint-direction-button").click();
  await expect(page.locator(".grid-cell.is-hint")).toHaveCount(2);
  await expect(page.locator("#board-status")).toContainText("cap avall ↓");
  await expect(page.locator("#hint-button")).toContainText("1");
  await page.reload();
  await startStudentSession(page);
  await page.locator("#hint-button").click();
  await page.locator("#hint-word-select").selectOption(target.wordId);
  await page.locator("#hint-direction-button").click();
  await expect(page.locator("#hint-button")).toContainText("1");
  await expect(page.locator(".grid-cell.is-hint")).toHaveCount(2);
  await solvePlacement(page, target);
  await page.clock.runFor(4100);
  await page.locator("#hint-button").click();
  await expect(page.locator(`#hint-word-select option[value="${target.wordId}"]`)).toHaveCount(0);
});

test("the hint picker works at 320px with keyboard navigation and no Axe violations", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await generatePuzzle(page, { words: wordsText, size: "8", timer: "0" });
  await startStudentSession(page);
  await page.keyboard.press("h");
  await expect(page.locator("#hint-word-select")).toBeFocused();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  const box = await page.locator("#hint-modal .modal-content").boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#hint-close-button")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#hint-modal")).toBeHidden();
  await expect(page.locator('#puzzle-grid .grid-cell[tabindex="0"]')).toBeFocused();
});

test("editing a shared puzzle recovers pending work instead of reloading the original link", async ({ page }) => {
  await generatePuzzle(page, { words: wordsText, size: "8", timer: "0", openStudent: false });
  await page.locator("#teacher-share-button").click();
  await page.goto(await page.evaluate(() => window.__sharedUrl));
  await unlockTeacherView(page);
  await page.locator("#title-input").fill("Nova activitat");
  await page.reload();
  await expect(page.locator("#title-input")).toHaveValue("Nova activitat");
  await expect(page.locator("#teacher-pending-changes")).toBeVisible();
  await page.locator("#generate-button").click();
  expect(new URL(page.url()).searchParams.has("p")).toBe(false);
  await page.reload();
  await expect(page.locator("#teacher-ready-topic")).toHaveText("Nova activitat");
  await expect(page.locator("#teacher-share-button")).toBeEnabled();
});

test("blocked storage reports the problem without preventing play", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new DOMException("Unavailable", "QuotaExceededError"); };
  });
  await generatePuzzle(page, { words: wordsText, size: "8", timer: "0", openStudent: false });
  await expect(page.locator("#draft-status")).toHaveClass(/is-error/);
  await page.locator("#teacher-open-student-button").click();
  await startStudentSession(page);
  await solvePlacement(page, placements()[0]);
  await expect(page.locator("#progress-text")).toHaveText("1 / 3");
});

for (const finished of ["complete", "expired"]) {
  test(`a ${finished} game can be reviewed or reset for a new pupil after reload`, async ({ page }) => {
    // Axe needs its own timers to run; pause after the accessibility check,
    // before starting the new pupil's countdown.
    await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
    await generatePuzzle(page, { words: wordsText, size: "8", timer: "300", hints: "3" });
    await startStudentSession(page);
    if (finished === "complete") {
      for (const placement of placements()) await solvePlacement(page, placement);
    } else {
      await page.clock.runFor(300000);
    }
    await expect(page.locator("#completion-message")).toBeVisible();
    await page.reload();
    await expect(page.locator("#student-start-button")).toHaveText("Continuar");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.locator("#student-start-button").click();
    await expect(page.locator("#completion-message")).toBeVisible();
    await page.reload();
    await page.clock.pauseAt(new Date("2026-01-01T01:00:00Z"));
    await page.locator("#new-student-button").click();
    await expect(page.locator("#completion-message")).toBeHidden();
    await expect(page.locator("#progress-text")).toHaveText("0 / 3");
    await expect(page.locator("#timer-display")).toHaveText("05:00");
  });
}

test("another pupil is asked for their own name after restarting a completed game", async ({ page }) => {
  await page.addInitScript(() => { window.open = () => null; });
  await generatePuzzle(page, {
    words: wordsText, size: "8", timer: "0", hints: "0",
    formTemplate: "https://docs.google.com/forms/d/e/test/viewform?entry.10=Nom&entry.20=Cognoms&entry.30=Resultat&entry.40=Tema",
  });
  await startStudentSession(page);
  for (const placement of placements()) await solvePlacement(page, placement);
  await page.locator("#send-results-button").click();
  await page.locator("#student-nom-input").fill("Ada");
  await page.locator("#student-cognoms-input").fill("Lovelace");
  await page.locator('#student-name-form button[type="submit"]').click();
  await page.locator("#play-again-button").click();
  await startStudentSession(page);
  for (const placement of placements()) await solvePlacement(page, placement);
  await page.locator("#send-results-button").click();
  await expect(page.locator("#student-name-modal")).toBeVisible();
  await expect(page.locator("#student-nom-input")).toBeEmpty();
  await expect(page.locator("#student-cognoms-input")).toBeEmpty();
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  expect(stored).not.toContain("Ada");
  expect(stored).not.toContain("Lovelace");
});

test("the last hint can be repeated but cannot reveal new information", async ({ page }) => {
  await page.clock.install();
  await generatePuzzle(page, { words: wordsText, size: "8", timer: "0", hints: "1" });
  await startStudentSession(page);
  await page.locator("#hint-button").click();
  await page.locator("#hint-start-button").click();
  await expect(page.locator("#hint-button")).toContainText("0");
  await page.clock.runFor(4100);
  await page.locator("#hint-button").click();
  await expect(page.locator("#hint-start-button")).toBeEnabled();
  await expect(page.locator("#hint-direction-button")).toBeDisabled();
  await page.locator("#hint-word-select").selectOption(placements()[1].wordId);
  await expect(page.locator("#hint-start-button")).toBeDisabled();
});
