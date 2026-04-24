(function () {
  "use strict";

  const ALL_CATEGORY_ID = "__all__";
  const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const CORE = globalThis.WORD_SEARCH_CORE;
  if (!CORE) throw new Error("WORD_SEARCH_CORE is required.");
  const APP_HELPERS = globalThis.WORD_SEARCH_APP_HELPERS;
  if (!APP_HELPERS) throw new Error("WORD_SEARCH_APP_HELPERS is required.");
  const APP_STORAGE = globalThis.WORD_SEARCH_APP_STORAGE;
  if (!APP_STORAGE) throw new Error("WORD_SEARCH_APP_STORAGE is required.");
  const APP_MODAL = globalThis.WORD_SEARCH_APP_MODAL;
  if (!APP_MODAL) throw new Error("WORD_SEARCH_APP_MODAL is required.");
  const APP_BOARD = globalThis.WORD_SEARCH_APP_BOARD;
  if (!APP_BOARD) throw new Error("WORD_SEARCH_APP_BOARD is required.");
  const APP_TEACHER = globalThis.WORD_SEARCH_APP_TEACHER;
  if (!APP_TEACHER) throw new Error("WORD_SEARCH_APP_TEACHER is required.");
  const APP_SESSION = globalThis.WORD_SEARCH_APP_SESSION;
  if (!APP_SESSION) throw new Error("WORD_SEARCH_APP_SESSION is required.");

  const APP_DATA = globalThis.WORD_SEARCH_DATA || { vocabulary: {}, samplePuzzles: {}, definitions: {} };
  const TRANSLATIONS = globalThis.WORD_SEARCH_I18N || {};
  const getTranslations = () => TRANSLATIONS[state.lang];
  const VOCABULARY = APP_DATA.vocabulary || {};
  const SAMPLE_PUZZLES = APP_DATA.samplePuzzles || {};
  const WORD_DEFINITIONS = APP_DATA.definitions || {};
  const {
    SAMPLE_LANGS,
    SAMPLE_SIZES,
    SHARED_PUZZLE_VERSION,
    parseWords,
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
  const {
    formatSecondsAsClock,
    formatTimerSummary,
    formatHintsSummary,
    buildSelectionPath,
    shareUrlWithFallback,
  } = APP_HELPERS;
  const {
    loadTeacherPin: loadTeacherPinFromStorage,
    saveTeacherPin: saveTeacherPinToStorage,
    loadCustomSamples: loadCustomSamplesFromStorage,
    persistCustomSamples: persistCustomSamplesToStorage,
  } = APP_STORAGE;
  const {
    openModal,
    closeModal,
    trapModalFocus,
  } = APP_MODAL.createModalController({ focusableSelector: FOCUSABLE_SELECTOR });

  function getVocabularyCategories(lang) {
    return VOCABULARY[lang] || {};
  }

  function getBuiltInSamplePuzzles(lang) {
    return SAMPLE_PUZZLES[lang] || [];
  }

  function getDefinitionsForLang(lang) {
    return WORD_DEFINITIONS[lang] || {};
  }

  function persistCustomSamples() {
    if (persistCustomSamplesToStorage(state.customSamples)) {
      return true;
    }
    setStatus(TRANSLATIONS[state.lang].msg_storage_unavailable, "error");
    return false;
  }

  function getCustomSamplePuzzles(lang) {
    return state.customSamples[lang] || [];
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

  function prefersReducedMotion() {
    return Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
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
        ? formatTimerSummary(state.puzzle.timerDuration, TRANSLATIONS[state.lang])
        : TRANSLATIONS[state.lang].timer_none;
    }
    if (dom.studentStartHints) {
      dom.studentStartHints.textContent = state.puzzle
        ? formatHintsSummary(state.puzzle.hintsAllowed, TRANSLATIONS[state.lang])
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

  function ensureCompletionMessageVisible() {
    const target = dom.gridContainer || dom.completionMessage;
    if (!(target instanceof HTMLElement)) return;
    const rect = target.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const gutter = Math.min(72, Math.max(24, viewportHeight * 0.12));
    if (rect.top >= gutter && rect.bottom <= viewportHeight - gutter) return;
    target.scrollIntoView({
      block: "center",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }

  function revealCompletionMessage() {
    const focusTarget = dom.sendResultsButton && !dom.sendResultsButton.hidden
      ? dom.sendResultsButton
      : dom.playAgainButton || dom.completionMessage;
    requestAnimationFrame(() => {
      ensureCompletionMessageVisible();
      focusTarget?.focus({ preventScroll: true });
    });
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
    customSamples: loadCustomSamplesFromStorage(),
    teacherPin: loadTeacherPinFromStorage(),
    timerIntervalId: null,
    timerSecondsLeft: 0,
    timerExpired: false,
    studentSessionStarted: false,
    hintsRemaining: 0,
    studentName: { nom: "", cognoms: "" },
    formTemplate: "",
    activeDefinitionWordId: null,
    focusedCell: null,
    lastBoardInputMode: getDefaultBoardInputMode(),
  };

  function getPuzzleSourceLang() {
    return state.puzzle?.sourceLang || state.lang;
  }

  function composePuzzle(puzzle) {
    return {
      ...puzzle,
      difficultyLabel: TRANSLATIONS[state.lang][`diff_${puzzle.difficulty}`],
    };
  }

  function buildInitialPuzzleProgress() {
    return {
      foundWordIds: new Set(),
      foundPlacementIds: new Set(),
      prevFoundPlacementIds: new Set(),
      foundWordColors: new Map(),
      clickAnchor: null,
      previewCells: [],
      dragSelection: null,
      celebrated: false,
      timerExpired: false,
      studentSessionStarted: false,
      activeDefinitionWordId: null,
      timerSecondsLeft: state.puzzle?.timerDuration || 0,
      focusedCell: null,
    };
  }

  function resetPuzzleProgress() {
    stopTimer();
    Object.assign(state, buildInitialPuzzleProgress());
    dom.gridCells = null;
    dom.wordListItems = null;
    closeWordDefinitionModal({ restoreFocus: false });
  }

  function buildShareConfigFromPuzzle(puzzle) {
    return {
      version: SHARED_PUZZLE_VERSION,
      title: puzzle.title,
      words: puzzle.words.map(word => word.display).join("\n"),
      difficulty: puzzle.difficulty,
      size: puzzle.requestedSize || "auto",
      lang: puzzle.sourceLang || state.lang,
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
    deleteSampleButton: document.querySelector("#delete-sample-button"),
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
    gridContainer: document.querySelector("#grid-container"),
    completionMessage: document.querySelector("#completion-message"),
    completionNote: document.querySelector("#completion-note"),
    completionTime: document.querySelector("#completion-time"),
    playAgainButton: document.querySelector("#play-again-button"),
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
    wordDefinitionModal: document.querySelector("#word-definition-modal"),
    wordDefinitionTitle: document.querySelector("#word-definition-title"),
    wordDefinitionText: document.querySelector("#word-definition-text"),
    wordDefinitionFound: document.querySelector("#word-definition-found"),
    wordDefinitionClose: document.querySelector("#word-definition-close"),
    pinModal: document.querySelector("#pin-modal"),
    pinForm: document.querySelector("#pin-form"),
    pinInput: document.querySelector("#pin-input"),
    pinError: document.querySelector("#pin-error"),
    pinCancel: document.querySelector("#pin-cancel"),
  };

  function findPuzzleWordById(wordId) {
    return state.puzzle?.words.find(word => word.id === wordId) || null;
  }

  function getDefinitionTextForWordId(wordId) {
    return getDefinitionsForLang(getPuzzleSourceLang())[wordId] || "";
  }

  function resetWordDefinitionModalContent() {
    if (!dom.wordDefinitionTitle || !dom.wordDefinitionText) return;
    const t = TRANSLATIONS[state.lang];
    dom.wordDefinitionTitle.textContent = t.word_definition_placeholder_title;
    dom.wordDefinitionText.textContent = t.word_definition_placeholder_text;
    if (dom.wordDefinitionFound) dom.wordDefinitionFound.hidden = true;
  }

  function closeWordDefinitionModal(options) {
    state.activeDefinitionWordId = null;
    resetWordDefinitionModalContent();
    closeModal(dom.wordDefinitionModal, options);
  }

  function renderWordDefinitionModal() {
    if (!dom.wordDefinitionModal || !state.activeDefinitionWordId) return;
    const word = findPuzzleWordById(state.activeDefinitionWordId);
    const definitionText = getDefinitionTextForWordId(state.activeDefinitionWordId);
    if (!word || !definitionText) {
      closeWordDefinitionModal({ restoreFocus: false });
      return;
    }
    dom.wordDefinitionTitle.textContent = word.display;
    dom.wordDefinitionText.textContent = definitionText;
    if (dom.wordDefinitionFound) {
      dom.wordDefinitionFound.hidden = !state.foundWordIds.has(word.id);
    }
  }

  function openWordDefinition(wordId) {
    if (!state.puzzle) return;
    const definitionText = getDefinitionTextForWordId(wordId);
    if (!definitionText) return;
    state.activeDefinitionWordId = wordId;
    renderWordDefinitionModal();
    openModal(dom.wordDefinitionModal, dom.wordDefinitionClose);
  }

  function buildTeacherReadyMeta(puzzle) {
    const t = TRANSLATIONS[state.lang];
    const difficultyLabel = t[`diff_${puzzle.difficulty}`] || puzzle.difficultyLabel;
    const parts = [t.teacher_ready_meta
      .replace("{count}", puzzle.words.length)
      .replace(/\{size\}/g, puzzle.actualSize)
      .replace("{difficulty}", difficultyLabel)];
    if (puzzle.timerDuration > 0) parts.push(formatTimerSummary(puzzle.timerDuration, t));
    return parts.join(" · ");
  }

  function updateTeacherReadyCard() {
    if (!dom.teacherReadyCard) return;
    dom.teacherReadyCard.hidden = !state.puzzle;
    if (!state.puzzle) return;
    dom.teacherReadyTopic.textContent = state.puzzle.title;
    dom.teacherReadyMeta.textContent = buildTeacherReadyMeta(state.puzzle);
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
    const nav = document.querySelector("nav[aria-label]");
    if (nav && TRANSLATIONS[lang].nav_sections) nav.setAttribute("aria-label", TRANSLATIONS[lang].nav_sections);
    dom.langBtns.forEach(btn => {
      const isActive = btn.dataset.lang === lang;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });
    state.activeCategory = null;
    teacherController.renderSampleOptions();
    teacherController.updateWordsHelper();
    teacherController.renderLibrary();
    render();
    renderWordDefinitionModal();
    if (!state.activeDefinitionWordId) resetWordDefinitionModalContent();
  }

  function setStatus(msg, tone) {
    dom.statusMessage.textContent = msg || TRANSLATIONS[state.lang].status_default;
    dom.statusMessage.className = "status-message" + (tone ? ` is-${tone}` : "");
  }

  const teacherController = APP_TEACHER.createTeacherController({
    dom,
    state,
    getTranslations,
    sampleLangs: SAMPLE_LANGS,
    allCategoryId: ALL_CATEGORY_ID,
    parseWords,
    countValidWords: CORE.countValidWords,
    normalizeWord: CORE.normalizeWord,
    generateSampleId: APP_HELPERS.generateSampleId,
    mergeSamples: APP_HELPERS.mergeSamples,
    sanitizeCustomSampleCollection: APP_STORAGE.sanitizeCustomSampleCollection,
    getBuiltInSamplePuzzles,
    getCustomSamplePuzzles,
    getVocabularyCategories,
    persistCustomSamples,
    setStatus,
    debounce,
  });

  const {
    checkMatch,
    render,
    renderGridHighlights,
    updateHintButton,
    useHint,
  } = APP_BOARD.createBoardController({
    dom,
    state,
    getTranslations,
    sameCell,
    formatSecondsAsClock,
    parseFormEntries,
    getDefinitionTextForWordId,
    openWordDefinition,
    renderWordDefinitionModal,
    syncStudentStartOverlay,
    updateTeacherReadyCard,
    stopTimer,
    revealCompletionMessage,
    setStatus,
    prefersReducedMotion,
    canInteractWithPuzzle,
  });

  const flashTimeouts = new Map();
  function flashButtonText(button, temporaryText, resetText) {
    if (!button) return;
    clearTimeout(flashTimeouts.get(button));
    button.textContent = temporaryText;
    flashTimeouts.set(button, setTimeout(() => {
      button.textContent = resetText;
      flashTimeouts.delete(button);
    }, 2500));
  }

  async function shareCurrentPuzzle(button) {
    if (!state.puzzle) return;
    const config = buildShareConfigFromPuzzle(state.puzzle);
    const encoded = encodePuzzleConfig(config);
    const shareUrl = new URL(window.location.pathname, window.location.href);
    shareUrl.search = "";
    shareUrl.hash = "";
    shareUrl.searchParams.set("p", encoded);
    const url = shareUrl.toString();
    const t = TRANSLATIONS[state.lang];
    const nativeShare = typeof navigator.share === "function"
      ? payload => navigator.share(payload)
      : null;
    const writeText = typeof navigator.clipboard?.writeText === "function"
      ? text => navigator.clipboard.writeText(text)
      : null;
    const promptShare = typeof window.prompt === "function"
      ? (message, value) => window.prompt(message, value)
      : null;
    const prefersNativeShare = Boolean(globalThis.matchMedia?.("(pointer: coarse)")?.matches);
    let outcome;

    if (prefersNativeShare) {
      outcome = await shareUrlWithFallback({
        url,
        share: nativeShare,
        writeText,
        prompt: promptShare,
        promptMessage: t.btn_share,
      });
    } else {
      outcome = await shareUrlWithFallback({
        url,
        writeText,
        prompt: null,
      });
      if (outcome === "unavailable") {
        outcome = await shareUrlWithFallback({
          url,
          share: nativeShare,
          prompt: promptShare,
          promptMessage: t.btn_share,
        });
      }
    }

    if (outcome === "shared") {
      setStatus(t.msg_share_opened, "success");
      return;
    }

    if (outcome === "copied") {
      flashButtonText(button, t.btn_share_copied, t.btn_share);
      setStatus(t.btn_share_copied, "success");
      return;
    }

    if (outcome === "prompted") {
      setStatus(t.msg_share_manual, "success");
      return;
    }

    if (outcome === "unavailable") {
      setStatus(t.msg_share_unavailable, "error");
    }
  }

  function printCurrentPuzzle() {
    if (!state.puzzle) {
      setStatus(TRANSLATIONS[state.lang].msg_print_without_puzzle, "error");
      return;
    }

    window.print();
  }

  const sessionController = APP_SESSION.createSessionController({
    dom,
    state,
    getTranslations,
    openModal,
    closeModal,
    trapModalFocus,
    parseFormEntries,
    buildFormSubmitUrl,
    saveTeacherPin: saveTeacherPinToStorage,
    shouldShowStudentStartOverlay,
    focusStudentStartButton,
    focusGridCell,
    setFocusedCell,
    stopTimer,
    startTimer,
    clearSelection,
    render,
    updateHintButton,
    resetPuzzleProgress,
    closeWordDefinitionModal,
    printCurrentPuzzle,
    shareCurrentPuzzle,
  });

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
        sourceLang: state.lang,
      });
      state.hintsRemaining = state.puzzle.hintsAllowed;
      state.studentName = { nom: "", cognoms: "" };
      stopTimer();
      resetPuzzleProgress();
      setStatus(t.msg_success, "success");
      render();
      if (openStudent) sessionController.setTab("student");
    } catch (err) {
      const wordTooLong = err.message?.startsWith("WORD_TOO_LONG:");
      const errMsg = wordTooLong
        ? (t.msg_puzzle_word_too_long || err.message).replace("{word}", err.message.slice("WORD_TOO_LONG:".length))
        : (t.msg_puzzle_error || err.message);
      setStatus(errMsg, "error");
    } finally {
      if (triggerButton) triggerButton.textContent = originalTriggerText;
      if (dom.generateButton) dom.generateButton.textContent = t.btn_generate;
      if (dom.generateOpenButton) dom.generateOpenButton.textContent = t.btn_generate_open_student;
      teacherController.updateWordsHelper();
    }
  }

  dom.form.addEventListener("submit", e => {
    e.preventDefault();
    generatePuzzle({ triggerButton: e.submitter || dom.generateButton });
  });
  teacherController.bindEvents();
  sessionController.bindEvents({
    onGenerateOpenStudent: () => generatePuzzle({ openStudent: true, triggerButton: dom.generateOpenButton }),
  });

  if (dom.hintButton) {
    dom.hintButton.addEventListener("click", () => useHint());
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

  // pointercancel fires when the OS interrupts the gesture (e.g. second touch, scroll,
  // window losing focus). Without this, state.dragSelection would stay active and the
  // next interaction would resume the orphaned drag.
  window.addEventListener("pointercancel", () => {
    if (!state.dragSelection) return;
    state.dragSelection = null;
    clearSelection();
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

  function tryLoadFromUrl() {
    const param = new URLSearchParams(window.location.search).get("p");
    if (!param) return false;
    const config = decodePuzzleConfig(param);
    if (!config) return false;

    // Guardar estado previo para rollback
    const prevLang = state.lang;
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
      teacherController.syncWordsUi();
      const metadata = {
        title: config.title,
        requestedSize: config.requestedSize,
        timerDuration: config.timer,
        hintsAllowed: config.hints,
        sourceLang: config.lang,
      };
      state.puzzle = config.version >= SHARED_PUZZLE_VERSION && config.gridRows && config.placementPaths
        ? buildPuzzleFromSnapshot(parsed.words, config, metadata)
        : buildPuzzle(parsed.words, config.size, config.difficulty, metadata);
      state.hintsRemaining = state.puzzle.hintsAllowed;
      resetPuzzleProgress();
      sessionController.setTab("student");
      return true;
    } catch {
      // Rollback al estado previo
      updateLanguage(prevLang || "ca");
      dom.titleInput.value = prevTitle;
      dom.wordsInput.value = prevWords;
      dom.difficultyInput.value = prevDifficulty;
      dom.sizeInput.value = prevSize;
      if (dom.timerInput) dom.timerInput.value = prevTimer;
      if (dom.hintsInput) dom.hintsInput.value = prevHints;
      state.formTemplate = prevFormTemplate;
      state.puzzle = prevPuzzle;
      if (dom.formTemplateInput) dom.formTemplateInput.value = state.formTemplate;
      teacherController.syncWordsUi();
      console.warn("[word-search] Failed to load puzzle from shared URL.");
      return false;
    }
  }

  if (!tryLoadFromUrl()) {
    updateLanguage("ca");
    teacherController.updateWordsHelper();
    sessionController.setTab("teacher");
    if (new URLSearchParams(window.location.search).has("p")) {
      const errParam = new URLSearchParams(window.location.search).get("p");
      const errConfig = errParam ? decodePuzzleConfig(errParam) : null;
      const errLang = errConfig?.lang && TRANSLATIONS[errConfig.lang] ? errConfig.lang : "ca";
      setStatus(TRANSLATIONS[errLang].msg_link_error, "error");
    }
  }
})();
