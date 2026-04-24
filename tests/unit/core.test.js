const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../../core.js");

function lettersForPlacement(grid, placement) {
  return placement.cells.map(cell => grid[cell.row][cell.col]).join("");
}

test("normalizeWord removes accents and keeps Ñ", () => {
  assert.equal(core.normalizeWord("cañón-áéíóú ç"), "CAÑONAEIOUC");
});

test("parseWords deduplicates normalized words and ignores short entries", () => {
  const parsed = core.parseWords("avió\navio\nsol\nso\nsol");
  assert.deepEqual(parsed.words.map(word => word.cleaned), ["AVIO", "SOL"]);
  assert.deepEqual(parsed.words.map(word => word.display), ["avió", "sol"]);
});

test("normalizeSharedSize accepts valid numeric sizes and rejects invalid ones", () => {
  assert.equal(core.normalizeSharedSize("14"), "14");
  assert.equal(core.normalizeSharedSize(9), "9");
  assert.equal(core.normalizeSharedSize(2), "auto");
  assert.equal(core.normalizeSharedSize(40), "auto");
});

test("buildPuzzleData creates a solvable puzzle with matching placements", () => {
  const words = core.parseWords("balena\ndofi\npeix").words;
  const puzzle = core.buildPuzzleData(words, "10", "medium", { title: "Mar" }, { random: () => 0 });

  assert.equal(puzzle.actualSize, 10);
  assert.equal(puzzle.placements.length, words.length);
  for (const placement of puzzle.placements) {
    const word = words.find(candidate => candidate.id === placement.wordId);
    assert.ok(word);
    assert.equal(lettersForPlacement(puzzle.grid, placement), word.cleaned);
  }
});

test("snapshot serialization roundtrip rebuilds the same puzzle", () => {
  const words = core.parseWords("balena\ndofi\npeix").words;
  const original = core.buildPuzzleData(words, "10", "hard", { title: "Mar" }, { random: () => 0 });
  const rebuilt = core.buildPuzzleFromSnapshotData(words, {
    requestedSize: "10",
    difficulty: "hard",
    gridRows: core.serializeGridRows(original.grid),
    placementPaths: original.placements.map(placement => core.serializePlacementCells(placement.cells)),
  }, { title: "Mar" });

  assert.deepEqual(rebuilt.grid, original.grid);
  assert.equal(rebuilt.actualSize, original.actualSize);
  assert.equal(rebuilt.placements.length, original.placements.length);
});

test("encodePuzzleConfig and decodePuzzleConfig preserve shared puzzle data", () => {
  const encoded = core.encodePuzzleConfig({
    version: core.SHARED_PUZZLE_VERSION,
    title: "Animals del mar",
    words: "balena\ndofi\npeix",
    difficulty: "medium",
    size: "12",
    lang: "ca",
    timer: 300,
    hints: 3,
    formTemplate: "https://example.com/form",
    gridRows: ["ABC", "DEF", "GHI"],
    placementPaths: ["0.0,0.1,0.2"],
  });

  assert.deepEqual(core.decodePuzzleConfig(encoded), {
    version: core.SHARED_PUZZLE_VERSION,
    title: "Animals del mar",
    words: "balena\ndofi\npeix",
    difficulty: "medium",
    size: "12",
    requestedSize: "12",
    lang: "ca",
    timer: 300,
    hints: 3,
    formTemplate: "https://example.com/form",
    gridRows: ["ABC", "DEF", "GHI"],
    placementPaths: ["0.0,0.1,0.2"],
  });
});

test("decodePuzzleConfig returns null for invalid payloads", () => {
  assert.equal(core.decodePuzzleConfig("not-base64"), null);
});

test("decodePuzzleConfig clamps negative timer to 0 and negative hints to -1", () => {
  const encoded = core.encodePuzzleConfig({
    version: core.SHARED_PUZZLE_VERSION,
    title: "t",
    words: "w",
    difficulty: "easy",
    size: "10",
    lang: "ca",
    timer: -30,
    hints: -5,
    formTemplate: "",
    gridRows: null,
    placementPaths: null,
  });
  const decoded = core.decodePuzzleConfig(encoded);
  assert.equal(decoded.timer, 0, "negative timer must clamp to 0");
  assert.equal(decoded.hints, -1, "hints below -1 must clamp to -1 (unlimited)");
});

