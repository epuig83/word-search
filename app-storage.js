(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./core.js"), require("./app-helpers.js"));
    return;
  }
  global.WORD_SEARCH_APP_STORAGE = factory(global.WORD_SEARCH_CORE, global.WORD_SEARCH_APP_HELPERS);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core, helpers) {
  "use strict";

  if (!core) throw new Error("WORD_SEARCH_CORE is required.");
  if (!helpers) throw new Error("WORD_SEARCH_APP_HELPERS is required.");

  const CUSTOM_SAMPLES_STORAGE_KEY = "word-search-custom-samples-v1";
  const TEACHER_PIN_STORAGE_KEY = "word-search-teacher-pin-v1";
  const DEFAULT_TEACHER_PIN = "1234";
  const {
    SAMPLE_LANGS,
    createEmptyCustomSamples,
  } = core;
  const {
    sanitizeStoredSample,
    mergeSamples,
  } = helpers;

  function sanitizeCustomSampleCollection(rawCollection) {
    const normalized = createEmptyCustomSamples();
    if (!rawCollection || typeof rawCollection !== "object") return normalized;

    SAMPLE_LANGS.forEach(lang => {
      const rawSamples = Array.isArray(rawCollection[lang]) ? rawCollection[lang] : [];
      const sanitized = rawSamples
        .map(sanitizeStoredSample)
        .filter(Boolean);
      normalized[lang] = mergeSamples([], sanitized, lang);
    });

    return normalized;
  }

  function loadTeacherPin(storage) {
    try {
      const storageImpl = storage || globalThis.localStorage;
      const stored = storageImpl.getItem(TEACHER_PIN_STORAGE_KEY);
      return stored && stored.length >= 4 ? stored : DEFAULT_TEACHER_PIN;
    } catch {
      return DEFAULT_TEACHER_PIN;
    }
  }

  function saveTeacherPin(pin, storage) {
    try {
      const storageImpl = storage || globalThis.localStorage;
      storageImpl.setItem(TEACHER_PIN_STORAGE_KEY, pin);
      return true;
    } catch {
      return false;
    }
  }

  function loadCustomSamples(storage) {
    try {
      const storageImpl = storage || globalThis.localStorage;
      const rawValue = storageImpl.getItem(CUSTOM_SAMPLES_STORAGE_KEY);
      if (!rawValue) return createEmptyCustomSamples();
      const parsed = JSON.parse(rawValue);
      const samples = parsed && typeof parsed === "object" && parsed.samples ? parsed.samples : parsed;
      return sanitizeCustomSampleCollection(samples);
    } catch {
      return createEmptyCustomSamples();
    }
  }

  function persistCustomSamples(customSamples, storage) {
    try {
      const storageImpl = storage || globalThis.localStorage;
      storageImpl.setItem(CUSTOM_SAMPLES_STORAGE_KEY, JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        samples: customSamples,
      }));
      return true;
    } catch {
      return false;
    }
  }

  return Object.freeze({
    CUSTOM_SAMPLES_STORAGE_KEY,
    TEACHER_PIN_STORAGE_KEY,
    DEFAULT_TEACHER_PIN,
    sanitizeCustomSampleCollection,
    loadTeacherPin,
    saveTeacherPin,
    loadCustomSamples,
    persistCustomSamples,
  });
});
