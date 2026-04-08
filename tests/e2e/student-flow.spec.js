const { test, expect } = require("@playwright/test");
const {
  generatePuzzle,
  readTimerSeconds,
  startStudentSession,
  unlockTeacherView,
} = require("./helpers");

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
