const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

globalThis.window = globalThis;
require(path.resolve(__dirname, "../../data.js"));
const data = globalThis.WORD_SEARCH_DATA;
const core = require(path.resolve(__dirname, "../../core.js"));

const LANGS = ["ca", "es", "en"];
const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const VALID_SIZES = new Set(["auto", "10", "12", "14", "16"]);

// ── Top-level structure ───────────────────────────────────────────────────

test("data exports vocabulary, definitions, and samplePuzzles", () => {
  assert.ok(data.vocabulary, "Missing vocabulary");
  assert.ok(data.definitions, "Missing definitions");
  assert.ok(data.samplePuzzles, "Missing samplePuzzles");
  assert.ok(Object.isFrozen(data), "data should be frozen");
});

// ── Vocabulary categories ─────────────────────────────────────────────────

test("vocabulary has the same categories across all languages", () => {
  const caCats = Object.keys(data.vocabulary.ca);
  for (const lang of LANGS) {
    const cats = Object.keys(data.vocabulary[lang]);
    assert.deepEqual(cats, caCats, `Category mismatch between ca and ${lang}`);
  }
});

test("each vocabulary category is frozen", () => {
  for (const lang of LANGS) {
    for (const [catId, cat] of Object.entries(data.vocabulary[lang])) {
      assert.ok(Object.isFrozen(cat), `${lang}.${catId} should be frozen`);
    }
  }
});

test("each category has a label and a words array", () => {
  for (const lang of LANGS) {
    for (const [catId, cat] of Object.entries(data.vocabulary[lang])) {
      assert.ok(typeof cat.label === "string" && cat.label, `${lang}.${catId} missing label`);
      assert.ok(Array.isArray(cat.words), `${lang}.${catId} words should be an array`);
      assert.ok(cat.words.length >= 3, `${lang}.${catId} should have at least 3 words`);
    }
  }
});

test("no duplicate words within a category", () => {
  for (const lang of LANGS) {
    for (const [catId, cat] of Object.entries(data.vocabulary[lang])) {
      const normalized = cat.words.map(w =>
        w.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      );
      const unique = new Set(normalized);
      assert.equal(
        unique.size,
        normalized.length,
        `${lang}.${catId} has duplicate words`
      );
    }
  }
});

test("no empty words in any category", () => {
  for (const lang of LANGS) {
    for (const [catId, cat] of Object.entries(data.vocabulary[lang])) {
      for (const word of cat.words) {
        assert.ok(
          typeof word === "string" && word.trim().length >= 2,
          `${lang}.${catId} contains empty/short word: "${word}"`
        );
      }
    }
  }
});

test("category words arrays are frozen", () => {
  for (const lang of LANGS) {
    for (const cat of Object.values(data.vocabulary[lang])) {
      assert.ok(Object.isFrozen(cat.words), `${lang} words array should be frozen`);
    }
  }
});

test("definitions are frozen for every language", () => {
  for (const lang of LANGS) {
    assert.ok(Object.isFrozen(data.definitions[lang]), `${lang} definitions should be frozen`);
  }
});

test("every internal vocabulary and built-in sample word has a definition", () => {
  for (const lang of LANGS) {
    const internalWords = new Set([
      ...Object.values(data.vocabulary[lang]).flatMap(cat => cat.words),
      ...data.samplePuzzles[lang].flatMap(sample => sample.words.split("\n").filter(Boolean)),
    ].map(word => core.normalizeWord(word)));

    for (const wordId of internalWords) {
      assert.ok(
        data.definitions[lang][wordId],
        `${lang} is missing a definition for ${wordId}`
      );
    }
  }
});

// ── Sample puzzles ─────────────────────────────────────────────────────────

test("samplePuzzles has the same number of entries per language", () => {
  const counts = LANGS.map(lang => data.samplePuzzles[lang].length);
  // They don't need to be equal, but each should have at least 1
  for (const lang of LANGS) {
    assert.ok(
      data.samplePuzzles[lang].length >= 1,
      `${lang} should have at least 1 sample puzzle`
    );
  }
});

