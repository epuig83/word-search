const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;
const core = require("../../core.js");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { generatePuzzle, installPausedClock, startStudentSession, solvePlacement, unlockTeacherView } = require("./helpers");

function sharedPath(overrides = {}) {
  return `/es.html?p=${encodeURIComponent(core.encodePuzzleConfig({
    version: 2, title: "Palabras repetidas", words: "sol\nmar", difficulty: "easy",
    size: "8", lang: "es", timer: 0, hints: -1,
    gridRows: ["SOLXXXXX", "SOLXXXXX", "MARXXXXX", ...Array(5).fill("XXXXXXXX")],
    placementPaths: ["0.0,0.1,0.2", "2.0,2.1,2.2"], ...overrides,
  }))}`;
}

const occurrence = row => ({ cells: [{ row, col: 0 }, { row, col: 1 }, { row, col: 2 }] });
const foundCells = page => page.locator(".grid-cell.is-found").evaluateAll(cells => cells.map(cell => `${cell.dataset.row}.${cell.dataset.col}`));

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("numbered examples survive import, reload and manual saving", async ({ page }) => {
  await page.goto("/es.html");
  const samples = { es: [1, 2].map(n => ({ id: `topic-${n}`, title: `Tema ${n}`, words: "sol\nluna\nmar", size: "8" })) };
  await page.locator("#import-samples-input").setInputFiles({
    name: "examples.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(samples)),
  });
  const options = page.locator('#sample-select option[value^="custom:"]');
  await expect(options).toHaveText(["Tema 1", "Tema 2"]);
  await page.reload();
  await expect(options).toHaveText(["Tema 1", "Tema 2"]);
  await page.locator("#sample-select").selectOption("custom:topic-1");
  await page.locator("#load-sample-button").click();
  await expect(page.locator("#teacher-ready-card")).toBeVisible();
  await page.locator("#title-input").fill("Tema 3");
  await page.locator(".sample-management summary").click();
  await page.locator("#save-sample-button").click();
  await expect(options).toHaveText(["Tema 1", "Tema 2", "Tema 3"]);
  await page.locator("#title-input").fill("  TEMA   1 ");
  await page.locator("#save-sample-button").click();
  await expect(page.locator("#confirm-modal")).toBeVisible();
  await page.locator("#confirm-modal-confirm").click();
  await expect(page.locator("#sample-select")).toHaveValue("custom:topic-1");
  await expect(options).toHaveCount(3);
});

test("an alternate occurrence keeps its own highlight through reload and resets for a new pupil", async ({ page }) => {
  const url = sharedPath();
  await page.goto(url);
  await startStudentSession(page);
  await solvePlacement(page, occurrence(1));
  await expect(page.locator("#progress-text")).toHaveText("1 / 2");
  expect(await foundCells(page)).toEqual(["1.0", "1.1", "1.2"]);
  await solvePlacement(page, occurrence(0));
  await expect(page.locator("#progress-text")).toHaveText("1 / 2");
  await expect(page.locator("#board-status")).toContainText("ya la tienes");
  await page.reload();
  await expect(page.locator("#progress-text")).toHaveText("1 / 2");
  await startStudentSession(page);
  expect(await foundCells(page)).toEqual(["1.0", "1.1", "1.2"]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(new URL(page.url()).search).toBe(new URL(url, page.url()).search);
  await page.reload();
  await page.locator("#new-student-button").click();
  await expect(page.locator("#progress-text")).toHaveText("0 / 2");
  expect(await foundCells(page)).toEqual([]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("word-search-progress-v1")).foundWordPaths)).toEqual({});
});

