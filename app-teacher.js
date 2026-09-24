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
    normalizeWord,
    normalizeSampleTitle,
    generateSampleId,
    mergeSamples,
    sanitizeCustomSampleCollection,
    getBuiltInSamplePuzzles,
    getCustomSamplePuzzles,
    getVocabularyCategories,
    persistCustomSamples,
    setStatus,
    debounce,
    confirmDialog,
    onFormChange,
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
        setSampleStatus(getTranslations().msg_sample_requires_title, "error");
        return null;
      }

      const parsed = parseWords(dom.wordsInput.value);
      if (parsed.words.length < 3) {
        setSampleStatus(getTranslations().msg_sample_requires_words, "error");
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
          setSampleStatus(getTranslations().msg_import_invalid, "error");
          return;
        }

        const rawSamples = parsed && typeof parsed === "object" && parsed.samples ? parsed.samples : parsed;
        const importedSamples = sanitizeCustomSampleCollection(rawSamples);
        const totalImported = sampleLangs.reduce((sum, lang) => sum + importedSamples[lang].length, 0);

        if (!totalImported) {
          setSampleStatus(getTranslations().msg_import_empty, "error");
          return;
        }

        sampleLangs.forEach(lang => {
          state.customSamples[lang] = mergeSamples(state.customSamples[lang], importedSamples[lang], lang);
        });

        if (!persistCustomSamples()) {
          return;
        }

        renderSampleOptions();
        setSampleStatus(getTranslations().msg_import_success.replace("{count}", totalImported), "success");
      } catch {
        setSampleStatus(getTranslations().msg_import_read_error, "error");
      } finally {
        dom.importSamplesInput.value = "";
      }
    }

    function updateWordsHelper() {
      if (!dom.wordsCount || !dom.wordsFeedback) return;
      const t = getTranslations();
      const { words } = parseWords(dom.wordsInput.value);
      const count = words.length;
      const countTone = count >= 3 ? "ready" : count > 0 ? "sparse" : "";
      const feedbackKey = count >= 3 ? "words_summary_ready" : count > 0 ? "words_summary_sparse" : "words_summary_empty";

      // Name every line parseWords drops, so nothing disappears silently. Two-letter
      // words such as "os" are valid; single letters get their own hint.
      const shortWords = [];
      const skippedWords = [];
      const seen = new Set();
      dom.wordsInput.value
        .split(/[\n,;]+/)
        .map(token => token.trim())
        .filter(Boolean)
        .forEach(token => {
          const cleaned = normalizeWord(token);
          if (cleaned.length === 1) shortWords.push(token);
          else if (cleaned.length === 0 || seen.has(cleaned)) skippedWords.push(token);
          seen.add(cleaned);
        });

      // Mirror the WORD_TOO_LONG generation error before the teacher submits.
      const fixedSize = Number(dom.sizeInput?.value);
      const tooLong = fixedSize ? words.find(word => word.cleaned.length > fixedSize) : null;

      const messages = [];
      if (tooLong) messages.push(t.msg_puzzle_word_too_long.replace("{word}", tooLong.display));
      if (shortWords.length) messages.push(t.words_too_short.replace("{words}", shortWords.join(", ")));
      if (skippedWords.length) messages.push(t.words_skipped.replace("{words}", skippedWords.join(", ")));

      dom.wordsCount.textContent = t.words_count.replace("{count}", count);
      dom.wordsCount.className = "words-count-pill" + (countTone ? ` is-${countTone}` : "");
      const feedbackTone = messages.length ? "sparse" : countTone;
      dom.wordsFeedback.textContent = messages.length ? messages.join(" ") : t[feedbackKey];
      dom.wordsFeedback.className = "words-feedback" + (feedbackTone ? ` is-${feedbackTone}` : "");

      if (dom.clearWordsButton) dom.clearWordsButton.disabled = dom.wordsInput.value.length === 0;
    }

    function syncWordsUi({ notifyChange = true } = {}) {
      updateWordsHelper();
      renderLibrary();
      if (notifyChange) onFormChange?.();
    }

    function isFormDirty() {
      return Boolean(dom.titleInput.value.trim() || dom.wordsInput.value.trim());
    }

    // Sample actions sit far above #status-message, so they report next to their own
    // controls. The line is cleared whenever the options are rebuilt (save, delete,
    // language switch), so it never shows a stale message or language.
    function setSampleStatus(message, tone) {
      if (!dom.sampleStatus) return setStatus(message, tone);
      dom.sampleStatus.textContent = message;
      dom.sampleStatus.className = `status-message is-${tone}`;
      dom.sampleStatus.hidden = false;
      const container = dom.sampleStatus.closest("details");
      if (container) container.open = true;
    }

    function renderSampleOptions(selectedValue = "") {
      if (dom.sampleStatus) dom.sampleStatus.hidden = true;
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
        // The closed select hides optgroup labels, so name the group when a saved
        // example shares its title with a built-in one.
        const builtInTitles = new Set(builtInSamples.map(sample => normalizeSampleTitle(sample.title)));
        customSamples.forEach(sample => {
          const option = document.createElement("option");
          option.value = `custom:${sample.id}`;
          option.textContent = builtInTitles.has(normalizeSampleTitle(sample.title))
            ? `${sample.title} · ${t.sample_group_custom}`
            : sample.title;
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

    let undoTimeoutId = null;
    let undoSnapshot = null;

    function commitPendingUndo() {
      if (!undoSnapshot) return;
      clearTimeout(undoTimeoutId);
      undoTimeoutId = null;
      undoSnapshot = null;
      if (dom.sampleUndoToast) dom.sampleUndoToast.hidden = true;
      persistCustomSamples();
    }

    function deleteCurrentSample() {
      const value = dom.sampleSelect.value;
      if (!value.startsWith("custom:")) return;
      const sampleId = value.slice("custom:".length);
      const lang = state.lang;
      const current = state.customSamples[lang] || [];
      const index = current.findIndex(sample => sample.id === sampleId);
      if (index < 0) return;

      commitPendingUndo();
      const removed = current[index];
      state.customSamples[lang] = current.filter((_, i) => i !== index);
      renderSampleOptions();

      undoSnapshot = { lang, sample: removed, index };
      if (dom.sampleUndoToast) {
        dom.sampleUndoToast.hidden = false;
        const container = dom.sampleUndoToast.closest("details");
        if (container) container.open = true;
      }
      undoTimeoutId = setTimeout(() => commitPendingUndo(), 5000);
    }

    function undoLastDelete() {
      if (!undoSnapshot) return;
      const { lang, sample, index } = undoSnapshot;
      const collection = state.customSamples[lang] || [];
      const restored = [...collection];
      const insertAt = Math.min(index, restored.length);
      restored.splice(insertAt, 0, sample);
      state.customSamples[lang] = restored;
      undoSnapshot = null;
      clearTimeout(undoTimeoutId);
      undoTimeoutId = null;
      if (dom.sampleUndoToast) dom.sampleUndoToast.hidden = true;
      renderSampleOptions(`custom:${sample.id}`);
      setSampleStatus(getTranslations().msg_sample_restored, "success");
    }

    async function loadSelectedSample() {
      const sample = resolveSelectedSample();
      if (!sample) {
        setSampleStatus(getTranslations().msg_choose_sample, "error");
        return;
      }

      if (isFormDirty() && !(await confirmDialog({ message: getTranslations().msg_confirm_replace }))) {
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

    function renderLibrary() {
      const lang = state.lang;
      // Same normalization as the puzzle, so "leon" finds "león".
      const search = normalizeWord(dom.libSearch.value);
      const categories = getVocabularyCategories(lang);
      const categoryEntries = Object.entries(categories);
      // Starting on null showed "choose a category" on first load on every device, not
      // just on mobile as the string name suggests. Open on the first category instead.
      if (!state.activeCategory && categoryEntries.length) {
        state.activeCategory = categoryEntries[0][0];
      }
      const isAllCategoriesSelected = state.activeCategory === allCategoryId;

      dom.libCategories.innerHTML = "";
      const allButton = document.createElement("button");
      allButton.type = "button";
      allButton.className = "category-chip" + (isAllCategoriesSelected ? " is-active" : "");
      allButton.setAttribute("aria-pressed", String(isAllCategoriesSelected));
      allButton.textContent = getTranslations().all_categories;
      allButton.addEventListener("click", () => selectCategory(allCategoryId));
      dom.libCategories.appendChild(allButton);

      categoryEntries.forEach(([categoryId, category]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "category-chip" + (state.activeCategory === categoryId ? " is-active" : "");
        button.setAttribute("aria-pressed", String(state.activeCategory === categoryId));
        button.textContent = category.label;
        button.addEventListener("click", () => selectCategory(categoryId));
        dom.libCategories.appendChild(button);
      });

      setRovingGroup(dom.libCategories, getTranslations().lib_categories_label,
        dom.libCategories.querySelector('[aria-pressed="true"]'));

      dom.libResults.innerHTML = "";
      let wordsToShow = [];
      const shouldShowCategoryPrompt = !state.activeCategory && !search;
      // A search looks through every category: a word from another topic must not
      // read as "no results" just because a different category chip is active.
      if (!search && state.activeCategory && state.activeCategory !== allCategoryId && categories[state.activeCategory]) {
        wordsToShow = categories[state.activeCategory].words;
      } else if (!shouldShowCategoryPrompt) {
        categoryEntries.forEach(([, category]) => wordsToShow.push(...category.words));
      }

      wordsToShow = [...new Set(wordsToShow)]
        .filter(word => normalizeWord(word).includes(search))
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
      const activeCatColorClass = !search && state.activeCategory && state.activeCategory !== allCategoryId
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
        button.addEventListener("click", () => {
          appendLibraryWord(word);
          focusLibraryChipAfter(word);
        });
        dom.libResults.appendChild(button);
      });
      setRovingGroup(dom.libResults, getTranslations().lib_words_label);
    }

    // Both helpers run after renderLibrary() replaced every chip, which drops focus to
    // <body>. Put it back where a keyboard or screen reader user left off.
    function selectCategory(categoryId) {
      state.activeCategory = categoryId;
      renderLibrary();
      dom.libCategories.querySelector('[aria-pressed="true"]')?.focus();
    }

    function focusLibraryChipAfter(word) {
      const chips = [...dom.libResults.querySelectorAll(".lib-word-chip")];
      const index = chips.findIndex(chip => chip.textContent === word);
      const next = chips.slice(index + 1).find(chip => !chip.disabled) ||
        chips.slice(0, Math.max(index, 0)).reverse().find(chip => !chip.disabled);
      if (next) moveRovingFocus(dom.libResults, next);
      else dom.wordsInput.focus();
    }

    // Each chip group is one Tab stop (a WAI-ARIA toolbar): Tab reaches the active
    // category or the first word, arrows/Home/End move inside, so reaching "Create"
    // no longer means tabbing through every chip in the library.
    function setRovingGroup(container, label, current) {
      container.setAttribute("role", "toolbar");
      container.setAttribute("aria-label", label);
      const items = [...container.querySelectorAll("button:not(:disabled)")];
      const stop = items.includes(current) ? current : items[0];
      items.forEach(item => { item.tabIndex = item === stop ? 0 : -1; });
    }

    function moveRovingFocus(container, target) {
      container.querySelectorAll("button").forEach(item => { item.tabIndex = item === target ? 0 : -1; });
      target.focus();
    }

    function handleRovingKeys(event) {
      const steps = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
      const items = [...event.currentTarget.querySelectorAll("button:not(:disabled)")];
      const index = items.indexOf(document.activeElement);
      if (index < 0) return;
      let target;
      if (event.key in steps) target = items[(index + steps[event.key] + items.length) % items.length];
      else if (event.key === "Home") target = items[0];
      else if (event.key === "End") target = items[items.length - 1];
      else return;
      event.preventDefault();
      moveRovingFocus(event.currentTarget, target);
    }

    function bindEvents() {
      dom.sampleSelect.addEventListener("change", () => updateDeleteSampleButton());

      dom.loadSampleButton.addEventListener("click", () => {
        if (!getBuiltInSamplePuzzles(state.lang).length && !getCustomSamplePuzzles(state.lang).length) {
          setSampleStatus(getTranslations().msg_no_examples, "error");
          return;
        }

        loadSelectedSample();
      });

      if (dom.deleteSampleButton) {
        dom.deleteSampleButton.addEventListener("click", () => deleteCurrentSample());
      }

      if (dom.sampleUndoButton) {
        dom.sampleUndoButton.addEventListener("click", () => undoLastDelete());
      }

      dom.saveSampleButton.addEventListener("click", async () => {
        const sample = buildCurrentSampleFromForm();
        if (!sample) {
          return;
        }

        const titleKey = normalizeSampleTitle(sample.title);
        const currentSamples = getCustomSamplePuzzles(state.lang);
        const existingSample = currentSamples.find(item => normalizeSampleTitle(item.title) === titleKey);

        if (existingSample && !(await confirmDialog({ message: getTranslations().msg_confirm_replace_custom_sample }))) {
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

        const savedSample = state.customSamples[state.lang].find(item => normalizeSampleTitle(item.title) === titleKey);
        renderSampleOptions(savedSample ? `custom:${savedSample.id}` : "");
        setSampleStatus(getTranslations().msg_sample_saved, "success");
      });

      dom.exportSamplesButton.addEventListener("click", () => {
        const totalSamples = sampleLangs.reduce((sum, lang) => sum + getCustomSamplePuzzles(lang).length, 0);
        if (!totalSamples) {
          setSampleStatus(getTranslations().msg_export_no_samples, "error");
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
        setSampleStatus(getTranslations().msg_export_success, "success");
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
      dom.libCategories.addEventListener("keydown", handleRovingKeys);
      dom.libResults.addEventListener("keydown", handleRovingKeys);
      // Native input/change events already notify the form synchronously. This
      // delayed refresh must not overwrite a more recent submission error.
      dom.wordsInput.addEventListener("input", debounce(() => syncWordsUi({ notifyChange: false }), 200));
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
