(function () {
  "use strict";

  const LETTERS = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
  const MAX_GENERATION_ATTEMPTS = 180;
  const MAX_GRID_SIZE = 22;
  const CUSTOM_SAMPLES_STORAGE_KEY = "word-search-custom-samples-v1";
  const TEACHER_PIN_STORAGE_KEY = "word-search-teacher-pin-v1";
  const SAMPLE_LANGS = ["ca", "es", "en"];
  const SAMPLE_DIFFICULTIES = new Set(["easy", "medium", "hard"]);
  const SAMPLE_SIZES = new Set(["auto", "10", "12", "14", "16"]);

  const APP_DATA = globalThis.WORD_SEARCH_DATA || { vocabulary: {}, samplePuzzles: {} };
  const TRANSLATIONS = globalThis.WORD_SEARCH_I18N || {};
  const VOCABULARY = APP_DATA.vocabulary || {};
  const SAMPLE_PUZZLES = APP_DATA.samplePuzzles || {};

  function getVocabularyCategories(lang) {
    return VOCABULARY[lang] || {};
  }

  function getBuiltInSamplePuzzles(lang) {
    return SAMPLE_PUZZLES[lang] || [];
  }

  function createEmptyCustomSamples() {
    return { ca: [], es: [], en: [] };
  }

  function generateSampleId() {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
    return `sample-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeWord(value) {
    return value.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-ZÑ]/g, "");
  }

  function parseWords(rawText) {
    const tokens = rawText.split(/[\n,;]+/).map(t => t.trim()).filter(Boolean);
    const words = [];
    const seen = new Set();
    for (const token of tokens) {
      const cleaned = normalizeWord(token);
      if (cleaned.length >= 3 && !seen.has(cleaned)) {
        seen.add(cleaned);
        words.push({ id: cleaned, cleaned, display: token });
      }
    }
    return { words };
  }

  function loadTeacherPin() {
    try {
      const stored = window.localStorage.getItem(TEACHER_PIN_STORAGE_KEY);
      return stored && stored.length >= 4 ? stored : "1234";
    } catch { return "1234"; }
  }

  function saveTeacherPin(pin) {
    try { window.localStorage.setItem(TEACHER_PIN_STORAGE_KEY, pin); return true; }
    catch { return false; }
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

  function loadCustomSamples() {
    try {
      const rawValue = window.localStorage.getItem(CUSTOM_SAMPLES_STORAGE_KEY);
      if (!rawValue) return createEmptyCustomSamples();
      const parsed = JSON.parse(rawValue);
      const samples = parsed && typeof parsed === "object" && parsed.samples ? parsed.samples : parsed;
      return sanitizeCustomSampleCollection(samples);
    } catch {
      return createEmptyCustomSamples();
    }
  }

  function persistCustomSamples() {
    try {
      window.localStorage.setItem(CUSTOM_SAMPLES_STORAGE_KEY, JSON.stringify({
        version: 1,
        updatedAt: new Date().toISOString(),
        samples: state.customSamples,
      }));
      return true;
    } catch {
      setStatus(TRANSLATIONS[state.lang].msg_storage_unavailable, "error");
      return false;
    }
  }

  function getCustomSamplePuzzles(lang) {
    return state.customSamples[lang] || [];
  }

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
      setStatus(TRANSLATIONS[state.lang].msg_sample_requires_title, "error");
      return null;
    }

    const parsed = parseWords(dom.wordsInput.value);
    if (parsed.words.length < 3) {
      setStatus(TRANSLATIONS[state.lang].msg_sample_requires_words, "error");
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
      const parsed = JSON.parse(await file.text());
      const rawSamples = parsed && typeof parsed === "object" && parsed.samples ? parsed.samples : parsed;
      const importedSamples = sanitizeCustomSampleCollection(rawSamples);
      const totalImported = SAMPLE_LANGS.reduce((sum, lang) => sum + importedSamples[lang].length, 0);

      if (!totalImported) {
        setStatus(TRANSLATIONS[state.lang].msg_import_empty, "error");
        return;
      }

      SAMPLE_LANGS.forEach(lang => {
        state.customSamples[lang] = mergeSamples(state.customSamples[lang], importedSamples[lang], lang);
      });

      if (!persistCustomSamples()) {
        return;
      }

      renderSampleOptions();
      setStatus(TRANSLATIONS[state.lang].msg_import_success.replace("{count}", totalImported), "success");
    } catch {
      setStatus(TRANSLATIONS[state.lang].msg_import_invalid, "error");
    } finally {
      dom.importSamplesInput.value = "";
    }
  }

  function calculateAutoSize(words) {
    const longest = words.reduce((max, w) => Math.max(max, w.cleaned.length), 0);
    const total = words.reduce((sum, w) => sum + w.cleaned.length, 0);
    return Math.min(MAX_GRID_SIZE, Math.max(longest + 2, Math.ceil(Math.sqrt(total * 1.6)) + 2));
  }

  function buildEmptyGrid(size) {
    return Array.from({ length: size }, () => Array(size).fill(""));
  }

  function buildPuzzle(words, requestedSize, difficultyKey, metadata) {
    const size = requestedSize === "auto" ? calculateAutoSize(words) : Number(requestedSize);
    const directions = [{ row: 0, col: 1 }, { row: 1, col: 0 }];
    if (difficultyKey !== "easy") directions.push({ row: 1, col: 1 });
    if (difficultyKey === "hard") directions.push({ row: 1, col: -1 }, { row: 0, col: -1 }, { row: -1, col: 0 }, { row: -1, col: -1 }, { row: -1, col: 1 });

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const grid = buildEmptyGrid(size);
      const placements = [];
      let success = true;

      for (const word of words) {
        let options = [];
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            for (const d of directions) {
              let can = true;
              for (let i = 0; i < word.cleaned.length; i++) {
                const rr = r + d.row * i, cc = c + d.col * i;
                if (rr < 0 || rr >= size || cc < 0 || cc >= size || (grid[rr][cc] && grid[rr][cc] !== word.cleaned[i])) { can = false; break; }
              }
              if (can) options.push({ r, c, d });
            }
          }
        }
        if (options.length === 0) { success = false; break; }
        const opt = options[Math.floor(Math.random() * options.length)];
        const cells = [];
        for (let i = 0; i < word.cleaned.length; i++) {
          const rr = opt.r + opt.d.row * i, cc = opt.c + opt.d.col * i;
          grid[rr][cc] = word.cleaned[i];
          cells.push({ row: rr, col: cc });
        }
        placements.push({ wordId: word.id, display: word.display, cells, key: cells.map(c => `${c.row}:${c.col}`).join("|"), reversedKey: [...cells].reverse().map(c => `${c.row}:${c.col}`).join("|"), placementId: `${word.id}-${opt.r}-${opt.c}` });
      }

      if (success) {
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) if (!grid[r][c]) grid[r][c] = LETTERS[Math.floor(Math.random() * LETTERS.length)];
        }
        return { ...metadata, grid, placements, actualSize: size, words, difficulty: difficultyKey, difficultyLabel: TRANSLATIONS[state.lang][`diff_${difficultyKey}`] };
      }
    }
    throw new Error("Error generating puzzle.");
  }

  function stopTimer() {
    if (state.timerIntervalId !== null) {
      clearInterval(state.timerIntervalId);
      state.timerIntervalId = null;
    }
  }

  function updateTimerDisplay() {
    if (!dom.timerDisplay) return;
    const t = state.timerSecondsLeft;
    if (t <= 0) {
      dom.timerDisplay.textContent = TRANSLATIONS[state.lang].timer_expired;
      dom.timerDisplay.classList.remove("is-warning");
      dom.timerDisplay.classList.add("is-expired");
      return;
    }
    const mins = Math.floor(t / 60).toString().padStart(2, "0");
    const secs = (t % 60).toString().padStart(2, "0");
    dom.timerDisplay.textContent = `${mins}:${secs}`;
    dom.timerDisplay.classList.toggle("is-warning", t <= 60);
    dom.timerDisplay.classList.remove("is-expired");
  }

  function startTimer(totalSeconds) {
    stopTimer();
    state.timerSecondsLeft = totalSeconds;
    dom.timerDisplay.hidden = false;
    dom.timerDisplay.classList.remove("is-warning", "is-expired");
    updateTimerDisplay();
    state.timerIntervalId = setInterval(() => {
      if (state.timerSecondsLeft > 0) {
        state.timerSecondsLeft--;
        updateTimerDisplay();
      } else {
        stopTimer();
        state.timerExpired = true;
        state.clickAnchor = null;
        state.previewCells = [];
        render();
      }
    }, 1000);
  }

  function updateHintButton() {
    if (!dom.hintButton || !state.puzzle) {
      if (dom.hintButton) dom.hintButton.hidden = true;
      return;
    }
    const allowed = state.puzzle.hintsAllowed;
    if (allowed === 0) {
      dom.hintButton.hidden = true;
      return;
    }
    dom.hintButton.hidden = false;
    const t = TRANSLATIONS[state.lang];
    if (allowed === -1) {
      dom.hintButton.textContent = t.btn_hint.replace("{n}", "∞");
      dom.hintButton.disabled = false;
    } else {
      dom.hintButton.textContent = t.btn_hint.replace("{n}", state.hintsRemaining);
      dom.hintButton.disabled = state.hintsRemaining <= 0;
    }
  }

  function useHint() {
    if (!state.puzzle || (state.puzzle.hintsAllowed !== -1 && state.hintsRemaining <= 0)) return;
    const unsolved = state.puzzle.placements.filter(p => !state.foundPlacementIds.has(p.placementId));
    if (!unsolved.length) return;
    const placement = unsolved[Math.floor(Math.random() * unsolved.length)];
    const firstCell = placement.cells[0];
    const cellEl = dom.puzzleGrid.querySelector(`[data-row="${firstCell.row}"][data-col="${firstCell.col}"]`);
    if (cellEl) {
      cellEl.classList.add("is-hint");
      setTimeout(() => cellEl.classList.remove("is-hint"), 2000);
    }
    if (state.puzzle.hintsAllowed !== -1) {
      state.hintsRemaining = Math.max(0, state.hintsRemaining - 1);
    }
    updateHintButton();
    setStatus(TRANSLATIONS[state.lang].msg_hint_used, "success");
  }

  function buildSelectionPath(start, end) {
    const dr = end.row - start.row, dc = end.col - start.col;
    const sr = Math.sign(dr), sc = Math.sign(dc);
    const dist = Math.max(Math.abs(dr), Math.abs(dc));
    if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return [];
    return Array.from({ length: dist + 1 }, (_, i) => ({ row: start.row + sr * i, col: start.col + sc * i }));
  }

  const state = { lang: "ca", puzzle: null, foundWordIds: new Set(), foundPlacementIds: new Set(), prevFoundPlacementIds: new Set(), foundWordColors: new Map(), clickAnchor: null, previewCells: [], dragSelection: null, mode: "student", activeTab: "teacher", celebrated: false, activeCategory: null, pinCallback: null, customSamples: loadCustomSamples(), teacherPin: loadTeacherPin(), timerIntervalId: null, timerSecondsLeft: 0, timerStarted: false, timerExpired: false, hintsRemaining: 0, studentName: { nom: "", cognoms: "" }, formTemplate: "" };

  function resetPuzzleProgress() {
    state.foundWordIds = new Set(); state.foundPlacementIds = new Set();
    state.prevFoundPlacementIds = new Set(); state.foundWordColors = new Map();
    state.clickAnchor = null; state.previewCells = []; state.celebrated = false;
    state.timerStarted = false; state.timerExpired = false;
  }
  function encodePuzzleConfig(config) {
    const json = JSON.stringify({ t: config.title, w: config.words, d: config.difficulty, s: config.size, l: config.lang, tm: config.timer, h: config.hints, f: config.formTemplate || "" });
    return btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  }

  function decodePuzzleConfig(encoded) {
    try {
      const json = new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0)));
      const obj = JSON.parse(json);
      return {
        title: typeof obj.t === "string" ? obj.t : "",
        words: typeof obj.w === "string" ? obj.w : "",
        difficulty: SAMPLE_DIFFICULTIES.has(obj.d) ? obj.d : "easy",
        size: SAMPLE_SIZES.has(String(obj.s)) ? String(obj.s) : "auto",
        lang: SAMPLE_LANGS.includes(obj.l) ? obj.l : "ca",
        timer: Number(obj.tm) || 0,
        hints: Number(obj.h) || 0,
        formTemplate: typeof obj.f === "string" ? obj.f : "",
      };
    } catch { return null; }
  }

  function parseFormEntries(templateUrl) {
    try {
      const url = new URL(templateUrl);
      const entries = [...url.searchParams.keys()].filter(k => k.startsWith("entry."));
      if (entries.length === 0) return null;
      return { baseUrl: url.origin + url.pathname, entries };
    } catch { return null; }
  }

  function buildFormSubmitUrl(parsed, nom, cognoms, resultat, puzzle) {
    const url = new URL(parsed.baseUrl);
    const vals = [nom, cognoms, resultat, puzzle];
    parsed.entries.forEach((entry, i) => { if (vals[i] !== undefined) url.searchParams.set(entry, vals[i]); });
    return url.toString();
  }

  const dom = {
    metaDescription: document.querySelector('meta[name="description"]'),
    form: document.querySelector("#generator-form"),
    titleInput: document.querySelector("#title-input"),
    wordsInput: document.querySelector("#words-input"),
    difficultyInput: document.querySelector("#difficulty-input"),
    sizeInput: document.querySelector("#size-input"),
    sampleSelect: document.querySelector("#sample-select"),
    loadSampleButton: document.querySelector("#load-sample-button"),
    saveSampleButton: document.querySelector("#save-sample-button"),
    exportSamplesButton: document.querySelector("#export-samples-button"),
    importSamplesButton: document.querySelector("#import-samples-button"),
    importSamplesInput: document.querySelector("#import-samples-input"),
    solutionToggleButton: document.querySelector("#solution-toggle-button"),
    resetProgressButton: document.querySelector("#reset-progress-button"),
    printButton: document.querySelector("#print-button"),
    teacherTools: document.querySelector("#teacher-tools"),
    statusMessage: document.querySelector("#status-message"),
    boardTitle: document.querySelector("#board-title"),
    progressText: document.querySelector("#progress-text"),
    puzzleGrid: document.querySelector("#puzzle-grid"),
    wordList: document.querySelector("#word-list"),
    wordBankCount: document.querySelector("#word-bank-count"),
    studentActions: document.querySelector("#student-actions"),
    completionMessage: document.querySelector("#completion-message"),
    langBtns: document.querySelectorAll(".lang-btn"),
    libSearch: document.querySelector("#lib-search"),
    libCategories: document.querySelector("#lib-categories"),
    libResults: document.querySelector("#lib-results"),
    tabTeacher: document.querySelector("#tab-teacher"),
    tabStudent: document.querySelector("#tab-student"),
    sectionTeacher: document.querySelector("#section-teacher"),
    sectionStudent: document.querySelector("#section-student"),
    timerInput: document.querySelector("#timer-input"),
    hintsInput: document.querySelector("#hints-input"),
    timerDisplay: document.querySelector("#timer-display"),
    hintButton: document.querySelector("#hint-button"),
    newPinInput: document.querySelector("#new-pin-input"),
    confirmPinInput: document.querySelector("#confirm-pin-input"),
    savePinButton: document.querySelector("#save-pin-button"),
    pinChangeMessage: document.querySelector("#pin-change-message"),
    pinChangeDetails: document.querySelector("#pin-change-details"),
    shareButton: document.querySelector("#share-button"),
    formTemplateInput: document.querySelector("#form-template-input"),
    sendResultsButton: document.querySelector("#send-results-button"),
    studentNameModal: document.querySelector("#student-name-modal"),
    studentNameForm: document.querySelector("#student-name-form"),
    studentNomInput: document.querySelector("#student-nom-input"),
    studentCognomsInput: document.querySelector("#student-cognoms-input"),
  };

  function setTab(tab) {
    state.activeTab = tab;
    document.body.dataset.tab = tab;
    dom.tabTeacher.classList.toggle("is-active", tab === "teacher");
    dom.tabStudent.classList.toggle("is-active", tab === "student");
    dom.sectionTeacher.hidden = tab !== "teacher";
    dom.sectionStudent.hidden = tab !== "student";
    if (tab === "student") {
      state.mode = "student";
      if (dom.teacherTools) dom.teacherTools.open = false;
      if (state.puzzle && state.puzzle.timerDuration > 0 && !state.timerStarted && !state.timerExpired) {
        state.timerStarted = true;
        startTimer(state.puzzle.timerDuration);
      } else if (!state.puzzle || state.puzzle.timerDuration === 0) {
        stopTimer();
        if (dom.timerDisplay) dom.timerDisplay.hidden = true;
      }
      render();
      updateHintButton();
      const formParsed = state.formTemplate ? parseFormEntries(state.formTemplate) : null;
      if (formParsed && !state.studentName.nom && dom.studentNameModal) {
        const t = TRANSLATIONS[state.lang];
        if (dom.studentNomInput) dom.studentNomInput.placeholder = t.name_nom_placeholder;
        if (dom.studentCognomsInput) dom.studentCognomsInput.placeholder = t.name_cognoms_placeholder;
        dom.studentNameModal.hidden = false;
        if (dom.studentNomInput) dom.studentNomInput.focus();
      }
    }
  }

  function openPinModal(callback) {
    state.pinCallback = callback;
    document.querySelector("#pin-modal").hidden = false;
    document.querySelector("#pin-input").value = "";
    document.querySelector("#pin-input").focus();
    document.querySelector("#pin-error").style.display = "none";
  }

  function isFormDirty() {
    return Boolean(dom.titleInput.value.trim() || dom.wordsInput.value.trim());
  }

  function renderSampleOptions(selectedValue = "") {
    const builtInSamples = getBuiltInSamplePuzzles(state.lang);
    const customSamples = getCustomSamplePuzzles(state.lang);
    const placeholder = TRANSLATIONS[state.lang].sample_placeholder;
    const t = TRANSLATIONS[state.lang];
    dom.sampleSelect.innerHTML = "";

    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = placeholder;
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
  }

  function loadSelectedSample() {
    const sample = resolveSelectedSample();

    if (!sample) {
      setStatus(TRANSLATIONS[state.lang].msg_choose_sample, "error");
      return;
    }

    if (isFormDirty() && !window.confirm(TRANSLATIONS[state.lang].msg_confirm_replace)) {
      return;
    }

    dom.titleInput.value = sample.title;
    dom.wordsInput.value = sample.words;
    dom.difficultyInput.value = sample.difficulty;
    dom.sizeInput.value = sample.size;
    if (dom.timerInput && sample.timerDuration !== undefined) dom.timerInput.value = String(sample.timerDuration);
    if (dom.hintsInput && sample.hintsAllowed !== undefined) dom.hintsInput.value = String(sample.hintsAllowed);
    if (dom.formTemplateInput) { dom.formTemplateInput.value = sample.formTemplate || ""; state.formTemplate = sample.formTemplate || ""; }
    dom.form.dispatchEvent(new Event("submit"));
  }

  function appendLibraryWord(word, chipBtn) {
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
    // Update only this chip in-place — no full library re-render
    if (chipBtn) {
      chipBtn.classList.add("is-added");
      chipBtn.disabled = true;
    }
  }

  function renderLibrary() {
    const lang = state.lang;
    const search = dom.libSearch.value.toLowerCase();
    const categories = getVocabularyCategories(lang);
    const categoryEntries = Object.entries(categories);
    dom.libCategories.innerHTML = "";
    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "category-chip" + (!state.activeCategory ? " is-active" : "");
    allBtn.textContent = TRANSLATIONS[lang].all_categories;
    allBtn.addEventListener("click", () => { state.activeCategory = null; renderLibrary(); });
    dom.libCategories.appendChild(allBtn);
    categoryEntries.forEach(([categoryId, category]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "category-chip" + (state.activeCategory === categoryId ? " is-active" : "");
      btn.textContent = category.label;
      btn.addEventListener("click", () => { state.activeCategory = categoryId; renderLibrary(); });
      dom.libCategories.appendChild(btn);
    });
    dom.libResults.innerHTML = "";
    let wordsToShow = [];
    if (state.activeCategory && categories[state.activeCategory]) {
      wordsToShow = categories[state.activeCategory].words;
    } else {
      categoryEntries.forEach(([, category]) => wordsToShow.push(...category.words));
    }
    wordsToShow = [...new Set(wordsToShow)]
      .filter(word => word.toLowerCase().includes(search))
      .sort((left, right) => left.localeCompare(right, lang));
    const addedWords = new Set(
      dom.wordsInput.value.split(/[\n,;]+/).map(t => t.trim()).filter(Boolean).map(normalizeWord)
    );
    // Build word → category index map for consistent per-family coloring
    const chipColors = ["chip-green", "chip-blue", "chip-orange", "chip-purple", "chip-teal"];
    const wordCategoryIndex = new Map();
    categoryEntries.forEach(([, category], idx) => {
      category.words.forEach(w => {
        const key = normalizeWord(w);
        if (!wordCategoryIndex.has(key)) wordCategoryIndex.set(key, idx);
      });
    });
    // When a specific category is active, all chips use that category's color
    const activeCatColorClass = state.activeCategory
      ? chipColors[categoryEntries.findIndex(([id]) => id === state.activeCategory) % chipColors.length]
      : null;

    wordsToShow.forEach(word => {
      const btn = document.createElement("button");
      btn.type = "button";
      const catIdx = wordCategoryIndex.get(normalizeWord(word)) ?? 0;
      const colorClass = activeCatColorClass ?? chipColors[catIdx % chipColors.length];
      const isAdded = addedWords.has(normalizeWord(word));
      btn.className = `lib-word-chip ${colorClass}${isAdded ? " is-added" : ""}`;
      btn.textContent = word; // text never changes, ::after handles the checkmark
      btn.disabled = isAdded;
      btn.addEventListener("click", () => appendLibraryWord(word, btn));
      dom.libResults.appendChild(btn);
    });
  }

  function updateLanguage(lang) {
    state.lang = lang;
    document.documentElement.lang = lang;
    document.title = TRANSLATIONS[lang].page_title;
    if (dom.metaDescription) dom.metaDescription.setAttribute("content", TRANSLATIONS[lang].page_description);
    document.querySelectorAll("[data-t]").forEach(el => {
      const key = el.getAttribute("data-t");
      if (TRANSLATIONS[lang][key]) el.textContent = TRANSLATIONS[lang][key];
    });
    dom.titleInput.placeholder = TRANSLATIONS[lang].field_topic_placeholder;
    dom.wordsInput.placeholder = TRANSLATIONS[lang].field_words_placeholder;
    dom.libSearch.placeholder = TRANSLATIONS[lang].lib_search_placeholder;
    if (dom.puzzleGrid) dom.puzzleGrid.setAttribute("aria-label", TRANSLATIONS[lang].grid_label);
    dom.langBtns.forEach(btn => btn.classList.toggle("is-active", btn.dataset.lang === lang));
    state.activeCategory = null;
    renderSampleOptions();
    renderLibrary();
    render();
  }

  function setStatus(msg, tone) {
    dom.statusMessage.textContent = msg || TRANSLATIONS[state.lang].status_default;
    dom.statusMessage.className = "status-message" + (tone ? ` is-${tone}` : "");
  }

  function render() {
    document.body.dataset.mode = state.mode;
    document.body.dataset.tab = state.activeTab;
    dom.studentActions.hidden = !state.puzzle;
    if (!state.puzzle) return;
    const t = TRANSLATIONS[state.lang];
    dom.solutionToggleButton.textContent =
      state.mode === "teacher" ? t.btn_hide_solution : t.btn_show_solution;
    dom.solutionToggleButton.classList.toggle("is-active", state.mode === "teacher");
    if (state.mode === "teacher" && dom.teacherTools) dom.teacherTools.open = true;
    dom.boardTitle.textContent = state.puzzle.title;
    dom.progressText.textContent = `${state.foundWordIds.size} / ${state.puzzle.words.length}`;
    dom.wordBankCount.textContent = state.puzzle.words.length;
    // Build per-word color map for grid cells, tracking newly found for animation
    const foundColorMap = new Map(); // "row:col" → "wc-N"
    const newlyFoundCells = new Set();
    state.puzzle.placements.forEach(p => {
      if (state.foundPlacementIds.has(p.placementId)) {
        const colorClass = state.foundWordColors.get(p.wordId) || "wc-0";
        const isNew = !state.prevFoundPlacementIds.has(p.placementId);
        p.cells.forEach(c => {
          const cellKey = `${c.row}:${c.col}`;
          foundColorMap.set(cellKey, colorClass);
          if (isNew) newlyFoundCells.add(cellKey);
        });
      }
    });
    state.prevFoundPlacementIds = new Set(state.foundPlacementIds);

    dom.wordList.innerHTML = "";
    state.puzzle.words.forEach(word => {
      const solved = state.foundWordIds.has(word.id);
      const colorClass = solved ? (state.foundWordColors.get(word.id) || "wc-0") : "";
      const li = document.createElement("li");
      li.className = "word-item" + (solved ? ` is-found ${colorClass}` : "");
      const textSpan = document.createElement("span");
      textSpan.textContent = word.display;
      const checkSpan = document.createElement("span");
      checkSpan.className = "check-icon";
      checkSpan.innerHTML = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 13l4 4L19 7"/></svg>`;
      li.appendChild(textSpan);
      li.appendChild(checkSpan);
      dom.wordList.appendChild(li);
    });
    dom.puzzleGrid.innerHTML = "";
    dom.puzzleGrid.style.gridTemplateColumns = `repeat(${state.puzzle.actualSize}, 1fr)`;
    const solutionCells = new Set();
    if (state.mode === "teacher") state.puzzle.placements.forEach(p => p.cells.forEach(c => solutionCells.add(`${c.row}:${c.col}`)));
    const previewSet = new Set(state.previewCells.map(c => `${c.row}:${c.col}`));
    state.puzzle.grid.forEach((row, r) => {
      row.forEach((letter, c) => {
        const key = `${r}:${c}`;
        const wordColor = foundColorMap.get(key) || "";
        const btn = document.createElement("button");
        btn.className = "grid-cell" +
          (foundColorMap.has(key) ? ` is-found ${wordColor}` : "") +
          (newlyFoundCells.has(key) ? " is-found-new" : "") +
          (previewSet.has(key) ? " is-preview" : "") +
          (state.clickAnchor && state.clickAnchor.row === r && state.clickAnchor.col === c ? " is-anchor" : "") +
          (solutionCells.has(key) ? " is-solution" : "");
        btn.textContent = letter; btn.dataset.row = r; btn.dataset.col = c;
        dom.puzzleGrid.appendChild(btn);
      });
    });
    const isComplete = state.foundWordIds.size === state.puzzle.words.length;
    dom.completionMessage.hidden = !isComplete;
    if (isComplete) {
      stopTimer();
      if (!state.celebrated) { celebrate(); state.celebrated = true; }
    }
    if (dom.sendResultsButton) {
      const formParsed = state.formTemplate ? parseFormEntries(state.formTemplate) : null;
      dom.sendResultsButton.hidden = !(isComplete && formParsed);
    }
    updateHintButton();
    if (dom.shareButton) dom.shareButton.disabled = !state.puzzle;
  }

  function celebrate() {
    const colors = ["#ff6b00", "#0d9488", "#3b82f6", "#8b5cf6"];
    for (let i = 0; i < 50; i++) {
      const p = document.createElement("div");
      Object.assign(p.style, { position: "fixed", left: Math.random() * 100 + "vw", top: "-10px", width: "10px", height: "10px", backgroundColor: colors[Math.floor(Math.random() * colors.length)], borderRadius: "50%", zIndex: "1000", pointerEvents: "none" });
      document.body.appendChild(p);
      p.animate([{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(100vh)", opacity: 0 }], { duration: 1000 + Math.random() * 2000 }).onfinish = () => p.remove();
    }
  }

  function checkMatch(path) {
    if (!path || path.length < 2) return false;
    const key = path.map(c => `${c.row}:${c.col}`).join("|");
    const match = state.puzzle.placements.find(p => (p.key === key || p.reversedKey === key) && !state.foundPlacementIds.has(p.placementId));
    if (match) {
      state.foundPlacementIds.add(match.placementId);
      state.foundWordIds.add(match.wordId);
      if (!state.foundWordColors.has(match.wordId)) {
        state.foundWordColors.set(match.wordId, `wc-${state.foundWordColors.size % 5}`);
      }
      setStatus(TRANSLATIONS[state.lang].msg_found.replace("{word}", match.display), "success");
      return true;
    }
    return false;
  }

  dom.form.addEventListener("submit", e => {
    e.preventDefault();
    const submitBtn = dom.form.querySelector("[type=submit]");
    const originalHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.textContent = TRANSLATIONS[state.lang].btn_generating || "...";
    try {
      const parsed = parseWords(dom.wordsInput.value);
      if (parsed.words.length < 1) throw new Error("no_words");
      state.puzzle = buildPuzzle(parsed.words, dom.sizeInput.value, dom.difficultyInput.value, {
        title: dom.titleInput.value,
        timerDuration: Number(dom.timerInput?.value) || 0,
        hintsAllowed: Number(dom.hintsInput?.value) || 0,
      });
      state.hintsRemaining = state.puzzle.hintsAllowed === -1 ? Infinity : state.puzzle.hintsAllowed;
      state.studentName = { nom: "", cognoms: "" };
      stopTimer();
      resetPuzzleProgress();
      setStatus(TRANSLATIONS[state.lang].msg_success, "success");
      render();
    } catch (err) { setStatus(TRANSLATIONS[state.lang].msg_puzzle_error || err.message, "error"); }
    finally { submitBtn.disabled = false; submitBtn.innerHTML = originalHTML; }
  });

  dom.loadSampleButton.addEventListener("click", () => {
    if (!getBuiltInSamplePuzzles(state.lang).length && !getCustomSamplePuzzles(state.lang).length) {
      setStatus(TRANSLATIONS[state.lang].msg_no_examples, "error");
      return;
    }

    loadSelectedSample();
  });

  dom.saveSampleButton.addEventListener("click", () => {
    const sample = buildCurrentSampleFromForm();
    if (!sample) {
      return;
    }

    const titleKey = normalizeWord(sample.title);
    const currentSamples = getCustomSamplePuzzles(state.lang);
    const existingSample = currentSamples.find(item => normalizeWord(item.title) === titleKey);

    if (existingSample && !window.confirm(TRANSLATIONS[state.lang].msg_confirm_replace_custom_sample)) {
      return;
    }

    state.customSamples[state.lang] = mergeSamples(currentSamples, [{ ...sample, id: existingSample?.id || sample.id }], state.lang);
    if (!persistCustomSamples()) {
      return;
    }

    const savedSample = state.customSamples[state.lang].find(item => normalizeWord(item.title) === titleKey);
    renderSampleOptions(savedSample ? `custom:${savedSample.id}` : "");
    setStatus(TRANSLATIONS[state.lang].msg_sample_saved, "success");
  });

  dom.exportSamplesButton.addEventListener("click", () => {
    const totalSamples = SAMPLE_LANGS.reduce((sum, lang) => sum + getCustomSamplePuzzles(lang).length, 0);
    if (!totalSamples) {
      setStatus(TRANSLATIONS[state.lang].msg_export_no_samples, "error");
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
    setStatus(TRANSLATIONS[state.lang].msg_export_success, "success");
  });

  dom.importSamplesButton.addEventListener("click", () => dom.importSamplesInput.click());
  dom.importSamplesInput.addEventListener("change", event => importCustomSamplesFromFile(event.target.files?.[0]));

  dom.solutionToggleButton.addEventListener("click", () => {
    if (!state.puzzle) {
      return;
    }

    if (state.mode === "teacher") {
      state.mode = "student";
      render();
      return;
    }

    openPinModal(() => {
      state.mode = "teacher";
      render();
    });
  });

  dom.resetProgressButton.addEventListener("click", () => {
    if (!window.confirm(TRANSLATIONS[state.lang].msg_confirm_reset)) return;
    resetPuzzleProgress();
    stopTimer();
    if (state.puzzle?.timerDuration > 0) startTimer(state.puzzle.timerDuration);
    else if (dom.timerDisplay) dom.timerDisplay.hidden = true;
    if (state.puzzle) state.hintsRemaining = state.puzzle.hintsAllowed === -1 ? Infinity : (state.puzzle.hintsAllowed || 0);
    render();
  });
  dom.printButton.addEventListener("click", () => {
    if (!state.puzzle) {
      setStatus(TRANSLATIONS[state.lang].msg_print_without_puzzle, "error");
      return;
    }

    window.print();
  });
  
  dom.tabTeacher.addEventListener("click", () => {
    if (state.activeTab === "teacher") return;
    openPinModal(() => { stopTimer(); setTab("teacher"); });
  });
  
  dom.tabStudent.addEventListener("click", () => setTab("student"));

  document.querySelector("#pin-form").addEventListener("submit", event => {
    event.preventDefault();
    const pin = document.querySelector("#pin-input").value;
    if (pin === state.teacherPin) {
      document.querySelector("#pin-modal").hidden = true;
      if (state.pinCallback) state.pinCallback();
      state.pinCallback = null;
    } else {
      document.querySelector("#pin-error").style.display = "block";
    }
  });

  document.querySelector("#pin-cancel").addEventListener("click", () => { document.querySelector("#pin-modal").hidden = true; state.pinCallback = null; });

  document.querySelector("#pin-modal").addEventListener("click", e => {
    if (e.target === e.currentTarget) { e.currentTarget.hidden = true; state.pinCallback = null; }
  });

  if (dom.hintButton) {
    dom.hintButton.addEventListener("click", () => useHint());
  }

  if (dom.savePinButton) {
    dom.savePinButton.addEventListener("click", () => {
      const t = TRANSLATIONS[state.lang];
      const newPin = dom.newPinInput.value;
      const confirmPin = dom.confirmPinInput.value;
      dom.pinChangeMessage.style.display = "block";
      if (newPin.length < 4) {
        dom.pinChangeMessage.textContent = t.pin_too_short;
        dom.pinChangeMessage.className = "status-message is-error";
        return;
      }
      if (newPin !== confirmPin) {
        dom.pinChangeMessage.textContent = t.pin_change_mismatch;
        dom.pinChangeMessage.className = "status-message is-error";
        return;
      }
      state.teacherPin = newPin;
      saveTeacherPin(newPin);
      dom.newPinInput.value = "";
      dom.confirmPinInput.value = "";
      dom.pinChangeMessage.textContent = t.pin_change_success;
      dom.pinChangeMessage.className = "status-message is-success";
      if (dom.pinChangeDetails) dom.pinChangeDetails.open = false;
    });
  }
  
  dom.puzzleGrid.addEventListener("pointerdown", e => {
    const btn = e.target.closest(".grid-cell");
    if (!btn || !state.puzzle || state.timerExpired) return;
    const cell = { row: +btn.dataset.row, col: +btn.dataset.col };
    state.dragSelection = { start: cell, end: cell, moved: false };
  });

  window.addEventListener("pointermove", e => {
    const hovered = document.elementFromPoint(e.clientX, e.clientY);
    const btn = hovered?.closest(".grid-cell");
    const cell = btn ? { row: +btn.dataset.row, col: +btn.dataset.col } : null;
    if (state.dragSelection) {
      if (cell && (cell.row !== state.dragSelection.end.row || cell.col !== state.dragSelection.end.col)) {
        state.dragSelection.end = cell; state.dragSelection.moved = true; state.previewCells = buildSelectionPath(state.dragSelection.start, state.dragSelection.end); render();
      }
    } else if (state.clickAnchor && cell) { state.previewCells = buildSelectionPath(state.clickAnchor, cell); render(); }
  });

  window.addEventListener("pointerup", () => {
    if (!state.dragSelection) return;
    const { start, end, moved } = state.dragSelection; state.dragSelection = null;
    if (!moved) {
      if (!state.clickAnchor) { state.clickAnchor = start; state.previewCells = [start]; }
      else { if (start.row === state.clickAnchor.row && start.col === state.clickAnchor.col) { state.clickAnchor = null; state.previewCells = []; } else { checkMatch(buildSelectionPath(state.clickAnchor, start)); state.clickAnchor = null; state.previewCells = []; } }
    } else { checkMatch(buildSelectionPath(start, end)); state.clickAnchor = null; state.previewCells = []; }
    render();
  });

  dom.langBtns.forEach(btn => btn.addEventListener("click", () => updateLanguage(btn.dataset.lang)));
  dom.libSearch.addEventListener("input", () => renderLibrary());
  dom.wordsInput.addEventListener("input", () => renderLibrary());
  if (dom.formTemplateInput) {
    dom.formTemplateInput.addEventListener("input", () => {
      state.formTemplate = dom.formTemplateInput.value.trim();
      const errorEl = document.querySelector("#form-url-error");
      if (errorEl) {
        const invalid = state.formTemplate && !parseFormEntries(state.formTemplate);
        errorEl.style.display = invalid ? "block" : "none";
        errorEl.textContent = invalid ? TRANSLATIONS[state.lang].form_url_invalid : "";
      }
    });
  }

  if (dom.studentNameForm) {
    dom.studentNameForm.addEventListener("submit", e => {
      e.preventDefault();
      const nom = dom.studentNomInput?.value.trim() || "";
      if (!nom) return;
      state.studentName = { nom, cognoms: dom.studentCognomsInput?.value.trim() || "" };
      dom.studentNameModal.hidden = true;
    });
  }

  if (dom.sendResultsButton) {
    dom.sendResultsButton.addEventListener("click", () => {
      const formParsed = state.formTemplate ? parseFormEntries(state.formTemplate) : null;
      if (!formParsed || !state.puzzle) return;
      const total = state.puzzle.words.length;
      const found = state.foundWordIds.size;
      const resultat = `${found}/${total}`;
      const url = buildFormSubmitUrl(formParsed, state.studentName.nom, state.studentName.cognoms, resultat, state.puzzle.title || "");
      window.open(url, "_blank", "noopener");
    });
  }

  if (dom.shareButton) {
    dom.shareButton.addEventListener("click", () => {
      if (!state.puzzle) return;
      const config = {
        title: state.puzzle.title,
        words: state.puzzle.words.map(w => w.display).join("\n"),
        difficulty: state.puzzle.difficulty,
        size: String(state.puzzle.actualSize),
        lang: state.lang,
        timer: state.puzzle.timerDuration,
        hints: state.puzzle.hintsAllowed,
        formTemplate: state.formTemplate || "",
      };
      const encoded = encodePuzzleConfig(config);
      const url = `${window.location.origin}${window.location.pathname}?p=${encodeURIComponent(encoded)}`;
      const t = TRANSLATIONS[state.lang];
      navigator.clipboard.writeText(url).then(() => {
        dom.shareButton.textContent = t.btn_share_copied;
        setTimeout(() => { dom.shareButton.textContent = t.btn_share; }, 2500);
      }).catch(() => {
        window.prompt(t.btn_share, url);
      });
    });
  }

  function tryLoadFromUrl() {
    const param = new URLSearchParams(window.location.search).get("p");
    if (!param) return false;
    const config = decodePuzzleConfig(param);
    if (!config) return false;
    try {
      const parsed = parseWords(config.words);
      if (parsed.words.length < 1) return false;
      updateLanguage(config.lang);
      dom.titleInput.value = config.title;
      dom.wordsInput.value = config.words;
      dom.difficultyInput.value = config.difficulty;
      dom.sizeInput.value = config.size;
      if (dom.timerInput) dom.timerInput.value = config.timer;
      if (dom.hintsInput) dom.hintsInput.value = config.hints;
      state.formTemplate = config.formTemplate || "";
      state.studentName = { nom: "", cognoms: "" };
      if (dom.formTemplateInput) dom.formTemplateInput.value = state.formTemplate;
      state.puzzle = buildPuzzle(parsed.words, config.size, config.difficulty, {
        title: config.title,
        timerDuration: config.timer,
        hintsAllowed: config.hints,
      });
      state.hintsRemaining = state.puzzle.hintsAllowed === -1 ? Infinity : state.puzzle.hintsAllowed;
      resetPuzzleProgress();
      setTab("student");
      return true;
    } catch { return false; }
  }

  if (!tryLoadFromUrl()) {
    updateLanguage("ca");
    setTab("teacher");
  }
})();