test("inverse words sharing cells can both be found, preferring the selected direction", async ({ page }) => {
  await page.goto(sharedPath({ words: "sol\nlos\nmar", placementPaths: ["0.0,0.1,0.2", "0.2,0.1,0.0", "2.0,2.1,2.2"] }));
  await startStudentSession(page);
  await solvePlacement(page, { cells: [...occurrence(1).cells].reverse() });
  await expect(page.locator("#word-list .is-found")).toContainText("los");
  await solvePlacement(page, occurrence(1));
  await expect(page.locator("#progress-text")).toHaveText("2 / 3");
  await solvePlacement(page, occurrence(1));
  await expect(page.locator("#progress-text")).toHaveText("2 / 3");
});

test.describe("touch and keyboard on small screens", () => {
  test.use({ hasTouch: true });
  for (const width of [320, 375, 414, 768]) {
    test(`alternate occurrences remain playable at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(sharedPath());
      await startStudentSession(page);
      const cell = (row, col) => page.locator(`#puzzle-grid [data-row="${row}"][data-col="${col}"]`);
      const geometry = await page.evaluate(() => {
        const rect = document.querySelector(".grid-cell").getBoundingClientRect();
        return { width: document.documentElement.scrollWidth, cellWidth: rect.width, cellHeight: rect.height };
      });
      expect(geometry.width).toBeLessThanOrEqual(width);
      expect(geometry.cellWidth).toBeGreaterThanOrEqual(24);
      expect(geometry.cellHeight).toBeGreaterThanOrEqual(24);
      await cell(1, 0).tap();
      await cell(1, 2).tap();
      await expect(page.locator("#progress-text")).toHaveText("1 / 2");
      expect(await foundCells(page)).toEqual(["1.0", "1.1", "1.2"]);
      await cell(2, 0).focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("ArrowRight");
      await page.keyboard.press("Enter");
      await expect(page.locator("#progress-text")).toHaveText("2 / 2");
      await expect(page.locator("#completion-message")).toBeVisible();
    });
  }
});

for (const savedPath of [null, "0.0,1.1,2.0", "3.0,3.1,3.2"]) {
  test(`old or invalid saved selections use the original placement: ${savedPath}`, async ({ page }) => {
    const url = sharedPath();
    const key = new URL(url, "http://localhost").searchParams.get("p");
    await page.addInitScript(({ key, savedPath }) => {
      localStorage.setItem("word-search-progress-v1", JSON.stringify({ key, foundWordIds: ["SOL"], started: true,
        ...(savedPath === null ? {} : { foundWordPaths: { SOL: savedPath } }),
      }));
    }, { key, savedPath });
    await page.goto(url);
    await startStudentSession(page);
    await expect(page.locator("#progress-text")).toHaveText("1 / 2");
    expect(await foundCells(page)).toEqual(["0.0", "0.1", "0.2"]);
  });
}

test("a shared zigzag is rejected without losing the teacher draft", async ({ page }) => {
  await page.goto("/es.html");
  await page.locator("#title-input").fill("Mi borrador");
  await page.locator("#words-input").fill("sol\nm");
  await page.goto(sharedPath({ words: "sol", gridRows: ["SXX", "XOX", "LXX"], placementPaths: ["0.0,1.1,2.0"] }));
  await expect(page.locator("#section-teacher")).toBeVisible();
  await expect(page.locator("#status-message")).toHaveClass(/is-error/);
  await page.goto("/es.html");
  await expect(page.locator("#title-input")).toHaveValue("Mi borrador");
});

test("clearing invalid text also clears the saved draft and updates pending changes", async ({ page }) => {
  await page.goto(sharedPath());
  await unlockTeacherView(page);
  for (const text of ["x\ny\n!", "   "]) {
    await page.locator("#words-input").fill(text);
    await expect(page.locator("#teacher-pending-changes")).toBeVisible();
    await expect(page.locator("#clear-words-button")).toBeEnabled();
    await page.locator("#clear-words-button").click();
    await expect(page.locator("#words-input")).toBeEmpty();
    await expect(page.locator("#clear-words-button")).toBeDisabled();
    await expect(page.locator("#words-count")).toContainText("0");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("word-search-draft-v1")).words)).toBe("");
  }
});

