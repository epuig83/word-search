const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../../core.js");
const helpers = require("../../app-helpers.js");

// Load i18n for translation-dependent tests
require("../../i18n.js");
const TRANSLATIONS = globalThis.WORD_SEARCH_I18N;

const {
  formatSecondsAsClock,
  formatTimerSummary,
  formatHintsSummary,
  buildSelectionPath,
  generateSampleId,
  sanitizeStoredSample,
  mergeSamples,
  shareUrlWithFallback,
} = helpers;

// ── formatSecondsAsClock ───────────────────────────────────────────────────

test("formatSecondsAsClock formats 0 seconds", () => {
  assert.equal(formatSecondsAsClock(0), "00:00");
});

test("formatSecondsAsClock formats 30 seconds", () => {
  assert.equal(formatSecondsAsClock(30), "00:30");
});

test("formatSecondsAsClock formats 60 seconds", () => {
  assert.equal(formatSecondsAsClock(60), "01:00");
});

test("formatSecondsAsClock formats 125 seconds", () => {
  assert.equal(formatSecondsAsClock(125), "02:05");
});

test("formatSecondsAsClock formats 3600 seconds", () => {
  assert.equal(formatSecondsAsClock(3600), "60:00");
});

// ── formatTimerSummary ─────────────────────────────────────────────────────

test("formatTimerSummary returns 'Sin límite' for 0 seconds (es)", () => {
  assert.equal(formatTimerSummary(0, TRANSLATIONS.es), "Sin límite");
});

test("formatTimerSummary returns minutes for exact minutes", () => {
  assert.equal(formatTimerSummary(300, TRANSLATIONS.ca), "5 min");
  assert.equal(formatTimerSummary(600, TRANSLATIONS.ca), "10 min");
});

test("formatTimerSummary returns clock format for non-minute values", () => {
  assert.equal(formatTimerSummary(90, TRANSLATIONS.ca), "01:30");
  assert.equal(formatTimerSummary(125, TRANSLATIONS.ca), "02:05");
});

// ── formatHintsSummary ─────────────────────────────────────────────────────

test("formatHintsSummary returns unlimited for -1", () => {
  assert.equal(formatHintsSummary(-1, TRANSLATIONS.ca), "Il·limitades");
  assert.equal(formatHintsSummary(-1, TRANSLATIONS.es), "Ilimitadas");
});

test("formatHintsSummary returns none text for 0", () => {
  assert.equal(formatHintsSummary(0, TRANSLATIONS.ca), "Sense pistes");
  assert.equal(formatHintsSummary(0, TRANSLATIONS.es), "Sin pistas");
});

test("formatHintsSummary returns number for positive values", () => {
  assert.equal(formatHintsSummary(3, TRANSLATIONS.ca), "3");
  assert.equal(formatHintsSummary(5, TRANSLATIONS.es), "5");
});

// ── buildSelectionPath ─────────────────────────────────────────────────────

test("buildSelectionPath horizontal right", () => {
  const path = buildSelectionPath({ row: 0, col: 0 }, { row: 0, col: 3 });
  assert.deepEqual(path, [
    { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 },
  ]);
});

test("buildSelectionPath horizontal left", () => {
  const path = buildSelectionPath({ row: 0, col: 3 }, { row: 0, col: 0 });
  assert.deepEqual(path, [
    { row: 0, col: 3 }, { row: 0, col: 2 }, { row: 0, col: 1 }, { row: 0, col: 0 },
  ]);
});

test("buildSelectionPath vertical down", () => {
  const path = buildSelectionPath({ row: 0, col: 0 }, { row: 2, col: 0 });
  assert.deepEqual(path, [
    { row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 },
  ]);
});

test("buildSelectionPath vertical up", () => {
  const path = buildSelectionPath({ row: 3, col: 0 }, { row: 0, col: 0 });
  assert.deepEqual(path, [
    { row: 3, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 0 }, { row: 0, col: 0 },
  ]);
});

test("buildSelectionPath diagonal down-right", () => {
  const path = buildSelectionPath({ row: 0, col: 0 }, { row: 2, col: 2 });
  assert.deepEqual(path, [
    { row: 0, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 2 },
  ]);
});

test("buildSelectionPath diagonal down-left", () => {
  const path = buildSelectionPath({ row: 0, col: 2 }, { row: 2, col: 0 });
  assert.deepEqual(path, [
    { row: 0, col: 2 }, { row: 1, col: 1 }, { row: 2, col: 0 },
  ]);
});

