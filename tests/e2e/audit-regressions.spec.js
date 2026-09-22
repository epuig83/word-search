const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const core = require("../../core.js");
const { startStudentSession, solvePlacement, unlockTeacherView } = require("./helpers");

function sharedPath(overrides = {}) {
  return `/es.html?p=${encodeURIComponent(core.encodePuzzleConfig({
    version: 2, title: "Palabras repetidas", words: "sol\nmar", difficulty: "easy",
    size: "8", lang: "es", timer: 0, hints: -1,
    gridRows: ["SOLXXXXX", "SOLXXXXX", "MARXXXXX", ...Array(5).fill("XXXXXXXX")],
    placementPaths: ["0.0,0.1,0.2", "2.0,2.1,2.2"], ...overrides,
  }))}`;
}

const occurrence = row => ({ cells: [{ row, col: 0 }, { row, col: 1 }, { row, col: 2 }] });
const foundCells = page => page.locator(".grid-cell.is-found").evaluateAll(cells => cells.map(cell => `${cell.dataset.row}.${cell.dataset.col}`));

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("numbered examples survive import, reload and manual saving", async ({ page }) => {
  await page.goto("/es.html");
  const samples = { es: [1, 2].map(n => ({ id: `topic-${n}`, title: `Tema ${n}`, words: "sol\nluna\nmar", size: "8" })) };
  await page.locator("#import-samples-input").setInputFiles({
    name: "examples.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(samples)),
  });
  const options = page.locator('#sample-select option[value^="custom:"]');
  await expect(options).toHaveText(["Tema 1", "Tema 2"]);
  await page.reload();
  await expect(options).toHaveText(["Tema 1", "Tema 2"]);
  await page.locator("#sample-select").selectOption("custom:topic-1");
  await page.locator("#load-sample-button").click();
  await expect(page.locator("#teacher-ready-card")).toBeVisible();
  await page.locator("#title-input").fill("Tema 3");
  await page.locator(".sample-management summary").click();
  await page.locator("#save-sample-button").click();
  await expect(options).toHaveText(["Tema 1", "Tema 2", "Tema 3"]);
  await page.locator("#title-input").fill("  TEMA   1 ");
  await page.locator("#save-sample-button").click();
  await expect(page.locator("#confirm-modal")).toBeVisible();
  await page.locator("#confirm-modal-confirm").click();
  await expect(page.locator("#sample-select")).toHaveValue("custom:topic-1");
  await expect(options).toHaveCount(3);
});

test("an alternate occurrence keeps its own highlight through reload and resets for a new pupil", async ({ page }) => {
  const url = sharedPath();
  await page.goto(url);
  await startStudentSession(page);
  await solvePlacement(page, occurrence(1));
  await expect(page.locator("#progress-text")).toHaveText("1 / 2");
  expect(await foundCells(page)).toEqual(["1.0", "1.1", "1.2"]);
  await solvePlacement(page, occurrence(0));
  await expect(page.locator("#progress-text")).toHaveText("1 / 2");
  await expect(page.locator("#board-status")).toContainText("ya la tienes");
  await page.reload();
  await expect(page.locator("#progress-text")).toHaveText("1 / 2");
  await startStudentSession(page);
  expect(await foundCells(page)).toEqual(["1.0", "1.1", "1.2"]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(new URL(page.url()).search).toBe(new URL(url, page.url()).search);
  await page.reload();
  await page.locator("#new-student-button").click();
  await expect(page.locator("#progress-text")).toHaveText("0 / 2");
  expect(await foundCells(page)).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("word-search-progress-v1")).foundWordPaths)).toEqual({});
});

