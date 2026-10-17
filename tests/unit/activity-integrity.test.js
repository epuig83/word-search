const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../../core.js");
const storage = require("../../app-storage.js");
const { sanitizeStoredSample } = require("../../app-helpers.js");

function randomSource() {
  let seed = 123456;
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

test("sixty full definitions survive encoding and reconstruct the exact snapshot", () => {
  const words = core.parseWords(Array.from({ length: 60 }, (_, index) =>
    `w${String.fromCharCode(97 + Math.floor(index / 26))}${String.fromCharCode(97 + index % 26)}: ${"à".repeat(160)}`
  ).join("\n")).words;
  const puzzle = core.buildPuzzleData(words, "auto", "easy", {}, { random: randomSource() });
  const config = {
    version: 2, title: "Definiciones", words: core.serializeWords(words), size: "auto", lang: "es",
    gridRows: core.serializeGridRows(puzzle.grid),
    placementPaths: puzzle.placements.map(p => core.serializePlacementCells(p.cells)),
  };
  const decoded = core.decodePuzzleConfig(core.encodePuzzleConfig(config));
  assert.equal(decoded.words, config.words);
  const restored = core.buildPuzzleFromSnapshotData(core.parseWords(decoded.words).words, decoded, {});
  assert.deepEqual(restored.grid, puzzle.grid);
  assert.deepEqual(restored.words, words);
});

test("the UTF-8 budget accepts its boundary and rejects oversized payloads without truncation", () => {
  const base = { version: 2, words: "" };
  const overhead = Buffer.from(core.encodePuzzleConfig(base), "base64").length;
  const words = "x".repeat(core.MAX_SHARED_BYTES - overhead);
  assert.equal(core.decodePuzzleConfig(core.encodePuzzleConfig({ ...base, words })).words, words);
  assert.throws(() => core.encodePuzzleConfig({ ...base, words: words + "x" }), /ACTIVITY_TOO_LARGE/);
  assert.throws(() => core.encodePuzzleConfig({ ...base, words: "à".repeat(core.MAX_SHARED_BYTES / 2) }), /ACTIVITY_TOO_LARGE/);
  const hostile = Buffer.from(JSON.stringify({ v: 2, w: "à".repeat(core.MAX_SHARED_BYTES) })).toString("base64");
  assert.equal(core.decodePuzzleConfig(hostile), null);
});

test("saved and imported examples retain definitions and legacy plain words", () => {
  const words = "sol: Mi estrella, cálida\nluna: Mi satélite\nmar";
  const sample = sanitizeStoredSample({ title: "Ciencias", words });
  assert.equal(sample.words, words);
  assert.equal(sanitizeStoredSample(JSON.parse(JSON.stringify(sample))).words, words);
  assert.equal(sanitizeStoredSample({ title: "Antiguo", words: ["sol", "luna", "mar"] }).words, "sol\nluna\nmar");
});

test("cooperative generation yields repeatedly and preserves the synchronous seeded result", async () => {
  const words = core.parseWords("sol\nluna\nmar\nola\npez").words;
  const expected = core.buildPuzzleData(words, "8", "easy", {}, { random: randomSource() });
  let time = 0;
  let yields = 0;
  const result = await core.buildPuzzleDataAsync(words, "8", "easy", {}, {
    random: randomSource(), now: () => time++, yieldTask: async () => { yields++; },
  });
  assert.ok(yields > 1);
  assert.deepEqual(result, expected);
});

test("cooperative generation stops inside an attempt when cancelled", async () => {
  let yields = 0;
  let time = 0;
  await assert.rejects(core.buildPuzzleDataAsync(core.parseWords("sol\nluna\nmar").words, "16", "hard", {}, {
    now: () => time++, yieldTask: async () => { yields++; }, cancelled: () => yields >= 2,
  }), /CANCELLED/);
  assert.equal(yields, 2);
});

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
}

test("a stale tab cannot overwrite or delete any part of a newer workspace", () => {
  const backend = memoryStorage();
  let conflicts = 0;
  const old = storage.createWorkspaceStorage({ storage: backend, onConflict: () => { conflicts++; } });
  const fresh = storage.createWorkspaceStorage({ storage: backend });
  fresh.setItem(storage.DRAFT_STORAGE_KEY, "new draft");
  fresh.setItem(storage.PROGRESS_STORAGE_KEY, "new progress");
  assert.throws(() => old.setItem(storage.ACTIVITY_STORAGE_KEY, "old activity"), /WORKSPACE_CONFLICT/);
  assert.throws(() => old.removeItem(storage.PROGRESS_STORAGE_KEY), /WORKSPACE_CONFLICT/);
  assert.equal(backend.getItem(storage.DRAFT_STORAGE_KEY), "new draft");
  assert.equal(backend.getItem(storage.PROGRESS_STORAGE_KEY), "new progress");
  assert.equal(conflicts, 1);
});

test("legacy writes and clearing browser storage also invalidate a tab", () => {
  const backend = memoryStorage();
  backend.setItem(storage.DRAFT_STORAGE_KEY, "legacy draft");
  const tab = storage.createWorkspaceStorage({ storage: backend });
  tab.setItem(storage.DRAFT_STORAGE_KEY, "legacy draft");
  assert.equal(backend.getItem(storage.WORKSPACE_REVISION_KEY), null);
  backend.removeItem(storage.DRAFT_STORAGE_KEY);
  assert.equal(tab.check(), false);
  assert.equal(tab.handles(null), true);
  assert.equal(tab.handles(storage.THEME_STORAGE_KEY), false);
});

test("a tab loaded from the latest revision can continue saving without a migration", () => {
  const backend = memoryStorage();
  const first = storage.createWorkspaceStorage({ storage: backend });
  first.setItem(storage.DRAFT_STORAGE_KEY, "draft one");
  const next = storage.createWorkspaceStorage({ storage: backend });
  next.setItem(storage.DRAFT_STORAGE_KEY, "draft two");
  assert.equal(next.check(), true);
  assert.equal(first.check(), false);
});
