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

test("library search ignores accents and looks beyond the active category", async ({ page }) => {
  await page.goto("/index.html");
  const results = page.locator("#lib-results .lib-word-chip");
  await page.locator("#lib-search").fill("lleo");
  await expect(results).toHaveText(["lleó"]);
  // Animals is the active category; a fruit must still be found.
  await page.locator("#lib-search").fill("poma");
  await expect(results).toHaveText(["poma"]);
});

test("example actions report next to their controls, not far below", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#title-input").fill("Sistema solar");
  await page.locator("#words-input").fill("sol\nlluna\nmart");
  await page.locator(".sample-management summary").click();
  const status = page.locator("#sample-status");
  await page.locator("#save-sample-button").click();
  await expect(status).toBeInViewport();
  await expect(status).toContainText("desat");
  // A saved example named like a built-in one names its group in the closed select.
  await expect(page.locator('#sample-select option[value^="custom:"]')).toHaveText(["Sistema solar · Els meus exemples"]);
  await expect(page.locator("#delete-sample-button")).toBeEnabled();
  await page.locator("#delete-sample-button").click();
  await expect(status).toBeHidden();
  await page.locator("#sample-undo-button").click();
  await expect(status).toContainText("recuperat");
  await page.locator("#sample-select").selectOption("builtin:0");
  await expect(page.locator("#delete-sample-button")).toBeDisabled();
  await expect(page.locator("#delete-sample-button")).toHaveCSS("cursor", "not-allowed");
});

test("the variants dialog does not repeat its introduction before preparing", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#title-input").fill("Animals");
  await page.locator("#words-input").fill("gos\ngat\nlleó");
  await page.locator("#generate-button").click();
  await page.locator("#teacher-variants-button").click();
  await expect(page.locator("#variants-intro")).toBeVisible();
  await expect(page.locator("#variants-status")).toHaveText("");
  await expect(page.locator("#variants-print")).toHaveCSS("cursor", "not-allowed");
});

test("keyboard users keep their place in the word library", async ({ page }) => {
  await page.goto("/index.html");
  const fruits = page.locator("#lib-categories .category-chip", { hasText: "Fruites" });
  await fruits.focus();
  await page.keyboard.press("Enter");
  await expect(fruits).toBeFocused();
  await expect(fruits).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#lib-categories .category-chip", { hasText: "Animals" })).toHaveAttribute("aria-pressed", "false");

  const chips = page.locator("#lib-results .lib-word-chip");
  const first = await chips.nth(0).textContent();
  const second = await chips.nth(1).textContent();
  await chips.nth(0).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#words-input")).toHaveValue(first);
  await expect(page.locator("#lib-results .lib-word-chip:focus")).toHaveText(second);
});

test("open teacher sections show a minus marker and the form URL error is announced", async ({ page }) => {
  await page.goto("/index.html");
  const summary = page.locator("#form-config-details > summary");
  await summary.click();
  expect(await summary.evaluate(el => getComputedStyle(el, "::after").content)).toBe('"−"');
  await page.locator("#form-template-input").fill("hola");
  await expect(page.locator("#form-url-error")).toHaveAttribute("role", "alert");
  await expect(page.locator("#form-template-input")).toHaveAttribute("aria-invalid", "true");
  await page.locator("#form-template-input").fill("");
  await expect(page.locator("#form-template-input")).toHaveAttribute("aria-invalid", "false");
});

test("each library chip group is a single Tab stop with arrow-key navigation", async ({ page }) => {
  await page.goto("/index.html");
  const categories = page.locator("#lib-categories");
  const words = page.locator("#lib-results");
  await expect(categories).toHaveAttribute("role", "toolbar");
  await expect(categories).toHaveAttribute("aria-label", "Categories de la biblioteca");
  await expect(words).toHaveAttribute("role", "toolbar");

  await page.locator("#lib-search").focus();
  await page.keyboard.press("Tab");
  await expect(categories.locator(".category-chip.is-active")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(categories.locator(".category-chip").nth(2)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(categories.locator(".category-chip").first()).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(categories.locator(".category-chip").last()).toBeFocused();

  await page.keyboard.press("Tab");
  const chips = words.locator(".lib-word-chip");
  await expect(chips.first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(chips.last()).toBeFocused();

  // One more Tab leaves the library entirely instead of walking every chip.
  await page.keyboard.press("Tab");
  const focusedInLibrary = await page.evaluate(() => Boolean(document.activeElement.closest("#lib-categories, #lib-results")));
  expect(focusedInLibrary).toBe(false);
});
