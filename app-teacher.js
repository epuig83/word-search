(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  global.WORD_SEARCH_APP_TEACHER = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createTeacherController({
    dom,
    state,
    getTranslations,
    sampleLangs,
    allCategoryId,
    parseWords,
    countValidWords,
    normalizeWord,
    generateSampleId,
    mergeSamples,
    sanitizeCustomSampleCollection,
    getBuiltInSamplePuzzles,
    getCustomSamplePuzzles,
    getVocabularyCategories,
    persistCustomSamples,
    setStatus,
    debounce,
  }) {
    function resolveSelectedSample() {
      const value = dom.sampleSelect.value;
      if (!value) return null;

      if (value.startsWith("builtin:")) {
        const index = Number(value.slice("builtin:".length));
        return getBuiltInSamplePuzzles(state.lang)[index] || null;
      }

      if (value.startsWith("custom:")) {
        const sampleId = value.slice("custom:".length);
        return getCustomSamplePuzzles(state.lang).find(sample => sample.id === sampleId) || null;
      }

      return null;
    }

    function buildCurrentSampleFromForm() {
      const title = dom.titleInput.value.trim();
      if (!title) {
        setStatus(getTranslations().msg_sample_requires_title, "error");
        return null;
      }

      const parsed = parseWords(dom.wordsInput.value);
      if (parsed.words.length < 3) {
        setStatus(getTranslations().msg_sample_requires_words, "error");
        return null;
      }

      return {
        id: generateSampleId(),
        title,
        words: parsed.words.map(word => word.display).join("\n"),
        difficulty: dom.difficultyInput.value,
        size: dom.sizeInput.value,
        timerDuration: Number(dom.timerInput?.value) || 0,
        hintsAllowed: Number(dom.hintsInput?.value) || 0,
        formTemplate: dom.formTemplateInput?.value.trim() || "",
      };
    }

    async function importCustomSamplesFromFile(file) {
      if (!file) return;

      try {
        const text = await file.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          setStatus(getTranslations().msg_import_invalid, "error");
          return;
        }

        const rawSamples = parsed && typeof parsed === "object" && parsed.samples ? parsed.samples : parsed;
        const importedSamples = sanitizeCustomSampleCollection(rawSamples);
        const totalImported = sampleLangs.reduce((sum, lang) => sum + importedSamples[lang].length, 0);

        if (!totalImported) {
          setStatus(getTranslations().msg_import_empty, "error");
          return;
        }

        sampleLangs.forEach(lang => {
          state.customSamples[lang] = mergeSamples(state.customSamples[lang], importedSamples[lang], lang);
        });

        if (!persistCustomSamples()) {
          return;
        }

        renderSampleOptions();
        setStatus(getTranslations().msg_import_success.replace("{count}", totalImported), "success");
      } catch {
        setStatus(getTranslations().msg_import_read_error, "error");
      } finally {
        dom.importSamplesInput.value = "";
      }
    }

    function updateWordsHelper() {
      if (!dom.wordsCount || !dom.wordsFeedback) return;
      const t = getTranslations();
      const count = countValidWords(dom.wordsInput.value);
      const countTone = count >= 3 ? "ready" : count > 0 ? "sparse" : "";
      const feedbackKey = count >= 3 ? "words_summary_ready" : count > 0 ? "words_summary_sparse" : "words_summary_empty";

      dom.wordsCount.textContent = t.words_count.replace("{count}", count);
      dom.wordsCount.className = "words-count-pill" + (countTone ? ` is-${countTone}` : "");
      dom.wordsFeedback.textContent = t[feedbackKey];
      dom.wordsFeedback.className = "words-feedback" + (countTone ? ` is-${countTone}` : "");

      if (dom.clearWordsButton) dom.clearWordsButton.disabled = count === 0;
      if (dom.generateButton) dom.generateButton.disabled = count === 0;
      if (dom.generateOpenButton) dom.generateOpenButton.disabled = count === 0;
    }

    function syncWordsUi() {
      updateWordsHelper();
      renderLibrary();
    }

    function isFormDirty() {
      return Boolean(dom.titleInput.value.trim() || dom.wordsInput.value.trim());
    }

    function renderSampleOptions(selectedValue = "") {
      const builtInSamples = getBuiltInSamplePuzzles(state.lang);
      const customSamples = getCustomSamplePuzzles(state.lang);
      const t = getTranslations();
      dom.sampleSelect.innerHTML = "";

      const placeholderOption = document.createElement("option");
      placeholderOption.value = "";
      placeholderOption.textContent = t.sample_placeholder;
      dom.sampleSelect.appendChild(placeholderOption);

      if (builtInSamples.length) {
        const builtInGroup = document.createElement("optgroup");
        builtInGroup.label = t.sample_group_builtin;
        builtInSamples.forEach((sample, index) => {
          const option = document.createElement("option");
          option.value = `builtin:${index}`;
          option.textContent = sample.title;
          builtInGroup.appendChild(option);
        });
        dom.sampleSelect.appendChild(builtInGroup);
      }

      if (customSamples.length) {
        const customGroup = document.createElement("optgroup");
        customGroup.label = t.sample_group_custom;
        customSamples.forEach(sample => {
          const option = document.createElement("option");
          option.value = `custom:${sample.id}`;
          option.textContent = sample.title;
          customGroup.appendChild(option);
        });
        dom.sampleSelect.appendChild(customGroup);
      }

      dom.sampleSelect.value = selectedValue;
      if (dom.sampleSelect.value !== selectedValue) {
        dom.sampleSelect.value = "";
      }
      updateDeleteSampleButton();
    }

    function updateDeleteSampleButton() {
      if (!dom.deleteSampleButton) return;
      dom.deleteSampleButton.disabled = !dom.sampleSelect.value.startsWith("custom:");
    }

    function deleteCurrentSample() {
      const value = dom.sampleSelect.value;
      if (!value.startsWith("custom:")) return;
      const t = getTranslations();
      if (!window.confirm(t.msg_confirm_delete_sample)) return;
      const sampleId = value.slice("custom:".length);
      state.customSamples[state.lang] = (state.customSamples[state.lang] || []).filter(sample => sample.id !== sampleId);
      if (!persistCustomSamples()) return;
      renderSampleOptions();
      setStatus(t.msg_sample_deleted, "success");
    }

    function loadSelectedSample() {
      const sample = resolveSelectedSample();
      if (!sample) {
        setStatus(getTranslations().msg_choose_sample, "error");
        return;
      }

      if (isFormDirty() && !window.confirm(getTranslations().msg_confirm_replace)) {
        return;
      }

      dom.titleInput.value = sample.title;
      dom.wordsInput.value = sample.words;
      dom.difficultyInput.value = sample.difficulty;
      dom.sizeInput.value = sample.size;
      if (dom.timerInput && sample.timerDuration !== undefined) dom.timerInput.value = String(sample.timerDuration);
      if (dom.hintsInput && sample.hintsAllowed !== undefined) dom.hintsInput.value = String(sample.hintsAllowed);
      if (dom.formTemplateInput) {
        dom.formTemplateInput.value = sample.formTemplate || "";
        state.formTemplate = sample.formTemplate || "";
      }
      syncWordsUi();
      if (typeof dom.form.requestSubmit === "function") {
        dom.form.requestSubmit(dom.generateButton || undefined);
      } else {
        dom.form.dispatchEvent(new Event("submit"));
      }
    }

    function appendLibraryWord(word) {
      const currentWords = dom.wordsInput.value
        .split("\n")
        .map(entry => entry.trim())
        .filter(Boolean);
      const currentNormalized = new Set(currentWords.map(normalizeWord));

      if (currentNormalized.has(normalizeWord(word))) {
        return;
      }

      dom.wordsInput.value = [...currentWords, word].join("\n");
      setStatus(null);
      syncWordsUi();
    }

    function shouldUseCompactLibraryBrowse() {
      return Boolean(globalThis.matchMedia?.("(max-width: 640px)")?.matches);
    }

    function renderLibrary() {
      const lang = state.lang;
      const search = dom.libSearch.value.trim().toLowerCase();
      const isCompactBrowse = shouldUseCompactLibraryBrowse();
      const categories = getVocabularyCategories(lang);
      const categoryEntries = Object.entries(categories);
      const isAllCategoriesSelected = state.activeCategory === allCategoryId;

      dom.libCategories.innerHTML = "";
      const allButton = document.createElement("button");
      allButton.type = "button";
      allButton.className = "category-chip" + (
        isAllCategoriesSelected || (!isCompactBrowse && !state.activeCategory)
          ? " is-active"
          : ""
      );
      allButton.textContent = getTranslations().all_categories;
      allButton.addEventListener("click", () => {
        state.activeCategory = allCategoryId;
        renderLibrary();
      });
      dom.libCategories.appendChild(allButton);

      categoryEntries.forEach(([categoryId, category]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "category-chip" + (state.activeCategory === categoryId ? " is-active" : "");
        button.textContent = category.label;
        button.addEventListener("click", () => {
          state.activeCategory = categoryId;
          renderLibrary();
        });
        dom.libCategories.appendChild(button);
      });

      dom.libResults.innerHTML = "";
      let wordsToShow = [];
      const shouldShowCategoryPrompt = isCompactBrowse && !state.activeCategory && !search;
      if (state.activeCategory && state.activeCategory !== allCategoryId && categories[state.activeCategory]) {
        wordsToShow = categories[state.activeCategory].words;
      } else if (!shouldShowCategoryPrompt) {
        categoryEntries.forEach(([, category]) => wordsToShow.push(...category.words));
      }

      wordsToShow = [...new Set(wordsToShow)]
        .filter(word => word.toLowerCase().includes(search))
        .sort((left, right) => left.localeCompare(right, lang));

      const addedWords = new Set(
        dom.wordsInput.value.split(/[\n,;]+/).map(token => token.trim()).filter(Boolean).map(normalizeWord)
      );
      const chipColors = ["chip-green", "chip-blue", "chip-orange", "chip-purple", "chip-teal"];
      const wordCategoryIndex = new Map();
      categoryEntries.forEach(([, category], index) => {
        category.words.forEach(word => {
          const key = normalizeWord(word);
          if (!wordCategoryIndex.has(key)) wordCategoryIndex.set(key, index);
        });
      });
      const activeCatColorClass = state.activeCategory && state.activeCategory !== allCategoryId
        ? chipColors[categoryEntries.findIndex(([id]) => id === state.activeCategory) % chipColors.length]
        : null;

      if (!wordsToShow.length) {
        const emptyState = document.createElement("p");
        emptyState.className = "library-empty-state";
        emptyState.textContent = shouldShowCategoryPrompt
          ? getTranslations().lib_empty_mobile
          : getTranslations().lib_empty_search;
        dom.libResults.appendChild(emptyState);
        return;
      }

      wordsToShow.forEach(word => {
        const button = document.createElement("button");
        button.type = "button";
        const categoryIndex = wordCategoryIndex.get(normalizeWord(word)) ?? 0;
        const colorClass = activeCatColorClass ?? chipColors[categoryIndex % chipColors.length];
        const isAdded = addedWords.has(normalizeWord(word));
        button.className = `lib-word-chip ${colorClass}${isAdded ? " is-added" : ""}`;
        button.textContent = word;
        button.disabled = isAdded;
        button.addEventListener("click", () => appendLibraryWord(word));
        dom.libResults.appendChild(button);
      });
    }

    function bindEvents() {
      dom.sampleSelect.addEventListener("change", () => updateDeleteSampleButton());

      dom.loadSampleButton.addEventListener("click", () => {
        if (!getBuiltInSamplePuzzles(state.lang).length && !getCustomSamplePuzzles(state.lang).length) {
          setStatus(getTranslations().msg_no_examples, "error");
          return;
        }

        loadSelectedSample();
      });

      if (dom.deleteSampleButton) {
        dom.deleteSampleButton.addEventListener("click", () => deleteCurrentSample());
      }

      dom.saveSampleButton.addEventListener("click", () => {
        const sample = buildCurrentSampleFromForm();
        if (!sample) {
          return;
        }

        const titleKey = normalizeWord(sample.title);
        const currentSamples = getCustomSamplePuzzles(state.lang);
        const existingSample = currentSamples.find(item => normalizeWord(item.title) === titleKey);

        if (existingSample && !window.confirm(getTranslations().msg_confirm_replace_custom_sample)) {
          return;
        }

        state.customSamples[state.lang] = mergeSamples(
          currentSamples,
          [{ ...sample, id: existingSample?.id || sample.id }],
          state.lang
        );
        if (!persistCustomSamples()) {
          return;
        }

        const savedSample = state.customSamples[state.lang].find(item => normalizeWord(item.title) === titleKey);
        renderSampleOptions(savedSample ? `custom:${savedSample.id}` : "");
        setStatus(getTranslations().msg_sample_saved, "success");
      });

      dom.exportSamplesButton.addEventListener("click", () => {
        const totalSamples = sampleLangs.reduce((sum, lang) => sum + getCustomSamplePuzzles(lang).length, 0);
        if (!totalSamples) {
          setStatus(getTranslations().msg_export_no_samples, "error");
          return;
        }

        const payload = JSON.stringify({
          version: 1,
          exportedAt: new Date().toISOString(),
          samples: state.customSamples,
        }, null, 2);

        const blob = new Blob([payload], { type: "application/json" });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "word-search-examples.json";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        setStatus(getTranslations().msg_export_success, "success");
      });

      dom.importSamplesButton.addEventListener("click", () => dom.importSamplesInput.click());
      dom.importSamplesInput.addEventListener("change", event => importCustomSamplesFromFile(event.target.files?.[0]));

      dom.clearWordsButton?.addEventListener("click", () => {
        dom.wordsInput.value = "";
        setStatus(null);
        syncWordsUi();
        dom.wordsInput.focus();
      });

      dom.libSearch.addEventListener("input", debounce(() => renderLibrary(), 150));
      dom.wordsInput.addEventListener("input", debounce(() => syncWordsUi(), 200));
    }

    return Object.freeze({
      bindEvents,
      renderLibrary,
      renderSampleOptions,
      syncWordsUi,
      updateWordsHelper,
    });
  }

  return Object.freeze({
    createTeacherController,
  });
});
