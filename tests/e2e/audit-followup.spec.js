const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const core = require("../../core.js");
const { generatePuzzle, startStudentSession, unlockTeacherView, installPausedClock } = require("./helpers");
const { startOfflineServer } = require("./fixtures/offline-server");

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

function sampleFile(title, words = "sol\nluna\nmar") {
  return {
    name: "examples.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ samples: { es: [{ id: title, title, words }] } })),
  };
}

async function openImport(page) {
  const details = page.locator("details").filter({ has: page.locator("#import-samples-button") });
  if (!(await details.evaluate(node => node.open))) await details.locator("summary").click();
  const chooser = page.waitForEvent("filechooser");
  await page.locator("#import-samples-button").click();
  return chooser;
}

async function savedTitles(page) {
  // FileReader may still be importing on the first poll. Keep waiting for the
  // expected titles instead of throwing on the not-yet-created storage record.
  return page.evaluate(() => (JSON.parse(localStorage.getItem("word-search-custom-samples-v1"))?.samples?.es || []).map(sample => sample.title));
}

test("an import already open in a stale tab cannot overwrite a newer library", async ({ page, context }) => {
  await page.goto("/es.html");
  await page.locator("#title-input").fill("Trabajo compartido");
  await page.locator("#words-input").fill("sol\nluna\nmar");
  const older = await context.newPage();
  await older.goto("/es.html");
  const pendingImport = await openImport(older);
  await (await openImport(page)).setFiles(sampleFile("Ejemplo A"));
  await expect.poll(() => savedTitles(page)).toEqual(["Ejemplo A"]);
  await expect(older.locator("#workspace-conflict-modal")).toBeVisible();
  await pendingImport.setFiles(sampleFile("Ejemplo B"));
  // The asynchronous file-read continuation must also respect the conflict.
  await expect(older.locator("#import-samples-input")).toHaveValue("");
  expect(await savedTitles(page)).toEqual(["Ejemplo A"]);
  await older.locator("#workspace-reload").click();
  await expect(older.locator("#workspace-conflict-modal")).toBeHidden();
  await (await openImport(older)).setFiles(sampleFile("Ejemplo B"));
  await expect.poll(() => savedTitles(older)).toEqual(["Ejemplo A", "Ejemplo B"]);
  await expect(page.locator("#workspace-conflict-modal")).toBeVisible();
  await page.close();
  await older.reload();
  expect(await savedTitles(older)).toEqual(["Ejemplo A", "Ejemplo B"]);
  await older.close();
});

test("closing a stale tab during delete undo cannot replace a newer example library", async ({ page, context }) => {
  await installPausedClock(page);
  await page.goto("/es.html");
  await page.locator("#title-input").fill("Draft");
  await (await openImport(page)).setFiles(sampleFile("Ejemplo A"));
  await expect.poll(() => savedTitles(page)).toEqual(["Ejemplo A"]);
  const newer = await context.newPage();
  await newer.goto("/es.html");
  await page.locator("#sample-select").selectOption("custom:Ejemplo A");
  await page.locator("#delete-sample-button").click();
  await expect(page.locator("#sample-undo-toast")).toBeVisible();
  await (await openImport(newer)).setFiles(sampleFile("Ejemplo B"));
  await expect.poll(() => savedTitles(newer)).toEqual(["Ejemplo A", "Ejemplo B"]);
  await expect(page.locator("#workspace-conflict-modal")).toBeVisible();
  await page.close();
  await newer.reload();
  expect(await savedTitles(newer)).toEqual(["Ejemplo A", "Ejemplo B"]);
  await newer.close();
});

