const { test, expect } = require("@playwright/test");
const core = require("../../core.js");
const { startStudentSession, solvePlacement, unlockTeacherView, waitForOfflineControl } = require("./helpers");

const sunClue = "Estrella que nos da luz y calor.";
const moonClue = "Satélite que gira alrededor de la Tierra.";

function sharedActivity(firstClue = sunClue) {
  const key = core.encodePuzzleConfig({
    title: "El cielo", words: `sol: ${firstClue}\nluna: ${moonClue}`, definitionMode: true,
    lang: "es", size: "8", difficulty: "easy", hints: 3, timer: 0,
    gridRows: ["SOLXXXXX", "LUNAXXXX", ...Array(6).fill("XXXXXXXX")],
    placementPaths: ["0.0,0.1,0.2", "1.0,1.1,1.2,1.3"],
  });
  return `/es.html#p=${encodeURIComponent(key)}`;
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("teachers can recover a definition draft, check missing clues and share the exact reviewed activity", async ({ page, browser }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      async writeText(text) { window.copiedActivity = text; },
    } });
  });
  await page.goto("/es.html");
  const mode = page.getByRole("checkbox", { name: "Jugar por definiciones" });
  const words = page.locator("#words-input");
  await expect(mode).not.toBeChecked();
  await page.locator("#title-input").fill("El cielo");
  await words.fill(`sol: ${sunClue}\nluna\npúlsar`);
  await mode.focus();
  await mode.press("Space");
  await page.locator("#generate-button").click();
  await expect(words).toBeFocused();
  await expect(words).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#words-feedback")).toHaveText("Añade una definición para púlsar.");
  await page.reload();
  await expect(mode).toBeChecked();
  await words.fill(`sol: ${sunClue}\nluna`);
  await page.locator("#generate-button").click();
  const preview = page.locator("#teacher-preview-words li");
  await expect(preview).toHaveText([sunClue, moonClue]);
  await page.locator("#teacher-preview-solution").click();
  await expect(preview).toHaveText([`sol — ${sunClue}`, `luna — ${moonClue}`]);
  const share = page.locator("#teacher-share-button");
  await mode.uncheck();
  await expect(share).toBeDisabled();
  await mode.check();
  await share.click();
  await expect.poll(() => page.evaluate(() => window.copiedActivity)).toContain("#p=");
  const url = await page.evaluate(() => window.copiedActivity);
  const pupil = await browser.newPage();
  try {
    await pupil.goto(url);
    await startStudentSession(pupil);
    await expect(pupil.locator("#word-list button")).toHaveText([sunClue, moonClue]);
    expect(await pupil.locator("#puzzle-grid .grid-cell").allTextContents()).toEqual(
      await page.locator("#teacher-preview-grid .teacher-preview-cell").allTextContents()
    );
  } finally {
    await pupil.close();
  }
});

test("reading, listening and both hint stages keep the answer hidden until it is found, including after reload", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      getVoices: () => [{ lang: "es-ES", name: "Mónica", localService: true }],
      speak(utterance) { window.spokenClue = utterance.text; },
      cancel() {},
    } });
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
  });
  await page.goto(sharedActivity());
  await expect(page.locator("#student-start-text")).toContainText("Lee una definición");
  await expect(page.locator("#selection-demo")).toBeHidden();
  await startStudentSession(page);
  const sun = page.locator("#word-list button").first();
  await expect(sun).toHaveAccessibleName(sunClue);
  await sun.click();
  await expect(page.getByRole("dialog", { name: "¿Qué palabra es?" })).toBeVisible();
  await page.locator("#word-definition-listen").click();
  expect(await page.evaluate(() => window.spokenClue)).toBe(sunClue);
  await page.keyboard.press("Escape");
  await page.locator("#hint-button").click();
  await expect(page.getByRole("combobox", { name: "¿Con qué definición necesitas ayuda?" })).toBeVisible();
  await expect(page.locator("#hint-word-select option")).toHaveText([sunClue, moonClue]);
  await page.locator("#hint-start-button").click();
  const hint = page.locator("#active-hint-text");
  await expect(hint).toHaveText(`${sunClue} · La primera letra está en la fila 1, columna 1.`);
  await page.locator("#active-hint-direction").click();
  await expect(hint).toContainText("hacia la derecha");
  await page.reload();
  await startStudentSession(page);
  await expect(hint).toContainText(sunClue);
  await expect(hint).not.toContainText(/\bsol\b/i);
  await solvePlacement(page, { cells: [{ row: 0, col: 0 }, { row: 0, col: 2 }] });
  await expect(sun).toContainText(`sol — ${sunClue}`);
  await expect(page.locator("#word-list button").last()).toHaveText(moonClue);
  await page.reload();
  await startStudentSession(page);
  await expect(page.locator("#progress-text")).toHaveText("1 / 2");
  await expect(sun).toContainText(`sol — ${sunClue}`);
  await unlockTeacherView(page);
  await page.locator('[data-lang="en"]').click();
  await page.locator("#teacher-open-student-button").click();
  await expect(page.locator("#word-bank-label")).toHaveText("Definitions");
  await page.locator("#word-list button").last().click();
  await expect(page.getByRole("dialog", { name: "What’s the word?" })).toBeVisible();
  await expect(page.locator("#word-definition-text")).toHaveAttribute("lang", "es");
  await expect(page.locator("#word-definition-text")).toHaveText(moonClue);
  await page.locator("#word-definition-close").click();
  await page.locator("#hint-button").click();
  await page.locator("#hint-start-button").click();
  await expect(page.locator("#active-hint-clue")).toHaveAttribute("lang", "es");
  await expect(page.locator("#active-hint-clue")).toContainText(moonClue);
  await expect(page.locator("#active-hint-instruction")).toHaveText("The first letter is in row 2, column 1.");
});

