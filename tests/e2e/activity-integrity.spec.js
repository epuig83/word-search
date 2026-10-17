const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const core = require("../../core.js");
const { generatePuzzle, startStudentSession, solvePlacement, unlockTeacherView } = require("./helpers");

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

for (const lang of ["ca", "es", "en"]) {
  test(`${lang} examples retain teacher definitions through export, reload and import`, async ({ page, browser }) => {
    const words = "sol: Una estrella, amb llum.\nluna: Mi satélite.\nsea: Salt water.";
    await page.goto(`/${lang === "ca" ? "index" : lang}.html`);
    await page.locator("#title-input").fill("Definitions");
    await page.locator("#words-input").fill(words);
    await page.locator("#save-sample-button").evaluate(button => { button.closest("details").open = true; });
    await page.locator("#save-sample-button").click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#export-samples-button").click();
    const download = await downloadPromise;
    const exported = fs.readFileSync(await download.path());
    expect(JSON.parse(exported).samples[lang][0].words).toBe(words);
    await page.reload();
    expect(await page.evaluate(language => JSON.parse(localStorage.getItem("word-search-custom-samples-v1")).samples[language][0].words, lang)).toBe(words);

    const imported = await browser.newPage({ reducedMotion: "reduce" });
    try {
      await imported.goto(page.url());
      await imported.locator("#import-samples-input").setInputFiles({ name: "examples.json", mimeType: "application/json", buffer: exported });
      await expect(imported.locator("#sample-select option[value^='custom:']")).toHaveCount(1);
      const value = await imported.locator("#sample-select option[value^='custom:']").getAttribute("value");
      await imported.locator("#sample-select").selectOption(value);
      await imported.locator("#load-sample-button").click();
      await expect(imported.locator("#teacher-ready-card")).toBeVisible();
      await expect(imported.locator("#words-input")).toHaveValue(words);
      await imported.locator("#teacher-open-student-button").click();
      await startStudentSession(imported);
      await imported.getByRole("button", { name: "sol", exact: true }).click();
      await expect(imported.locator("#word-definition-text")).toHaveText("Una estrella, amb llum.");
    } finally { await imported.close(); }
  });
}

test("a large activity retains all words, definitions and its exact board on reload and sharing", async ({ page }) => {
  const words = Array.from({ length: 60 }, (_, index) =>
    `w${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}: ${"definición ".repeat(14)}`
  ).join("\n");
  await generatePuzzle(page, { title: "Full definitions", words, timer: "0", openStudent: false });
  const key = await page.evaluate(() => JSON.parse(localStorage.getItem("word-search-activity-v1")).key);
  const config = core.decodePuzzleConfig(key);
  expect(core.parseWords(config.words).words).toHaveLength(60);
  await page.reload();
  await expect(page.locator("#teacher-ready-card")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("word-search-activity-v1")).key)).toBe(key);
  await page.goto(`/index.html?p=${encodeURIComponent(key)}`);
  await startStudentSession(page);
  await expect(page.locator("#word-list li")).toHaveCount(60);
  expect((await page.locator("#puzzle-grid .grid-cell").allTextContents()).join("")).toBe(config.gridRows.join(""));
  await page.getByRole("button", { name: "wba", exact: true }).click();
  await expect(page.locator("#word-definition-text")).toHaveText("definición ".repeat(14).trim());
});

test("an oversized activity keeps the draft and the previously reviewed board", async ({ page }) => {
  await generatePuzzle(page, { timer: "0", openStudent: false });
  const previous = await page.evaluate(() => localStorage.getItem("word-search-activity-v1"));
  const words = `s${" ".repeat(70_000)}ol\nluna\nmar`;
  await page.locator("#words-input").fill(words);
  await page.locator("#generate-button").click();
  await expect(page.locator("#status-message")).toHaveText(/massa text/);
  expect(await page.evaluate(() => localStorage.getItem("word-search-activity-v1"))).toBe(previous);
  await page.reload();
  await expect(page.locator("#words-input")).toHaveValue(words);
  await expect(page.locator("#teacher-ready-card")).toBeVisible();
  await expect(page.locator("#teacher-pending-changes")).toBeVisible();
});

for (const oldFirst of [true, false]) {
  test(`stale drafts cannot overwrite newer edits when the old tab closes ${oldFirst ? "first" : "last"}`, async ({ page, context }) => {
    await page.goto("/es.html");
    await page.locator("#title-input").fill("Old draft");
    const newer = await context.newPage();
    await newer.goto("/es.html");
    await newer.locator("#title-input").fill("Latest teacher work");
    await expect(page.locator("#workspace-conflict-modal")).toBeVisible();
    await expect(page.locator("#title-input")).toHaveValue("Old draft");
    if (oldFirst) { await page.close(); await newer.close(); }
    else { await newer.close(); await page.close(); }
    const restored = await context.newPage();
    await restored.goto("/es.html");
    await expect(restored.locator("#title-input")).toHaveValue("Latest teacher work");
    await expect(restored.locator("#workspace-conflict-modal")).toBeHidden();
    await restored.close();
  });
}