test("library search ignores accents and looks beyond the active category", async ({ page }) => {
  await page.goto("/index.html");
  const results = page.locator("#lib-results .lib-word-chip");
  await page.locator("#lib-search").fill("lleo");
  await expect(results).toHaveText(["lleó"]);
  // Animals is the active category; a fruit must still be found.
  await page.locator("#lib-search").fill("poma");
  await expect(results).toHaveText(["poma"]);
});

test("example actions report next to their controls, not far below", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#title-input").fill("Sistema solar");
  await page.locator("#words-input").fill("sol\nlluna\nmart");
  await page.locator(".sample-management summary").click();
  const status = page.locator("#sample-status");
  await page.locator("#save-sample-button").click();
  await expect(status).toBeInViewport();
  await expect(status).toContainText("desat");
  // A saved example named like a built-in one names its group in the closed select.
  await expect(page.locator('#sample-select option[value^="custom:"]')).toHaveText(["Sistema solar · Els meus exemples"]);
  await expect(page.locator("#delete-sample-button")).toBeEnabled();
  await page.locator("#delete-sample-button").click();
  await expect(status).toBeHidden();
  await page.locator("#sample-undo-button").click();
  await expect(status).toContainText("recuperat");
  await page.locator("#sample-select").selectOption("builtin:0");
  await expect(page.locator("#delete-sample-button")).toBeDisabled();
  await expect(page.locator("#delete-sample-button")).toHaveCSS("cursor", "not-allowed");
});

test("the variants dialog does not repeat its introduction before preparing", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#title-input").fill("Animals");
  await page.locator("#words-input").fill("gos\ngat\nlleó");
  await page.locator("#generate-button").click();
  await page.locator("#teacher-variants-button").click();
  await expect(page.locator("#variants-intro")).toBeVisible();
  await expect(page.locator("#variants-status")).toHaveText("");
  await expect(page.locator("#variants-print")).toHaveCSS("cursor", "not-allowed");
});

test("keyboard users keep their place in the word library", async ({ page }) => {
  await page.goto("/index.html");
  const fruits = page.locator("#lib-categories .category-chip", { hasText: "Fruites" });
  await fruits.focus();
  await page.keyboard.press("Enter");
  await expect(fruits).toBeFocused();
  await expect(fruits).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#lib-categories .category-chip", { hasText: "Animals" })).toHaveAttribute("aria-pressed", "false");

  const chips = page.locator("#lib-results .lib-word-chip");
  const first = await chips.nth(0).textContent();
  const second = await chips.nth(1).textContent();
  await chips.nth(0).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#words-input")).toHaveValue(first);
  await expect(page.locator("#lib-results .lib-word-chip:focus")).toHaveText(second);
});

test("open teacher sections show a minus marker and the form URL error is announced", async ({ page }) => {
  await page.goto("/index.html");
  const summary = page.locator("#form-config-details > summary");
  await summary.click();
  expect(await summary.evaluate(el => getComputedStyle(el, "::after").content)).toBe('"−"');
  await page.locator("#form-template-input").fill("hola");
  await expect(page.locator("#form-url-error")).toHaveAttribute("role", "alert");
  await expect(page.locator("#form-template-input")).toHaveAttribute("aria-invalid", "true");
  await page.locator("#form-template-input").fill("");
  await expect(page.locator("#form-template-input")).toHaveAttribute("aria-invalid", "false");
});

