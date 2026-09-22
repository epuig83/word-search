const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { APP_SHELL, buildOfflineManifest, serializeOfflineManifest } = require("../../../scripts/generate-offline-manifest.js");

const root = path.resolve(__dirname, "../../..");

function createRelease(label) {
  const files = new Map([...APP_SHELL, "sw.js", "robots.txt", "sitemap.xml"].map(filename => [filename, fs.readFileSync(path.join(root, filename))]));
  for (const filename of ["index.html", "es.html", "en.html"]) {
    files.set(filename, Buffer.from(files.get(filename).toString().replace("<html ", `<html data-release="${label}" `)));
  }
  files.set("app-storage.js", Buffer.from(`globalThis.__storageRelease = "${label}";\n${files.get("app-storage.js")}`));
  files.set("app.js", Buffer.from(`if (globalThis.__storageRelease !== "${label}") throw new Error("Mixed offline releases");\n${files.get("app.js")}`));
  const manifest = buildOfflineManifest(filename => files.get(filename));
  files.set("offline-manifest.js", Buffer.from(serializeOfflineManifest(manifest)));
  return { files, manifest };
}

async function startOfflineServer() {
  const releases = { one: createRelease("one"), two: createRelease("two") };
  let current = releases.one;
  let failure = null;
  const requests = [];
  const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    const filename = url.pathname.replace(/^\/word-search\//, "") || "index.html";
    requests.push(filename);
    if (filename === "app-storage.js" && failure === "disconnect") {
      request.socket.destroy();
      return;
    }
    // A successful HTTP response with the previous release's bytes models a
    // stale edge cache. Only content integrity can detect it.
    const files = filename === "app-storage.js" && failure === "integrity" ? releases.one.files : current.files;
    const content = files.get(filename);
    response.writeHead(content ? 200 : 404, { "Content-Type": mime[path.extname(filename)] || "text/plain", "Cache-Control": "no-store" });
    response.end(content || "Not found");
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}/word-search/`,
    releases,
    requests,
    publish(label, fail = null) { current = releases[label]; failure = fail; },
    async close() {
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    },
  };
}

module.exports = { startOfflineServer };
