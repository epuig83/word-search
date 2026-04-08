(function () {
  "use strict";

  const CUSTOM_SAMPLES_STORAGE_KEY = "word-search-custom-samples-v1";
  const TEACHER_PIN_STORAGE_KEY = "word-search-teacher-pin-v1";
  const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const CORE = globalThis.WORD_SEARCH_CORE;
  if (!CORE) throw new Error("WORD_SEARCH_CORE is required.");

  const APP_DATA = globalThis.WORD_SEARCH_DATA || { vocabulary: {}, samplePuzzles: {} };
  const TRANSLATIONS = globalThis.WORD_SEARCH_I18N || {};
  const VOCABULARY = APP_DATA.vocabulary || {};
  const SAMPLE_PUZZLES = APP_DATA.samplePuzzles || {};
  const {
    MAX_GRID_SIZE,
    SAMPLE_LANGS,
    SAMPLE_DIFFICULTIES,
    SAMPLE_SIZES,
    SHARED_PUZZLE_VERSION,
    createEmptyCustomSamples,
    normalizeWord,
    parseWords,
    countValidWords,
    normalizeSharedSize,
    sameCell,
    serializeGridRows,
    serializePlacementCells,
    buildPuzzleData,
    buildPuzzleFromSnapshotData,
    encodePuzzleConfig,
    decodePuzzleConfig,
    parseFormEntries,
    buildFormSubmitUrl,
  } = CORE;

  function getVocabularyCategories(lang) {
    return VOCABULARY[lang] || {};
  }

  function getBuiltInSamplePuzzles(lang) {
    return SAMPLE_PUZZLES[lang] || [];
  }

  function generateSampleId() {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
    return `sample-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
      const text = await file.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (parseErr) {
        setStatus(TRANSLATIONS[state.lang].msg_import_invalid, "error");
        return;
      }

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
      setStatus("Error leyendo el archivo. Inténtalo de nuevo.", "error");
    } finally {
      dom.importSamplesInput.value = "";
    }
  }

  function buildPuzzle(words, requestedSize, difficultyKey, metadata) {
    return composePuzzle(buildPuzzleData(words, requestedSize, difficultyKey, metadata));
  }

  function buildPuzzleFromSnapshot(words, config, metadata) {
    return composePuzzle(buildPuzzleFromSnapshotData(words, config, metadata));
  }

  function stopTimer() {
    if (state.timerIntervalId !== null) {
      clearInterval(state.timerIntervalId);
      state.timerIntervalId = null;
    }
  }

  function formatSecondsAsClock(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const secs = (totalSeconds % 60).toString().padStart(2, "0");
    return `${mins}:${secs}`;
  }

  function formatTimerSummary(totalSeconds) {
    if (totalSeconds <= 0) return TRANSLATIONS[state.lang].timer_none;
    if (totalSeconds % 60 === 0) return `${totalSeconds / 60} min`;
    return formatSecondsAsClock(totalSeconds);
  }

  function formatHintsSummary(hintsAllowed) {
    const t = TRANSLATIONS[state.lang];
    if (hintsAllowed === -1) return t.hints_unlimited;
    if (hintsAllowed === 0) return t.hints_none;
    return String(hintsAllowed);
  }

  function shouldShowStudentStartOverlay() {
    return Boolean(state.puzzle && state.activeTab === "student" && !state.studentSessionStarted && !state.timerExpired);
  }

  function canInteractWithPuzzle() {
    return Boolean(state.puzzle && state.activeTab === "student" && state.studentSessionStarted && !state.timerExpired);
  }

  function syncStudentStartOverlay() {
    if (dom.studentStartTimer) {
      dom.studentStartTimer.textContent = state.puzzle
        ? formatTimerSummary(state.puzzle.timerDuration)
        : TRANSLATIONS[state.lang].timer_none;
    }
    if (dom.studentStartHints) {
      dom.studentStartHints.textContent = state.puzzle
        ? formatHintsSummary(state.puzzle.hintsAllowed)
        : TRANSLATIONS[state.lang].hints_none;
    }
    const shouldShow = shouldShowStudentStartOverlay();
    if (dom.studentStartOverlay) dom.studentStartOverlay.hidden = !shouldShow;
    if (dom.studentPlaySurface) {
      dom.studentPlaySurface.classList.toggle("is-blocked", shouldShow);
      if ("inert" in dom.studentPlaySurface) dom.studentPlaySurface.inert = shouldShow;
    }
  }

  function focusStudentStartButton() {
    requestAnimationFrame(() => dom.studentStartButton?.focus());
  }

  function expireTimer() {
    stopTimer();
    state.timerSecondsLeft = 0;
    state.timerExpired = true;
    state.dragSelection = null;
    state.clickAnchor = null;
    state.previewCells = [];
    render();
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
    dom.timerDisplay.textContent = formatSecondsAsClock(t);
    dom.timerDisplay.classList.toggle("is-warning", t <= 60);
    dom.timerDisplay.classList.remove("is-expired");
  }

  function startTimer(totalSeconds) {
    stopTimer();
    state.timerSecondsLeft = Math.max(0, totalSeconds);
    if (state.timerSecondsLeft <= 0) {
      expireTimer();
      return;
    }
    dom.timerDisplay.hidden = false;
    dom.timerDisplay.classList.remove("is-warning", "is-expired");
    updateTimerDisplay();
    state.timerIntervalId = setInterval(() => {
      state.timerSecondsLeft = Math.max(0, state.timerSecondsLeft - 1);
      updateTimerDisplay();
      if (state.timerSecondsLeft <= 0) expireTimer();
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
    if (!canInteractWithPuzzle() || (state.puzzle.hintsAllowed !== -1 && state.hintsRemaining <= 0)) return;
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

  function clampFocusedCell(cell) {
    if (!state.puzzle) return null;
    const maxIndex = state.puzzle.actualSize - 1;
    return {
      row: Math.max(0, Math.min(maxIndex, cell?.row ?? 0)),
      col: Math.max(0, Math.min(maxIndex, cell?.col ?? 0)),
    };
  }

  function setFocusedCell(cell) {
    state.focusedCell = clampFocusedCell(cell);
    if (state.clickAnchor && state.focusedCell) {
      state.previewCells = buildSelectionPath(state.clickAnchor, state.focusedCell);
    }
    return state.focusedCell;
  }

  function getGridCellFromElement(element) {
    const btn = element?.closest?.(".grid-cell");
    if (!btn) return null;
    return { row: Number(btn.dataset.row), col: Number(btn.dataset.col) };
  }

  function focusGridCell(cell) {
    if (!cell) return;
    const btn = dom.puzzleGrid.querySelector(`[data-row="${cell.row}"][data-col="${cell.col}"]`);
    btn?.focus({ preventScroll: true });
  }

  function clearSelection() {
    state.clickAnchor = null;
    state.previewCells = [];
  }

  function selectCell(cell) {
    if (!canInteractWithPuzzle()) return;
    setFocusedCell(cell);
    if (!state.clickAnchor) {
      state.clickAnchor = cell;
      state.previewCells = [cell];
      return;
    }
    if (sameCell(cell, state.clickAnchor)) {
      clearSelection();
      return;
    }
    checkMatch(buildSelectionPath(state.clickAnchor, cell));
    clearSelection();
  }

  function completeSelection(start, end, moved) {
    if (!moved) {
      selectCell(start);
      return;
    }
    setFocusedCell(end);
    checkMatch(buildSelectionPath(start, end));
    clearSelection();
  }

  function moveFocusedCell(rowDelta, colDelta) {
    const current = clampFocusedCell(state.focusedCell);
    if (!current) return null;
    return setFocusedCell({ row: current.row + rowDelta, col: current.col + colDelta });
  }

  function buildGridCellLabel(letter, row, col, flags) {
    const t = TRANSLATIONS[state.lang];
    const parts = [
      t.grid_cell_label
        .replace("{letter}", letter)
        .replace("{row}", String(row + 1))
        .replace("{col}", String(col + 1)),
    ];
    if (flags.isAnchor) parts.push(t.grid_cell_anchor);
    if (flags.isPreview && !flags.isAnchor) parts.push(t.grid_cell_preview);
    if (flags.isFound) parts.push(t.grid_cell_found);
    if (flags.isSolution) parts.push(t.grid_cell_solution);
    return parts.join(", ");
  }

  function getDefaultBoardInputMode() {
    return globalThis.matchMedia?.("(pointer: coarse)")?.matches ? "touch" : "pointer";
  }

  function debounce(fn, ms) {
    let id;
    return (...args) => { clearTimeout(id); id = setTimeout(() => fn(...args), ms); };
  }

  const state = {
    lang: "ca",
    puzzle: null,
    foundWordIds: new Set(),
    foundPlacementIds: new Set(),
    prevFoundPlacementIds: new Set(),
    foundWordColors: new Map(),
    clickAnchor: null,
    previewCells: [],
    dragSelection: null,
    mode: "student",
    activeTab: "teacher",
    celebrated: false,
    activeCategory: null,
    pinCallback: null,
    customSamples: loadCustomSamples(),
    teacherPin: loadTeacherPin(),
    timerIntervalId: null,
    timerSecondsLeft: 0,
    timerExpired: false,
    studentSessionStarted: false,
    hintsRemaining: 0,
    studentName: { nom: "", cognoms: "" },
    formTemplate: "",
    focusedCell: null,
    lastFocusedElement: null,
    lastBoardInputMode: getDefaultBoardInputMode(),
  };

  function composePuzzle(puzzle) {
    return {
      ...puzzle,
      difficultyLabel: TRANSLATIONS[state.lang][`diff_${puzzle.difficulty}`],
    };
  }

  function resetPuzzleProgress() {
    stopTimer();
    state.foundWordIds = new Set(); state.foundPlacementIds = new Set();
    state.prevFoundPlacementIds = new Set(); state.foundWordColors = new Map();
    state.clickAnchor = null; state.previewCells = []; state.dragSelection = null; state.celebrated = false;
    state.timerExpired = false; state.studentSessionStarted = false;
    state.timerSecondsLeft = state.puzzle?.timerDuration || 0;
    state.focusedCell = null;
    dom.gridCells = null;
    dom.wordListItems = null;
  }

  function buildShareConfigFromPuzzle(puzzle) {
    return {
      version: SHARED_PUZZLE_VERSION,
      title: puzzle.title,
      words: puzzle.words.map(word => word.display).join("\n"),
      difficulty: puzzle.difficulty,
      size: puzzle.requestedSize || "auto",
      lang: state.lang,
      timer: puzzle.timerDuration,
      hints: puzzle.hintsAllowed,
      formTemplate: state.formTemplate || "",
      gridRows: serializeGridRows(puzzle.grid),
      placementPaths: puzzle.placements.map(placement => serializePlacementCells(placement.cells)),
    };
  }

  const dom = {
    metaDescription: document.querySelector('meta[name="description"]'),
    form: document.querySelector("#generator-form"),
    generateButton: document.querySelector("#generate-button"),
    generateOpenButton: document.querySelector("#generate-open-button"),
    titleInput: document.querySelector("#title-input"),
    wordsInput: document.querySelector("#words-input"),
    clearWordsButton: document.querySelector("#clear-words-button"),
    wordsCount: document.querySelector("#words-count"),
    wordsFeedback: document.querySelector("#words-feedback"),
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
    teacherReadyCard: document.querySelector("#teacher-ready-card"),
    teacherReadyTopic: document.querySelector("#teacher-ready-topic"),
    teacherReadyMeta: document.querySelector("#teacher-ready-meta"),
    teacherOpenStudentButton: document.querySelector("#teacher-open-student-button"),
    teacherShareButton: document.querySelector("#teacher-share-button"),
    teacherPrintButton: document.querySelector("#teacher-print-button"),
    boardTitle: document.querySelector("#board-title"),
    boardInstructions: document.querySelector("#board-instructions"),
    boardStatus: document.querySelector("#board-status"),
    progressText: document.querySelector("#progress-text"),
    puzzleGrid: document.querySelector("#puzzle-grid"),
    wordList: document.querySelector("#word-list"),
    wordBankCount: document.querySelector("#word-bank-count"),
    studentActions: document.querySelector("#student-actions"),
    studentPlaySurface: document.querySelector("#student-play-surface"),
    studentStartOverlay: document.querySelector("#student-start-overlay"),
    studentStartTimer: document.querySelector("#student-start-timer"),
    studentStartHints: document.querySelector("#student-start-hints"),
    studentStartButton: document.querySelector("#student-start-button"),
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
    pinChangeForm: document.querySelector("#pin-change-form"),
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
    pinModal: document.querySelector("#pin-modal"),
    pinForm: document.querySelector("#pin-form"),
    pinInput: document.querySelector("#pin-input"),
    pinError: document.querySelector("#pin-error"),
    pinCancel: document.querySelector("#pin-cancel"),
  };

  function getFocusableElements(container) {
    return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter(element => !element.hasAttribute("hidden"));
  }

  function openModal(overlay, focusTarget) {
    if (!overlay) return;
    state.lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    overlay.hidden = false;
    document.body.classList.add("has-modal");
    requestAnimationFrame(() => {
      const fallbackTarget = overlay.querySelector(".modal-content");
      (focusTarget || getFocusableElements(overlay)[0] || fallbackTarget)?.focus();
    });
  }

  function closeModal(overlay, { restoreFocus = true } = {}) {
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    if (![dom.pinModal, dom.studentNameModal].some(modal => modal && !modal.hidden)) {
      document.body.classList.remove("has-modal");
    }
    const focusTarget = restoreFocus ? state.lastFocusedElement : null;
    state.lastFocusedElement = null;
    if (focusTarget?.isConnected) {
      requestAnimationFrame(() => focusTarget.focus());
    }
  }

  function trapModalFocus(event, overlay) {
    if (event.key !== "Tab" || !overlay || overlay.hidden) return;
    const focusable = getFocusableElements(overlay);
    if (!focusable.length) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function startStudentSession() {
    if (!state.puzzle || state.studentSessionStarted) return;
    state.studentSessionStarted = true;
    clearSelection();
    if (state.puzzle.timerDuration > 0 && !state.timerExpired) {
      startTimer(state.timerSecondsLeft || state.puzzle.timerDuration);
    }
    render();
    focusGridCell(setFocusedCell(state.focusedCell || { row: 0, col: 0 }));
  }

  function setTab(tab) {
    state.activeTab = tab;
    document.body.dataset.tab = tab;
    dom.tabTeacher.classList.toggle("is-active", tab === "teacher");
    dom.tabTeacher.setAttribute("aria-selected", String(tab === "teacher"));
    dom.tabStudent.classList.toggle("is-active", tab === "student");
    dom.tabStudent.setAttribute("aria-selected", String(tab === "student"));
    dom.sectionTeacher.hidden = tab !== "teacher";
    dom.sectionStudent.hidden = tab !== "student";
    if (tab === "student") {
      state.mode = "student";
      if (dom.teacherTools) dom.teacherTools.open = false;
      if (state.puzzle && state.studentSessionStarted && state.puzzle.timerDuration > 0 && !state.timerExpired && state.timerIntervalId === null && state.timerSecondsLeft > 0) {
        startTimer(state.timerSecondsLeft);
      }
      render();
      updateHintButton();
      const formParsed = state.formTemplate ? parseFormEntries(state.formTemplate) : null;
      if (formParsed && !state.studentName.nom && dom.studentNameModal) {
        const t = TRANSLATIONS[state.lang];
        if (dom.studentNomInput) dom.studentNomInput.placeholder = t.name_nom_placeholder;
        if (dom.studentCognomsInput) dom.studentCognomsInput.placeholder = t.name_cognoms_placeholder;
        openModal(dom.studentNameModal, dom.studentNomInput);
      } else if (shouldShowStudentStartOverlay()) {
        focusStudentStartButton();
      }
    }
  }

  function openPinModal(callback) {
    state.pinCallback = callback;
    if (dom.pinInput) dom.pinInput.value = "";
    if (dom.pinError) dom.pinError.style.display = "none";
    openModal(dom.pinModal, dom.pinInput);
  }

  function updateWordsHelper() {
    if (!dom.wordsCount || !dom.wordsFeedback) return;
    const t = TRANSLATIONS[state.lang];
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

  function getBoardInstructionText() {
    const t = TRANSLATIONS[state.lang];
    if (state.lastBoardInputMode === "keyboard") return t.board_instructions_keyboard || t.board_instructions;
    if (state.lastBoardInputMode === "touch") return t.board_instructions_touch || t.board_instructions;
    return t.board_instructions_pointer || t.board_instructions;
  }

  function buildTeacherReadyMeta(puzzle) {
    const t = TRANSLATIONS[state.lang];
    const difficultyLabel = t[`diff_${puzzle.difficulty}`] || puzzle.difficultyLabel;
    const parts = [t.teacher_ready_meta
      .replace("{count}", puzzle.words.length)
      .replace(/\{size\}/g, puzzle.actualSize)
      .replace("{difficulty}", difficultyLabel)];
    if (puzzle.timerDuration > 0) parts.push(formatTimerSummary(puzzle.timerDuration));
    return parts.join(" · ");
  }

  function updateTeacherReadyCard() {
    if (!dom.teacherReadyCard) return;
    dom.teacherReadyCard.hidden = !state.puzzle;
    if (!state.puzzle) return;
    dom.teacherReadyTopic.textContent = state.puzzle.title;
    dom.teacherReadyMeta.textContent = buildTeacherReadyMeta(state.puzzle);
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
    syncWordsUi();
    if (typeof dom.form.requestSubmit === "function") {
      dom.form.requestSubmit(dom.generateButton || undefined);
    } else {
      dom.form.dispatchEvent(new Event("submit"));
    }
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
    syncWordsUi();
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
    dom.langBtns.forEach(btn => {
      const isActive = btn.dataset.lang === lang;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });
    state.activeCategory = null;
    renderSampleOptions();
    updateWordsHelper();
    renderLibrary();
    render();
  }

  function setStatus(msg, tone) {
    dom.statusMessage.textContent = msg || TRANSLATIONS[state.lang].status_default;
    dom.statusMessage.className = "status-message" + (tone ? ` is-${tone}` : "");
  }

  function initGrid() {
    if (!state.puzzle) return;
    const size = state.puzzle.actualSize;
    dom.puzzleGrid.innerHTML = "";
    dom.puzzleGrid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
    dom.gridCells = new Array(size * size);
    state.puzzle.grid.forEach((row, r) => {
      row.forEach((letter, c) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "grid-cell";
        btn.textContent = letter;
        btn.dataset.row = r;
        btn.dataset.col = c;
        btn.tabIndex = -1;
        dom.puzzleGrid.appendChild(btn);
        dom.gridCells[r * size + c] = btn;
      });
    });
  }

  function initWordList() {
    if (!state.puzzle) return;
    dom.wordList.innerHTML = "";
    dom.wordListItems = new Map();
    const svgCheck = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 13l4 4L19 7"/></svg>`;
    state.puzzle.words.forEach(word => {
      const li = document.createElement("li");
      li.className = "word-item";
      const textSpan = document.createElement("span");
      textSpan.textContent = word.display;
      const checkSpan = document.createElement("span");
      checkSpan.className = "check-icon";
      checkSpan.innerHTML = svgCheck;
      li.appendChild(textSpan);
      li.appendChild(checkSpan);
      dom.wordList.appendChild(li);
      dom.wordListItems.set(word.id, li);
    });
  }

  function renderGridHighlights() {
    if (!state.puzzle || !dom.gridCells) return;
    const foundColorMap = new Map();
    state.puzzle.placements.forEach(p => {
      if (state.foundPlacementIds.has(p.placementId)) {
        const colorClass = state.foundWordColors.get(p.wordId) || "wc-0";
        p.cells.forEach(c => foundColorMap.set(`${c.row}:${c.col}`, colorClass));
      }
    });
    const previewSet = new Set(state.previewCells.map(c => `${c.row}:${c.col}`));
    const solutionCells = new Set();
    if (state.mode === "teacher") state.puzzle.placements.forEach(p => p.cells.forEach(c => solutionCells.add(`${c.row}:${c.col}`)));
    const size = state.puzzle.actualSize;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const key = `${r}:${c}`;
        const wordColor = foundColorMap.get(key) || "";
        const isAnchor = Boolean(state.clickAnchor && state.clickAnchor.row === r && state.clickAnchor.col === c);
        const isPreview = previewSet.has(key);
        const isFound = foundColorMap.has(key);
        const isSolution = solutionCells.has(key);
        dom.gridCells[r * size + c].className = "grid-cell" +
          (isFound ? ` is-found ${wordColor}` : "") +
          (isPreview ? " is-preview" : "") +
          (isAnchor ? " is-anchor" : "") +
          (isSolution ? " is-solution" : "");
      }
    }
  }

  function render() {
    document.body.dataset.mode = state.mode;
    document.body.dataset.tab = state.activeTab;
    dom.studentActions.hidden = !state.puzzle;
    if (!state.puzzle) {
      if (dom.timerDisplay) dom.timerDisplay.hidden = true;
      if (dom.teacherReadyCard) dom.teacherReadyCard.hidden = true;
      if (dom.boardStatus) {
        dom.boardStatus.textContent = "";
        dom.boardStatus.className = "board-status";
      }
      syncStudentStartOverlay();
      return;
    }
    const t = TRANSLATIONS[state.lang];
    dom.solutionToggleButton.textContent =
      state.mode === "teacher" ? t.btn_hide_solution : t.btn_show_solution;
    dom.solutionToggleButton.classList.toggle("is-active", state.mode === "teacher");
    if (state.mode === "teacher" && dom.teacherTools) dom.teacherTools.open = true;
    if (dom.boardInstructions) dom.boardInstructions.textContent = getBoardInstructionText();
    dom.boardTitle.textContent = state.puzzle.title;
    dom.progressText.textContent = `${state.foundWordIds.size} / ${state.puzzle.words.length}`;
    dom.wordBankCount.textContent = state.puzzle.words.length;
    updateTeacherReadyCard();
    if (dom.timerDisplay) {
      const showTimer = state.puzzle.timerDuration > 0 && (state.studentSessionStarted || state.timerExpired);
      dom.timerDisplay.hidden = !showTimer;
      if (showTimer) updateTimerDisplay();
      else {
        dom.timerDisplay.textContent = "00:00";
        dom.timerDisplay.classList.remove("is-warning", "is-expired");
      }
    }
    syncStudentStartOverlay();
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

    // Word list — build once, update classes in-place on subsequent renders
    if (!dom.wordListItems) initWordList();
    state.puzzle.words.forEach(word => {
      const solved = state.foundWordIds.has(word.id);
      const colorClass = solved ? (state.foundWordColors.get(word.id) || "wc-0") : "";
      const li = dom.wordListItems.get(word.id);
      if (li) li.className = "word-item" + (solved ? ` is-found ${colorClass}` : "");
    });

    // Grid — build once, update attributes in-place on subsequent renders
    if (!dom.gridCells) initGrid();
    dom.puzzleGrid.setAttribute("aria-label", t.grid_label);
    if (!state.focusedCell || state.focusedCell.row >= state.puzzle.actualSize || state.focusedCell.col >= state.puzzle.actualSize) {
      state.focusedCell = { row: 0, col: 0 };
    }
    const solutionCells = new Set();
    if (state.mode === "teacher") state.puzzle.placements.forEach(p => p.cells.forEach(c => solutionCells.add(`${c.row}:${c.col}`)));
    const previewSet = new Set(state.previewCells.map(c => `${c.row}:${c.col}`));
    const gridSize = state.puzzle.actualSize;
    state.puzzle.grid.forEach((row, r) => {
      row.forEach((letter, c) => {
        const key = `${r}:${c}`;
        const wordColor = foundColorMap.get(key) || "";
        const isAnchor = Boolean(state.clickAnchor && state.clickAnchor.row === r && state.clickAnchor.col === c);
        const isPreview = previewSet.has(key);
        const isFound = foundColorMap.has(key);
        const isSolution = solutionCells.has(key);
        const btn = dom.gridCells[r * gridSize + c];
        btn.className = "grid-cell" +
          (isFound ? ` is-found ${wordColor}` : "") +
          (newlyFoundCells.has(key) ? " is-found-new" : "") +
          (isPreview ? " is-preview" : "") +
          (isAnchor ? " is-anchor" : "") +
          (isSolution ? " is-solution" : "");
        btn.tabIndex = sameCell(state.focusedCell, { row: r, col: c }) ? 0 : -1;
        btn.setAttribute("aria-label", buildGridCellLabel(letter, r, c, { isAnchor, isPreview, isFound, isSolution }));
      });
    });
    const isComplete = state.foundWordIds.size === state.puzzle.words.length;
    dom.completionMessage.hidden = !isComplete;
    if (dom.boardStatus) {
      const boardStatusTone = state.timerExpired
        ? "expired"
        : isComplete
          ? "complete"
          : !state.studentSessionStarted
            ? "pending"
          : state.foundWordIds.size > 0
            ? "progress"
            : "";
      const boardStatusText = state.timerExpired
        ? t.board_status_expired
        : isComplete
          ? t.board_status_complete
          : !state.studentSessionStarted
            ? t.board_status_pending
          : state.foundWordIds.size > 0
            ? t.board_status_progress
              .replace("{found}", state.foundWordIds.size)
              .replace("{total}", state.puzzle.words.length)
            : t.board_status_start;
      dom.boardStatus.textContent = boardStatusText;
      dom.boardStatus.className = "board-status" + (boardStatusTone ? ` is-${boardStatusTone}` : "");
    }
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
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    const colors = ["#ff6b00", "#0d9488", "#3b82f6", "#8b5cf6"];
    const confettiElements = [];
    for (let i = 0; i < 50; i++) {
      const p = document.createElement("div");
      Object.assign(p.style, { position: "fixed", left: Math.random() * 100 + "vw", top: "-10px", width: "10px", height: "10px", backgroundColor: colors[Math.floor(Math.random() * colors.length)], borderRadius: "50%", zIndex: "1000", pointerEvents: "none" });
      document.body.appendChild(p);
      confettiElements.push(p);
      const anim = p.animate([{ transform: "translateY(0)", opacity: 1 }, { transform: "translateY(100vh)", opacity: 0 }], { duration: 1000 + Math.random() * 2000 });
      anim.onfinish = () => p.remove();
    }
    // Cleanup if page unloads before animations finish
    window.addEventListener("beforeunload", () => {
      confettiElements.forEach(el => { if (el.isConnected) el.remove(); });
    }, { once: true });
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

  function flashButtonText(button, temporaryText, resetText) {
    if (!button) return;
    button.textContent = temporaryText;
    setTimeout(() => { button.textContent = resetText; }, 2500);
  }

  function shareCurrentPuzzle(button) {
    if (!state.puzzle) return;
    const config = buildShareConfigFromPuzzle(state.puzzle);
    const encoded = encodePuzzleConfig(config);
    const url = `${window.location.origin}${window.location.pathname}?p=${encodeURIComponent(encoded)}`;
    const t = TRANSLATIONS[state.lang];
    navigator.clipboard.writeText(url).then(() => {
      flashButtonText(button, t.btn_share_copied, t.btn_share);
      setStatus(t.btn_share_copied, "success");
    }).catch(() => {
      window.prompt(t.btn_share, url);
    });
  }

  function printCurrentPuzzle() {
    if (!state.puzzle) {
      setStatus(TRANSLATIONS[state.lang].msg_print_without_puzzle, "error");
      return;
    }

    window.print();
  }

  function generatePuzzle({ openStudent = false, triggerButton = dom.generateButton } = {}) {
    const t = TRANSLATIONS[state.lang];
    const parsed = parseWords(dom.wordsInput.value);
    const originalTriggerText = triggerButton?.textContent || "";

    [dom.generateButton, dom.generateOpenButton].forEach(button => {
      if (button) button.disabled = true;
    });
    if (triggerButton) {
      triggerButton.textContent = t.btn_generating || "...";
    }

    try {
      if (parsed.words.length < 1) throw new Error("no_words");
      state.puzzle = buildPuzzle(parsed.words, dom.sizeInput.value, dom.difficultyInput.value, {
        title: dom.titleInput.value,
        requestedSize: dom.sizeInput.value,
        timerDuration: Number(dom.timerInput?.value) || 0,
        hintsAllowed: Number(dom.hintsInput?.value) || 0,
      });
      state.hintsRemaining = state.puzzle.hintsAllowed;
      state.studentName = { nom: "", cognoms: "" };
      stopTimer();
      resetPuzzleProgress();
      setStatus(t.msg_success, "success");
      render();
      if (openStudent) setTab("student");
    } catch (err) {
      setStatus(t.msg_puzzle_error || err.message, "error");
    } finally {
      if (triggerButton) triggerButton.textContent = originalTriggerText;
      if (dom.generateButton) dom.generateButton.textContent = t.btn_generate;
      if (dom.generateOpenButton) dom.generateOpenButton.textContent = t.btn_generate_open_student;
      updateWordsHelper();
    }
  }

  dom.form.addEventListener("submit", e => {
    e.preventDefault();
    generatePuzzle({ triggerButton: e.submitter || dom.generateButton });
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

  dom.studentStartButton?.addEventListener("click", () => startStudentSession());

  dom.resetProgressButton.addEventListener("click", () => {
    if (!window.confirm(TRANSLATIONS[state.lang].msg_confirm_reset)) return;
    resetPuzzleProgress();
    if (state.puzzle) state.hintsRemaining = state.puzzle.hintsAllowed;
    render();
    if (shouldShowStudentStartOverlay()) focusStudentStartButton();
  });
  dom.printButton.addEventListener("click", () => printCurrentPuzzle());
  
  dom.tabTeacher.addEventListener("click", () => {
    if (state.activeTab === "teacher") return;
    openPinModal(() => { stopTimer(); setTab("teacher"); });
  });
  
  dom.tabStudent.addEventListener("click", () => setTab("student"));
  dom.generateOpenButton?.addEventListener("click", () => {
    if (!dom.form.reportValidity()) return;
    generatePuzzle({ openStudent: true, triggerButton: dom.generateOpenButton });
  });
  dom.clearWordsButton?.addEventListener("click", () => {
    dom.wordsInput.value = "";
    setStatus(null);
    syncWordsUi();
    dom.wordsInput.focus();
  });
  dom.teacherOpenStudentButton?.addEventListener("click", () => {
    if (state.puzzle) setTab("student");
  });
  dom.teacherShareButton?.addEventListener("click", () => shareCurrentPuzzle(dom.teacherShareButton));
  dom.teacherPrintButton?.addEventListener("click", () => printCurrentPuzzle());

  dom.pinForm?.addEventListener("submit", event => {
    event.preventDefault();
    const pin = dom.pinInput?.value || "";
    if (pin === state.teacherPin) {
      closeModal(dom.pinModal);
      if (state.pinCallback) state.pinCallback();
      state.pinCallback = null;
    } else {
      if (dom.pinError) dom.pinError.style.display = "block";
    }
  });

  dom.pinCancel?.addEventListener("click", () => { closeModal(dom.pinModal); state.pinCallback = null; });

  dom.pinModal?.addEventListener("click", event => {
    if (event.target === event.currentTarget) {
      closeModal(dom.pinModal);
      state.pinCallback = null;
    }
  });

  dom.pinModal?.addEventListener("keydown", event => {
    trapModalFocus(event, dom.pinModal);
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal(dom.pinModal);
      state.pinCallback = null;
    }
  });

  dom.studentNameModal?.addEventListener("keydown", event => {
    trapModalFocus(event, dom.studentNameModal);
  });

  if (dom.hintButton) {
    dom.hintButton.addEventListener("click", () => useHint());
  }

  if (dom.pinChangeForm) {
    dom.pinChangeForm.addEventListener("submit", event => {
      event.preventDefault();
      const t = TRANSLATIONS[state.lang];
      const newPin = dom.newPinInput.value.trim();
      const confirmPin = dom.confirmPinInput.value.trim();
      dom.pinChangeMessage.style.display = "block";
      if (!/^\d{4,8}$/.test(newPin)) {
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
    if (!btn || !canInteractWithPuzzle()) return;
    state.lastBoardInputMode = e.pointerType === "touch" ? "touch" : "pointer";
    const cell = { row: +btn.dataset.row, col: +btn.dataset.col };
    setFocusedCell(cell);
    state.dragSelection = { start: cell, end: cell, moved: false };
  });

  window.addEventListener("pointermove", e => {
    if (!canInteractWithPuzzle()) return;
    const hovered = document.elementFromPoint(e.clientX, e.clientY);
    const btn = hovered?.closest(".grid-cell");
    const cell = btn ? { row: +btn.dataset.row, col: +btn.dataset.col } : null;
    if (state.dragSelection) {
      if (cell && (cell.row !== state.dragSelection.end.row || cell.col !== state.dragSelection.end.col)) {
        state.dragSelection.end = cell;
        state.dragSelection.moved = true;
        state.previewCells = buildSelectionPath(state.dragSelection.start, state.dragSelection.end);
        if (dom.gridCells) renderGridHighlights();
      }
    } else if (state.clickAnchor && cell) {
      state.previewCells = buildSelectionPath(state.clickAnchor, cell);
      if (dom.gridCells) renderGridHighlights();
    }
  });

  window.addEventListener("pointerup", () => {
    if (!state.dragSelection) return;
    if (!canInteractWithPuzzle()) {
      state.dragSelection = null;
      clearSelection();
      render();
      return;
    }
    const { start, end, moved } = state.dragSelection; state.dragSelection = null;
    completeSelection(start, end, moved);
    render();
  });

  dom.puzzleGrid.addEventListener("focusin", event => {
    const cell = getGridCellFromElement(event.target);
    if (cell) {
      setFocusedCell(cell);
    }
  });

  dom.puzzleGrid.addEventListener("keydown", event => {
    const cell = getGridCellFromElement(event.target);
    if (!cell || !canInteractWithPuzzle()) return;
    state.lastBoardInputMode = "keyboard";
    setFocusedCell(cell);

    const focusMoves = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };

    if (focusMoves[event.key]) {
      event.preventDefault();
      const [rowDelta, colDelta] = focusMoves[event.key];
      const nextCell = moveFocusedCell(rowDelta, colDelta);
      render();
      focusGridCell(nextCell);
      return;
    }

    if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      selectCell(cell);
      render();
      focusGridCell(state.focusedCell || cell);
      return;
    }

    if (event.key === "Escape" && state.clickAnchor) {
      event.preventDefault();
      clearSelection();
      render();
      focusGridCell(state.focusedCell || cell);
    }
  });

  dom.langBtns.forEach(btn => btn.addEventListener("click", () => updateLanguage(btn.dataset.lang)));
  dom.libSearch.addEventListener("input", debounce(() => renderLibrary(), 150));
  dom.wordsInput.addEventListener("input", debounce(() => syncWordsUi(), 200));
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
      closeModal(dom.studentNameModal, { restoreFocus: false });
      render();
      if (shouldShowStudentStartOverlay()) focusStudentStartButton();
      else focusGridCell(setFocusedCell(state.focusedCell || { row: 0, col: 0 }));
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
    dom.shareButton.addEventListener("click", () => shareCurrentPuzzle(dom.shareButton));
  }

  function tryLoadFromUrl() {
    const param = new URLSearchParams(window.location.search).get("p");
    if (!param) return false;
    const config = decodePuzzleConfig(param);
    if (!config) return false;

    // Guardar estado previo para rollback
    const prevTitle = dom.titleInput.value;
    const prevWords = dom.wordsInput.value;
    const prevDifficulty = dom.difficultyInput.value;
    const prevSize = dom.sizeInput.value;
    const prevTimer = dom.timerInput ? dom.timerInput.value : "0";
    const prevHints = dom.hintsInput ? dom.hintsInput.value : "0";
    const prevFormTemplate = state.formTemplate;
    const prevPuzzle = state.puzzle;

    try {
      const parsed = parseWords(config.words);
      if (parsed.words.length < 1) return false;
      updateLanguage(config.lang);
      dom.titleInput.value = config.title;
      dom.wordsInput.value = config.words;
      dom.difficultyInput.value = config.difficulty;
      dom.sizeInput.value = SAMPLE_SIZES.has(config.requestedSize) ? config.requestedSize : "auto";
      if (dom.timerInput) dom.timerInput.value = config.timer;
      if (dom.hintsInput) dom.hintsInput.value = config.hints;
      state.formTemplate = config.formTemplate || "";
      state.studentName = { nom: "", cognoms: "" };
      if (dom.formTemplateInput) dom.formTemplateInput.value = state.formTemplate;
      syncWordsUi();
      const metadata = {
        title: config.title,
        requestedSize: config.requestedSize,
        timerDuration: config.timer,
        hintsAllowed: config.hints,
      };
      state.puzzle = config.version >= SHARED_PUZZLE_VERSION && config.gridRows && config.placementPaths
        ? buildPuzzleFromSnapshot(parsed.words, config, metadata)
        : buildPuzzle(parsed.words, config.size, config.difficulty, metadata);
      state.hintsRemaining = state.puzzle.hintsAllowed;
      resetPuzzleProgress();
      setTab("student");
      return true;
    } catch {
      // Rollback al estado previo
      updateLanguage("ca");
      dom.titleInput.value = prevTitle;
      dom.wordsInput.value = prevWords;
      dom.difficultyInput.value = prevDifficulty;
      dom.sizeInput.value = prevSize;
      if (dom.timerInput) dom.timerInput.value = prevTimer;
      if (dom.hintsInput) dom.hintsInput.value = prevHints;
      state.formTemplate = prevFormTemplate;
      state.puzzle = prevPuzzle;
      if (dom.formTemplateInput) dom.formTemplateInput.value = state.formTemplate;
      syncWordsUi();
      console.warn("[word-search] Failed to load puzzle from shared URL.");
      return false;
    }
  }

  if (!tryLoadFromUrl()) {
    updateLanguage("ca");
    updateWordsHelper();
    setTab("teacher");
    if (new URLSearchParams(window.location.search).has("p")) {
      setStatus(TRANSLATIONS["ca"].msg_link_error, "error");
    }
  }
})();
