const { test, expect } = require("@playwright/test");
const core = require("../../core.js");
const AxeBuilder = require("@axe-core/playwright").default;
const { startStudentSession, solvePlacement, installPausedClock, unlockTeacherView, generatePuzzle, measureGridVisibility } = require("./helpers");

function activityPath(overrides = {}) {
  return `/es.html#p=${encodeURIComponent(core.encodePuzzleConfig({
    version: 2, title: "Ciencias", words: "sol: Estrella que nos da luz.\nluna: Satélite de la Tierra.",
    difficulty: "easy", size: "8", lang: "es", timer: 0, hints: 3, formTemplate: "",
    gridRows: ["SOLXXXXX", "LUNAXXXX", ...Array(6).fill("XXXXXXXX")],
    placementPaths: ["0.0,0.1,0.2", "1.0,1.1,1.2,1.3"], ...overrides,
  }))}`;
}
const SOL = { cells: [{ row: 0, col: 0 }, { row: 0, col: 2 }] };
const LUNA = { cells: [{ row: 1, col: 0 }, { row: 1, col: 3 }] };

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("definitions and hint choices suspend both clocks and resume without giving extra seconds", async ({ page }) => {
  await installPausedClock(page);
  await page.goto(activityPath({ timer: 300 }));
  await startStudentSession(page);
  for (let i = 0; i < 6; i++) {
    await page.clock.runFor(500);
    await page.locator("#word-list button").first().click();
    const frozen = await page.locator("#timer-display").textContent();
    await page.clock.runFor(12000);
    await expect(page.locator("#timer-display")).toHaveText(frozen);
    await expect(page.locator("#learning-dialog-note")).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await page.clock.runFor(1000);
  await expect(page.locator("#timer-display")).toHaveText("04:56");
  await page.locator("#hint-button").click();
  await page.clock.runFor(60000);
  await expect(page.locator("#timer-display")).toHaveText("04:56");
  await page.locator("#hint-start-button").click();
  await page.clock.runFor(1000);
  await solvePlacement(page, SOL);
  await solvePlacement(page, LUNA);
  await expect(page.locator("#completion-time")).toHaveText("Tiempo: 00:05");
});

test("closing a definition keeps a manual pause and never restarts an expired game", async ({ page }) => {
  await installPausedClock(page);
  await page.goto(activityPath({ timer: 300 }));
  await startStudentSession(page);
  await page.clock.runFor(5000);
  await page.locator("#pause-button").click();
  await page.locator("#word-list button").first().click();
  await expect(page.locator("#word-definition-hint")).toBeHidden();
  await page.clock.runFor(20000);
  await page.locator("#word-definition-close").click();
  await page.clock.runFor(20000);
  await expect(page.locator("#pause-button")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#timer-display")).toHaveText("04:55");
  await page.locator("#pause-button").click();
  await page.clock.runFor(295000);
  await page.locator("#view-board-button").click();
  await page.locator("#word-list button").first().click();
  await expect(page.locator("#word-definition-hint")).toBeHidden();
  await page.locator("#word-definition-close").click();
  await page.clock.runFor(5000);
  await expect(page.locator("#grid-container")).toHaveClass(/is-expired/);
  await expect(page.locator("#pause-button")).toBeHidden();
});

test("manual pauses preserve fractional seconds through resume, reload and expiry", async ({ page }) => {
  await installPausedClock(page);
  await page.goto(activityPath({ timer: 300 }));
  await startStudentSession(page);
  const pause = page.locator("#pause-button");
  for (let i = 0; i < 10; i++) {
    await page.clock.runFor(900);
    await pause.click();
    await page.clock.runFor(500);
    await pause.click();
  }
  await expect(page.locator("#timer-display")).toHaveText("04:51");
  await page.clock.runFor(750);
  await pause.click();
  await page.reload();
  await startStudentSession(page);
  await page.clock.runFor(250);
  await expect(page.locator("#timer-display")).toHaveText("04:50");
  await page.clock.fastForward(290000);
  await expect(page.locator("#grid-container")).toHaveClass(/is-expired/);
});

test("arrow keys keep the focused cell visible across a scrollable board", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await generatePuzzle(page, { size: "16", timer: "0" });
  await startStudentSession(page);
  for (const [key, col] of [["ArrowRight", 15], ["ArrowLeft", 0]]) {
    for (let i = 0; i < 15; i++) await page.keyboard.press(key);
    const cell = page.locator(`#puzzle-grid [data-row="0"][data-col="${col}"]`);
    await expect(cell).toBeFocused();
    await expect(cell).toBeInViewport({ ratio: 1 });
  }
});

test("an untimed game saves only play time when reloaded from a definition", async ({ page }) => {
  await installPausedClock(page);
  await page.goto(activityPath());
  await startStudentSession(page);
  await page.clock.runFor(7000);
  await page.locator("#word-list button").first().click();
  await page.clock.runFor(60000);
  await page.reload();
  await startStudentSession(page);
  await page.clock.runFor(3000);
  await solvePlacement(page, SOL);
  await solvePlacement(page, LUNA);
  await expect(page.locator("#completion-time")).toHaveText("Tiempo: 00:10");
});

test("hints stay visible, direction is immediate, repeats are free and hiding is reversible", async ({ page }) => {
  await installPausedClock(page);
  await page.goto(activityPath({ hints: 2 }));
  await startStudentSession(page);
  await page.locator("#hint-button").click();
  await page.locator("#hint-start-button").click();
  await expect(page.locator("#hint-button")).toHaveText("Pista (1)");
  // Let the temporary board message expire while a learning dialog is open.
  // Closing must restore the persistent clue and usable controls.
  await page.locator("#word-list button").first().click();
  await page.clock.runFor(3000);
  await page.keyboard.press("Escape");
  await expect(page.locator("#active-hint")).toBeVisible();
  await expect(page.locator("#hint-button")).toBeEnabled();
  await page.locator("#hint-button").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#hint-button")).toBeFocused();
  await page.locator("#active-hint-direction").click();
  await expect(page.locator("#hint-button")).toHaveText("Pista (0)");
  await page.clock.runFor(60000);
  await expect(page.locator(".grid-cell.is-hint")).toHaveCount(2);
  await expect(page.locator("#active-hint-text")).toContainText("derecha");
  // Axe schedules asynchronous work; resume the clock after the persistence assertion.
  await page.clock.resume();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.locator("#active-hint-hide").click();
  await expect(page.locator(".grid-cell.is-hint")).toHaveCount(0);
  await expect(page.locator("#hint-button")).toBeFocused();
  await page.locator("#hint-button").click();
  await page.locator("#hint-direction-button").click();
  await expect(page.locator(".grid-cell.is-hint")).toHaveCount(2);
  await expect(page.locator("#hint-button")).toHaveText("Pista (0)");
  await solvePlacement(page, SOL);
  await expect(page.locator("#active-hint")).toBeHidden();
  await expect(page.locator(".grid-cell.is-hint")).toHaveCount(0);
});

test("the definition hint marks the chosen word, keeps the other words hidden and remembers the paid step", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installPausedClock(page);
  await page.goto(activityPath({ version: 3, definitionMode: true, hints: 1, timer: 300 }));
  await startStudentSession(page);
  const moon = page.getByRole("button", { name: "Satélite de la Tierra.", exact: true });
  const request = page.getByRole("button", { name: "Pista para esta palabra" });
  const firstLetter = page.locator('.grid-cell[data-row="1"][data-col="0"]');
  await page.clock.runFor(1000);
  await moon.click();
  await expect(request).toHaveAccessibleDescription("Marcar la primera letra cuesta una pista.");
  await page.clock.runFor(15000);
  await request.focus();
  await page.keyboard.press("Enter");
  await expect(firstLetter).toBeFocused();
  await expect(firstLetter).toBeInViewport();
  await expect(firstLetter).toHaveClass(/is-hint/);
  await expect(page.locator("#active-hint-text")).toContainText("Satélite de la Tierra.");
  await expect(page.locator("#active-hint-text")).not.toContainText(/luna/i);
  await expect(page.locator("#timer-display")).toHaveText("04:59");
  await expect(page.locator("#hint-button")).toHaveText("Pista (0)");
  await expect(page.locator("#active-hint-direction")).toBeDisabled();
  await page.clock.runFor(1000);
  await expect(page.locator("#timer-display")).toHaveText("04:58");

  await page.reload();
  await startStudentSession(page);
  await page.getByRole("button", { name: "Estrella que nos da luz.", exact: true }).click();
  await expect(request).toBeDisabled();
  await expect(request).toHaveAccessibleDescription("Ya has usado todas las pistas.");
  await page.keyboard.press("Escape");
  await moon.click();
  await expect(request).toHaveAccessibleDescription("Volver a ver esta pista es gratis.");
  await request.click();
  await expect(firstLetter).toBeFocused();
  await expect(page.locator("#hint-button")).toHaveText("Pista (0)");
  await solvePlacement(page, LUNA);
  await page.locator("#word-list .is-found button").click();
  await expect(page.locator("#word-definition-hint")).toBeHidden();
  await page.keyboard.press("Escape");
  await solvePlacement(page, SOL);
  await page.locator("#review-words-button").click();
  await expect(page.locator("#word-definition-title")).toHaveText("luna");
  await expect(page.locator("#word-definition-hint")).toBeHidden();
  await page.locator("#word-review-next").click();
  await expect(page.locator("#word-definition-title")).toHaveText("sol");
});

