const { test, expect } = require("@playwright/test");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
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

test("the app still opens directly from file protocol", async ({ page }) => {
  const runtimeErrors = [];
  page.on("pageerror", error => runtimeErrors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });

  const fileUrl = pathToFileURL(path.resolve(__dirname, "../../index.html")).href;
  await page.goto(fileUrl);

  await expect(page.locator("#generator-form")).toBeVisible();
  await expect(page).toHaveTitle(/Sopes de Lletres/);
  expect(runtimeErrors).toEqual([]);
});

test("teacher flow presents one creation CTA and grouped optional settings", async ({ page }) => {
  await page.goto("/index.html");

  await expect(page.locator("#generate-open-button")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Crear i revisar l'activitat" })).toBeVisible();
  await expect(page.locator("#advanced-settings-details")).not.toHaveAttribute("open", "");
  await expect(page.locator(".sample-management")).not.toHaveAttribute("open", "");
  await expect(page.locator("#lib-results .lib-word-chip")).toHaveCount(0);
});

test("Andika is self-hosted and loaded as the classroom typeface", async ({ page }) => {
  const regular = await page.request.get("/assets/fonts/andika-regular-latin.woff2");
  const bold = await page.request.get("/assets/fonts/andika-bold-latin.woff2");
  expect(regular.ok()).toBeTruthy();
  expect(bold.ok()).toBeTruthy();
  expect((await regular.body()).byteLength + (await bold.body()).byteLength).toBeLessThan(120_000);

  await page.goto("/index.html");
  await page.evaluate(() => document.fonts.ready);
  const fontFamily = await page.locator("body").evaluate(element => getComputedStyle(element).fontFamily);
  expect(fontFamily).toContain("Andika");
  expect(await page.evaluate(() => document.fonts.check('16px "Andika"'))).toBe(true);
});

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

  await page.getByRole("button", { name: "Reiniciar joc" }).click();
  await page.getByRole("button", { name: "Confirmar" }).click();

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
  await page.locator("#advanced-settings-details summary").click();
  await page.locator("#timer-input").selectOption("300");
  await page.locator("#generate-button").click();
  await page.locator("#teacher-open-student-button").click();
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
  await page.locator("#advanced-settings-details summary").click();
  await page.locator("#timer-input").selectOption("300");
  await page.locator("#generate-button").click();
  await page.locator("#teacher-open-student-button").click();
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

test("PIN with surrounding whitespace still authenticates", async ({ page }) => {
  await generatePuzzle(page);
  await expect(page.locator("#student-start-overlay")).toBeVisible();

  await page.locator("#tab-teacher").click();
  await expect(page.locator("#pin-modal")).toBeVisible();
  await page.locator("#pin-input").fill("  1234  ");
  await page.locator("#pin-submit").click();

  await expect(page.locator("#pin-modal")).toBeHidden();
  await expect(page.locator("#section-teacher")).toBeVisible();
});

test("board theme picker reskins the page and persists across reloads", async ({ page }) => {
  await generatePuzzle(page);
  await startStudentSession(page);

  await expect(page.locator("html")).toHaveAttribute("data-theme", "pergami");
  const oceaBtn = page.locator('.theme-btn[data-theme="ocea"]');
  await oceaBtn.click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "ocea");
  await expect(oceaBtn).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "ocea");
});

test("difficulty preset fills the four config fields in one click", async ({ page }) => {
  await page.goto("/index.html");

  await page.locator('.preset-btn[data-preset="dificil"]').click();
  await expect(page.locator("#difficulty-input")).toHaveValue("hard");
  await expect(page.locator("#size-input")).toHaveValue("16");
  await expect(page.locator("#timer-input")).toHaveValue("300");
  await expect(page.locator("#hints-input")).toHaveValue("1");

  await page.locator('.preset-btn[data-preset="facil"]').click();
  await expect(page.locator("#difficulty-input")).toHaveValue("easy");
  await expect(page.locator("#size-input")).toHaveValue("10");
  await expect(page.locator("#hints-input")).toHaveValue("5");
});