test("a stale pupil tab pauses, preserves newer progress and can explicitly load it", async ({ page, context }) => {
  await generatePuzzle(page, { words: "sol\nluna\nmar", timer: "0", size: "8" });
  await startStudentSession(page);
  const newer = await context.newPage();
  await newer.emulateMedia({ reducedMotion: "reduce" });
  await newer.goto("/index.html");
  await startStudentSession(newer);
  const config = core.decodePuzzleConfig(await newer.evaluate(() => JSON.parse(localStorage.getItem("word-search-activity-v1")).key));
  const cells = core.parsePlacementCells(config.placementPaths[0], 3, 8);
  await solvePlacement(newer, { cells });
  await expect(page.locator("#workspace-conflict-modal")).toBeVisible();
  await expect(page.locator("#workspace-reload")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#workspace-reload")).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const progress = await newer.evaluate(() => localStorage.getItem("word-search-progress-v1"));
  // Programmatic activation bypasses inert; the event guard must still stop resets.
  await page.locator("#play-again-button").evaluate(button => button.click());
  expect(await newer.evaluate(() => localStorage.getItem("word-search-progress-v1"))).toBe(progress);
  await page.locator("#workspace-reload").click();
  await expect(page.locator("#workspace-conflict-modal")).toBeHidden();
  await expect(page.locator("#progress-text")).toHaveText("1 / 3");
  await newer.close();
});

test("content keeps its source language after changing the interface, including print sheets", async ({ page }) => {
  await page.goto("/es.html");
  await page.locator("#title-input").fill("Ciencias");
  await page.locator("#words-input").fill("sol: Estrella propia\nluna\nmar");
  await page.locator("#generate-button").click();
  await expect(page.locator("#teacher-ready-card")).toBeVisible();
  await page.locator('[data-lang="en"]').click();
  await page.locator("#teacher-open-student-button").click();
  await startStudentSession(page);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "sol", exact: true })).toHaveAttribute("lang", "es");
  await page.getByRole("button", { name: "sol", exact: true }).click();
  await expect(page.locator("#word-definition-text")).toHaveAttribute("lang", "es");
  await expect(page.locator("#word-definition-title")).toHaveAttribute("lang", "es");
  await page.locator("#word-definition-close").click();
  await page.locator("#hint-button").click();
  await expect(page.locator("#hint-word-select option").first()).toHaveAttribute("lang", "es");
  await page.locator("#hint-close-button").click();
  await unlockTeacherView(page);
  await page.evaluate(() => { window.print = () => {}; });
  await page.locator("#teacher-print-button").click();
  await expect(page.locator("#variant-print-root .variant-words")).toHaveAttribute("lang", "es");
  await expect(page.locator("#variant-print-root .variant-title")).toHaveAttribute("lang", "es");
});

test("generation exposes its busy state and commits only one completed activity", async ({ page }) => {
  await page.goto("/es.html");
  await page.locator("#title-input").fill("Responsive generation");
  await page.locator("#words-input").fill("sol\nluna\nmar");
  // Count workspace commits while the UI handles a double click.
  await page.evaluate(() => {
    window.__activityWrites = 0;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "word-search-activity-v1") window.__activityWrites++;
      return setItem.call(this, key, value);
    };
    document.querySelector("#generator-form").requestSubmit();
    document.querySelector("#generator-form").requestSubmit();
    window.__busyAtSubmit = document.querySelector("#generator-form").getAttribute("aria-busy");
    window.__oldBoardAtSubmit = localStorage.getItem("word-search-activity-v1");
  });
  expect(await page.evaluate(() => window.__busyAtSubmit)).toBe("true");
  expect(await page.evaluate(() => window.__oldBoardAtSubmit)).toBeNull();
  await expect(page.locator("#teacher-ready-card")).toBeVisible();
  await expect(page.locator("#generate-button")).toBeEnabled();
  expect(await page.evaluate(() => window.__activityWrites)).toBe(1);
});

test("cooperative generation and definitions work when opened from disk", async ({ page }) => {
  await page.goto(pathToFileURL(path.resolve(__dirname, "../../index.html")).href);
  await page.locator("#title-input").fill("Local activity");
  await page.locator("#words-input").fill("sol: Llum pròpia\nmar\nona");
  await page.locator("#generate-button").click();
  await expect(page.locator("#teacher-ready-card")).toBeVisible();
  await page.locator("#teacher-open-student-button").click();
  await startStudentSession(page);
  await page.getByRole("button", { name: "sol", exact: true }).click();
  await expect(page.locator("#word-definition-text")).toHaveText("Llum pròpia");
});
