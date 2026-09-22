const { test: base, expect } = require("@playwright/test");
const core = require("../../core.js");
const { startOfflineServer } = require("./fixtures/offline-server.js");
const { waitForOfflineControl, startStudentSession, solvePlacement } = require("./helpers");

const test = base.extend({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires destructuring even without fixture dependencies.
  offlineServer: async ({}, use) => {
    const server = await startOfflineServer();
    try { await use(server); } finally { await server.close(); }
  },
});

const sharedPuzzle = core.encodePuzzleConfig({
  version: 2, title: "Offline classroom", words: "sol\nmar", lang: "es", size: "8", difficulty: "easy", timer: 300, hints: 3,
  gridRows: ["SOLXXXXX", "SOLXXXXX", "MARXXXXX", ...Array(5).fill("XXXXXXXX")],
  placementPaths: ["0.0,0.1,0.2", "2.0,2.1,2.2"],
});

async function updateAndWait(page, expectedState) {
  return page.evaluate(async expected => {
    const registration = await navigator.serviceWorker.ready;
    const next = new Promise(resolve => {
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        const changed = () => { if (worker.state === expected) resolve(worker.state); };
        worker.addEventListener("statechange", changed);
        changed();
      }, { once: true });
    });
    await registration.update();
    return next;
  }, expectedState);
}

