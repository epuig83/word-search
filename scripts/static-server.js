const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const rootDir = process.cwd();
const port = Number(process.env.PORT || 4173);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"],
]);

function resolveFilePath(requestUrl) {
  const pathname = new URL(requestUrl, "http://127.0.0.1").pathname;
  const relativePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.join(rootDir, path.normalize(relativePath));
  if (!filePath.startsWith(rootDir)) {
    return null;
  }
  return filePath;
}

const server = http.createServer((request, response) => {
  const filePath = resolveFilePath(request.url || "/");
  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, contents) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    response.writeHead(200, {
      "Content-Type": mimeTypes.get(path.extname(filePath)) || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(contents);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Static server listening on http://127.0.0.1:${port}`);
});