test("answer-key print button reveals the solution for printing", async ({ page }) => {
  await page.addInitScript(() => { window.print = () => {}; });
  await generatePuzzle(page);
  await startStudentSession(page);

  await page.locator("#teacher-tools summary").click();
  await page.locator("#print-solution-button").click();

  // Reveals solution (mode "teacher" → body[data-mode], which the print CSS
  // renders as an answer key with shaded solution cells).
  await expect(page.locator("body")).toHaveAttribute("data-mode", "teacher");
  await expect(page.locator(".grid-cell.is-solution").first()).toBeVisible();

  await page.emulateMedia({ media: "print" });
  const bg = await page.locator(".grid-cell.is-solution").first()
    .evaluate(el => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe("rgb(255, 255, 255)");
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

test("localized PWA shells remain localized offline without query cache entries", async ({ page, context }) => {
  await page.goto("/es.html?source=classroom");
  await page.waitForFunction(async () => {
    if (!("serviceWorker" in navigator)) return false;
    await navigator.serviceWorker.ready;
    return Boolean(navigator.serviceWorker.controller);
  }, null, { timeout: 8_000 });

  const cachePaths = await page.evaluate(async () => {
    const cache = await caches.open("word-search-v4");
    return (await cache.keys()).map(request => new URL(request.url).pathname + new URL(request.url).search);
  });
  expect(cachePaths.some(pathname => pathname.includes("?"))).toBe(false);

  await context.setOffline(true);
  await page.goto("/es.html?source=offline");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.locator("#generate-button")).toHaveText("Crear y revisar la actividad");

  await page.goto("/en.html?source=offline");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#generate-button")).toHaveText("Create and review activity");
  await context.setOffline(false);
});

test("mobile game bar keeps timer, pause, and hint controls in reach", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await generatePuzzle(page, { timer: "300", hints: "3" });
  await startStudentSession(page);
  await page.locator("#word-bank-title").scrollIntoViewIfNeeded();

  const metrics = await page.locator("#student-gamebar").evaluate(element => {
    const rect = element.getBoundingClientRect();
    const controls = Array.from(element.querySelectorAll("button:not([hidden]), .timer-pill:not([hidden])"));
    return {
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      targets: controls.map(control => {
        const target = control.getBoundingClientRect();
        return { width: target.width, height: target.height };
      }),
    };
  });
  expect(metrics.top).toBeGreaterThanOrEqual(0);
  expect(metrics.bottom).toBeLessThanOrEqual(844);
  expect(metrics.width).toBeLessThanOrEqual(390);
  expect(metrics.targets).toHaveLength(3);
  for (const target of metrics.targets) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }
});

test("H keyboard shortcut consumes a hint", async ({ page }) => {
  await generatePuzzle(page, { timer: "0", hints: "3" });
  await startStudentSession(page);

  await expect(page.locator("#hint-button")).toContainText("3");
  await page.locator("#reset-progress-button").focus();
  await page.keyboard.press("h");
  await expect(page.locator("#hint-button")).toContainText("3");

  await page.locator('#puzzle-grid .grid-cell[tabindex="0"]').focus();
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
  await expect(page.locator("#generate-button")).toHaveText("Crear y revisar la actividad");
  await expect(page).toHaveURL(/\/es\.html$/);
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "es_ES");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Generador de Sopas de Letras para Primaria");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://epuig83.github.io/word-search/es.html");

  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("#tab-teacher")).toContainText("Creation Panel");
  await expect(page.locator("#generate-button")).toHaveText("Create and review activity");
  await expect(page.locator("#tab-student")).toContainText("Student area");
  await expect(page).toHaveURL(/\/en\.html$/);
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "en_US");
  const structuredData = await page.locator("#structured-data").textContent();
  expect(JSON.parse(structuredData).name).toBe("Word Search Generator for Primary School");
});

