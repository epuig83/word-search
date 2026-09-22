const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const core = require("../../core.js");
const { generatePuzzle, getGridLetters, installPausedClock } = require("./helpers");

const messages = {
  ca: "Primer crea una activitat per obrir la zona de l'alumnat.",
  es: "Primero crea una actividad para abrir la zona del alumnado.",
  en: "First create an activity to open the student area.",
};

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

for (const [lang, message] of Object.entries(messages)) {
  test(`an empty or ungenerated draft cannot open the student area in ${lang}`, async ({ page }) => {
    await page.goto(lang === "ca" ? "/index.html" : `/${lang}.html`);
    const tab = page.getByRole("tab").nth(1);
    await expect(tab).toBeDisabled();
    await expect(tab).toHaveAccessibleDescription(message);
    await expect(page.locator("#student-tab-help")).toHaveText(message);
    await expect(page.locator("#student-tab-help")).toBeVisible();
    // Use a real pointer: Playwright's locator.click deliberately refuses an
    // aria-disabled control, which would leave the application's guard untested.
    const bounds = await tab.boundingBox();
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await expect(page.locator("#section-student")).toBeHidden();
    await page.getByRole("tab").first().focus();
    await page.keyboard.press("ArrowRight");
    await expect(tab).toBeFocused();
    for (const key of ["Enter", "Space"]) {
      await page.keyboard.press(key);
      await expect(tab).toBeFocused();
      await expect(tab).toHaveAttribute("aria-selected", "false");
      await expect(page.locator("#section-teacher")).toBeVisible();
    }
    await page.keyboard.press("Home");
    await expect(page.getByRole("tab").first()).toBeFocused();
    await page.locator("#generate-button").click();
    await expect(tab).toBeDisabled();
    await page.locator("#title-input").fill("La classe");
    await page.locator("#words-input").fill("gat\ngos");
    await expect(tab).toBeDisabled();
    await page.reload();
    await expect(page.locator("#words-input")).toHaveValue("gat\ngos");
    await expect(tab).toBeDisabled();
    await expect(tab).toHaveAccessibleDescription(message);
    await page.locator("#generate-button").click();
    await expect(tab).toBeEnabled();
    await expect(page.locator("#section-teacher")).toBeVisible();
    await expect(page.locator("#student-tab-help")).toBeHidden();
    await expect(tab).not.toHaveAttribute("aria-describedby");
    await tab.click();
    await expect(page.locator("#student-start-overlay")).toBeVisible();
  });
}

test("edits, failed generation, undo and reload keep access tied to the prepared activity", async ({ page }) => {
  await installPausedClock(page);
  await generatePuzzle(page, { words: "gat\ngos", size: "8", timer: "0", openStudent: false });
  const tab = page.locator("#tab-student");
  const grid = await getGridLetters(page);
  await page.reload();
  await expect(tab).toBeEnabled();
  await expect(page.locator("#section-teacher")).toBeVisible();
  expect(await getGridLetters(page)).toEqual(grid);
  await page.locator("#words-input").fill("extraordinari");
  await expect(tab).toBeDisabled();
  await expect(tab).toHaveAccessibleDescription("Has fet canvis. Torna a crear l'activitat per obrir-la.");
  await page.locator("#generate-button").click();
  await expect(page.locator("#status-message")).toHaveClass(/is-error/);
  // Submit before the words helper refreshes, then let its pending debounce run.
  // Refreshing the helper must not replace the generation error with a warning.
  await page.clock.runFor(200);
  await expect(page.locator("#status-message")).toHaveClass(/is-error/);
  await expect(page.locator("#status-message")).toContainText("extraordinari");
  await expect(tab).toBeDisabled();
  await page.reload();
  await expect(tab).toBeDisabled();
  await page.locator("#words-input").fill("gat\ngos");
  await expect(tab).toBeEnabled();
  await expect(page.locator("#student-tab-help")).toBeHidden();
  expect(await getGridLetters(page)).toEqual(grid);
  await page.locator("#title-input").fill("Nou tema");
  await expect(tab).toBeDisabled();
  await page.locator("#generate-button").click();
  await expect(tab).toBeEnabled();
  await tab.click();
  await expect(page.locator("#board-title")).toHaveText("Nou tema");
});

test("invalid links cannot open an empty board and valid shared activities open directly", async ({ page }) => {
  await page.goto("/index.html?p=invalid");
  await expect(page.locator("#tab-student")).toBeDisabled();
  await expect(page.locator("#section-teacher")).toBeVisible();
  await expect(page.locator("#status-message")).toHaveClass(/is-error/);
  const config = core.encodePuzzleConfig({
    version: 2, title: "Compartida", words: "sol\nmar", difficulty: "easy",
    size: "8", lang: "es", timer: 0, hints: -1,
    gridRows: ["SOLXXXXX", "MARXXXXX", ...Array(6).fill("XXXXXXXX")],
    placementPaths: ["0.0,0.1,0.2", "1.0,1.1,1.2"],
  });
  await page.goto(`/es.html?p=${encodeURIComponent(config)}`);
  await expect(page.locator("#tab-student")).toBeEnabled();
  await expect(page.locator("#section-student")).toBeVisible();
  await expect(page.locator("#student-tab-help")).toBeHidden();
  await expect(page.locator("#student-start-overlay")).toBeVisible();
  await expect(page.locator("#progress-text")).toHaveText("0 / 2");
});

test("the availability explanation follows language changes and fits a narrow high contrast view", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/index.html");
  for (const [lang, message] of Object.entries(messages)) {
    await page.locator(`[data-lang="${lang}"]`).click();
    await expect(page.locator("#tab-student")).toHaveAccessibleDescription(message);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.evaluate(() => { document.documentElement.dataset.contrast = "high"; });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#student-tab-help")).toBeHidden();
});