for (const lang of ["ca", "es", "en"]) {
  test(`completion review in ${lang} preserves the result and the repeat uses the same board`, async ({ page }) => {
    await page.goto(activityPath({ lang }));
    await startStudentSession(page);
    await solvePlacement(page, SOL);
    await solvePlacement(page, LUNA);
    const saved = await page.evaluate(() => localStorage.getItem("word-search-progress-v1"));
    const grid = await page.locator(".grid-cell").allTextContents();
    await page.locator("#review-words-button").click();
    await expect(page.locator("#word-definition-title")).toHaveText("sol");
    await expect(page.locator("#word-review-progress")).toContainText("1");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.locator("#word-review-next").click();
    await expect(page.locator("#word-definition-title")).toHaveText("luna");
    await expect(page.locator("#word-definition-title")).toBeFocused();
    await page.locator("#word-review-next").click();
    await expect(page.locator("#review-words-button")).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem("word-search-progress-v1"))).toBe(saved);
    await page.locator("#review-words-button").click();
    await page.keyboard.press("Escape");
    await expect(page.locator("#completion-message")).toBeVisible();
    await page.locator("#play-again-button").click();
    await expect(page.locator("#progress-text")).toHaveText("0 / 2");
    expect(await page.locator(".grid-cell").allTextContents()).toEqual(grid);
  });
}

