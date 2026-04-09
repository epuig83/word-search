const { expect } = require("@playwright/test");

async function generatePuzzle(page, options = {}) {
  const {
    title = "Animals del mar",
    words = "balena\ndofi\npeix\ntauro",
    size,
    timer = "300",
    hints = "3",
    formTemplate = "",
    openStudent = true,
  } = options;

  await page.goto("/index.html");
  await page.locator("#title-input").fill(title);
  await page.locator("#words-input").fill(words);
  if (size !== undefined) {
    await page.locator("#size-input").selectOption(String(size));
  }
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
  await page.locator(openStudent ? "#generate-open-button" : "#generate-button").click();
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
  await page.locator("#tab-teacher").click();
  await page.locator("#pin-input").fill("1234");
  await page.locator("#pin-submit").click();
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

async function measureGridVisibility(page) {
  return page.evaluate(() => {
    const container = document.querySelector("#grid-container");
    const grid = document.querySelector("#puzzle-grid");
    const cells = Array.from(document.querySelectorAll("#puzzle-grid .grid-cell"));
    if (!(container instanceof HTMLElement) || !(grid instanceof HTMLElement)) {
      return null;
    }

    const containerRect = container.getBoundingClientRect();
    const overflowAllowance = 0.5;
    const clippedCells = cells.filter(cell => {
      const rect = cell.getBoundingClientRect();
      return rect.left < containerRect.left - overflowAllowance ||
        rect.right > containerRect.right + overflowAllowance ||
        rect.top < containerRect.top - overflowAllowance ||
        rect.bottom > containerRect.bottom + overflowAllowance;
    }).length;

    return {
      clippedCells,
      totalCells: cells.length,
      containerClientWidth: container.clientWidth,
      containerScrollWidth: container.scrollWidth,
      gridWidth: Math.round(grid.getBoundingClientRect().width),
      density: container.dataset.gridDensity || null,
      size: container.dataset.gridSize || null,
    };
  });
}

module.exports = {
  generatePuzzle,
  readTimerSeconds,
  startStudentSession,
  unlockTeacherView,
  openTeacherTools,
  getGridLetters,
  solvePlacement,
  measureGridVisibility,
};
