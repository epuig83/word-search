const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

const core = require("../../core.js");
const {
  generatePuzzle,
  solvePlacement,
  startStudentSession,
} = require("./helpers");

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

async function expectNoAccessibilityViolations(page, state) {
  const results = await new AxeBuilder({ page }).analyze();
  const violations = results.violations.map(violation => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
  }));
  expect(violations, `${state}\n${JSON.stringify(violations, null, 2)}`).toEqual([]);
}

test("teacher view has no automated accessibility violations", async ({ page }) => {
  await page.goto("/index.html");
  await expectNoAccessibilityViolations(page, "teacher view");
});

test("active student view has valid list, heading, and tab semantics", async ({ page }) => {
  await generatePuzzle(page, { timer: "0" });
  await startStudentSession(page);

  await expect(page.getByRole("heading", { level: 1, name: "Animals del mar" })).toBeVisible();
  await expect(page.locator("#section-student")).toHaveAttribute("role", "tabpanel");
  await expect(page.locator("#word-list").getByRole("listitem")).toHaveCount(4);
  await expectNoAccessibilityViolations(page, "active student view");
});

test("completion state and decorative confetti remain accessible", async ({ page }) => {
  const wordsText = "balena\ndofi\npeix";
  await page.addInitScript(() => {
    Math.random = () => 0;
  });
  await generatePuzzle(page, { words: wordsText, timer: "0", hints: "0" });
  await startStudentSession(page);

  const words = core.parseWords(wordsText).words;
  const puzzle = core.buildPuzzleData(
    words,
    "auto",
    "easy",
    { title: "Animals del mar" },
    { random: () => 0 }
  );
  for (const placement of puzzle.placements) {
    await solvePlacement(page, placement);
  }

  await expect(page.getByRole("region", { name: /Excel·lent treball/ })).toBeVisible();
  await expect(page.locator("#celebration-canvas")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("#send-results-button")).toBeHidden();
  await expect(page.locator("#pause-button")).toBeHidden();
  await expectNoAccessibilityViolations(page, "completion state");
});

test("tabs use roving focus and explicit activation", async ({ page }) => {
  await page.goto("/index.html");
  const teacherTab = page.getByRole("tab", { name: /Panell de creació/ });
  const studentTab = page.getByRole("tab", { name: /Zona de l'alumnat/ });

  await teacherTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(studentTab).toBeFocused();
  await expect(studentTab).toHaveAttribute("aria-selected", "false");

  await page.keyboard.press("Enter");
  await expect(studentTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#section-student")).toBeVisible();
});

// Axe previously ran on three states and on none of them with a modal open, which is
// exactly where the focus-trap and overflow problems lived.

test("the PIN modal is accessible and dismissable", async ({ page }) => {
  await generatePuzzle(page, { timer: "0" });
  await startStudentSession(page);

  await page.locator("#tab-teacher").click();
  await expect(page.locator("#pin-modal")).toBeVisible();
  await expectNoAccessibilityViolations(page, "pin modal");

  await page.keyboard.press("Escape");
  await expect(page.locator("#pin-modal")).toBeHidden();
});

test("the word definition modal is accessible and dismissable", async ({ page }) => {
  await generatePuzzle(page, { words: "gos\ngat\npeix", timer: "0", hints: "0" });
  await startStudentSession(page);

  await page.locator("#word-list .word-definition-button").first().click();
  await expect(page.locator("#word-definition-modal")).toBeVisible();
  await expectNoAccessibilityViolations(page, "word definition modal");

  await page.keyboard.press("Escape");
  await expect(page.locator("#word-definition-modal")).toBeHidden();
});

test("the student name modal is only asked for at send time and can be escaped", async ({ page }) => {
  const wordsText = "balena\ndofi\npeix";
  await page.addInitScript(() => { Math.random = () => 0; });
  await generatePuzzle(page, {
    words: wordsText,
    timer: "0",
    hints: "0",
    formTemplate: "https://docs.google.com/forms/d/e/abc/viewform?entry.1=x&entry.2=y",
  });
  await startStudentSession(page);

  // Arriving in the student area must not put a two-field form in front of the child.
  await expect(page.locator("#student-name-modal")).toBeHidden();

  const words = core.parseWords(wordsText).words;
  const puzzle = core.buildPuzzleData(words, "auto", "easy", { title: "Animals del mar" }, { random: () => 0 });
  for (const placement of puzzle.placements) {
    await solvePlacement(page, placement);
  }

  await page.locator("#send-results-button").click();
  await expect(page.locator("#student-name-modal")).toBeVisible();
  await expectNoAccessibilityViolations(page, "student name modal");

  // Three ways out, none of which existed before: Escape, the cancel button, the overlay.
  await page.keyboard.press("Escape");
  await expect(page.locator("#student-name-modal")).toBeHidden();

  await page.locator("#send-results-button").click();
  await expect(page.locator("#student-name-modal")).toBeVisible();
  await page.locator("#student-name-cancel").click();
  await expect(page.locator("#student-name-modal")).toBeHidden();
});
