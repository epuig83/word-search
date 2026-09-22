const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { generatePuzzle, startStudentSession, unlockTeacherView } = require("./helpers");

async function prepareVariants(page, count = "2") {
  await page.locator("#teacher-variants-button").click();
  await page.locator("#variants-count").selectOption(count);
  await page.locator("#variants-prepare").click();
  await expect(page.locator("#variants-print")).toBeEnabled();
}

for (const lang of ["ca", "es", "en"]) {
  for (const [count, size] of [["2", "8"], ["3", "16"], ["4", "auto"]]) {
    test(`${lang} prints ${count} distinct ${size} models and their exact answer keys`, async ({ page, browserName }, testInfo) => {
      await page.addInitScript(() => { window.print = () => {}; });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await generatePuzzle(page, { title: "Animals · Models A–D", size, timer: "0", openStudent: false });
      await page.locator(`[data-lang="${lang}"]`).click();
      const original = await page.locator("#puzzle-grid .grid-cell").allTextContents();
      const saved = await page.evaluate(() => ({ ...localStorage }));
      await prepareVariants(page, count);
      await expect(page.locator("#variants-preview .variant-sheet")).toHaveCount(Number(count));
      const previews = await page.locator("#variants-preview .variant-grid").evaluateAll(grids => grids.map(grid => grid.textContent));
      expect(new Set(previews).size).toBe(Number(count));
      expect(previews[0]).toBe(original.join(""));
      if (count === "2") {
        await expect(page.locator("#variants-modal")).toHaveCSS("opacity", "1");
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await page.screenshot({ path: testInfo.outputPath(`variants-${lang}.png`), fullPage: true });
      }
      for (const solutions of [true, false]) {
        await page.locator("#variants-solutions").setChecked(solutions);
        await page.locator("#variants-print").click();
        const sheets = await page.locator("#variant-print-root .variant-sheet").evaluateAll(nodes => nodes.map(node => ({
          model: node.dataset.model, solution: node.dataset.solution,
          grid: node.querySelector(".variant-grid").textContent,
          words: [...node.querySelectorAll(".variant-words li")].map(word => word.textContent),
          highlighted: node.querySelectorAll(".is-answer").length,
        })));
        expect(sheets).toHaveLength(Number(count) * (solutions ? 2 : 1));
        for (let index = 0; index < Number(count); index++) {
          expect(sheets[index].highlighted).toBe(0);
          expect(sheets[index].model).toBe(String.fromCharCode(65 + index));
          if (solutions) {
            const answer = sheets[index + Number(count)];
            expect(answer.model).toBe(sheets[index].model);
            expect(answer.grid).toBe(sheets[index].grid);
            expect(answer.words).toEqual(sheets[index].words);
            expect(answer.highlighted).toBeGreaterThan(0);
          }
        }
        await page.emulateMedia({ media: "print" });
        await expect(page.locator("#variant-print-root")).toBeVisible();
        await expect(page.locator("#puzzle-grid")).toBeHidden();
        if (size === "8") await expect(page.locator("#variant-print-root .variant-cell").first()).toHaveCSS("font-size", "24px");
        const fits = await page.locator("#variant-print-root .variant-sheet").evaluateAll(nodes => nodes.every(node => node.scrollHeight <= node.clientHeight + 1));
        expect(fits).toBe(true);
        if (browserName === "chromium") {
          const filename = `models-${lang}-${count}-${solutions ? "with-keys" : "worksheets"}.pdf`;
          const pdf = await page.pdf({ path: testInfo.outputPath(filename), preferCSSPageSize: true, printBackground: false });
          expect((pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length).toBe(sheets.length);
          await testInfo.attach(filename, { body: pdf, contentType: "application/pdf" });
        }
        await page.emulateMedia({ media: "screen" });
        await page.evaluate(() => dispatchEvent(new Event("afterprint")));
        await expect(page.locator("body")).not.toHaveAttribute("data-print-variants");
      }
      await page.locator("#variants-close").click();
      await expect(page.locator("#teacher-variants-button")).toBeFocused();
      expect(await page.locator("#puzzle-grid .grid-cell").allTextContents()).toEqual(original);
      expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(saved);
      await page.locator("#teacher-variants-button").click();
      expect(await page.locator("#variants-preview .variant-grid").evaluateAll(grids => grids.map(grid => grid.textContent))).toEqual(previews);
    });
  }
}

test("variant preparation preserves found words, hints and the saved pupil session", async ({ page }) => {
  await generatePuzzle(page, { size: "8", timer: "0" });
  await startStudentSession(page);
  const cells = await page.evaluate(() => {
    const config = globalThis.WORD_SEARCH_CORE.decodePuzzleConfig(JSON.parse(localStorage.getItem("word-search-activity-v1")).key);
    return config.placementPaths[0].split(",").map(value => value.split(".").map(Number));
  });
  for (const [row, col] of [cells[0], cells[cells.length - 1]]) await page.locator(`[data-row="${row}"][data-col="${col}"]`).click();
  await page.locator("#hint-button").click();
  await page.locator("#hint-start-button").click();
  await unlockTeacherView(page);
  const before = await page.evaluate(() => ({ ...localStorage }));
  await prepareVariants(page);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
  await page.locator("#title-input").fill("Changed activity");
  await expect(page.locator("#teacher-variants-button")).toBeDisabled();
  await page.locator("#generate-button").click();
  await page.locator("#teacher-variants-button").click();
  await expect(page.locator("#variants-preview .variant-sheet")).toHaveCount(0);
  await expect(page.locator("#variants-print")).toBeDisabled();
});

test("failed or cancelled preparation never prints a partial batch", async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0; });
  await generatePuzzle(page, { size: "8", timer: "0", openStudent: false });
  await page.locator("#teacher-variants-button").click();
  await page.locator("#variants-prepare").click();
  await expect(page.locator("#variants-status")).toContainText("No s'han pogut");
  await expect(page.locator("#variants-print")).toBeDisabled();
  await expect(page.locator("#variant-print-root .variant-sheet")).toHaveCount(0);
  await page.evaluate(() => {
    document.querySelector("#variants-form").requestSubmit();
    document.querySelector("#variants-close").click();
  });
  await expect(page.locator("#variants-modal")).toBeHidden();
  await page.locator("#teacher-variants-button").click();
  await expect(page.locator("#variants-prepare")).toBeEnabled();
  await expect(page.locator("#variants-print")).toBeDisabled();
});