test("each library chip group is a single Tab stop with arrow-key navigation", async ({ page }) => {
  await page.goto("/index.html");
  const categories = page.locator("#lib-categories");
  const words = page.locator("#lib-results");
  await expect(categories).toHaveAttribute("role", "toolbar");
  await expect(categories).toHaveAttribute("aria-label", "Categories de la biblioteca");
  await expect(words).toHaveAttribute("role", "toolbar");

  await page.locator("#lib-search").focus();
  await page.keyboard.press("Tab");
  await expect(categories.locator(".category-chip.is-active")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(categories.locator(".category-chip").nth(2)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(categories.locator(".category-chip").first()).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(categories.locator(".category-chip").last()).toBeFocused();

  await page.keyboard.press("Tab");
  const chips = words.locator(".lib-word-chip");
  await expect(chips.first()).toBeFocused();
  await page.keyboard.press("End");
  await expect(chips.last()).toBeFocused();

  // One more Tab leaves the library entirely instead of walking every chip.
  await page.keyboard.press("Tab");
  const focusedInLibrary = await page.evaluate(() => Boolean(document.activeElement.closest("#lib-categories, #lib-results")));
  expect(focusedInLibrary).toBe(false);
});

test("the words helper explains removed symbols and the 60-word limit", async ({ page }) => {
  await page.goto("/index.html");
  const many = Array.from({ length: 62 }, (_, i) => `mot${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`);
  await page.locator("#words-input").fill(["1a2b", "col·legi", "d'aigua", ...many].join("\n"));
  const feedback = page.locator("#words-feedback");
  await expect(feedback).toContainText("1a2b");
  await expect(feedback).not.toContainText("col·legi");
  await expect(feedback).toContainText("Màxim 60 paraules: s'ometen les 5 últimes.");
});

test("on Automatic a word longer than the biggest board asks to shorten it", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#title-input").fill("Paraules");
  await page.locator("#words-input").fill("supercalifragilisticexpialidos\ngat\ngos");
  await page.locator("#advanced-settings-details summary").click();
  await page.locator("#size-input").selectOption("auto");
  await expect(page.locator("#words-feedback")).toContainText("més de 22 lletres");
  await page.locator("#generate-button").click();
  await expect(page.locator("#status-message")).toContainText("Escurça-la");
  await expect(page.locator("#status-message")).not.toContainText("Automàtic");
});

test("a copy opened from disk switches language and shares the public link", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__copiedText = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText(text) { window.__copiedText = text; return Promise.resolve(); } },
    });
  });
  await page.goto(pathToFileURL(path.resolve(__dirname, "../../index.html")).href);
  await page.locator('[data-lang="es"]').click();
  await expect(page.locator("#generate-button")).toHaveText("Crear y revisar la actividad");
  await page.reload();
  await expect(page.locator("#generate-button")).toHaveText("Crear y revisar la actividad");

  await page.locator("#title-input").fill("Mar");
  await page.locator("#words-input").fill("sol\nmar");
  await page.locator("#generate-button").click();
  await page.locator("#teacher-share-button").click();
  // A file:// link would point at the teacher's own disk, and name their account.
  await expect.poll(() => page.evaluate(() => window.__copiedText))
    .toMatch(/^https:\/\/epuig83\.github\.io\/word-search\/es\.html\?p=/);
  expect(errors).toEqual([]);
});

test("a revealed solution is hidden again for the next pupil", async ({ page }) => {
  await page.goto(sharedPath());
  await startStudentSession(page);
  await page.locator("#teacher-tools summary").click();
  await page.locator("#solution-toggle-button").click();
  await page.locator("#pin-input").fill("1234");
  await page.locator("#pin-submit").click();
  await expect(page.locator("body")).toHaveAttribute("data-mode", "teacher");

  await page.locator("#reset-progress-button").click();
  await page.locator("#confirm-modal-confirm").click();
  await startStudentSession(page);
  await expect(page.locator("body")).toHaveAttribute("data-mode", "student");
  await expect(page.locator(".grid-cell.is-solution")).toHaveCount(0);
});

