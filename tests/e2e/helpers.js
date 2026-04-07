const { expect } = require("@playwright/test");

async function generatePuzzle(page, options = {}) {
  const {
    title = "Animals del mar",
    words = "balena\ndofi\npeix\ntauro",
    timer = "300",
    hints = "3",
    formTemplate = "",
    openStudent = true,
  } = options;

  await page.goto("/index.html");
  await page.getByLabel("Tema de l'exercici").fill(title);
  await page.getByLabel("Llista de paraules (una per línia)").fill(words);
  if (timer !== undefined) {
    await page.locator("#timer-input").selectOption(String(timer));
  }
  if (hints !== undefined) {
    await page.locator("#hints-input").selectOption(String(hints));
  }
  if (formTemplate) {
    await page.locator("#form-config-details summary").click();
    await page.locator("#form-template-input").fill(formTemplate);
  }
  await page.getByRole("button", {
    name: openStudent ? "Generar i obrir zona alumne" : "Generar nova sopa",
  }).click();
}

async function readTimerSeconds(page) {
  const text = (await page.locator("#timer-display").textContent())?.trim() || "";
  const match = text.match(/^(\d{2}):(\d{2})$/);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

async function startStudentSession(page) {
  await expect(page.locator("#student-start-overlay")).toBeVisible();
  await page.getByRole("button", { name: "Començar" }).click();
  await expect(page.locator("#student-start-overlay")).toBeHidden();
}

async function unlockTeacherView(page) {
  await page.getByRole("tab", { name: /Panel Creació/ }).click();
  await page.locator("#pin-input").fill("1234");
  await page.getByRole("button", { name: "Validar PIN" }).click();
}

async function openTeacherTools(page) {
  const details = page.locator("#teacher-tools");
  await details.locator("summary").click();
  await expect(details).toHaveAttribute("open", "");
}

async function getGridLetters(page) {
  return page.locator("#puzzle-grid .grid-cell").allTextContents();
}

async function solvePlacement(page, placement) {
  const first = placement.cells[0];
  const last = placement.cells[placement.cells.length - 1];
  await page.locator(`[data-row="${first.row}"][data-col="${first.col}"]`).click({ force: true });
  await page.locator(`[data-row="${last.row}"][data-col="${last.col}"]`).click({ force: true });
}

module.exports = {
  generatePuzzle,
  readTimerSeconds,
  startStudentSession,
  unlockTeacherView,
  openTeacherTools,
  getGridLetters,
  solvePlacement,
};
