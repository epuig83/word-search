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
    targets: violation.nodes.map(node => node.target),
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
