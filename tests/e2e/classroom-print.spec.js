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
        // The activity prints on the same isolated sheet as the variants.
        const sheet = page.locator("#variant-print-root .variant-sheet");
        await expect(sheet).toHaveCount(1);
        await expect(sheet).toBeVisible();
        await expect(page.locator("#puzzle-grid")).toBeHidden();
        await expect(page.locator(".skip-link")).toBeHidden();
        const cells = await sheet.locator(".variant-cell").count();
        expect(cells).toBe(Number(size) ** 2);
        if (solution) {
          // One ring per word: crossing words stay readable, and strokes are ink,
          // so the key survives the default "no background graphics" print setting.
          const words = await page.evaluate(() => globalThis.WORD_SEARCH_CORE.decodePuzzleConfig(JSON.parse(localStorage.getItem("word-search-activity-v1")).key).words.split("\n").filter(Boolean).length);
          await expect(sheet.locator(".variant-mark")).toHaveCount(words);
          await expect(sheet.locator(".variant-learning")).toHaveCount(0);
        } else {
          await expect(sheet.locator(".variant-meta")).toBeVisible();
          await expect(sheet.locator(".variant-learning")).toBeVisible();
          await expect(sheet.locator(".variant-mark")).toHaveCount(0);
        }
        const filename = `${solution ? "answer-key" : "worksheet"}-${lang}-${size}.pdf`;
        const pdf = await page.pdf({ path: testInfo.outputPath(filename), format: "A4", preferCSSPageSize: true, printBackground: true });
        expect((pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length).toBe(1);
        await testInfo.attach(filename, { body: pdf, contentType: "application/pdf" });

        // The default print path: no background graphics requested by the user.
        const plainPdf = await page.pdf({ format: "A4", preferCSSPageSize: true, printBackground: false });
        expect((plainPdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length).toBe(1);
      }
    });
  }
}