test("buildSelectionPath returns empty for non-aligned cells", () => {
  // Not horizontal, vertical, or diagonal
  const path = buildSelectionPath({ row: 0, col: 0 }, { row: 1, col: 3 });
  assert.deepEqual(path, []);
});

test("buildSelectionPath single cell returns that cell", () => {
  const path = buildSelectionPath({ row: 2, col: 2 }, { row: 2, col: 2 });
  assert.deepEqual(path, [{ row: 2, col: 2 }]);
});

// ── sanitizeStoredSample ──────────────────────────────────────────────────

test("sanitizeStoredSample returns null for invalid input", () => {
  assert.equal(sanitizeStoredSample(null), null);
  assert.equal(sanitizeStoredSample(undefined), null);
  assert.equal(sanitizeStoredSample("string"), null);
  assert.equal(sanitizeStoredSample(42), null);
});

test("sanitizeStoredSample returns null for missing title", () => {
  assert.equal(sanitizeStoredSample({ words: "sol\nluna\nmar" }), null);
});

test("sanitizeStoredSample returns null for fewer than 3 valid words", () => {
  assert.equal(sanitizeStoredSample({ title: "Test", words: "sol\nluna" }), null);
  assert.equal(sanitizeStoredSample({ title: "Test", words: "so\nlu" }), null);
});

test("sanitizeStoredSample sanitizes a valid sample", () => {
  const raw = {
    title: "  Mi Sopa  ",
    words: ["sol", "luna", "mar"],
    difficulty: "medium",
    size: "12",
    timerDuration: 300,
    hintsAllowed: 5,
    formTemplate: "https://example.com/form",
  };
  const result = sanitizeStoredSample(raw);

  assert.ok(result);
  assert.equal(result.title, "Mi Sopa");
  assert.equal(result.words, "sol\nluna\nmar");
  assert.equal(result.difficulty, "medium");
  assert.equal(result.size, "12");
  assert.equal(result.timerDuration, 300);
  assert.equal(result.hintsAllowed, 5);
  assert.equal(result.formTemplate, "https://example.com/form");
  assert.ok(typeof result.id === "string" && result.id.length > 0);
});

test("sanitizeStoredSample defaults invalid difficulty to easy", () => {
  const result = sanitizeStoredSample({
    title: "Test",
    words: "sol\nluna\nmar",
    difficulty: "impossible",
  });
  assert.equal(result.difficulty, "easy");
});

test("sanitizeStoredSample defaults invalid size to auto", () => {
  const result = sanitizeStoredSample({
    title: "Test",
    words: "sol\nluna\nmar",
    size: "99",
  });
  assert.equal(result.size, "auto");
});

test("sanitizeStoredSample defaults missing timer/hints/formTemplate", () => {
  const result = sanitizeStoredSample({
    title: "Test",
    words: "sol\nluna\nmar",
  });
  assert.equal(result.timerDuration, 0);
  assert.equal(result.hintsAllowed, 3);
  assert.equal(result.formTemplate, "");
});

test("sanitizeStoredSample preserves provided id", () => {
  const result = sanitizeStoredSample({
    id: "my-custom-id",
    title: "Test",
    words: "sol\nluna\nmar",
  });
  assert.equal(result.id, "my-custom-id");
});

// ── mergeSamples ───────────────────────────────────────────────────────────

test("mergeSamples combines samples and deduplicates by title", () => {
  const existing = [
    { id: "old-1", title: "Animals", words: "gos\ngat\nocell", difficulty: "easy", size: "auto", timerDuration: 0, hintsAllowed: 3, formTemplate: "" },
  ];
  const incoming = [
    { id: "new-1", title: "Animals", words: "gos\ngat\nocell\nllop", difficulty: "medium", size: "10", timerDuration: 300, hintsAllowed: 5, formTemplate: "" },
    { id: "new-2", title: "Fruits", words: "poma\npera\nplàtan", difficulty: "easy", size: "auto", timerDuration: 0, hintsAllowed: 3, formTemplate: "" },
  ];

  const merged = mergeSamples(existing, incoming, "ca");

  assert.equal(merged.length, 2);
  // "Animals" should keep the existing id but update content
  const animals = merged.find(s => s.title === "Animals");
  assert.equal(animals.id, "old-1");
  assert.equal(animals.difficulty, "medium");

  // Sorted alphabetically
  assert.equal(merged[0].title, "Animals");
  assert.equal(merged[1].title, "Fruits");
});