test("large content is reported instead of clipping an A4 worksheet", async ({ page }) => {
  await generatePuzzle(page, { title: "Long display text", words: `sol${"!".repeat(2500)}\nmar\nluna`, size: "16", timer: "0", openStudent: false });
  await page.locator("#teacher-variants-button").click();
  await page.locator("#variants-prepare").click();
  await expect(page.locator("#variants-status")).toContainText("no cap");
  await expect(page.locator("#variants-print")).toBeDisabled();
});

test("variant controls and preview fit a narrow screen and high contrast", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await generatePuzzle(page, { size: "8", timer: "0", openStudent: false });
  await page.evaluate(() => { document.documentElement.dataset.contrast = "high"; });
  await prepareVariants(page, "4");
  await expect(page.locator("#variants-modal")).toHaveCSS("opacity", "1");
  expect(await page.locator(".variants-dialog").evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Tab");
  await expect(page.locator("#variants-count")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#variants-print")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#teacher-variants-button")).toBeFocused();
});

test("local files can prepare variants and accurately identify their offline mode", async ({ page }) => {
  await page.goto(pathToFileURL(path.resolve(__dirname, "../../es.html")).href);
  await expect(page.locator("#offline-status")).toHaveText("Archivo local");
  await expect(page.locator("#offline-retry")).toBeHidden();
  await page.locator("#title-input").fill("Animales");
  await page.locator("#words-input").fill("gato\nperro\noso");
  await page.locator("#generate-button").click();
  await prepareVariants(page);
});

test("large automatic boards keep readable cells and fit their A4 pages", async ({ page, browserName }, testInfo) => {
  await page.addInitScript(() => { window.print = () => {}; });
  await generatePuzzle(page, {
    words: "electroencefalograma\nhipopotamo\nrinoceronte\nelefante\ncocodrilo\nmariposa",
    size: "auto", timer: "0", openStudent: false,
  });
  await prepareVariants(page);
  await page.locator("#variants-print").click();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#variant-print-root .is-dense")).toHaveCount(4);
  const fontSize = await page.locator("#variant-print-root .variant-cell").first().evaluate(cell => parseFloat(getComputedStyle(cell).fontSize));
  expect(fontSize).toBeCloseTo(40 / 3, 2);
  if (browserName === "chromium") {
    const pdf = await page.pdf({ path: testInfo.outputPath("large-auto-models.pdf"), preferCSSPageSize: true, printBackground: false });
    expect((pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length).toBe(4);
    await testInfo.attach("Large automatic models", { body: pdf, contentType: "application/pdf" });
  }
});
