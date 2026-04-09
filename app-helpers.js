(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./core.js"));
    return;
  }
  global.WORD_SEARCH_APP_HELPERS = factory(global.WORD_SEARCH_CORE);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  if (!core) throw new Error("WORD_SEARCH_CORE is required.");

  const {
    SAMPLE_DIFFICULTIES,
    SAMPLE_SIZES,
    normalizeWord,
    parseWords,
  } = core;

  function formatSecondsAsClock(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const secs = (totalSeconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  }

  function formatTimerSummary(totalSeconds, translations) {
    if (totalSeconds <= 0) return translations.timer_none;
    if (totalSeconds % 60 === 0) return `${totalSeconds / 60} min`;
    return formatSecondsAsClock(totalSeconds);
  }

  function formatHintsSummary(hintsAllowed, translations) {
    if (hintsAllowed === -1) return translations.hints_unlimited;
    if (hintsAllowed === 0) return translations.hints_none;
    return String(hintsAllowed);
  }

  function buildSelectionPath(start, end) {
    const dr = end.row - start.row;
    const dc = end.col - start.col;
    const sr = Math.sign(dr);
    const sc = Math.sign(dc);
    const dist = Math.max(Math.abs(dr), Math.abs(dc));
    if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return [];
    return Array.from({ length: dist + 1 }, (_, index) => ({
      row: start.row + sr * index,
      col: start.col + sc * index,
    }));
  }

  function generateSampleId() {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
    return `sample-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function sanitizeStoredSample(rawSample) {
    if (!rawSample || typeof rawSample !== "object") return null;
    const title = typeof rawSample.title === "string" ? rawSample.title.trim() : "";
    const rawWords = Array.isArray(rawSample.words)
      ? rawSample.words.join("\n")
      : typeof rawSample.words === "string"
        ? rawSample.words
        : "";
    const parsed = parseWords(rawWords);
    if (!title || parsed.words.length < 3) return null;

    const difficulty = SAMPLE_DIFFICULTIES.has(rawSample.difficulty) ? rawSample.difficulty : "easy";
    const size = SAMPLE_SIZES.has(String(rawSample.size)) ? String(rawSample.size) : "auto";
    const timerDuration = typeof rawSample.timerDuration === "number" ? rawSample.timerDuration : 0;
    const hintsAllowed = typeof rawSample.hintsAllowed === "number" ? rawSample.hintsAllowed : 3;
    const formTemplate = typeof rawSample.formTemplate === "string" ? rawSample.formTemplate : "";

    return {
      id: typeof rawSample.id === "string" && rawSample.id ? rawSample.id : generateSampleId(),
      title,
      words: parsed.words.map(word => word.display).join("\n"),
      difficulty,
      size,
      timerDuration,
      hintsAllowed,
      formTemplate,
    };
  }

  function mergeSamples(existingSamples, incomingSamples, lang) {
    const byTitle = new Map();
    existingSamples.forEach(sample => byTitle.set(normalizeWord(sample.title), sample));
    incomingSamples.forEach(sample => {
      const key = normalizeWord(sample.title);
      const previous = byTitle.get(key);
      byTitle.set(key, { ...sample, id: previous?.id || sample.id || generateSampleId() });
    });
    return [...byTitle.values()].sort((left, right) => left.title.localeCompare(right.title, lang));
  }

  async function shareUrlWithFallback({ url, share, writeText, prompt, promptMessage = "" }) {
    if (!url) throw new Error("url_required");

    if (typeof share === "function") {
      try {
        await share({ url });
        return "shared";
      } catch (error) {
        if (error?.name === "AbortError") return "cancelled";
      }
    }

    if (typeof writeText === "function") {
      try {
        await writeText(url);
        return "copied";
      } catch {}
    }

    if (typeof prompt === "function") {
      prompt(promptMessage, url);
      return "prompted";
    }

    return "unavailable";
  }

  return Object.freeze({
    formatSecondsAsClock,
    formatTimerSummary,
    formatHintsSummary,
    buildSelectionPath,
    generateSampleId,
    sanitizeStoredSample,
    mergeSamples,
    shareUrlWithFallback,
  });
});