test("localized pages ship localized metadata before JavaScript runs", async ({ page }) => {
  const spanishResponse = await page.request.get("/es.html");
  expect(spanishResponse.ok()).toBeTruthy();
  const spanishHtml = await spanishResponse.text();
  expect(spanishHtml).toContain('<html lang="es" data-initial-lang="es">');
  expect(spanishHtml).toContain('<meta property="og:locale" content="es_ES" />');
  expect(spanishHtml).toContain('<link rel="canonical" href="https://epuig83.github.io/word-search/es.html" />');

  await page.goto("/en.html");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle("Word Search Generator for Primary School");
  await expect(page.locator("#generate-button")).toHaveText("Create and review activity");
});

test("language selector exposes a localized accessible label", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator(".lang-selector")).toHaveAttribute("aria-label", "Idioma");
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator(".lang-selector")).toHaveAttribute("aria-label", "Language");
});

test("words helper flags entries shorter than 3 letters as undroppable", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#words-input").fill("os\nau\ngat\ngos\npeix");

  // Two 2-letter tokens (os, au) are dropped; three valid words remain.
  await expect(page.locator("#words-count")).toContainText("3");
  await expect(page.locator("#words-feedback")).toContainText("menys de 3 lletres");
  await expect(page.locator("#words-feedback")).toContainText("os, au");
});

test("print worksheet shows a localized name/date line and drops the screen background", async ({ page }) => {
  await generatePuzzle(page, { timer: "0" });
  await startStudentSession(page);

  await page.emulateMedia({ media: "print" });

  // Student worksheet: name/date fill-in line is revealed and localized (ca).
  const printMeta = page.locator("#print-meta");
  await expect(printMeta).toBeVisible();
  await expect(printMeta).toContainText("Nom");
  await expect(printMeta).toContainText("Data");

  // The worksheet tells the pupil what to do (board instructions are hidden in print).
  const printInstructions = page.locator("#print-instructions");
  await expect(printInstructions).toBeVisible();
  await expect(printInstructions).toContainText("Troba");

  // The student lavender grid background must not bleed onto paper.
  const bodyBackgroundImage = await page.evaluate(
    () => getComputedStyle(document.body).backgroundImage
  );
  expect(bodyBackgroundImage).toBe("none");

  // The teacher answer-key suffix is wired to the active locale, not hardcoded.
  await expect(page.locator("#board-title")).toHaveAttribute("data-solution-suffix", "Solució");

  // The lang selector lives in the hero, hidden in the student tab, so switch
  // back to the teacher view before changing locale.
  await page.emulateMedia({ media: "screen" });
  await unlockTeacherView(page);
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.locator("#board-title")).toHaveAttribute("data-solution-suffix", "Solution");
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
    label: "mobile 320 with a 16x16 board",
    context: {
      viewport: { width: 320, height: 568 },
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
    label: "mobile 390 with a 16x16 board",
    context: {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    },
    puzzle: {
      size: "16",
      words: LARGE_RESPONSIVE_WORDS,
    },
  },
  {
    label: "200 percent zoom equivalent at 683px with a 16x16 board",
    context: {
      viewport: { width: 683, height: 768 },
      isMobile: false,
      hasTouch: false,
      deviceScaleFactor: 1,
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
  test(`student board keeps accessible targets on ${label}`, async ({ browser }) => {
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
    expect(metrics.minCellWidth, JSON.stringify(metrics)).toBeGreaterThanOrEqual(24);
    expect(metrics.minCellHeight, JSON.stringify(metrics)).toBeGreaterThanOrEqual(24);
    if (context.viewport.width <= 683 && puzzle.size === "16") {
      expect(metrics.isHorizontallyScrollable, JSON.stringify(metrics)).toBe(true);
    }

    await pageContext.close();
  });
});
