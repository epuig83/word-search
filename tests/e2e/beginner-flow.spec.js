const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const core = require("../../core");
const { generatePuzzle, solvePlacement, measureGridVisibility } = require("./helpers");

const examples = [
  { lang: "ca", path: "/index.html", title: "Primers passos: animals", words: "gos\ngat\nos\nvaca\nllop\nlleó", start: "Començar" },
  { lang: "es", path: "/es.html", title: "Primeros pasos: animales", words: "perro\ngato\noso\nvaca\nlobo\nleón", start: "Empezar" },
  { lang: "en", path: "/en.html", title: "First steps: animals", words: "dog\ncat\nbear\ncow\nwolf\nlion", start: "Start" },
];

for (const example of examples) {
  test(`beginner example can be solved and shared in ${example.lang}`, async ({ page, context }) => {
    await page.addInitScript(() => {
      Math.random = () => 0;
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: async text => { window.__sharedUrl = text; } },
      });
    });
    await page.goto(example.path);
    await expect(page.locator('[data-preset="inicial"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#size-input")).toHaveValue("8");
    await expect(page.locator("#timer-input")).toHaveValue("0");
    await expect(page.locator("#hints-input")).toHaveValue("-1");
    await page.locator("#sample-select").selectOption({ label: example.title });
    await page.locator("#load-sample-button").click();
    await expect(page.locator("#teacher-ready-meta")).toContainText("8 x 8");
    await expect(page.locator("#word-list li")).toHaveCount(6);
    await page.locator("#teacher-share-button").click();
    await expect.poll(() => page.evaluate(() => window.__sharedUrl)).toContain("?p=");
    const url = await page.evaluate(() => window.__sharedUrl);
    const originalGrid = await page.locator(".grid-cell").allTextContents();
    await page.locator("#teacher-open-student-button").click();
    await expect(page.locator(".selection-demo")).toBeVisible();
    await expect(page.locator("#pause-button")).toBeHidden();
    await page.getByRole("button", { name: example.start, exact: true }).click();
    await expect(page.locator("#timer-display")).toBeHidden();
    await expect(page.locator("#hint-button")).toContainText("∞");
    await page.locator("#hint-button").click();
    await expect(page.locator(".grid-cell.is-hint")).toHaveCount(1);
    await expect(page.locator("#hint-button")).toContainText("∞");
    await expect(page.locator("#word-definitions-help")).toBeVisible();
    await page.locator(".word-definition-button").first().click();
    await expect(page.locator("#word-definition-modal")).toBeVisible();
    await expect(page.locator("#word-definition-close")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#word-definition-modal")).toBeHidden();

    const puzzle = core.buildPuzzleData(core.parseWords(example.words).words, "8", "easy", { sourceLang: example.lang }, { random: () => 0 });
    for (const placement of puzzle.placements) await solvePlacement(page, placement);
    await expect(page.locator("#progress-text")).toHaveText("6 / 6");
    await expect(page.locator("#completion-message")).toBeVisible();
    await expect(page.locator("#send-results-button")).toBeHidden();
    await expect(page.locator("#hint-button")).toBeHidden();
    await expect(page.locator("#pause-button")).toBeHidden();
    await expect(page.locator('#completion-message [data-t="learning_prompt"]')).toBeVisible();

    const reopened = await context.newPage();
    await reopened.goto(url);
    await expect(reopened.locator("#student-start-overlay")).toBeVisible();
    expect(await reopened.locator(".grid-cell").allTextContents()).toEqual(originalGrid);
    await expect(reopened.locator("#size-input")).toHaveValue("8");
    await expect(reopened.locator("#hints-input")).toHaveValue("-1");
    await reopened.close();
  });
}

test("presets keep custom vocabulary and an oversized word has a useful error", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#title-input").fill("Animals");
  await page.locator("#words-input").fill("os\ngat\nextraterrestre");
  await page.locator('[data-preset="dificil"]').click();
  await page.locator('[data-preset="inicial"]').click();
  await expect(page.locator("#words-input")).toHaveValue("os\ngat\nextraterrestre");
  await page.locator("#generate-button").click();
  await expect(page.locator("#status-message")).toContainText("extraterrestre");
  await expect(page.locator("#status-message")).toContainText("Automàtic");
  await expect(page.locator("#teacher-ready-card")).toBeHidden();
  await page.locator("#advanced-settings-details summary").click();
  await page.locator("#size-input").selectOption("auto");
  await page.locator("#generate-button").click();
  await expect(page.locator("#teacher-ready-card")).toBeVisible();
});

for (const width of [320, 390, 768, 1366]) {
  test(`beginner board and word list work at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: true });
    const page = await context.newPage();
    await generatePuzzle(page, { size: "8", words: "os\ngat\ngos", timer: "0", hints: "-1" });
    await page.locator("#student-start-button").click();
    const metrics = await measureGridVisibility(page);
    expect(metrics.clippedCells).toBe(0);
    expect(metrics.isHorizontallyScrollable).toBe(false);
    expect(metrics.minCellWidth).toBeGreaterThanOrEqual(24);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const words = await page.locator(".word-bank").boundingBox();
    const grid = await page.locator("#grid-container").boundingBox();
    const actions = await page.locator("#student-actions").boundingBox();
    if (width <= 640) {
      expect(words.y + words.height).toBeLessThanOrEqual(grid.y);
      expect(actions.y).toBeGreaterThanOrEqual(grid.y + grid.height);
    } else {
      expect(words.x).toBeGreaterThanOrEqual(grid.x + grid.width);
    }
    await context.close();
  });
}

test("a two-letter word can be selected with touch and keyboard", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await page.addInitScript(() => { Math.random = () => 0; });
  await generatePuzzle(page, { size: "8", words: "os\ngat\ngos", timer: "0" });
  await page.locator("#student-start-button").click();
  const puzzle = core.buildPuzzleData(core.parseWords("os\ngat\ngos").words, "8", "easy", {}, { random: () => 0 });
  for (const cell of puzzle.placements[0].cells) {
    await page.locator(`[data-row="${cell.row}"][data-col="${cell.col}"]`).tap();
  }
  await expect(page.locator("#progress-text")).toHaveText("1 / 3");
  const placement = puzzle.placements[1];
  const first = placement.cells[0];
  await page.locator(`[data-row="${first.row}"][data-col="${first.col}"]`).focus();
  await page.keyboard.press("Enter");
  for (let i = 1; i < placement.cells.length; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.locator("#progress-text")).toHaveText("2 / 3");
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
  await context.close();
});
