const { test, expect } = require("@playwright/test");
const {
  generatePuzzle,
  measureGridVisibility,
  readTimerSeconds,
  startStudentSession,
  unlockTeacherView,
} = require("./helpers");

const LARGE_RESPONSIVE_WORDS = [
  "elefant",
  "girafa",
  "rinoceront",
  "cocodril",
  "orangutan",
  "hipopotam",
  "serpentina",
  "papallona",
  "llangardaix",
  "tortuga",
  "camaleo",
  "formiguer",
  "esquirol",
  "salamandra",
  "dromedari",
  "ornitorrinc",
].join("\n");

test("student overlay gates the start of the timer", async ({ page }) => {
  await generatePuzzle(page);

  await expect(page.getByRole("heading", { name: "Tot a punt per començar" })).toBeVisible();
  await expect(page.locator("#timer-display")).toBeHidden();
  await expect(page.getByText("Prem Començar per iniciar l'activitat.")).toBeVisible();

  await startStudentSession(page);

  await expect(page.locator("#timer-display")).toHaveText("05:00");
  await expect(page.getByText("Comença amb qualsevol paraula de la llista.")).toBeVisible();
  await expect.poll(() => readTimerSeconds(page), { timeout: 4_000 }).toBeLessThan(300);
});

test("reset returns the student view to the pre-start overlay", async ({ page }) => {
  await generatePuzzle(page);
  await startStudentSession(page);
  await expect.poll(() => readTimerSeconds(page), { timeout: 4_000 }).toBeLessThan(300);

  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Reiniciar joc" }).click();

  await expect(page.locator("#student-start-overlay")).toBeVisible();
  await expect(page.locator("#timer-display")).toBeHidden();
  await expect(page.getByText("Prem Començar per iniciar l'activitat.")).toBeVisible();
});

test("returning from teacher view resumes the running timer without resetting it", async ({ page }) => {
  await generatePuzzle(page);
  await startStudentSession(page);
  await expect.poll(() => readTimerSeconds(page), { timeout: 4_000 }).toBeLessThan(300);
  const beforePause = await readTimerSeconds(page);

  await unlockTeacherView(page);
  await expect(page.getByRole("heading", { name: "Crea la teva sopa" })).toBeVisible();
  await page.locator("#teacher-open-student-button").click();

  await expect(page.locator("#student-start-overlay")).toBeHidden();
  const resumedAt = await readTimerSeconds(page);
  expect(resumedAt).toBeLessThan(300);
  expect(resumedAt).toBeLessThanOrEqual(beforePause);
  await expect.poll(() => readTimerSeconds(page), { timeout: 4_000 }).toBeLessThan(resumedAt);
});

test("language switch updates the main teacher controls in all locales", async ({ page }) => {
  await page.goto("/index.html");

  await expect(page.locator("#tab-teacher")).toContainText("Panell de creació");
  await page.getByRole("button", { name: "Castellano" }).click();
  await expect(page.locator("#tab-teacher")).toContainText("Panel de creación");
  await expect(page.locator("#generate-button")).toHaveText("Generar nueva sopa");

  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("#tab-teacher")).toContainText("Creation Panel");
  await expect(page.locator("#generate-button")).toHaveText("Generate new puzzle");
  await expect(page.locator("#tab-student")).toContainText("Student area");
});

[
  {
    label: "mobile 320 with a 10x10 board",
    context: {
      viewport: { width: 320, height: 568 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    },
    puzzle: {
      size: "10",
      words: "balena\ndofi\npeix\ntauro\ncranc\npop\nmedusa\norca",
    },
  },
  {
    label: "mobile 375 with a 16x16 board",
    context: {
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    },
    puzzle: {
      size: "16",
      words: LARGE_RESPONSIVE_WORDS,
    },
  },
  {
    label: "tablet 768 with a 16x16 board",
    context: {
      viewport: { width: 768, height: 1024 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    },
    puzzle: {
      size: "16",
      words: LARGE_RESPONSIVE_WORDS,
    },
  },
  {
    label: "desktop 1024 with a 16x16 board",
    context: {
      viewport: { width: 1024, height: 768 },
      isMobile: false,
      hasTouch: false,
      deviceScaleFactor: 1,
    },
    puzzle: {
      size: "16",
      words: LARGE_RESPONSIVE_WORDS,
    },
  },
].forEach(({ label, context, puzzle }) => {
  test(`student board keeps all cells visible on ${label}`, async ({ browser }) => {
    const pageContext = await browser.newContext(context);
    const page = await pageContext.newPage();

    await generatePuzzle(page, {
      title: `Responsive ${label}`,
      words: puzzle.words,
      size: puzzle.size,
    });
    await startStudentSession(page);

    const metrics = await measureGridVisibility(page);
    expect(metrics).not.toBeNull();
    expect(metrics.size).toBe(puzzle.size);
    expect(metrics.clippedCells, JSON.stringify(metrics)).toBe(0);

    await pageContext.close();
  });
});