test("large shared fragments open on a fresh browser behind a request URL limit", async ({ page, browser }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async text => { window.__sharedUrl = text; } } });
  });
  const words = Array.from({ length: 40 }, (_, i) =>
    `w${String.fromCharCode(97 + Math.floor(i / 26))}${String.fromCharCode(97 + i % 26)}: ${"definición ".repeat(14)}`
  ).join("\n");
  await generatePuzzle(page, { words, timer: "0", openStudent: false });
  await page.locator("#teacher-share-button").click();
  const shared = new URL(await page.evaluate(() => window.__sharedUrl));
  expect(shared.search).toBe("");
  expect(shared.hash.length).toBeGreaterThan(8000);
  const original = await page.locator("#puzzle-grid .grid-cell").allTextContents();
  const server = await startOfflineServer({ maxUrlLength: 2048 });
  const fresh = await browser.newContext({ serviceWorkers: "block", reducedMotion: "reduce" });
  try {
    const url = new URL(server.url);
    url.hash = shared.hash;
    const legacy = new URL(url);
    legacy.search = legacy.hash.slice(1);
    legacy.hash = "";
    expect((await fresh.request.get(legacy.href)).status()).toBe(414);
    const pupil = await fresh.newPage();
    expect((await pupil.goto(url.href)).status()).toBe(200);
    await startStudentSession(pupil);
    await expect(pupil.locator("#word-list li")).toHaveCount(40);
    expect(await pupil.locator("#puzzle-grid .grid-cell").allTextContents()).toEqual(original);
    await pupil.getByRole("button", { name: "wba", exact: true }).click();
    await expect(pupil.locator("#word-definition-text")).toHaveText("definición ".repeat(14).trim());
  } finally { await fresh.close(); await server.close(); }
});

test("pasting another shared fragment in the current page opens its activity", async ({ page }) => {
  await generatePuzzle(page, { title: "Primera", timer: "0", openStudent: false });
  const key = await page.evaluate(() => JSON.parse(localStorage.getItem("word-search-activity-v1")).key);
  const second = core.encodePuzzleConfig({ ...core.decodePuzzleConfig(key), title: "Segunda" });
  await page.evaluate(fragment => { location.hash = fragment; }, new URLSearchParams({ p: second }).toString());
  await expect(page.locator("#board-title")).toHaveText("Segunda");
  await startStudentSession(page);
  await unlockTeacherView(page);
  await page.locator("#title-input").fill("Borrador posterior");
  await expect(page).toHaveURL(url => url.hash === "");
  await page.reload();
  await expect(page.locator("#title-input")).toHaveValue("Borrador posterior");
});

for (const lang of ["ca", "es", "en"]) {
  test(`${lang} overlong definitions stay intact until the teacher shortens them`, async ({ page }, testInfo) => {
    await generatePuzzle(page, { timer: "0", openStudent: false });
    await page.locator(`[data-lang="${lang}"]`).click();
    await page.setViewportSize({ width: 390, height: 844 });
    const previous = await page.evaluate(() => localStorage.getItem("word-search-activity-v1"));
    const words = `sol: ${"a".repeat(161)}\nluna\nmar`;
    await page.locator("#words-input").fill(words);
    await expect(page.locator("#words-feedback")).toContainText("sol (161/160)");
    await page.locator("#generate-button").click();
    await expect(page.locator("#words-input")).toBeFocused();
    await expect(page.locator("#words-input")).toHaveAttribute("aria-invalid", "true");
    expect(await page.evaluate(() => localStorage.getItem("word-search-activity-v1"))).toBe(previous);
    await page.locator("details").filter({ has: page.locator("#save-sample-button") }).locator("summary").click();
    await page.locator("#save-sample-button").click();
    expect(await page.evaluate(() => localStorage.getItem("word-search-custom-samples-v1"))).toBeNull();
    await page.reload();
    await expect(page.locator("#words-input")).toHaveValue(words);
    await expect(page.locator("#words-feedback")).toContainText("sol (161/160)");
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.locator("#words-input").scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`definition-warning-${lang}.png`) });
    const fixed = `sol: ${"a".repeat(160)}\nluna\nmar`;
    await page.locator("#words-input").fill(fixed);
    await expect(page.locator("#words-input")).toHaveAttribute("aria-invalid", "false");
    await page.locator("#generate-button").click();
    await expect(page.locator("#teacher-pending-changes")).toBeHidden();
    await page.locator("#teacher-open-student-button").click();
    await startStudentSession(page);
    await page.getByRole("button", { name: "sol", exact: true }).click();
    await expect(page.locator("#word-definition-text")).toHaveText("a".repeat(160));
  });
}

test("importing an overlong definition preserves the saved library", async ({ page }) => {
  await page.goto("/es.html");
  await (await openImport(page)).setFiles(sampleFile("Saved"));
  await expect.poll(() => savedTitles(page)).toEqual(["Saved"]);
  const before = await page.evaluate(() => localStorage.getItem("word-search-custom-samples-v1"));
  await (await openImport(page)).setFiles(sampleFile("Too long", `sol: ${"x".repeat(161)}\nluna\nmar`));
  await expect(page.locator("#sample-status")).toContainText("sol (161/160)");
  expect(await page.evaluate(() => localStorage.getItem("word-search-custom-samples-v1"))).toBe(before);
});
