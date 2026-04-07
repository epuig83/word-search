const { test, expect } = require("@playwright/test");

async function generatePuzzle(page) {
  await page.goto("/index.html");
  await page.getByLabel("Tema de l'exercici").fill("Animals del mar");
  await page.getByLabel("Llista de paraules (una per línia)").fill("balena\ndofi\npeix\ntauro");
  await page.locator("#timer-input").selectOption("300");
  await page.getByRole("button", { name: "Generar i obrir zona alumne" }).click();
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
  await page.getByRole("button", { name: /Panel Creació/ }).click();
  await page.locator("#pin-input").fill("1234");
  await page.getByRole("button", { name: "Validar PIN" }).click();
}

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
