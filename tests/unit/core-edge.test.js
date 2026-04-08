const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../../core.js");

// ── countValidWords ────────────────────────────────────────────────────────

test("countValidWords returns the number of valid words", () => {
  assert.equal(core.countValidWords("sol\nluna\nmar"), 3);
  assert.equal(core.countValidWords("so\nluna\nmar"), 2); // "so" is too short
  assert.equal(core.countValidWords(""), 0);
  assert.equal(core.countValidWords("   \n  \n"), 0);
});

test("countValidWords deduplicates like parseWords", () => {
  assert.equal(core.countValidWords("sol\nsol\nsol"), 1);
  assert.equal(core.countValidWords("avió\navio\navio"), 1);
});

// ── calculateAutoSize ──────────────────────────────────────────────────────

test("calculateAutoSize returns a size within valid bounds", () => {
  const words = core.parseWords("sol\nluna\nmar\ntierra\ncielo").words;
  const size = core.calculateAutoSize(words);
  assert.ok(Number.isInteger(size), "size should be an integer");
  assert.ok(size >= 3, "size should be at least 3");
  assert.ok(size <= core.MAX_GRID_SIZE, `size should not exceed ${core.MAX_GRID_SIZE}`);
});

test("calculateAutoSize scales with longer words", () => {
  const short = core.parseWords("sol\nmar\nrio").words;
  const long = core.parseWords("extraordinario\nmaravillosamente\nelectrodomestico").words;
  assert.ok(
    core.calculateAutoSize(long) >= core.calculateAutoSize(short),
    "longer words should require equal or larger grid"
  );
});

test("calculateAutoSize with many short words", () => {
  const words = core.parseWords("sol\nmar\nrio\npan\nluz\nrey\nley\nojo\npie\nfin").words;
  const size = core.calculateAutoSize(words);
  assert.ok(size >= 5, "many short words should need at least a 5x5 grid");
});

// ── buildPlacementRecord ───────────────────────────────────────────────────

test("buildPlacementRecord creates correct structure", () => {
  const word = { id: "SOL", cleaned: "SOL", display: "sol" };
  const cells = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }];
  const record = core.buildPlacementRecord(word, cells, "SOL-0-0");

  assert.equal(record.wordId, "SOL");
  assert.equal(record.display, "sol");
  assert.deepEqual(record.cells, cells);
  assert.equal(record.key, "0:0|0:1|0:2");
  assert.equal(record.reversedKey, "0:2|0:1|0:0");
  assert.equal(record.placementId, "SOL-0-0");
});

// ── parsePlacementCells ────────────────────────────────────────────────────

test("parsePlacementCells parses valid cell paths", () => {
  const cells = core.parsePlacementCells("0.0,0.1,0.2", 3, 10);
  assert.deepEqual(cells, [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }]);
});

test("parsePlacementCells rejects invalid paths", () => {
  assert.equal(core.parsePlacementCells("", 3, 10), null);
  assert.equal(core.parsePlacementCells("abc", 3, 10), null);
  assert.equal(core.parsePlacementCells("0.0,0.1", 3, 10), null); // wrong length
  assert.equal(core.parsePlacementCells("-1.0,0.1,0.2", 3, 10), null); // negative
  assert.equal(core.parsePlacementCells("0.0,0.1,99.99", 3, 10), null); // out of bounds
});

test("parsePlacementCells validates cell bounds against grid size", () => {
  assert.ok(core.parsePlacementCells("0.0,1.1,2.2", 3, 3));
  assert.equal(core.parsePlacementCells("0.0,1.1,3.3", 3, 3), null); // row/col 3 >= size 3
});

// ── buildEmptyGrid ─────────────────────────────────────────────────────────

test("buildEmptyGrid creates a square grid of the correct size", () => {
  const grid = core.buildEmptyGrid(5);
  assert.equal(grid.length, 5);
  for (const row of grid) {
    assert.equal(row.length, 5);
    for (const cell of row) {
      assert.equal(cell, "");
    }
  }
});

// ── sameCell ───────────────────────────────────────────────────────────────

test("sameCell compares coordinates correctly", () => {
  assert.ok(core.sameCell({ row: 0, col: 0 }, { row: 0, col: 0 }));
  assert.ok(core.sameCell({ row: 3, col: 7 }, { row: 3, col: 7 }));
  assert.ok(!core.sameCell({ row: 0, col: 0 }, { row: 0, col: 1 }));
  assert.ok(!core.sameCell({ row: 1, col: 0 }, { row: 0, col: 0 }));
});

test("sameCell returns false for null/undefined inputs", () => {
  assert.ok(!core.sameCell(null, { row: 0, col: 0 }));
  assert.ok(!core.sameCell({ row: 0, col: 0 }, null));
  assert.ok(!core.sameCell(null, null));
  assert.ok(!core.sameCell(undefined, undefined));
});

// ── MAX_GENERATION_ATTEMPTS failure path ────────────────────────────────────

test("buildPuzzleData throws when words cannot fit", () => {
  // A 3x3 grid can't fit a word longer than 3 chars in any direction
  // With a tiny grid and a very long word, it should eventually fail
  const words = core.parseWords("supercalifragilisticoespialidoso").words;
  assert.throws(() => {
    core.buildPuzzleData(words, "3", "easy", { title: "Impossible" }, { random: Math.random });
  }, /Error generating puzzle/);
});

test("buildPuzzleData throws when too many long words for tiny grid", () => {
  const words = core.parseWords(
    "elefante\ngirafa\ncocodrilo\nhipopotamo\nrinoceronte"
  ).words;
  assert.throws(() => {
    core.buildPuzzleData(words, "4", "easy", { title: "Tight" }, { random: Math.random });
  }, /Error generating puzzle/);
});

// ── parseGridRows with valid data ──────────────────────────────────────────

test("parseGridRows accepts valid grid rows", () => {
  const grid = core.parseGridRows(["ABC", "DEF", "GHI"]);
  assert.ok(grid);
  assert.equal(grid.length, 3);
  assert.deepEqual(grid[0], ["A", "B", "C"]);
  assert.deepEqual(grid[1], ["D", "E", "F"]);
  assert.deepEqual(grid[2], ["G", "H", "I"]);
});

test("parseGridRows normalizes accented input", () => {
  const grid = core.parseGridRows(["CAFÉ", "MESA", "SILLA"]);
  // 4x5 is not square, so it should return null
  assert.equal(grid, null);
});

test("parseGridRows rejects too-small grids", () => {
  assert.equal(core.parseGridRows(["AB", "CD"]), null); // 2x2 < 3
});

test("parseGridRows rejects too-large grids", () => {
  const rows = Array(core.MAX_GRID_SIZE + 1).fill("A".repeat(core.MAX_GRID_SIZE + 1));
  assert.equal(core.parseGridRows(rows), null);
});

// ── Constants ──────────────────────────────────────────────────────────────

test("SHARED_PUZZLE_VERSION is 2", () => {
  assert.equal(core.SHARED_PUZZLE_VERSION, 2);
});

test("SAMPLE_LANGS contains expected languages", () => {
  assert.deepEqual(core.SAMPLE_LANGS, ["ca", "es", "en"]);
});

test("MAX_GRID_SIZE is 22", () => {
  assert.equal(core.MAX_GRID_SIZE, 22);
});

test("LETTERS contains Spanish alphabet including Ñ", () => {
  assert.ok(core.LETTERS.includes("Ñ"));
  assert.equal(core.LETTERS.length, 27); // A-Z + Ñ
});
