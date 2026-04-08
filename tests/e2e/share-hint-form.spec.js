const { test, expect } = require("@playwright/test");

const core = require("../../core.js");
const {
  generatePuzzle,
  startStudentSession,
  openTeacherTools,
  getGridLetters,
  solvePlacement,
} = require("./helpers");

test("shared links reopen the exact same puzzle", async ({ browser, page }) => {
  await page.addInitScript(() => {
    window.__copiedText = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText(text) {
          window.__copiedText = text;
          return Promise.resolve();
        },
      },
    });
  });

  await generatePuzzle(page);
  await startStudentSession(page);

  const originalGrid = await getGridLetters(page);
  const originalWords = await page.locator("#word-list .word-item").allTextContents();

  await openTeacherTools(page);
  await page.locator("#share-button").click();

  await expect.poll(
    () => page.evaluate(() => window.__copiedText || ""),
    { timeout: 3_000 }
  ).toContain("?p=");
  const sharedUrl = await page.evaluate(() => window.__copiedText);

  const context = await browser.newContext();
  const reopenedPage = await context.newPage();
  await reopenedPage.goto(sharedUrl);

  await expect(reopenedPage.locator("#student-start-overlay")).toBeVisible();
  await expect(reopenedPage.locator("#board-title")).toHaveText("Animals del mar");
  await expect(reopenedPage.locator("#student-start-timer")).toHaveText("5 min");
  expect(await getGridLetters(reopenedPage)).toEqual(originalGrid);
  expect(await reopenedPage.locator("#word-list .word-item").allTextContents()).toEqual(originalWords);

  await context.close();
});

test("hint highlights the expected cell and decrements the counter", async ({ page }) => {
  const wordsText = "balena\ndofi\npeix";
  await page.addInitScript(() => {
    Math.random = () => 0;
  });

  await generatePuzzle(page, { words: wordsText, timer: "0", hints: "3" });
  await startStudentSession(page);

  const words = core.parseWords(wordsText).words;
  const puzzle = core.buildPuzzleData(words, "auto", "easy", { title: "Animals del mar" }, { random: () => 0 });
  const hintedCell = puzzle.placements[0].cells[0];

  await page.locator("#hint-button").click();

  await expect(page.locator("#hint-button")).toHaveText("💡 Pista (2)");
  await expect(page.locator(`[data-row="${hintedCell.row}"][data-col="${hintedCell.col}"]`)).toHaveClass(/is-hint/);
});

test("student name modal and send results use the configured form URL", async ({ page }) => {
  const wordsText = "balena\ndofi\npeix";
  const formTemplate = "https://docs.google.com/forms/d/e/test/viewform?entry.10=Nom&entry.20=Cognoms&entry.30=Resultat&entry.40=Tema";
  const runtimeErrors = [];

  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => {
    Math.random = () => 0;
    window.__openedUrls = [];
    window.open = (...args) => {
      window.__openedUrls.push(args);
      return null;
    };
  });
  page.on("pageerror", error => runtimeErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  await generatePuzzle(page, { words: wordsText, timer: "0", hints: "0", formTemplate });

  await expect(page.locator("#student-name-modal")).toBeVisible();
  await page.locator("#student-nom-input").fill("Ada");
  await page.locator("#student-cognoms-input").fill("Lovelace");
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.locator("#student-name-modal")).toBeHidden();
  await expect(page.locator("#student-start-overlay")).toBeVisible();

  await startStudentSession(page);

  const words = core.parseWords(wordsText).words;
  const puzzle = core.buildPuzzleData(words, "auto", "easy", { title: "Animals del mar" }, { random: () => 0 });

  for (let index = 0; index < puzzle.placements.length; index++) {
    await solvePlacement(page, puzzle.placements[index]);
    await expect(page.locator("#word-list .word-item.is-found")).toHaveCount(index + 1);
  }

  await expect(page.locator("#completion-message")).toBeVisible();
  await expect(page.locator("#completion-message")).toBeInViewport();
  await expect(page.locator("#send-results-button")).toBeVisible();
  await expect(page.locator("#send-results-button")).toBeInViewport();
  await expect.poll(() => page.evaluate(() => document.activeElement?.id || "")).toBe("send-results-button");
  expect(runtimeErrors).toEqual([]);

  await page.locator("#send-results-button").click();

  const openedUrl = await page.evaluate(() => window.__openedUrls[0]?.[0] || "");
  const url = new URL(openedUrl);
  expect(url.searchParams.get("entry.10")).toBe("Ada");
  expect(url.searchParams.get("entry.20")).toBe("Lovelace");
  expect(url.searchParams.get("entry.30")).toBe("3/3");
  expect(url.searchParams.get("entry.40")).toBe("Animals del mar");
});

test("malformed or corrupted shared URLs fall back to the teacher view", async ({ page }) => {
  await page.goto("/index.html?p=not-a-valid-payload");
  await expect(page.getByRole("heading", { name: "Crea la teva sopa" })).toBeVisible();

  const corruptedUrl = "/index.html?p=" + encodeURIComponent(core.encodePuzzleConfig({
    version: core.SHARED_PUZZLE_VERSION,
    title: "Trencat",
    words: "balena\ndofi\npeix",
    difficulty: "easy",
    size: "10",
    lang: "ca",
    timer: 0,
    hints: 0,
    formTemplate: "",
    gridRows: ["ABC", "DEF", "GHI"],
    placementPaths: ["0.0,0.1,0.2"],
  }));

  await page.goto(corruptedUrl);
  await expect(page.getByRole("heading", { name: "Crea la teva sopa" })).toBeVisible();
  await expect(page.locator("#student-start-overlay")).toBeHidden();
});

test("mobile library starts category-first instead of showing the full word cloud", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/index.html");

  await expect(page.locator("#lib-results")).toContainText("Tria una categoria o escriu al cercador per veure paraules.");
  await expect(page.locator("#lib-results .lib-word-chip")).toHaveCount(0);

  await page.getByRole("button", { name: "Animals" }).click();
  await expect(page.locator("#lib-results .lib-word-chip")).toHaveCount(17);
});

test("defined student words open a definition modal and uncovered custom words stay inert", async ({ page }) => {
  await generatePuzzle(page, {
    title: "Animals barrejats",
    words: "gos\nbalena\ndofi",
    timer: "0",
    hints: "0",
  });
  await startStudentSession(page);

  const dogWord = page.locator("#word-list .word-item").filter({ hasText: "gos" });
  await dogWord.click();

  await expect(page.locator("#word-definition-modal")).toBeVisible();
  await expect(page.locator("#word-definition-title")).toHaveText("gos");
  await expect(page.locator("#word-definition-text")).toContainText("Animal domèstic");

  await page.keyboard.press("Escape");
  await expect(page.locator("#word-definition-modal")).toBeHidden();

  await dogWord.click();
  await page.locator("#word-definition-close").click();
  await expect(page.locator("#word-definition-modal")).toBeHidden();

  await page.locator("#word-list .word-item").filter({ hasText: "balena" }).click();
  await expect(page.locator("#word-definition-modal")).toBeHidden();
});