test("a complete offline release waits for every tab and preserves classroom progress", async ({ page, context, offlineServer }) => {
  const errors = [];
  context.on("page", tab => tab.on("pageerror", error => errors.push(error.message)));
  page.on("pageerror", error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${offlineServer.url}es.html?p=${encodeURIComponent(sharedPuzzle)}`);
  await waitForOfflineControl(page);
  await expect(page.locator("#offline-status")).toHaveText("Lista para usar sin conexión");
  await expect(page.locator("html")).toHaveAttribute("data-release", "one");
  await startStudentSession(page);
  await solvePlacement(page, { cells: [{ row: 1, col: 0 }, { row: 1, col: 2 }] });
  await page.locator("#hint-button").click();
  await page.locator("#hint-word-select").selectOption("MAR");
  await page.locator("#hint-start-button").click();
  const before = await page.evaluate(async () => {
    const foreign = await caches.open("another-app-v1");
    await foreign.put("/another-app/keep", new Response("keep me"));
    await caches.open("word-search-shell-%2Fanother-scope%2F-old");
    // A deployed pre-manifest version's cache must also be retired on activation.
    await caches.open("word-search-v5");
    return JSON.parse(localStorage.getItem("word-search-progress-v1"));
  });
  // Opening the second tab after progress is saved avoids stale-tab progress writes.
  const second = await context.newPage();
  await second.goto(offlineServer.url);
  await expect(second.locator("#progress-text")).toHaveText("1 / 2");
  offlineServer.publish("two");
  expect(await updateAndWait(page, "installed")).toBe("installed");
  await expect(page.locator("#offline-update")).toContainText("cierra todas las pestañas");
  await expect(page.locator("#offline-status")).toHaveText("Lista para usar sin conexión");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-release", "one");
  await expect(page.locator("#progress-text")).toHaveText("1 / 2");
  await page.close();
  expect(await second.evaluate(async () => Boolean((await navigator.serviceWorker.ready).waiting))).toBe(true);
  await second.goto(`${offlineServer.url}es.html?another=tab`);
  await expect(second.locator("html")).toHaveAttribute("data-release", "one");
  // Leaving the scope closes its final controlled client while retaining a page
  // that can await activation without any time-based sleep or network dependency.
  await second.goto("about:blank");
  await expect.poll(async () => {
    const workers = context.serviceWorkers();
    for (const worker of workers) {
      try {
        const state = await worker.evaluate(() => ({ revision: self.WORD_SEARCH_OFFLINE.revision, active: self.registration.active?.state, waiting: Boolean(self.registration.waiting) }));
        if (state.revision === offlineServer.releases.two.manifest.revision && state.active === "activated" && !state.waiting) return true;
      } catch { /* The previous worker may exit during this check. */ }
    }
    return false;
  }).toBe(true);
  await context.setOffline(true);
  await second.goto(`${offlineServer.url}es.html?p=${encodeURIComponent(sharedPuzzle)}`);
  await expect(second.locator("html")).toHaveAttribute("data-release", "two");
  await expect(second.locator("#offline-status")).toHaveText("Sin conexión · lista para usar");
  await expect(second.locator("#progress-text")).toHaveText("1 / 2");
  const after = await second.evaluate(() => JSON.parse(localStorage.getItem("word-search-progress-v1")));
  expect(after.foundWordPaths).toEqual(before.foundWordPaths);
  expect(after.hintsRemaining).toBe(before.hintsRemaining);
  expect(after.hintStages).toEqual(before.hintStages);
  expect(after.timerSecondsLeft).toBeGreaterThan(0);
  expect(after.timerSecondsLeft).toBeLessThanOrEqual(before.timerSecondsLeft);
  expect(after.key).toBe(before.key);
  const cacheInfo = await second.evaluate(async () => {
    const keys = await caches.keys();
    const requests = (await Promise.all(keys.filter(key => key.startsWith("word-search-shell-%2Fword-search%2F-")).map(async key => (await (await caches.open(key)).keys()).map(request => request.url)))).flat();
    return { keys, requests, foreign: await (await (await caches.open("another-app-v1")).match("/another-app/keep")).text() };
  });
  expect(cacheInfo.keys).toContain("another-app-v1");
  expect(cacheInfo.keys).toContain("word-search-shell-%2Fanother-scope%2F-old");
  expect(cacheInfo.keys).not.toContain("word-search-v5");
  expect(cacheInfo.keys.filter(key => key.startsWith("word-search-shell-%2Fword-search%2F-"))).toHaveLength(1);
  expect(cacheInfo.requests.every(url => !new URL(url).search)).toBe(true);
  expect(cacheInfo.foreign).toBe("keep me");
  for (const lang of ["en", "es"]) {
    await second.goto(`${offlineServer.url}${lang}.html?offline=1`);
    await expect(second.locator("html")).toHaveAttribute("lang", lang);
    await expect(second.locator("html")).toHaveAttribute("data-release", "two");
  }
  expect(errors).toEqual([]);
});

for (const failure of ["disconnect", "integrity"]) {
  test(`a failed ${failure} update keeps the previous complete release`, async ({ page, context, offlineServer }) => {
    await page.goto(`${offlineServer.url}es.html`);
    await waitForOfflineControl(page);
    await page.locator("#title-input").fill("Borrador sin perder");
    await page.locator("#words-input").fill("sol\nm");
    offlineServer.publish("two", failure);
    expect(await updateAndWait(page, "redundant")).toBe("redundant");
    await expect(page.locator("#offline-status")).toHaveText("Lista para usar sin conexión");
    await expect(page.locator("#offline-update")).toBeHidden();
    const revisions = await page.evaluate(() => caches.keys());
    expect(revisions.some(key => key.endsWith(offlineServer.releases.two.manifest.revision))).toBe(false);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-release", "one");
    await expect(page.locator("#title-input")).toHaveValue("Borrador sin perder");
    await expect(page.locator("#words-input")).toHaveValue("sol\nm");
    // A later retry installs normally after the network/CDN becomes consistent.
    await context.setOffline(false);
    offlineServer.publish("two");
    expect(await updateAndWait(page, "installed")).toBe("installed");
    const response = await page.goto(`${offlineServer.url}robots.txt`);
    expect(response.headers()["content-type"]).toBe("text/plain");
    expect(await response.text()).not.toContain("<!DOCTYPE html>");
  });
}

test("offline readiness waits for complete installation and detects missing files", async ({ page, context, offlineServer }) => {
  offlineServer.holdDownloads();
  await page.goto(`${offlineServer.url}es.html`);
  await expect(page.locator("#offline-status")).toHaveText("Preparando el uso sin conexión…");
  offlineServer.releaseDownloads();
  await expect(page.locator("#offline-status")).toHaveText("Lista para usar sin conexión");
  await page.locator("#title-input").fill("Para mañana");
  await page.locator("#words-input").fill("sol\nmar\nluna");
  await page.locator("#generate-button").click();
  await waitForOfflineControl(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#offline-status")).toHaveText("Sin conexión · lista para usar");
  await page.locator("#teacher-variants-button").click();
  await page.locator("#variants-prepare").click();
  await expect(page.locator("#variants-print")).toBeEnabled();
  await page.locator("#variants-close").click();
  await page.evaluate(async () => {
    const keys = await caches.keys();
    for (const key of keys.filter(key => key.startsWith("word-search-shell-"))) {
      await (await caches.open(key)).delete(new URL("en.html", location.href));
    }
    dispatchEvent(new Event("pageshow"));
  });
  await expect(page.locator("#offline-status")).toContainText("No se ha podido confirmar");
  await expect(page.locator("#offline-retry")).toBeVisible();
});

test("an interrupted first installation can be retried without losing the draft", async ({ page, offlineServer }) => {
  offlineServer.publish("one", "disconnect");
  await page.goto(`${offlineServer.url}es.html`);
  await page.locator("#title-input").fill("Borrador de clase");
  await expect(page.locator("#offline-status")).toContainText("No se ha podido confirmar");
  offlineServer.publish("one");
  await page.locator("#offline-retry").click();
  await expect(page.locator("#offline-status")).toHaveText("Lista para usar sin conexión");
  await expect(page.locator("#title-input")).toHaveValue("Borrador de clase");
});

test("a legacy worker times out safely and still reports a waiting update", async ({ page, offlineServer }) => {
  offlineServer.publish("legacy");
  await page.goto(`${offlineServer.url}es.html`);
  await waitForOfflineControl(page);
  await expect(page.locator("#offline-status")).toContainText("No se ha podido confirmar", { timeout: 10000 });
  offlineServer.publish("two");
  expect(await updateAndWait(page, "installed")).toBe("installed");
  await expect(page.locator("#offline-update")).toContainText("cierra todas las pestañas", { timeout: 10000 });
  await expect(page.locator("#offline-status")).toContainText("No se ha podido confirmar");
  await expect(page.locator("#generate-button")).toBeEnabled();
});