test("a second finger or a palm does not take over a word being traced", async ({ page }) => {
  await page.goto(sharedPath());
  await startStudentSession(page);
  await page.evaluate(() => {
    const cell = (row, col) => document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    const fire = (element, type, pointerId) => {
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(new PointerEvent(type, {
        bubbles: true, pointerId, isPrimary: pointerId === 1, pointerType: "touch", button: type === "pointermove" ? -1 : 0,
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
      }));
    };
    fire(cell(0, 0), "pointerdown", 1);
    fire(cell(0, 2), "pointermove", 1);
    fire(cell(5, 5), "pointerdown", 2);
    fire(cell(5, 5), "pointerup", 2);
    fire(cell(0, 2), "pointerup", 1);
  });
  await expect(page.locator("#progress-text")).toHaveText("1 / 2");
});

test("time running out leaves focus in an open dialog", async ({ page }) => {
  await installPausedClock(page);
  await generatePuzzle(page, { words: "sol\ngat\nmar", size: "8", timer: "300", hints: "0" });
  await startStudentSession(page);
  await page.locator(".word-definition-button").first().click();
  await expect(page.locator("#word-definition-modal")).toBeVisible();
  await page.clock.runFor(301000);
  await expect(page.locator("#completion-message")).toBeVisible();
  // Otherwise Enter lands on "Play again" behind the dialog and wipes the result.
  await expect(page.locator("#word-definition-modal :focus")).toHaveCount(1);
});

test("pupils can go back to the result card to send it", async ({ page }) => {
  await installPausedClock(page);
  await generatePuzzle(page, {
    size: "8", timer: "300", hints: "0",
    formTemplate: "https://docs.google.com/forms/d/e/ABC/viewform?entry.1=n&entry.2=c&entry.3=r&entry.4=t",
  });
  await startStudentSession(page);
  await expect(page.locator("#view-result-button")).toBeHidden();
  await page.clock.runFor(301000);
  await page.locator("#view-board-button").click();
  await expect(page.locator("#send-results-button")).toBeHidden();

  // Keyboard users can still explore the revealed solution.
  await page.locator('[data-row="0"][data-col="0"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-row="0"][data-col="1"]')).toBeFocused();

  await page.locator("#view-result-button").click();
  await expect(page.locator("#send-results-button")).toBeFocused();
  await expect(page.locator("#view-result-button")).toBeHidden();
});

test("high contrast hover keeps the first selected letter readable", async ({ page }) => {
  await page.goto(sharedPath());
  await startStudentSession(page);
  await page.locator("#contrast-toggle").click();
  const anchor = page.locator('[data-row="0"][data-col="0"]');
  await anchor.click();
  await expect(anchor).toHaveClass(/is-anchor/);
  await anchor.hover();
  await expect(anchor).toHaveCSS("background-image", "none");
});

test("found words are announced as found in the word list", async ({ page }) => {
  await page.goto(sharedPath());
  await startStudentSession(page);
  await solvePlacement(page, occurrence(2));
  await expect(page.locator("#word-list .word-item.is-found")).toContainText("palabra encontrada");
  await expect(page.locator("#word-list .word-item:not(.is-found)")).not.toContainText("palabra encontrada");
});

const savedPlacements = page => page.evaluate(() => {
  const config = globalThis.WORD_SEARCH_CORE.decodePuzzleConfig(JSON.parse(localStorage.getItem("word-search-activity-v1")).key);
  return config.placementPaths.map(path => ({ cells: path.split(",").map(value => {
    const [row, col] = value.split(".").map(Number);
    return { row, col };
  }) }));
});