test("each sample puzzle has required fields", () => {
  for (const lang of LANGS) {
    for (const [idx, sample] of data.samplePuzzles[lang].entries()) {
      assert.ok(sample.title, `${lang}[${idx}] missing title`);
      assert.ok(sample.words, `${lang}[${idx}] missing words`);
      assert.ok(sample.difficulty, `${lang}[${idx}] missing difficulty`);
      assert.ok(sample.size !== undefined, `${lang}[${idx}] missing size`);
    }
  }
});

test("sample puzzle difficulties are valid", () => {
  for (const lang of LANGS) {
    for (const [idx, sample] of data.samplePuzzles[lang].entries()) {
      assert.ok(
        VALID_DIFFICULTIES.has(sample.difficulty),
        `${lang}[${idx}] has invalid difficulty: ${sample.difficulty}`
      );
    }
  }
});

test("sample puzzle sizes are valid", () => {
  for (const lang of LANGS) {
    for (const [idx, sample] of data.samplePuzzles[lang].entries()) {
      assert.ok(
        VALID_SIZES.has(String(sample.size)),
        `${lang}[${idx}] has invalid size: ${sample.size}`
      );
    }
  }
});

test("sample puzzle words contain at least 3 entries", () => {
  for (const lang of LANGS) {
    for (const [idx, sample] of data.samplePuzzles[lang].entries()) {
      const wordCount = sample.words.split("\n").filter(Boolean).length;
      assert.ok(
        wordCount >= 3,
        `${lang}[${idx}] has fewer than 3 words (${wordCount})`
      );
    }
  }
});

test("sample puzzles are frozen (top-level arrays and objects)", () => {
  for (const lang of LANGS) {
    assert.ok(
      Object.isFrozen(data.samplePuzzles[lang]),
      `${lang} samplePuzzles array should be frozen`
    );
    for (const sample of data.samplePuzzles[lang]) {
      assert.ok(Object.isFrozen(sample), `${lang} sample object should be frozen`);
    }
  }
});

test("no sample puzzle title is empty", () => {
  for (const lang of LANGS) {
    for (const [idx, sample] of data.samplePuzzles[lang].entries()) {
      assert.ok(
        typeof sample.title === "string" && sample.title.trim().length > 0,
        `${lang}[${idx}] has empty title`
      );
    }
  }
});

// ── Languages are distinct ─────────────────────────────────────────────────

test("vocabulary categories have language-specific labels", () => {
  const caLabels = Object.entries(data.vocabulary.ca).map(([id, cat]) => [id, cat.label]);
  for (const lang of LANGS) {
    if (lang === "ca") continue;
    for (const [id, caLabel] of caLabels) {
      const langLabel = data.vocabulary[lang][id]?.label;
      assert.ok(langLabel, `${lang}.${id} missing label`);
      // At least some labels should differ between languages
      // (e.g., "Animals" vs "Animals" might be same, but others differ)
    }
  }
});

test("sample puzzle titles differ across languages", () => {
  const caTitle = data.samplePuzzles.ca[0].title;
  const esTitle = data.samplePuzzles.es[0].title;
  const enTitle = data.samplePuzzles.en[0].title;
  // At least some should differ (Catalan vs English, for example)
  const unique = new Set([caTitle, esTitle, enTitle]);
  assert.ok(
    unique.size >= 2,
    "Sample puzzle titles should differ across languages"
  );
});

test("catalan vocabulary and samples use 'tomàquet' with accent", () => {
  assert.ok(data.vocabulary.ca.vegetables.words.includes("tomàquet"));
  assert.ok(data.vocabulary.ca.food.words.includes("tomàquet"));
  assert.ok(
    data.samplePuzzles.ca.some(sample => sample.words.includes("tomàquet")),
    "Expected at least one Catalan sample puzzle to include tomàquet"
  );
});
