const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const { generatePuzzle, measureGridVisibility } = require("./helpers");

test("iPad cannot open an empty activity with a tap", async ({ page }) => {
  await page.goto("/index.html");
  const studentTab = page.locator("#tab-student");
  await expect(studentTab).toBeDisabled();
  const bounds = await studentTab.boundingBox();
  await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(page.locator("#section-teacher")).toBeVisible();
  await expect(page.locator("#section-student")).toBeHidden();
  await expect(page.locator("#student-tab-help")).toBeVisible();
});

for (const lang of ["ca", "es", "en"]) {
  test(`${lang} iPad profile supports taps, orientation changes and recovery`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await generatePuzzle(page, { size: "8", timer: "0", openStudent: false });
    await page.locator(`[data-lang="${lang}"]`).tap();
    await page.locator("#teacher-open-student-button").tap();
    await page.locator("#student-start-button").tap();
    const cells = await page.evaluate(() => {
      const config = globalThis.WORD_SEARCH_CORE.decodePuzzleConfig(JSON.parse(localStorage.getItem("word-search-activity-v1")).key);
      return config.placementPaths[0].split(",").map(value => value.split(".").map(Number));
    });
    for (const [row, col] of [cells[0], cells[cells.length - 1]]) await page.locator(`[data-row="${row}"][data-col="${col}"]`).tap();
    await expect(page.locator("#progress-text")).toHaveText("1 / 4");
    await page.locator("#hint-button").tap();
    await page.locator("#hint-start-button").tap();
    await expect(page.locator(".grid-cell.is-hint")).toHaveCount(1);
    for (const viewport of [{ width: 1080, height: 810 }, { width: 810, height: 1080 }]) {
      await page.setViewportSize(viewport);
      const metrics = await measureGridVisibility(page);
      expect(metrics.clippedCells).toBe(0);
      expect(metrics.isHorizontallyScrollable).toBe(false);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator("#progress-text")).toHaveText("1 / 4");
    }
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("word-search-progress-v1")));
    await page.reload();
    await page.locator("#student-start-button").tap();
    await expect(page.locator("#progress-text")).toHaveText("1 / 4");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("word-search-progress-v1")).hintStages)).toEqual(saved.hintStages);
    await page.locator("#tab-teacher").tap();
    await page.locator("#pin-input").fill("1234");
    await page.locator("#pin-submit").tap();
    await expect(page.locator("#teacher-ready-card")).toBeVisible();
    expect(errors).toEqual([]);
  });

  // Keep the Axe scan and screenshot in their own classroom workflow so each
  // touch journey fits the standard timeout on slower Linux WebKit runners.
  test(`${lang} iPad profile prepares accessible print variants with touch`, async ({ page }, testInfo) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await generatePuzzle(page, { size: "8", timer: "0", openStudent: false });
    await page.locator(`[data-lang="${lang}"]`).tap();
    const activity = await page.evaluate(() => localStorage.getItem("word-search-activity-v1"));
    await page.locator("#teacher-variants-button").tap();
    for (const selector of ["#variants-count", ".variants-checkbox", "#variants-prepare", "#variants-close", "#variants-print"]) {
      const bounds = await page.locator(selector).boundingBox();
      expect(bounds.height, `${selector} touch target`).toBeGreaterThanOrEqual(44);
    }
    await page.locator("#variants-count").selectOption("4");
    await page.locator("#variants-prepare").tap();
    await expect(page.locator("#variants-print")).toBeEnabled();
    await expect(page.locator("#variants-preview .variant-sheet")).toHaveCount(4);
    await page.setViewportSize({ width: 1080, height: 810 });
    expect(await page.locator(".variants-dialog").evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const screenshot = await page.screenshot({ path: testInfo.outputPath(`ipad-${lang}-variants.png`) });
    await testInfo.attach(`iPad ${lang} variants`, { body: screenshot, contentType: "image/png" });
    await page.locator("#variants-close").tap();
    await expect(page.locator("#variants-modal")).toBeHidden();
    await expect(page.locator("#teacher-variants-button")).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem("word-search-activity-v1"))).toBe(activity);
    await page.locator("#teacher-open-student-button").tap();
    await expect(page.locator("#student-start-overlay")).toBeVisible();
    await expect(page.locator("#progress-text")).toHaveText("0 / 4");
    expect(errors).toEqual([]);
  });
}