test("mergeSamples with empty existing just adds incoming", () => {
  const incoming = [
    { id: "a", title: "Beta", words: "sol\nluna\nmar", difficulty: "easy", size: "auto", timerDuration: 0, hintsAllowed: 3, formTemplate: "" },
    { id: "b", title: "Alpha", words: "sol\nluna\nmar", difficulty: "easy", size: "auto", timerDuration: 0, hintsAllowed: 3, formTemplate: "" },
  ];

  const merged = mergeSamples([], incoming, "en");

  assert.equal(merged.length, 2);
  assert.equal(merged[0].title, "Alpha"); // sorted
  assert.equal(merged[1].title, "Beta");
});

test("mergeSamples with empty incoming returns existing", () => {
  const existing = [
    { id: "x", title: "Test", words: "sol\nluna\nmar", difficulty: "easy", size: "auto", timerDuration: 0, hintsAllowed: 3, formTemplate: "" },
  ];

  const merged = mergeSamples(existing, [], "ca");
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "x");
});

// ── generateSampleId ───────────────────────────────────────────────────────

test("generateSampleId returns unique IDs", () => {
  const id1 = generateSampleId();
  const id2 = generateSampleId();
  assert.ok(typeof id1 === "string" && id1.length > 0);
  assert.ok(typeof id2 === "string" && id2.length > 0);
  assert.notEqual(id1, id2);
});

// ── shareUrlWithFallback ───────────────────────────────────────────────────

test("shareUrlWithFallback uses navigator.share when it succeeds", async () => {
  const calls = [];
  const result = await shareUrlWithFallback({
    url: "https://example.com/?p=abc",
    share: async payload => calls.push(payload),
    writeText: async () => calls.push("clipboard"),
    prompt: () => calls.push("prompt"),
    promptMessage: "Share",
  });

  assert.equal(result, "shared");
  assert.deepEqual(calls, [{ url: "https://example.com/?p=abc" }]);
});

test("shareUrlWithFallback falls back to clipboard when navigator.share fails", async () => {
  const calls = [];
  const result = await shareUrlWithFallback({
    url: "https://example.com/?p=abc",
    share: async () => {
      const error = new Error("Not allowed");
      error.name = "NotAllowedError";
      throw error;
    },
    writeText: async text => calls.push(text),
    prompt: () => calls.push("prompt"),
    promptMessage: "Share",
  });

  assert.equal(result, "copied");
  assert.deepEqual(calls, ["https://example.com/?p=abc"]);
});

test("shareUrlWithFallback falls back to prompt when share and clipboard fail", async () => {
  const calls = [];
  const result = await shareUrlWithFallback({
    url: "https://example.com/?p=abc",
    share: async () => {
      const error = new Error("Not allowed");
      error.name = "NotAllowedError";
      throw error;
    },
    writeText: async () => {
      throw new Error("clipboard unavailable");
    },
    prompt: (message, value) => calls.push({ message, value }),
    promptMessage: "Share",
  });

  assert.equal(result, "prompted");
  assert.deepEqual(calls, [{ message: "Share", value: "https://example.com/?p=abc" }]);
});

// ── parseFormEntries / buildFormSubmitUrl (also tested in core, re-check) ───

test("parseFormEntries returns null for invalid URLs", () => {
  assert.equal(core.parseFormEntries("not-a-url"), null);
  assert.equal(core.parseFormEntries("https://example.com"), null); // no entry.* params
  assert.equal(core.parseFormEntries(""), null);
});

test("parseFormEntries extracts entry.* params", () => {
  const parsed = core.parseFormEntries("https://docs.google.com/forms/d/x/viewform?entry.1=a&entry.2=b&other=ignore");
  assert.ok(parsed);
  assert.equal(parsed.baseUrl, "https://docs.google.com/forms/d/x/viewform");
  assert.deepEqual(parsed.entries, ["entry.1", "entry.2"]);
});

test("buildFormSubmitUrl constructs correct URL", () => {
  const parsed = core.parseFormEntries("https://docs.google.com/forms/d/x/viewform?entry.10=Nom&entry.20=Cognoms&entry.30=Res&entry.40=Tema");
  const url = core.buildFormSubmitUrl(parsed, "Ada", "Lovelace", "5/5", "Animals");
  const resultUrl = new URL(url);
  assert.equal(resultUrl.searchParams.get("entry.10"), "Ada");
  assert.equal(resultUrl.searchParams.get("entry.20"), "Lovelace");
  assert.equal(resultUrl.searchParams.get("entry.30"), "5/5");
  assert.equal(resultUrl.searchParams.get("entry.40"), "Animals");
});
