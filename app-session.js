(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  global.WORD_SEARCH_APP_SESSION = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function createSessionController({
    dom,
    state,
    getTranslations,
    openModal,
    closeModal,
    trapModalFocus,
    parseFormEntries,
    buildFormSubmitUrl,
    saveTeacherPin,
    refreshDefaultPinWarning,
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
    confirmDialog,
  }) {
    function isTrivialPin(pin) {
      if (/^(\d)\1+$/.test(pin)) return true;
      const ascending = "0123456789";
      const descending = "9876543210";
      if (ascending.includes(pin) || descending.includes(pin)) return true;
      return false;
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
      closeWordDefinitionModal({ restoreFocus: false });
      state.activeTab = tab;
      document.body.dataset.tab = tab;
      dom.tabTeacher.classList.toggle("is-active", tab === "teacher");
      dom.tabTeacher.setAttribute("aria-selected", String(tab === "teacher"));
      dom.tabTeacher.tabIndex = tab === "teacher" ? 0 : -1;
      dom.tabStudent.classList.toggle("is-active", tab === "student");
      dom.tabStudent.setAttribute("aria-selected", String(tab === "student"));
      dom.tabStudent.tabIndex = tab === "student" ? 0 : -1;
      dom.sectionTeacher.hidden = tab !== "teacher";
      dom.sectionStudent.hidden = tab !== "student";

      if (tab !== "student") {
        return;
      }

      state.mode = "student";
      if (dom.teacherTools) dom.teacherTools.open = false;
      if (
        state.puzzle &&
        state.studentSessionStarted &&
        state.puzzle.timerDuration > 0 &&
        !state.timerExpired &&
        !state.timerPaused &&
        state.timerIntervalId === null &&
        state.timerSecondsLeft > 0
      ) {
        startTimer(state.timerSecondsLeft);
      }
      render();
      updateHintButton();

      const formParsed = state.formTemplate ? parseFormEntries(state.formTemplate) : null;
      if (formParsed && !state.studentName.nom && dom.studentNameModal) {
        const t = getTranslations();
        if (dom.studentNomInput) dom.studentNomInput.placeholder = t.name_nom_placeholder;
        if (dom.studentCognomsInput) dom.studentCognomsInput.placeholder = t.name_cognoms_placeholder;
        openModal(dom.studentNameModal, dom.studentNomInput);
      } else if (shouldShowStudentStartOverlay()) {
        focusStudentStartButton();
      }
    }

    function openPinModal(callback) {
      state.pinCallback = callback;
      if (dom.pinInput) dom.pinInput.value = "";
      if (dom.pinError) dom.pinError.style.display = "none";
      openModal(dom.pinModal, dom.pinInput);
    }

    function dismissPinModal() {
      closeModal(dom.pinModal);
      state.pinCallback = null;
    }

    function bindEvents() {
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

      // resetPuzzleProgress() already restores hintsRemaining from the puzzle.
      const restartPuzzle = () => {
        resetPuzzleProgress();
        render();
        if (shouldShowStudentStartOverlay()) focusStudentStartButton();
      };

      dom.resetProgressButton.addEventListener("click", async () => {
        const ok = await confirmDialog({ message: getTranslations().msg_confirm_reset });
        if (!ok) return;
        restartPuzzle();
      });

      if (dom.playAgainButton) {
        dom.playAgainButton.addEventListener("click", restartPuzzle);
      }

      dom.printButton.addEventListener("click", () => printCurrentPuzzle());
      dom.tabTeacher.addEventListener("click", () => {
        if (state.activeTab === "teacher") return;
        openPinModal(() => {
          stopTimer();
          setTab("teacher");
        });
      });
      dom.tabStudent.addEventListener("click", () => setTab("student"));

      const tabs = [dom.tabTeacher, dom.tabStudent];
      tabs.forEach((tab, index) => {
        tab.addEventListener("keydown", event => {
          let nextIndex = null;
          if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
          if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
          if (event.key === "Home") nextIndex = 0;
          if (event.key === "End") nextIndex = tabs.length - 1;
          if (nextIndex === null) return;
          event.preventDefault();
          tabs.forEach((candidate, candidateIndex) => {
            candidate.tabIndex = candidateIndex === nextIndex ? 0 : -1;
          });
          tabs[nextIndex].focus();
        });
      });

      dom.teacherOpenStudentButton?.addEventListener("click", () => {
        if (state.puzzle) setTab("student");
      });
      dom.teacherShareButton?.addEventListener("click", () => shareCurrentPuzzle(dom.teacherShareButton));
      dom.teacherPrintButton?.addEventListener("click", () => printCurrentPuzzle());
      dom.shareButton?.addEventListener("click", () => shareCurrentPuzzle(dom.shareButton));

      dom.pinForm?.addEventListener("submit", event => {
        event.preventDefault();
        const pin = (dom.pinInput?.value || "").trim();
        if (pin === state.teacherPin) {
          const callback = state.pinCallback;
          closeModal(dom.pinModal);
          state.pinCallback = null;
          callback?.();
          return;
        }
        if (dom.pinError) dom.pinError.style.display = "block";
      });

      dom.pinCancel?.addEventListener("click", () => dismissPinModal());

      dom.pinModal?.addEventListener("click", event => {
        if (event.target === event.currentTarget) {
          dismissPinModal();
        }
      });

      dom.pinModal?.addEventListener("keydown", event => {
        trapModalFocus(event, dom.pinModal);
        if (event.key === "Escape") {
          event.preventDefault();
          dismissPinModal();
        }
      });

      dom.studentNameModal?.addEventListener("keydown", event => {
        trapModalFocus(event, dom.studentNameModal);
      });

      if (dom.studentNameForm) {
        dom.studentNameForm.addEventListener("submit", event => {
          event.preventDefault();
          const nom = dom.studentNomInput?.value.trim() || "";
          if (!nom) return;
          state.studentName = { nom, cognoms: dom.studentCognomsInput?.value.trim() || "" };
          closeModal(dom.studentNameModal, { restoreFocus: false });
          render();
          if (shouldShowStudentStartOverlay()) {
            focusStudentStartButton();
            return;
          }
          focusGridCell(setFocusedCell(state.focusedCell || { row: 0, col: 0 }));
        });
      }

      dom.wordDefinitionClose?.addEventListener("click", () => {
        closeWordDefinitionModal();
      });

      dom.wordDefinitionModal?.addEventListener("click", event => {
        if (event.target === event.currentTarget) {
          closeWordDefinitionModal();
        }
      });

      dom.wordDefinitionModal?.addEventListener("keydown", event => {
        trapModalFocus(event, dom.wordDefinitionModal);
        if (event.key === "Escape") {
          event.preventDefault();
          closeWordDefinitionModal();
        }
      });

      if (dom.pinChangeForm) {
        dom.pinChangeForm.addEventListener("submit", event => {
          event.preventDefault();
          const t = getTranslations();
          const newPin = dom.newPinInput.value.trim();
          const confirmPin = dom.confirmPinInput.value.trim();
          dom.pinChangeMessage.style.display = "block";
          if (!/^\d{4,8}$/.test(newPin)) {
            dom.pinChangeMessage.textContent = t.pin_too_short;
            dom.pinChangeMessage.className = "status-message is-error";
            return;
          }
          if (isTrivialPin(newPin)) {
            dom.pinChangeMessage.textContent = t.pin_too_simple;
            dom.pinChangeMessage.className = "status-message is-error";
            return;
          }
          if (newPin !== confirmPin) {
            dom.pinChangeMessage.textContent = t.pin_change_mismatch;
            dom.pinChangeMessage.className = "status-message is-error";
            return;
          }
          state.teacherPin = newPin;
          if (!saveTeacherPin(newPin)) {
            dom.pinChangeMessage.textContent = t.msg_storage_unavailable;
            dom.pinChangeMessage.className = "status-message is-error";
            return;
          }
          dom.newPinInput.value = "";
          dom.confirmPinInput.value = "";
          dom.pinChangeMessage.textContent = t.pin_change_success;
          dom.pinChangeMessage.className = "status-message is-success";
          if (dom.pinChangeDetails) dom.pinChangeDetails.open = false;
          refreshDefaultPinWarning?.();
        });
      }

      if (dom.sendResultsButton) {
        dom.sendResultsButton.addEventListener("click", () => {
          const formParsed = state.formTemplate ? parseFormEntries(state.formTemplate) : null;
          if (!formParsed || !state.puzzle) return;
          if (typeof navigator !== "undefined" && navigator.onLine === false) {
            if (dom.boardStatus) dom.boardStatus.textContent = getTranslations().msg_send_offline;
            return;
          }
          const total = state.puzzle.words.length;
          const found = state.foundWordIds.size;
          const resultat = `${found}/${total}`;
          const url = buildFormSubmitUrl(
            formParsed,
            state.studentName.nom,
            state.studentName.cognoms,
            resultat,
            state.puzzle.title || ""
          );
          window.open(url, "_blank", "noopener");
        });
      }
    }

    return Object.freeze({
      bindEvents,
      setTab,
      startStudentSession,
    });
  }

  return Object.freeze({
    createSessionController,
  });
});