test("inverse words sharing cells can both be found, preferring the selected direction", async ({ page }) => {
  await page.goto(sharedPath({ words: "sol\nlos\nmar", placementPaths: ["0.0,0.1,0.2", "0.2,0.1,0.0", "2.0,2.1,2.2"] }));
  await startStudentSession(page);
  await solvePlacement(page, { cells: [...occurrence(1).cells].reverse() });
  await expect(page.locator("#word-list .is-found")).toContainText("los");
  await solvePlacement(page, occurrence(1));
  await expect(page.locator("#progress-text")).toHaveText("2 / 3");
  await solvePlacement(page, occurrence(1));
  await expect(page.locator("#progress-text")).toHaveText("2 / 3");
});

test.describe("touch and keyboard on small screens", () => {
  test.use({ hasTouch: true });
  for (const width of [320, 375, 414, 768]) {
    test(`alternate occurrences remain playable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(sharedPath());
      await startStudentSession(page);
      const cell = (row, col) => page.locator(`#puzzle-grid [data-row="${row}"][data-col="${col}"]`);
      const geometry = await page.evaluate(() => {
        const rect = document.querySelector(".grid-cell").getBoundingClientRect();
        return { width: document.documentElement.scrollWidth, cellWidth: rect.width, cellHeight: rect.height };
      });
      expect(geometry.width).toBeLessThanOrEqual(width);
      expect(geometry.cellWidth).toBeGreaterThanOrEqual(24);
      expect(geometry.cellHeight).toBeGreaterThanOrEqual(24);
      await cell(1, 0).tap();
      await cell(1, 2).tap();
      await expect(page.locator("#progress-text")).toHaveText("1 / 2");
      expect(await foundCells(page)).toEqual(["1.0", "1.1", "1.2"]);
      await cell(2, 0).focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      await expect(page.locator("#progress-text")).toHaveText("2 / 2");
      await expect(page.locator("#completion-message")).toBeVisible();
    });
  }
});

for (const savedPath of [null, "0.0,1.1,2.0", "3.0,3.1,3.2"]) {
  test(`old or invalid saved selections use the original placement: ${savedPath}`, async ({ page }) => {
    const url = sharedPath();
    const key = new URL(url, "http://localhost").searchParams.get("p");
    await page.addInitScript(({ key, savedPath }) => {
      localStorage.setItem("word-search-progress-v1", JSON.stringify({ key, foundWordIds: ["SOL"], started: true,
        ...(savedPath === null ? {} : { foundWordPaths: { SOL: savedPath } }),
      }));
    }, { key, savedPath });
    await page.goto(url);
    await startStudentSession(page);
    await expect(page.locator("#progress-text")).toHaveText("1 / 2");
    expect(await foundCells(page)).toEqual(["0.0", "0.1", "0.2"]);
  });
}

test("a shared zigzag is rejected without losing the teacher draft", async ({ page }) => {
  await page.goto("/es.html");
  await page.locator("#title-input").fill("Mi borrador");
  await page.locator("#words-input").fill("sol\nm");
  await page.goto(sharedPath({ words: "sol", gridRows: ["SXX", "XOX", "LXX"], placementPaths: ["0.0,1.1,2.0"] }));
  await expect(page.locator("#section-teacher")).toBeVisible();
  await expect(page.locator("#status-message")).toHaveClass(/is-error/);
  await page.goto("/es.html");
  await expect(page.locator("#title-input")).toHaveValue("Mi borrador");
});

test("clearing invalid text also clears the saved draft and updates pending changes", async ({ page }) => {
  await page.goto(sharedPath());
  await unlockTeacherView(page);
  for (const text of ["x\ny\n!", "   "]) {
    await page.locator("#words-input").fill(text);
    await expect(page.locator("#teacher-pending-changes")).toBeVisible();
    await expect(page.locator("#clear-words-button")).toBeEnabled();
    await page.locator("#clear-words-button").click();
    await expect(page.locator("#words-input")).toBeEmpty();
    await expect(page.locator("#clear-words-button")).toBeDisabled();
    await expect(page.locator("#words-count")).toContainText("0");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("word-search-draft-v1")).words)).toBe("");
  }
});
