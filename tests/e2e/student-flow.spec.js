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

test("timer expiry reveals the completion card with a play-again CTA", async ({ page }) => {
  await page.clock.install();
  await page.goto("/index.html");
  await page.locator("#title-input").fill("Animals");
  await page.locator("#words-input").fill("balena\ndofi\npeix\ntauro");
  await page.locator("#timer-input").selectOption("300");
  await page.locator("#generate-open-button").click();
  await expect(page.locator("#student-start-overlay")).toBeVisible();
  await page.getByRole("button", { name: "Començar" }).click();
  await expect(page.locator("#student-start-overlay")).toBeHidden();
  await expect(page.locator("#completion-message")).toBeHidden();

  await page.clock.runFor("05:05");

  await expect(page.locator("#completion-message")).toBeVisible();
  await expect(page.locator("#completion-message-title")).toContainText("Temps esgotat");
  await expect(page.locator("#play-again-button")).toBeVisible();
  await expect(page.locator("#timer-display")).toHaveText("⏰ Temps esgotat!");

  await page.locator("#play-again-button").click();
  await expect(page.locator("#student-start-overlay")).toBeVisible();
});

test("pause halts the timer and resume keeps the remaining seconds", async ({ page }) => {
  await page.clock.install();
  await page.goto("/index.html");
  await page.locator("#title-input").fill("Pause");
  await page.locator("#words-input").fill("gat\ngos\npeix\npop");
  await page.locator("#timer-input").selectOption("300");
  await page.locator("#generate-open-button").click();
  await page.getByRole("button", { name: "Començar" }).click();
  await page.clock.runFor("00:10");

  const secondsBefore = await readTimerSeconds(page);
  expect(secondsBefore).toBeLessThan(300);

  await page.locator("#pause-button").click();
  await expect(page.locator("#pause-button")).toContainText("Continuar");
  await expect(page.locator("#grid-container")).toHaveClass(/is-paused/);

  await page.clock.runFor("00:30");
  expect(await readTimerSeconds(page)).toBe(secondsBefore);

  await page.locator("#pause-button").click();
  await expect(page.locator("#grid-container")).not.toHaveClass(/is-paused/);
  await expect(page.locator("#pause-button")).toContainText("Pausa");
  await page.clock.runFor("00:05");
  expect(await readTimerSeconds(page)).toBeLessThan(secondsBefore);
});

test("default PIN warning appears until the teacher changes the PIN", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#default-pin-warning")).toBeVisible();
  await expect(page.locator("#default-pin-warning")).toContainText("1234");

  await page.locator("#pin-change-details summary").click();
  await page.locator("#new-pin-input").fill("74920");
  await page.locator("#confirm-pin-input").fill("74920");
  await page.locator("#save-pin-button").click();
  await expect(page.locator("#default-pin-warning")).toBeHidden();
});

test("PWA manifest loads and the service worker registers", async ({ page }) => {
  const manifestResponse = await page.request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.name).toContain("Sopes");
  expect(manifest.start_url).toBeTruthy();
  expect(manifest.icons?.length).toBeGreaterThan(0);

  await page.goto("/index.html");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "manifest.webmanifest");

  const registered = await page.waitForFunction(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    return Boolean(reg);
  }, null, { timeout: 5000 });
  expect(await registered.jsonValue()).toBe(true);
});

test("H keyboard shortcut consumes a hint", async ({ page }) => {
  await generatePuzzle(page, { timer: "0", hints: "3" });
  await startStudentSession(page);

  await expect(page.locator("#hint-button")).toContainText("3");
  await page.locator("#puzzle-grid").focus();
  await page.keyboard.press("h");
  await expect(page.locator("#hint-button")).toContainText("2");
});

test("generate aborts when the Google Forms URL is invalid", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#title-input").fill("Animals");
  await page.locator("#words-input").fill("gat\ngos\npeix");
  await page.locator("#form-config-details summary").click();
  await page.locator("#form-template-input").fill("not-a-valid-form-url");
  await page.locator("#generate-button").click();

  await expect(page.locator("#status-message")).toHaveClass(/is-error/);
  await expect(page.locator("#status-message")).toContainText("URL no vàlida");
  await expect(page.locator("#section-student")).toBeHidden();
  await expect(page.locator("#teacher-ready-card")).toBeHidden();
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
