const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../../core.js");
const { mergeSamples, normalizeSampleTitle } = require("../../app-helpers.js");
const storage = require("../../app-storage.js");

test("sample titles preserve numbers, punctuation, accents and word boundaries", () => {
  const titles = ["Tema 1", "Tema 2", "Tema-1", "Tema1", "Te ma", "Tema", "Téma"];
  const samples = titles.map((title, i) => ({ id: `sample-${i}`, title, words: "sol\nluna\nmar" }));
  assert.equal(storage.sanitizeCustomSampleCollection({ es: samples }).es.length, titles.length);
  const merged = mergeSamples(samples, [{ title: "  TEMA   1 ", words: "gato\nperro\noso" }], "es");
  assert.equal(merged.length, titles.length);
  assert.equal(merged.find(sample => sample.id === "sample-0").words, "gato\nperro\noso");
  assert.equal(normalizeSampleTitle("Te\u0301ma"), normalizeSampleTitle("Téma"));
});

test("shared paths reject bends, jumps, repeated cells and malformed coordinates", () => {
  for (const path of ["0.0,1.1,2.0", "0.0,0.2,0.4", "0.0,0.0,0.0", "0.0,1.1,0.0", "0.0.9,0.1,0.2", ".0,0.1,0.2", "0.0,0.1,0.8"]) {
    assert.equal(core.parsePlacementCells(path, 3, 8), null, path);
  }
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1], [0, -1], [-1, 0], [-1, -1], [-1, 1]]) {
    const cells = Array.from({ length: 3 }, (_, i) => ({ row: 3 + dr * i, col: 3 + dc * i }));
    assert.deepEqual(core.parsePlacementCells(core.serializePlacementCells(cells), 3, 8), cells);
  }
});

test("a snapshot spelling the right word in a zigzag cannot be loaded", () => {
  assert.throws(() => core.buildPuzzleFromSnapshotData(core.parseWords("sol").words, {
    gridRows: ["SXX", "XOX", "LXX"], placementPaths: ["0.0,1.1,2.0"],
  }, {}), /invalid_snapshot/);
});
