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
  const THEME_STORAGE_KEY = "word-search-theme-v1";
  const LANG_STORAGE_KEY = "word-search-lang-v1";
  const PROGRESS_STORAGE_KEY = "word-search-progress-v1";
  const DEFAULT_TEACHER_PIN = "1234";
  const DEFAULT_THEME = "pergami";
  const THEMES = ["pergami", "ocea", "bosc", "espai"];
  const DEFAULT_LANG = "ca";
  const LANGS = ["ca", "es", "en"];
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

  function loadTheme(storage) {
    try {
      const storageImpl = storage || globalThis.localStorage;
      const stored = storageImpl.getItem(THEME_STORAGE_KEY);
      return THEMES.includes(stored) ? stored : DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  }

  function saveTheme(theme, storage) {
    try {
      const storageImpl = storage || globalThis.localStorage;
      storageImpl.setItem(THEME_STORAGE_KEY, theme);
      return true;
    } catch {
      return false;
    }
  }

  function loadLang(storage) {
    try {
      const storageImpl = storage || globalThis.localStorage;
      const stored = storageImpl.getItem(LANG_STORAGE_KEY);
      return LANGS.includes(stored) ? stored : DEFAULT_LANG;
    } catch {
      return DEFAULT_LANG;
    }
  }

  function saveLang(lang, storage) {
    try {
      const storageImpl = storage || globalThis.localStorage;
      storageImpl.setItem(LANG_STORAGE_KEY, lang);
      return true;
    } catch {
      return false;
    }
  }

  // Single most-recent student progress record: { key, foundWordIds[], timerSecondsLeft, timerExpired }.
  function loadProgress(storage) {
    try {
      const storageImpl = storage || globalThis.localStorage;
      const raw = storageImpl.getItem(PROGRESS_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.key !== "string" || !Array.isArray(parsed.foundWordIds)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function saveProgress(record, storage) {
    try {
      const storageImpl = storage || globalThis.localStorage;
      storageImpl.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(record));
      return true;
    } catch {
      return false;
    }
  }

  function clearProgress(storage) {
    try {
      const storageImpl = storage || globalThis.localStorage;
      storageImpl.removeItem(PROGRESS_STORAGE_KEY);
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
    THEME_STORAGE_KEY,
    DEFAULT_TEACHER_PIN,
    DEFAULT_THEME,
    THEMES,
    DEFAULT_LANG,
    LANGS,
    sanitizeCustomSampleCollection,
    loadTeacherPin,
    saveTeacherPin,
    loadTheme,
    saveTheme,
    loadLang,
    saveLang,
    PROGRESS_STORAGE_KEY,
    loadProgress,
    saveProgress,
    clearProgress,
    loadCustomSamples,
    persistCustomSamples,
  });
});