test("a resting thumb or a palm that landed first does not block tracing", async ({ page }) => {
  await page.goto(sharedPath());
  await startStudentSession(page);
  const trace = steps => page.evaluate(list => {
    for (const [target, type, pointerId, isPrimary] of list) {
      const element = typeof target === "string" ? document.querySelector(target) : document.querySelector(`[data-row="${target[0]}"][data-col="${target[1]}"]`);
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(new PointerEvent(type, {
        bubbles: true, pointerId, isPrimary, pointerType: "touch", button: type === "pointermove" ? -1 : 0,
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
      }));
    }
  }, steps);
  // A thumb holding the tablet touches the screen first, so the tracing finger is not primary.
  await trace([
    ["#board-title", "pointerdown", 1, true],
    [[0, 0], "pointerdown", 2, false], [[0, 2], "pointermove", 2, false], [[0, 2], "pointerup", 2, false],
    ["#board-title", "pointerup", 1, true],
  ]);
  await expect(page.locator("#progress-text")).toHaveText("1 / 2");
  // A wrist resting on the board first must not own the trace either.
  await trace([
    [[5, 5], "pointerdown", 3, true],
    [[2, 0], "pointerdown", 4, false], [[2, 2], "pointermove", 4, false], [[2, 2], "pointerup", 4, false],
    [[5, 5], "pointerup", 3, true],
  ]);
  await expect(page.locator("#progress-text")).toHaveText("2 / 2");
});

test("a board shared before the accent fix still opens with its original letters", async ({ page }) => {
  // Before 2026-09-26 a decomposed ñ (n + combining tilde) was saved as N.
  await page.goto(sharedPath({
    words: "sol\naño",
    gridRows: ["SOLXXXXX", "XXXXXXXX", "ANOXXXXX", ...Array(5).fill("XXXXXXXX")],
  }));
  await startStudentSession(page);
  await solvePlacement(page, occurrence(2));
  await expect(page.locator("#progress-text")).toHaveText("1 / 2");
});

test("the Google Forms link shows which question receives each value", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#form-config-details summary").click();
  const input = page.locator("#form-template-input");
  const mapping = page.locator("#form-url-mapping");
  await input.fill("https://docs.google.com/forms/d/e/ABC/viewform?usp=pp_url&entry.1=Tema&entry.2=Maria&entry.3=7/8");
  await expect(mapping).toContainText("3 de 4");
  await input.fill("https://docs.google.com/forms/d/e/ABC/viewform?usp=pp_url&entry.1=Maria&entry.2=Puig&entry.3=7/8&entry.4=Animals");
  await expect(mapping).toHaveText(/«Maria».*nom.*«Puig».*cognoms.*«7\/8».*resultat.*«Animals».*tema/);
  await input.fill("");
  await expect(mapping).toBeHidden();
});

test("on a phone the finished card is readable and clear of the game bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await generatePuzzle(page, { words: "gos\ngat\nvaca", size: "8", timer: "600", hints: "0" });
  await startStudentSession(page);
  for (const placement of await savedPlacements(page)) await solvePlacement(page, placement);
  await expect(page.locator("#completion-message")).toBeVisible();
  // Static positioning let the board's finishing veil paint over the card.
  await expect(page.locator("#completion-message")).not.toHaveCSS("position", "static");
  const button = await page.locator("#view-board-button").boundingBox();
  const bar = await page.locator("#student-gamebar").boundingBox();
  expect(button.y + button.height).toBeLessThanOrEqual(bar.y);
});

test("on a portrait tablet a big board starts at the top of the pupil area", async ({ page }) => {
  await page.setViewportSize({ width: 810, height: 1080 });
  const words = ["elefant", "girafa", "rinoceront", "cocodril", "orangutan", "hipopotam", "serpentina", "papallona",
    "llangardaix", "tortuga", "camaleo", "formiguer", "esquirol", "salamandra", "dromedari", "ornitorrinc",
    "cavall", "conill", "guineu", "teixo"].join("\n");
  await generatePuzzle(page, { words, size: "16", timer: "600", hints: "3" });
  await expect(page.locator("#student-start-button")).toBeFocused();
  await page.locator("#student-start-button").click();
  const title = await page.locator("#board-title").boundingBox();
  expect(title.y).toBeGreaterThanOrEqual(0);
});