test("decodePuzzleConfig preserves hints: -1 sentinel (unlimited)", () => {
  const encoded = core.encodePuzzleConfig({
    version: core.SHARED_PUZZLE_VERSION,
    title: "t",
    words: "w",
    difficulty: "easy",
    size: "10",
    lang: "ca",
    timer: 0,
    hints: -1,
    formTemplate: "",
    gridRows: null,
    placementPaths: null,
  });
  assert.equal(core.decodePuzzleConfig(encoded).hints, -1);
});

test("parseGridRows rejects inconsistent grid sizes", () => {
  assert.equal(core.parseGridRows(["ABCD", "EFGH", "IJK"]), null);
});

test("buildPuzzleFromSnapshotData rejects corrupted snapshot data", () => {
  const words = core.parseWords("balena\ndofi\npeix").words;

  assert.throws(() => {
    core.buildPuzzleFromSnapshotData(words, {
      requestedSize: "10",
      difficulty: "easy",
      gridRows: ["ABC", "DEF", "GHI"],
      placementPaths: ["0.0,0.1,0.2"],
    }, { title: "Broken" });
  }, /invalid_snapshot/);
});

test("parseFormEntries and buildFormSubmitUrl preserve the expected fields", () => {
  const parsed = core.parseFormEntries("https://docs.google.com/forms/d/e/test/viewform?entry.10=Nom&entry.20=Cognoms&entry.30=Resultat&entry.40=Tema");
  assert.deepEqual(parsed, {
    baseUrl: "https://docs.google.com/forms/d/e/test/viewform",
    entries: ["entry.10", "entry.20", "entry.30", "entry.40"],
  });

  const submitUrl = core.buildFormSubmitUrl(parsed, "Ada", "Lovelace", "4/4", "Animals del mar");
  const url = new URL(submitUrl);
  assert.equal(url.searchParams.get("entry.10"), "Ada");
  assert.equal(url.searchParams.get("entry.20"), "Lovelace");
  assert.equal(url.searchParams.get("entry.30"), "4/4");
  assert.equal(url.searchParams.get("entry.40"), "Animals del mar");
});

test("parseFormEntries rejects non-allowed hosts to block redirect-based phishing", () => {
  assert.equal(core.parseFormEntries("https://evil.example.com/collect?entry.1=x"), null);
  assert.equal(core.parseFormEntries("https://docs-google.com/forms/d/x?entry.1=x"), null);
  assert.equal(core.parseFormEntries("http://docs.google.com/forms/d/x?entry.1=x"), null, "rejects plain http");
  assert.ok(core.parseFormEntries("https://forms.gle/short-link?entry.1=x"));
  assert.ok(core.parseFormEntries("https://docs.google.com/forms/d/x/viewform?entry.1=x"));
});

test("parseFormEntries rejects allowed host without entry.* params", () => {
  assert.equal(core.parseFormEntries("https://docs.google.com/forms/d/x/viewform"), null);
});

test("decodePuzzleConfig clamps title, words, and formTemplate lengths", () => {
  const longTitle = "A".repeat(500);
  const longWords = "palabra\n".repeat(1000);
  const longForm = "https://docs.google.com/forms/d/" + "z".repeat(1000) + "?entry.1=x";
  const encoded = core.encodePuzzleConfig({
    version: core.SHARED_PUZZLE_VERSION,
    title: longTitle,
    words: longWords,
    difficulty: "easy",
    size: "auto",
    lang: "ca",
    timer: 0,
    hints: 0,
    formTemplate: longForm,
  });
  const decoded = core.decodePuzzleConfig(encoded);
  assert.ok(decoded.title.length <= 60, `title ${decoded.title.length} > 60`);
  assert.ok(decoded.words.length <= 2000, `words ${decoded.words.length} > 2000`);
  assert.ok(decoded.formTemplate.length <= 500, `formTemplate ${decoded.formTemplate.length} > 500`);
});
