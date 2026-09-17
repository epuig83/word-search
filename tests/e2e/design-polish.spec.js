const { test, expect } = require("@playwright/test");
const core = require("../../core");
const { generatePuzzle, solvePlacement, startStudentSession } = require("./helpers");

for (const width of [1440, 768, 390, 320]) {
  test(`progress stays compact through a whole game at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => { Math.random = () => 0; });
    const words = "gat\ngos\npeix";
    await generatePuzzle(page, {
      title: "Animals que podem trobar a casa, al bosc i al costat del riu",
      words, size: "8", timer: "0", hints: "-1",
    });
    await startStudentSession(page);
    const bar = page.locator("#progress-bar");
    await expect(bar).toHaveCSS("height", "10px");
    await expect(bar).toHaveAttribute("value", "0");

    // Check the rendered geometry, including long headings and the desktop cap.
    const geometry = await page.evaluate(() => ({
      pageWidth: document.documentElement.scrollWidth,
      gridWidth: document.querySelector("#grid-container").getBoundingClientRect().width,
    }));
    expect(geometry.pageWidth).toBeLessThanOrEqual(width);
    expect(geometry.gridWidth).toBeLessThanOrEqual(Math.min(width, 640));

    const puzzle = core.buildPuzzleData(core.parseWords(words).words, "8", "easy", {}, { random: () => 0 });
    for (const [index, placement] of puzzle.placements.entries()) {
      await solvePlacement(page, placement);
      await expect(bar).toHaveAttribute("value", String(index + 1));
      await expect(bar).toHaveCSS("height", "10px");
    }
    await expect(page.locator("#completion-message")).toBeVisible();
  });
}

for (const width of [1440, 390]) {
  for (const source of ["manual", "example"]) {
    test(`${source} creation reveals the next step at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      // Exercise both instant scrolling and the normal smooth-scroll path.
      if (width === 390) await page.emulateMedia({ reducedMotion: "reduce" });
      if (source === "manual") {
        await generatePuzzle(page, { openStudent: false, size: "8", timer: "0" });
      } else {
        await page.goto("/index.html");
        await page.getByLabel("Exemple guiat").selectOption({ label: "Primers passos: animals" });
        await page.getByRole("button", { name: "Carregar exemple", exact: true }).click();
      }

      const ready = page.getByRole("region", { name: /^Activitat preparada/ });
      await expect(ready).toBeFocused();
      await expect(ready).toBeInViewport({ ratio: 1 });
      await page.keyboard.press("Tab");
      await expect(page.locator("#teacher-open-student-button")).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.locator("#student-start-button")).toBeFocused();
    });
  }
}

test("invalid creation keeps focus on the missing field, including after a valid activity", async ({ page }) => {
  await generatePuzzle(page, { openStudent: false });
  await expect(page.locator("#teacher-ready-card")).toBeFocused();
  await page.getByLabel("Tema de l'exercici").fill("");
  await page.getByRole("button", { name: "Crear i revisar l'activitat" }).click();
  await expect(page.getByLabel("Tema de l'exercici")).toBeFocused();
  await page.getByLabel("Tema de l'exercici").fill("Animals");
  await page.getByLabel("Llista de paraules (una per línia)").fill("");
  await page.getByRole("button", { name: "Crear i revisar l'activitat" }).click();
  await expect(page.getByLabel("Llista de paraules (una per línia)")).toBeFocused();
});
