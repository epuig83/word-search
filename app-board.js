(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  global.WORD_SEARCH_APP_BOARD = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createBoardController({
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
  }) {
    function buildGridCellLabel(letter, row, col, flags) {
      const t = getTranslations();
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

    function buildFoundColorMap(trackNewCellsInto) {
      const foundColorMap = new Map();
      state.puzzle.placements.forEach(placement => {
        if (state.foundPlacementIds.has(placement.placementId)) {
          const colorClass = state.foundWordColors.get(placement.wordId) || "wc-0";
          const isNew = trackNewCellsInto && !state.prevFoundPlacementIds.has(placement.placementId);
          placement.cells.forEach(cell => {
            const cellKey = `${cell.row}:${cell.col}`;
            foundColorMap.set(cellKey, colorClass);
            if (isNew) trackNewCellsInto.add(cellKey);
          });
        }
      });
      return foundColorMap;
    }

    function buildSolutionCells() {
      const solutionCells = new Set();
      if (state.mode === "teacher") {
        state.puzzle.placements.forEach(placement => {
          placement.cells.forEach(cell => solutionCells.add(`${cell.row}:${cell.col}`));
        });
      }
      return solutionCells;
    }

    function getGridDensity(size) {
      if (size >= 15) return "ultra-compact";
      if (size >= 13) return "compact";
      if (size >= 11) return "dense";
      return "standard";
    }

    function initGrid() {
      if (!state.puzzle) return;
      const size = state.puzzle.actualSize;
      const density = getGridDensity(size);
      dom.puzzleGrid.innerHTML = "";
      dom.puzzleGrid.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
      dom.puzzleGrid.dataset.gridSize = String(size);
      dom.puzzleGrid.dataset.gridDensity = density;
      if (dom.gridContainer) {
        dom.gridContainer.dataset.gridSize = String(size);
        dom.gridContainer.dataset.gridDensity = density;
      }
      dom.gridCells = new Array(size * size);
      state.puzzle.grid.forEach((row, rowIndex) => {
        row.forEach((letter, colIndex) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "grid-cell";
          button.textContent = letter;
          button.dataset.row = rowIndex;
          button.dataset.col = colIndex;
          button.tabIndex = -1;
          dom.puzzleGrid.appendChild(button);
          dom.gridCells[rowIndex * size + colIndex] = button;
        });
      });
    }

    function initWordList() {
      if (!state.puzzle) return;
      dom.wordList.innerHTML = "";
      dom.wordListItems = new Map();
      const svgCheck = `<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 13l4 4L19 7"/></svg>`;
      state.puzzle.words.forEach(word => {
        const item = document.createElement("li");
        item.className = "word-item";
        const isDefinable = Boolean(getDefinitionTextForWordId(word.id));
        item.dataset.definable = String(isDefinable);
        const textSpan = document.createElement("span");
        textSpan.textContent = word.display;
        const checkSpan = document.createElement("span");
        checkSpan.className = "check-icon";
        checkSpan.innerHTML = svgCheck;
        if (isDefinable) {
          item.classList.add("is-definable");
          item.tabIndex = 0;
          item.setAttribute("role", "button");
          item.setAttribute("aria-haspopup", "dialog");
          item.addEventListener("click", () => openWordDefinition(word.id));
          item.addEventListener("keydown", event => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            openWordDefinition(word.id);
          });
        }
        item.appendChild(textSpan);
        item.appendChild(checkSpan);
        dom.wordList.appendChild(item);
        dom.wordListItems.set(word.id, item);
      });
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
      const t = getTranslations();
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
      const unsolved = state.puzzle.placements.filter(placement => !state.foundPlacementIds.has(placement.placementId));
      if (!unsolved.length) return;
      const placement = unsolved[Math.floor(Math.random() * unsolved.length)];
      const firstCell = placement.cells[0];
      const cellElement = dom.puzzleGrid.querySelector(`[data-row="${firstCell.row}"][data-col="${firstCell.col}"]`);
      if (cellElement) {
        cellElement.classList.add("is-hint");
        setTimeout(() => cellElement.classList.remove("is-hint"), 2000);
      }
      if (state.puzzle.hintsAllowed !== -1) {
        state.hintsRemaining = Math.max(0, state.hintsRemaining - 1);
      }
      updateHintButton();
      setStatus(getTranslations().msg_hint_used, "success");
    }

    function renderGridHighlights() {
      if (!state.puzzle || !dom.gridCells) return;
      const foundColorMap = buildFoundColorMap();
      const previewSet = new Set(state.previewCells.map(cell => `${cell.row}:${cell.col}`));
      const solutionCells = buildSolutionCells();
      const size = state.puzzle.actualSize;

      for (let rowIndex = 0; rowIndex < size; rowIndex++) {
        for (let colIndex = 0; colIndex < size; colIndex++) {
          const key = `${rowIndex}:${colIndex}`;
          const wordColor = foundColorMap.get(key) || "";
          const isAnchor = Boolean(state.clickAnchor && state.clickAnchor.row === rowIndex && state.clickAnchor.col === colIndex);
          const isPreview = previewSet.has(key);
          const isFound = foundColorMap.has(key);
          const isSolution = solutionCells.has(key);
          dom.gridCells[rowIndex * size + colIndex].className = "grid-cell" +
            (isFound ? ` is-found ${wordColor}` : "") +
            (isPreview ? " is-preview" : "") +
            (isAnchor ? " is-anchor" : "") +
            (isSolution ? " is-solution" : "");
        }
      }
    }

    function celebrate() {
      if (prefersReducedMotion()) return;
      if (typeof globalThis.confetti !== "function") return;

      const baseOptions = {
        colors: ["#ff6b00", "#d47a3b", "#0d9488", "#3b82f6", "#8b5cf6", "#facc15"],
        disableForReducedMotion: true,
        ticks: 220,
        gravity: 0.95,
        decay: 0.92,
        startVelocity: 32,
        scalar: 0.95,
        shapes: ["circle", "square"],
        zIndex: 1600,
      };

      globalThis.confetti({
        ...baseOptions,
        particleCount: 52,
        angle: 60,
        spread: 70,
        drift: 0.18,
        origin: { x: 0.18, y: 0.72 },
      });

      window.setTimeout(() => {
        globalThis.confetti({
          ...baseOptions,
          particleCount: 52,
          angle: 120,
          spread: 70,
          drift: -0.18,
          origin: { x: 0.82, y: 0.72 },
        });
      }, 120);

      window.setTimeout(() => {
        globalThis.confetti({
          ...baseOptions,
          particleCount: 28,
          angle: 90,
          spread: 110,
          startVelocity: 24,
          scalar: 0.78,
          drift: 0,
          origin: { x: 0.5, y: 0.54 },
        });
      }, 240);
    }

    function checkMatch(path) {
      if (!path || path.length < 2) return false;
      const key = path.map(cell => `${cell.row}:${cell.col}`).join("|");
      const match = state.puzzle.placements.find(placement => (
        (placement.key === key || placement.reversedKey === key) &&
        !state.foundPlacementIds.has(placement.placementId)
      ));
      if (!match) return false;

      state.foundPlacementIds.add(match.placementId);
      state.foundWordIds.add(match.wordId);
      if (!state.foundWordColors.has(match.wordId)) {
        state.foundWordColors.set(match.wordId, `wc-${state.foundWordColors.size % 5}`);
      }
      setStatus(getTranslations().msg_found.replace("{word}", match.display), "success");
      return true;
    }

    function render() {
      document.body.dataset.mode = state.mode;
      document.body.dataset.tab = state.activeTab;
      dom.studentActions.hidden = !state.puzzle;

      if (!state.puzzle) {
        if (dom.timerDisplay) dom.timerDisplay.hidden = true;
        if (dom.teacherReadyCard) dom.teacherReadyCard.hidden = true;
        if (dom.completionMessage) dom.completionMessage.hidden = true;
        if (dom.gridContainer) dom.gridContainer.classList.remove("is-complete");
        if (dom.gridContainer) {
          delete dom.gridContainer.dataset.gridSize;
          delete dom.gridContainer.dataset.gridDensity;
        }
        delete dom.puzzleGrid.dataset.gridSize;
        delete dom.puzzleGrid.dataset.gridDensity;
        if (dom.boardStatus) {
          dom.boardStatus.textContent = "";
          dom.boardStatus.className = "board-status";
        }
        syncStudentStartOverlay();
        return;
      }

      const t = getTranslations();
      dom.solutionToggleButton.textContent =
        state.mode === "teacher" ? t.btn_hide_solution : t.btn_show_solution;
      dom.solutionToggleButton.classList.toggle("is-active", state.mode === "teacher");
      if (state.mode === "teacher" && dom.teacherTools) dom.teacherTools.open = true;
      if (dom.boardInstructions) dom.boardInstructions.textContent = state.lastBoardInputMode === "keyboard"
        ? t.board_instructions_keyboard || t.board_instructions
        : state.lastBoardInputMode === "touch"
          ? t.board_instructions_touch || t.board_instructions
          : t.board_instructions_pointer || t.board_instructions;
      dom.boardTitle.textContent = state.puzzle.title;
      dom.progressText.textContent = `${state.foundWordIds.size} / ${state.puzzle.words.length}`;
      dom.wordBankCount.textContent = state.puzzle.words.length;
      updateTeacherReadyCard();

      if (dom.timerDisplay) {
        const showTimer = state.puzzle.timerDuration > 0 && (state.studentSessionStarted || state.timerExpired);
        dom.timerDisplay.hidden = !showTimer;
        if (showTimer) {
          const secondsLeft = state.timerSecondsLeft;
          if (secondsLeft <= 0) {
            dom.timerDisplay.textContent = t.timer_expired;
            dom.timerDisplay.classList.remove("is-warning");
            dom.timerDisplay.classList.add("is-expired");
          } else {
            dom.timerDisplay.textContent = formatSecondsAsClock(secondsLeft);
            dom.timerDisplay.classList.toggle("is-warning", secondsLeft <= 60);
            dom.timerDisplay.classList.remove("is-expired");
          }
        } else {
          dom.timerDisplay.textContent = "00:00";
          dom.timerDisplay.classList.remove("is-warning", "is-expired");
        }
      }

      syncStudentStartOverlay();

      const newlyFoundCells = new Set();
      const foundColorMap = buildFoundColorMap(newlyFoundCells);
      state.prevFoundPlacementIds = new Set(state.foundPlacementIds);

      if (!dom.wordListItems) initWordList();
      state.puzzle.words.forEach(word => {
        const solved = state.foundWordIds.has(word.id);
        const colorClass = solved ? (state.foundWordColors.get(word.id) || "wc-0") : "";
        const item = dom.wordListItems.get(word.id);
        if (item) {
          item.className = "word-item" +
            (item.dataset.definable === "true" ? " is-definable" : "") +
            (solved ? ` is-found ${colorClass}` : "");
        }
      });
      if (state.activeDefinitionWordId) renderWordDefinitionModal();

      if (!dom.gridCells) initGrid();
      dom.puzzleGrid.setAttribute("aria-label", t.grid_label);
      if (!state.focusedCell || state.focusedCell.row >= state.puzzle.actualSize || state.focusedCell.col >= state.puzzle.actualSize) {
        state.focusedCell = { row: 0, col: 0 };
      }

      const solutionCells = buildSolutionCells();
      const previewSet = new Set(state.previewCells.map(cell => `${cell.row}:${cell.col}`));
      const gridSize = state.puzzle.actualSize;
      state.puzzle.grid.forEach((row, rowIndex) => {
        row.forEach((letter, colIndex) => {
          const key = `${rowIndex}:${colIndex}`;
          const wordColor = foundColorMap.get(key) || "";
          const isAnchor = Boolean(state.clickAnchor && state.clickAnchor.row === rowIndex && state.clickAnchor.col === colIndex);
          const isPreview = previewSet.has(key);
          const isFound = foundColorMap.has(key);
          const isSolution = solutionCells.has(key);
          const button = dom.gridCells[rowIndex * gridSize + colIndex];
          button.className = "grid-cell" +
            (isFound ? ` is-found ${wordColor}` : "") +
            (newlyFoundCells.has(key) ? " is-found-new" : "") +
            (isPreview ? " is-preview" : "") +
            (isAnchor ? " is-anchor" : "") +
            (isSolution ? " is-solution" : "");
          button.tabIndex = sameCell(state.focusedCell, { row: rowIndex, col: colIndex }) ? 0 : -1;
          button.setAttribute("aria-label", buildGridCellLabel(letter, rowIndex, colIndex, { isAnchor, isPreview, isFound, isSolution }));
        });
      });

      const isComplete = state.foundWordIds.size === state.puzzle.words.length;
      const formParsed = state.formTemplate ? parseFormEntries(state.formTemplate) : null;
      const hasSendResults = Boolean(isComplete && formParsed);
      if (dom.gridContainer) dom.gridContainer.classList.toggle("is-complete", isComplete);
      dom.completionMessage.hidden = !isComplete;
      if (dom.completionNote) dom.completionNote.hidden = hasSendResults;
      if (dom.sendResultsButton) dom.sendResultsButton.hidden = !hasSendResults;
      if (dom.completionTime) {
        if (isComplete && state.puzzle.timerDuration > 0) {
          const elapsed = state.puzzle.timerDuration - state.timerSecondsLeft;
          dom.completionTime.textContent = t.completion_time.replace("{time}", formatSecondsAsClock(Math.max(0, elapsed)));
          dom.completionTime.hidden = false;
        } else {
          dom.completionTime.hidden = true;
        }
      }
      if (dom.playAgainButton) dom.playAgainButton.hidden = !isComplete;
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
        if (!state.celebrated) {
          celebrate();
          revealCompletionMessage();
          state.celebrated = true;
        }
      }

      updateHintButton();
      if (dom.shareButton) dom.shareButton.disabled = !state.puzzle;
    }

    return Object.freeze({
      checkMatch,
      render,
      renderGridHighlights,
      updateHintButton,
      useHint,
    });
  }

  return Object.freeze({
    createBoardController,
  });
});
