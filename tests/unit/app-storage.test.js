const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../../core.js");
const storageModule = require("../../app-storage.js");

function createMemoryStorage(initialEntries = {}) {
  const entries = new Map(Object.entries(initialEntries));
  return {
    getItem(key) {
      return entries.has(key) ? entries.get(key) : null;
    },
    setItem(key, value) {
      entries.set(key, String(value));
    },
  };
}

test("loadTeacherPin falls back to the default PIN for missing or short values", () => {
  const emptyStorage = createMemoryStorage();
  const shortPinStorage = createMemoryStorage({
    [storageModule.TEACHER_PIN_STORAGE_KEY]: "123",
  });

  assert.equal(storageModule.loadTeacherPin(emptyStorage), storageModule.DEFAULT_TEACHER_PIN);
  assert.equal(storageModule.loadTeacherPin(shortPinStorage), storageModule.DEFAULT_TEACHER_PIN);
});

test("saveTeacherPin persists the provided teacher PIN", () => {
  const storage = createMemoryStorage();

  assert.equal(storageModule.saveTeacherPin("9876", storage), true);
  assert.equal(storage.getItem(storageModule.TEACHER_PIN_STORAGE_KEY), "9876");
  assert.equal(storageModule.loadTeacherPin(storage), "9876");
});

test("sanitizeCustomSampleCollection keeps only valid samples grouped by language", () => {
  const sanitized = storageModule.sanitizeCustomSampleCollection({
    ca: [
      { title: "Animals", words: "gos\ngat\nocell", difficulty: "medium", size: "10" },
      { title: "", words: "gos\ngat\nocell" },
    ],
    es: [
      { title: "Corto", words: "sol\nlu" },
    ],
  });

  assert.equal(sanitized.ca.length, 1);
  assert.equal(sanitized.ca[0].title, "Animals");
  assert.equal(sanitized.es.length, 0);
  assert.deepEqual(sanitized.en, []);
});

test("persistCustomSamples and loadCustomSamples roundtrip custom sample collections", () => {
  const storage = createMemoryStorage();
  const samples = core.createEmptyCustomSamples();
  samples.ca = [
    {
      id: "sample-1",
      title: "Mar",
      words: "balena\ndofi\npeix",
      difficulty: "easy",
      size: "auto",
      timerDuration: 300,
      hintsAllowed: 3,
      formTemplate: "",
    },
  ];

  assert.equal(storageModule.persistCustomSamples(samples, storage), true);

  const loaded = storageModule.loadCustomSamples(storage);
  assert.deepEqual(loaded, samples);
});

test("loadCustomSamples returns an empty collection for malformed JSON", () => {
  const storage = createMemoryStorage({
    [storageModule.CUSTOM_SAMPLES_STORAGE_KEY]: "{not-json",
  });

  assert.deepEqual(storageModule.loadCustomSamples(storage), core.createEmptyCustomSamples());
});

const draft = {
  lang: "ca", title: "Work in progress", words: "gat\ng\n", difficulty: "easy",
  size: "8", timer: "0", hints: "-1", formTemplate: "",
};

test("draft recovery preserves incomplete input and excludes unrelated personal fields", () => {
  const storage = createMemoryStorage();
  assert.equal(storageModule.saveDraft({ ...draft, studentName: "Ada", teacherPin: "9876" }, storage), true);
  assert.deepEqual(storageModule.loadDraft(storage), draft);
  assert.equal(storage.getItem(storageModule.DRAFT_STORAGE_KEY).includes("Ada"), false);
});

test("invalid drafts and activities fail closed without throwing", () => {
  for (const raw of ["{broken", "null", "[]", '{"lang":"unknown"}']) {
    const storage = createMemoryStorage({
      [storageModule.DRAFT_STORAGE_KEY]: raw,
      [storageModule.ACTIVITY_STORAGE_KEY]: raw,
    });
    assert.equal(storageModule.loadDraft(storage), null);
    assert.equal(storageModule.loadActivity(storage), null);
  }
});

test("draft recovery replaces invalid select values with supported defaults", () => {
  const storage = createMemoryStorage();
  storageModule.saveDraft({ ...draft, size: "999", difficulty: "other", timer: "NaN", hints: "999" }, storage);
  assert.deepEqual(storageModule.loadDraft(storage), draft);
});

test("unavailable browser storage returns a save failure and safe recovery defaults", () => {
  const storage = {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("full"); },
  };
  assert.equal(storageModule.saveDraft(draft, storage), false);
  assert.equal(storageModule.saveActivity({ key: "value", form: draft }, storage), false);
  assert.equal(storageModule.loadDraft(storage), null);
  assert.equal(storageModule.loadActivity(storage), null);
});