test("single and variant worksheets use definitions while their answer keys pair each clue with its word", async ({ page, browserName }) => {
  await page.addInitScript(() => { window.print = () => {}; });
  await page.goto(sharedActivity());
  await startStudentSession(page);
  await solvePlacement(page, { cells: [{ row: 0, col: 0 }, { row: 0, col: 2 }] });
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  const root = page.locator("#variant-print-root");
  await expect(root.locator(".variant-words li")).toHaveText([sunClue, moonClue]);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await unlockTeacherView(page);
  await page.locator("#teacher-print-button").click();
  await expect(root.locator(".variant-instructions")).toContainText("Lee cada definición");
  await expect(root.locator(".variant-words li")).toHaveText([sunClue, moonClue]);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.locator("#teacher-print-solution-button").click();
  await expect(root.locator(".variant-words li")).toHaveText([`sol — ${sunClue}`, `luna — ${moonClue}`]);
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.locator("#teacher-variants-button").click();
  await page.locator("#variants-prepare").click();
  await page.locator("#variants-print").click();
  const sheets = root.locator(".variant-sheet");
  await expect(sheets).toHaveCount(4);
  for (const index of [0, 1]) {
    await expect(sheets.nth(index).locator("li")).toHaveText([sunClue, moonClue]);
    await expect(sheets.nth(index + 2).locator("li")).toHaveText([`sol — ${sunClue}`, `luna — ${moonClue}`]);
  }
  if (browserName === "chromium") {
    const pdf = await page.pdf({ preferCSSPageSize: true });
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(4);
  }
});

test("saved examples keep their mode and library clues, and a regular example returns to the word list", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#title-input").fill("Animals del pati");
  await page.locator("#words-input").fill("gat\ngos\ncolom: Ocell que parrupa.");
  const mode = page.getByRole("checkbox", { name: "Jugar amb definicions" });
  await mode.check();
  await page.locator(".sample-management summary").click();
  await page.locator("#save-sample-button").click();
  const select = page.locator("#sample-select");
  await expect(select).toHaveValue(/^custom:/);
  await page.reload();
  await mode.uncheck();
  await select.selectOption({ label: "Animals del pati" });
  await page.locator("#load-sample-button").click();
  await page.locator("#confirm-modal-confirm").click();
  await expect(mode).toBeChecked();
  await expect(page.locator("#teacher-preview-words li")).toHaveText([
    "Animal domèstic que miola.", "Animal domèstic que lladra.", "Ocell que parrupa.",
  ]);
  await select.selectOption("builtin:0");
  await page.locator("#load-sample-button").click();
  await page.locator("#confirm-modal-confirm").click();
  await expect(mode).not.toBeChecked();
  await expect(page.locator("#teacher-preview-words li").first()).toHaveText("gos");
});

test("long clues fit a phone screen and the activity continues offline @chromium", async ({ page, context }) => {
  const longClue = "Una estrella " + "a".repeat(145);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(sharedActivity(longClue));
  await waitForOfflineControl(page);
  await context.setOffline(true);
  await page.reload();
  await startStudentSession(page);
  await page.locator("#word-list button").first().click();
  const dialog = page.locator(".word-definition-modal-content");
  await expect(page.locator("#word-definition-text")).toHaveText(longClue);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.locator("#word-definition-close").click();
  await page.locator("#hint-button").click();
  await page.locator("#hint-start-button").click();
  await expect(page.locator("#active-hint-text")).toContainText(longClue);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await solvePlacement(page, { cells: [{ row: 1, col: 0 }, { row: 1, col: 3 }] });
  await page.reload();
  await startStudentSession(page);
  await expect(page.locator("#progress-text")).toHaveText("1 / 2");
  await expect(page.locator("#word-list button").first()).toHaveAccessibleName(longClue);
  await expect(page.locator("#active-hint-text")).toContainText(longClue);
});

test("a single worksheet with long definitions flows onto additional A4 pages @chromium", async ({ page }) => {
  const clue = "Busca la palabra que corresponde a la descripción. ".repeat(3).trim();
  const words = Array.from({ length: 30 }, (_, i) => {
    const word = "w" + String.fromCharCode(97 + Math.floor(i / 26), 97 + i % 26);
    return `${word}: ${clue} ${i + 1}`;
  });
  await page.goto("/es.html");
  await page.locator("#title-input").fill("Cuaderno de definiciones");
  await page.locator("#words-input").fill(words.join("\n"));
  await page.locator("#definition-mode").check();
  await page.locator("#advanced-settings-details summary").click();
  await page.locator("#size-input").selectOption("16");
  await page.locator("#generate-button").click();
  await page.evaluate(() => { window.print = () => {}; });
  await page.locator("#teacher-print-button").click();
  const entries = page.locator("#variant-print-root .variant-words li");
  await expect(entries).toHaveCount(30);
  await expect(entries.last()).toHaveText(`${clue} 30`);
  const pdf = await page.pdf({ preferCSSPageSize: true });
  expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g).length).toBeGreaterThan(1);
});
