const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  workers: 4,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: process.env.CI ? "off" : "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium", channel: "chrome" }, testIgnore: "**/tablet.spec.js" },
    {
      name: "webkit",
      use: { browserName: "webkit" },
      grepInvert: /@chromium/,
      testIgnore: ["**/classroom-print.spec.js", "**/offline-updates.spec.js", "**/tablet.spec.js"],
    },
    {
      name: "ipad-webkit",
      use: { ...devices["iPad (gen 7)"], browserName: "webkit" },
      testMatch: "**/tablet.spec.js",
    },
  ],
  webServer: {
    command: "node scripts/static-server.js",
    port: 4173,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