test("a 22 × 22 board fits a 1366 × 768 projector without hidden columns", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await generatePuzzle(page, { words: "hipopotamoenormeblau\nbalena\ndofi", size: "auto", timer: "0", hints: "0" });
  await startStudentSession(page);
  await expect(page.locator("#puzzle-grid")).toHaveAttribute("data-grid-size", "22");
  await expect(page.locator("#grid-container")).not.toHaveClass(/is-scrollable/);
});

const I18N = (require("../../i18n.js"), globalThis.WORD_SEARCH_I18N);
const stored = (page, key) => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey) || "null"), key);
const examplesFile = samples => ({ name: "examples.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ es: samples })) });

test("a broken link reopens this device's activity instead of an unlocked teacher panel", async ({ page }) => {
  await generatePuzzle(page, { timer: "0" });
  await expect(page.locator("#section-student")).toBeVisible();
  for (const query of ["?p=", "?p=roto"]) {
    await page.goto(`/index.html${query}`);
    await expect(page.locator("#section-student")).toBeVisible();
    await expect(page.locator("#section-teacher")).toBeHidden();
  }
});

test("changing a custom PIN asks for the current one", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#pin-change-details summary").click();
  const current = page.locator("#current-pin-input");
  await expect(current).toBeHidden();
  const change = async (pin, currentPin) => {
    if (currentPin !== undefined) await current.fill(currentPin);
    await page.locator("#new-pin-input").fill(pin);
    await page.locator("#confirm-pin-input").fill(pin);
    await page.locator("#save-pin-button").click();
  };
  await change("2580");
  // Saving closes the section; reopen it to change the PIN again.
  await page.locator("#pin-change-details summary").click();
  await expect(current).toBeVisible();
  await change("3691", "0000");
  await expect(page.locator("#pin-change-message")).toHaveText(I18N.ca.pin_current_wrong);
  expect(await page.evaluate(() => localStorage.getItem("word-search-teacher-pin-v1"))).toBe("2580");
  await change("3691", "2580");
  await expect(page.locator("#pin-change-message")).toHaveClass(/is-success/);
  expect(await page.evaluate(() => localStorage.getItem("word-search-teacher-pin-v1"))).toBe("3691");
});

test("a PIN that could not be saved does not replace the working one", async ({ page }) => {
  await generatePuzzle(page, { timer: "0" });
  await unlockTeacherView(page);
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "word-search-teacher-pin-v1") throw new Error("quota");
      return setItem.call(this, key, value);
    };
  });
  await page.locator("#pin-change-details summary").click();
  await page.locator("#new-pin-input").fill("2580");
  await page.locator("#confirm-pin-input").fill("2580");
  await page.locator("#save-pin-button").click();
  await expect(page.locator("#pin-change-message")).toHaveClass(/is-error/);
  await page.locator("#teacher-open-student-button").click();
  await unlockTeacherView(page);
  await expect(page.locator("#section-teacher")).toBeVisible();
});

test("opening a shared link keeps the teacher's unfinished draft", async ({ page }) => {
  await page.goto("/es.html");
  await page.locator("#title-input").fill("Borrador de clase");
  await expect.poll(async () => (await stored(page, "word-search-draft-v1"))?.title).toBe("Borrador de clase");
  await page.goto(sharedPath());
  await expect(page.locator("#section-student")).toBeVisible();
  await unlockTeacherView(page);
  await expect(page.locator("#section-teacher")).toBeVisible();
  expect((await stored(page, "word-search-draft-v1")).title).toBe("Borrador de clase");
  // A real edit of the shared activity becomes the new draft.
  await page.locator("#title-input").fill("Palabras repetidas 2");
  await expect.poll(async () => (await stored(page, "word-search-draft-v1"))?.title).toBe("Palabras repetidas 2");
});