test("review adapts to one definition and is absent when no word has a definition", async ({ page }) => {
  for (const defined of [true, false]) {
    await page.goto(activityPath({ words: `${defined ? "xyz: Una palabra de prueba." : "xyz"}\nqrst`,
      gridRows: ["XYZXXXXX", "QRSTXXXX", ...Array(6).fill("XXXXXXXX")] }));
    await startStudentSession(page);
    await solvePlacement(page, SOL);
    await solvePlacement(page, LUNA);
    if (defined) {
      await page.locator("#review-words-button").click();
      await expect(page.locator("#word-review-progress")).toHaveText("Palabra 1 de 1");
      await expect(page.locator("#word-review-next")).toHaveText("Terminar repaso");
      await page.locator("#word-review-next").click();
    } else {
      await expect(page.locator("#review-words-button")).toBeHidden();
      await expect(page.locator("#completion-review-note")).toBeHidden();
    }
  }
});

test("the teacher previews the exact board and solution without changing a pupil's game", async ({ page }) => {
  await page.goto(activityPath());
  await startStudentSession(page);
  await solvePlacement(page, SOL);
  await unlockTeacherView(page);
  const progress = await page.evaluate(() => localStorage.getItem("word-search-progress-v1"));
  await expect(page.locator("#teacher-preview")).toHaveAttribute("open", "");
  expect(await page.locator(".teacher-preview-cell").allTextContents()).toEqual(await page.locator(".grid-cell").allTextContents());
  await page.locator("#teacher-preview-solution").click();
  await expect(page.locator(".teacher-preview-cell.is-solution")).toHaveCount(7);
  await expect(page.locator(".grid-cell.is-solution")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("word-search-progress-v1"))).toBe(progress);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.locator("#title-input").fill("Tema cambiado");
  await expect(page.locator("#teacher-preview")).toBeHidden();
  await page.locator("#generate-button").click();
  await expect(page.locator("#teacher-preview")).toBeVisible();
  await expect(page.locator("#teacher-preview-solution")).toHaveAttribute("aria-pressed", "false");
});

test("a 16 by 16 tablet board has roomy cells and keeps the word list above it", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await generatePuzzle(page, { size: "16", timer: "0" });
  await startStudentSession(page);
  await expect.poll(async () => (await measureGridVisibility(page)).minCellWidth).toBeGreaterThanOrEqual(40);
  const metrics = await measureGridVisibility(page);
  expect(metrics.clippedCells).toBe(0);
  expect(metrics.isHorizontallyScrollable).toBe(false);
  const words = await page.locator("#word-list").boundingBox();
  const board = await page.locator("#puzzle-grid").boundingBox();
  expect(words.y + words.height).toBeLessThan(board.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("a found word opens its definition from the centre and the edge of its tile", async ({ page }) => {
  await page.goto(activityPath());
  await startStudentSession(page);
  await solvePlacement(page, SOL);
  const tile = page.locator("#word-list li").first();
  await expect(tile).toHaveClass(/is-found/);
  // Real coordinates exercise hit testing, including the decorative strike.
  for (const edge of [false, true]) {
    const box = await tile.boundingBox();
    await page.mouse.click(edge ? box.x + 5 : box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator("#word-definition-modal")).toBeVisible();
    await page.locator("#word-definition-close").click();
  }
  await solvePlacement(page, LUNA);
  await page.locator("#view-board-button").click();
  await tile.locator("button").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#word-definition-title")).toHaveText("sol");
});
