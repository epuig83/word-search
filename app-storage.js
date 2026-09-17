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
  const DRAFT_STORAGE_KEY = "word-search-draft-v1";
  const ACTIVITY_STORAGE_KEY = "word-search-activity-v1";
  const DEFAULT_TEACHER_PIN = "1234";
  const DEFAULT_THEME = "pergami";
  const THEMES = ["pergami", "ocea", "bosc", "espai"];
  const CONTRAST_STORAGE_KEY = "word-search-contrast-v1";
  const CONTRASTS = ["normal", "high"];
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

  // Returns the stored contrast preference, or null when none is set so the
  // caller can fall back to the OS `prefers-contrast` media query.
  function loadContrast(storage) {
    try {
      const storageImpl = storage || globalThis.localStorage;
      const stored = storageImpl.getItem(CONTRAST_STORAGE_KEY);
      return CONTRASTS.includes(stored) ? stored : null;
    } catch {
      return null;
    }
  }

  function saveContrast(contrast, storage) {
    try {
      const storageImpl = storage || globalThis.localStorage;
      storageImpl.setItem(CONTRAST_STORAGE_KEY, contrast);
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

  // Drafts may be incomplete: preserve the teacher's text without requiring a
  // valid puzzle. Whitelist fields so student names and PINs are never included.
  function sanitizeDraft(raw) {
    if (!raw || !LANGS.includes(raw.lang) || typeof raw.title !== "string" || typeof raw.words !== "string") return null;
    return {
      lang: raw.lang,
      title: raw.title.slice(0, 60),
      words: raw.words,
      difficulty: ["easy", "medium", "hard"].includes(raw.difficulty) ? raw.difficulty : "easy",
      size: core.SAMPLE_SIZES.has(raw.size) ? raw.size : "8",
      timer: ["0", "300", "600", "900", "1200"].includes(raw.timer) ? raw.timer : "0",
      hints: ["-1", "0", "1", "3", "5"].includes(raw.hints) ? raw.hints : "-1",
      formTemplate: typeof raw.formTemplate === "string" ? raw.formTemplate : "",
    };
  }

  function loadRecord(key, storage) {
    try {
      return JSON.parse((storage || globalThis.localStorage).getItem(key));
    } catch {
      return null;
    }
  }

  function saveRecord(key, value, storage) {
    try {
      (storage || globalThis.localStorage).setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function loadDraft(storage) {
    return sanitizeDraft(loadRecord(DRAFT_STORAGE_KEY, storage));
  }

  function saveDraft(draft, storage) {
    const clean = sanitizeDraft(draft);
    return Boolean(clean) && saveRecord(DRAFT_STORAGE_KEY, clean, storage);
  }

  function loadActivity(storage) {
    const raw = loadRecord(ACTIVITY_STORAGE_KEY, storage);
    const form = sanitizeDraft(raw?.form);
    if (!form || typeof raw.key !== "string" || !core.decodePuzzleConfig(raw.key)) return null;
    return { key: raw.key, form, activeTab: raw.activeTab === "student" ? "student" : "teacher" };
  }

  function saveActivity(activity, storage) {
    return saveRecord(ACTIVITY_STORAGE_KEY, activity, storage);
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
    CONTRAST_STORAGE_KEY,
    CONTRASTS,
    loadContrast,
    saveContrast,
    loadLang,
    saveLang,
    PROGRESS_STORAGE_KEY,
    loadProgress,
    saveProgress,
    clearProgress,
    DRAFT_STORAGE_KEY,
    ACTIVITY_STORAGE_KEY,
    loadDraft,
    saveDraft,
    loadActivity,
    saveActivity,
    loadCustomSamples,
    persistCustomSamples,
  });
});
