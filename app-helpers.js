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

  const SAMPLE_TIMERS = new Set([0, 300, 600, 900, 1200]);
  const SAMPLE_HINTS = new Set([0, 1, 3, 5, -1]);

  function sanitizeStoredSample(rawSample) {
    if (!rawSample || typeof rawSample !== "object") return null;
    // Same 60-character cap as the topic field.
    const title = typeof rawSample.title === "string" ? rawSample.title.trim().slice(0, 60) : "";
    const rawWords = Array.isArray(rawSample.words)
      ? rawSample.words.join("\n")
      : typeof rawSample.words === "string"
        ? rawSample.words
        : "";
    const parsed = parseWords(rawWords);
    if (!title || parsed.words.length < 3) return null;

    const difficulty = SAMPLE_DIFFICULTIES.has(rawSample.difficulty) ? rawSample.difficulty : "easy";
    const size = SAMPLE_SIZES.has(String(rawSample.size)) ? String(rawSample.size) : "auto";
    // Only values the settings menus offer: anything else left the select blank.
    const timerDuration = SAMPLE_TIMERS.has(rawSample.timerDuration) ? rawSample.timerDuration : 0;
    const hintsAllowed = SAMPLE_HINTS.has(rawSample.hintsAllowed) ? rawSample.hintsAllowed : 3;
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

  function normalizeSampleTitle(title) {
    return String(title ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
  }

  function mergeSamples(existingSamples, incomingSamples, lang) {
    const byTitle = new Map();
    existingSamples.forEach(sample => byTitle.set(normalizeSampleTitle(sample.title), sample));
    incomingSamples.forEach(sample => {
      const key = normalizeSampleTitle(sample.title);
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
      } catch {
        // Continue to the prompt fallback when clipboard access is unavailable.
      }
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
    normalizeSampleTitle,
    mergeSamples,
    shareUrlWithFallback,
  });
});
