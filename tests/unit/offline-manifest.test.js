const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { APP_SHELL, buildOfflineManifest } = require("../../scripts/generate-offline-manifest.js");

test("the offline shell includes all local document, font and manifest icon dependencies", () => {
  const root = path.resolve(__dirname, "../..");
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  const urls = [
    ...[...html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"/g)].map(match => match[1]),
    ...[...css.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map(match => match[1]),
    ...manifest.icons.map(icon => icon.src),
  ];
  for (const url of urls.filter(url => !/^(?:[a-z]+:|\/\/|#)/i.test(url))) {
    assert.ok(APP_SHELL.includes(url.replace(/^\.\//, "")), `Missing offline dependency: ${url}`);
  }
  const current = buildOfflineManifest();
  for (const changedFile of ["app.js", "styles.css", "sw.js"]) {
    const next = buildOfflineManifest(filename => {
      const content = fs.readFileSync(path.join(root, filename));
      return filename === changedFile ? Buffer.concat([content, Buffer.from("\n/* changed */")]) : content;
    });
    assert.notEqual(next.revision, current.revision, `${changedFile} must create a new cache revision`);
  }
});
