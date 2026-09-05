const { test, expect } = require("@playwright/test");
require("../../data");
const data = globalThis.WORD_SEARCH_DATA;

for (const lang of ["ca", "es", "en"]) {
  for (const size of ["8", "16"]) {
    test(`${lang} ${size}x${size} worksheet and answer key each fit on one A4 page`, async ({ page }, testInfo) => {
      await page.addInitScript(() => { window.print = () => {}; });
      await page.goto(lang === "ca" ? "/index.html" : `/${lang}.html`);
      const sample = data.samplePuzzles[lang][0];
      await page.locator("#title-input").fill(sample.title);
      await page.locator("#words-input").fill(size === "8" ? sample.words : data.vocabulary[lang].animals.words.join("\n"));
      await page.locator("#advanced-settings-details summary").click();
      await page.locator("#size-input").selectOption(size);
      await page.locator("#generate-button").click();
      await expect(page.locator("#teacher-ready-card")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      for (const solution of [false, true]) {
        await page.emulateMedia({ media: "screen" });
        await page.locator(solution ? "#teacher-print-solution-button" : "#teacher-print-button").click();
        await page.emulateMedia({ media: "print" });
        await expect(page.locator("#puzzle-grid")).toBeVisible();
        await expect(page.locator("#word-list")).toBeVisible();
        await expect(page.locator("#word-definitions-help")).toBeHidden();
        await expect(page.locator(".skip-link")).toBeHidden();
        await expect(page.locator("#student-actions")).toBeHidden();
        if (solution) {
          await expect(page.locator(".grid-cell.is-solution").first()).toBeVisible();
          await expect(page.locator(".print-learning-prompt")).toBeHidden();
        } else {
          await expect(page.locator("#print-meta")).toBeVisible();
          await expect(page.locator(".print-learning-prompt")).toBeVisible();
        }
        const filename = `${solution ? "answer-key" : "worksheet"}-${lang}-${size}.pdf`;
        const pdf = await page.pdf({ path: testInfo.outputPath(filename), format: "A4", preferCSSPageSize: true, printBackground: true });
        expect((pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length).toBe(1);
        await testInfo.attach(filename, { body: pdf, contentType: "application/pdf" });
      }
    });
  }
}