test("a missing topic is explained next to the field", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#words-input").fill("gat\ngos");
  await page.locator("#generate-button").click();
  const title = page.locator("#title-input");
  await expect(title).toBeFocused();
  await expect(title).toHaveAttribute("aria-invalid", "true");
  await expect(title).toHaveAccessibleDescription(I18N.ca.msg_requires_title);
  await expect(page.locator("#title-error")).toBeInViewport();
  await title.fill("Animals");
  await expect(page.locator("#title-error")).toBeHidden();
  await expect(title).not.toHaveAttribute("aria-invalid", "true");
});

test("the pending-changes notice appears once, in the ready card", async ({ page }) => {
  await generatePuzzle(page, { openStudent: false });
  await page.locator("#title-input").fill("Un altre tema");
  await expect(page.locator("#teacher-pending-changes")).toBeVisible();
  await expect(page.locator("#status-message")).not.toContainText(I18N.ca.activity_pending);
});

test("switching language keeps the current error message", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#title-input").fill("Animals");
  await page.locator("#generate-button").click();
  await expect(page.locator("#status-message")).toHaveText(I18N.ca.words_summary_empty);
  await page.locator('[data-lang="en"]').click();
  await expect(page.locator("#status-message")).toHaveText(I18N.en.words_summary_empty);
  await expect(page.locator("#status-message")).toHaveClass(/is-error/);
});

test("importing examples asks before replacing ones with the same title", async ({ page }) => {
  await page.goto("/es.html");
  const input = page.locator("#import-samples-input");
  await input.setInputFiles(examplesFile([{ id: "a", title: "Tema 1", words: "sol\nluna\nmar", size: "8" }]));
  await expect(page.locator('#sample-select option[value^="custom:"]')).toHaveText(["Tema 1"]);
  await input.setInputFiles(examplesFile([{ id: "b", title: "Tema 1", words: "pez\nrio\nsal", size: "8" }]));
  await expect(page.locator("#confirm-modal")).toBeVisible();
  await page.locator("#confirm-modal-cancel").click();
  expect((await stored(page, "word-search-custom-samples-v1")).samples.es[0].words).toBe("sol\nluna\nmar");
  await input.setInputFiles(examplesFile([{ id: "b", title: "Tema 1", words: "pez\nrio\nsal", size: "8" }]));
  await page.locator("#confirm-modal-confirm").click();
  await expect.poll(async () => (await stored(page, "word-search-custom-samples-v1")).samples.es[0].words).toBe("pez\nrio\nsal");
});

test("deleting an example survives other saves, undo and a quick reload", async ({ page }) => {
  await page.goto("/es.html");
  const options = page.locator('#sample-select option[value^="custom:"]');
  await page.locator("#import-samples-input").setInputFiles(examplesFile([
    { id: "a", title: "Tema 1", words: "sol\nluna\nmar", size: "8" },
    { id: "b", title: "Tema 2", words: "pez\nrio\nsal", size: "8" },
  ]));
  await page.locator(".sample-management").evaluate(details => { details.open = true; });
  // Undo after another save in the 5-second window must still be stored.
  await page.locator("#sample-select").selectOption("custom:a");
  await page.locator("#delete-sample-button").click();
  await page.locator("#import-samples-input").setInputFiles(examplesFile([{ id: "c", title: "Tema 3", words: "luz\nmes\nave", size: "8" }]));
  await page.locator("#sample-undo-button").click();
  await page.reload();
  await expect(options).toHaveText(["Tema 1", "Tema 2", "Tema 3"]);
  // A delete followed at once by closing the page stays deleted.
  await page.locator(".sample-management").evaluate(details => { details.open = true; });
  await page.locator("#sample-select").selectOption("custom:b");
  await page.locator("#delete-sample-button").click();
  await page.reload();
  await expect(options).toHaveText(["Tema 1", "Tema 3"]);
});

test("counts of one use the singular", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#words-input").fill("gat");
  await expect(page.locator("#words-count")).toHaveText("1 paraula vàlida");
  await page.locator("#words-input").fill("gat\ngos");
  await expect(page.locator("#words-count")).toHaveText("2 paraules vàlides");
});
