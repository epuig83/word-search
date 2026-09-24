(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./core.js"));
    return;
  }
  global.WORD_SEARCH_APP_PRINT = factory(global.WORD_SEARCH_CORE);
})(typeof globalThis !== "undefined" ? globalThis : this, function (core) {
  "use strict";

  function placementSignature(puzzle) {
    return JSON.stringify(puzzle.placements.map(placement => [
      placement.wordId,
      placement.cells.map(cell => `${cell.row}.${cell.col}`).sort(),
    ]).sort((a, b) => a[0].localeCompare(b[0])));
  }

  async function buildVariantBatch(puzzle, count, {
    previous = [],
    generate = core.buildPuzzleData,
    now = Date.now,
    yieldFrame = () => new Promise(resolve => setTimeout(resolve, 0)),
    cancelled = () => false,
    onProgress = () => {},
  } = {}) {
    if (![2, 3, 4].includes(count)) throw new Error("INVALID_COUNT");
    const models = previous[0] === puzzle ? previous.slice(0, count) : [puzzle];
    const placements = new Set(models.map(placementSignature));
    const grids = new Set(models.map(model => JSON.stringify(model.grid)));
    const deadline = now() + 6000;
    function check() {
      if (cancelled()) throw new Error("CANCELLED");
      if (now() >= deadline) throw new Error("GENERATION_FAILED");
    }
    while (models.length < count) {
      let candidate = null;
      onProgress(models.length + 1, count);
      for (let attempt = 0; attempt < 3; attempt++) {
        await yieldFrame();
        check();
        try {
          candidate = generate(puzzle.words, String(puzzle.actualSize), puzzle.difficulty, {
            title: puzzle.title,
            sourceLang: puzzle.sourceLang,
            timerDuration: puzzle.timerDuration,
            hintsAllowed: puzzle.hintsAllowed,
          });
        } catch {
          candidate = null;
        }
        check();
        if (candidate && !placements.has(placementSignature(candidate)) && !grids.has(JSON.stringify(candidate.grid))) break;
        candidate = null;
      }
      if (!candidate) throw new Error("GENERATION_FAILED");
      placements.add(placementSignature(candidate));
      grids.add(JSON.stringify(candidate.grid));
      models.push(candidate);
    }
    check();
    return models;
  }

  function createPrintController({ getPuzzle, getTranslations, requireCurrentActivity, openModal, closeModal, trapModalFocus }) {
    const modal = document.querySelector("#variants-modal");
    const form = document.querySelector("#variants-form");
    const countInput = document.querySelector("#variants-count");
    const solutionsInput = document.querySelector("#variants-solutions");
    const prepare = document.querySelector("#variants-prepare");
    const print = document.querySelector("#variants-print");
    const close = document.querySelector("#variants-close");
    const status = document.querySelector("#variants-status");
    const preview = document.querySelector("#variants-preview");
    const root = document.querySelector("#variant-print-root");
    let source = null;
    let models = [];
    let ready = false;
    let busy = false;
    let generation = 0;

    function element(tag, className, text) {
      const node = document.createElement(tag);
      node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    // One ring per word, drawn over the letters in cell units (the grid has no gaps),
    // so a teacher can see where each word starts and ends even where words cross.
    // Strokes are foreground ink: they print without "Background graphics".
    function createAnswerMarks(puzzle) {
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("class", "variant-marks");
      svg.setAttribute("viewBox", `0 0 ${puzzle.actualSize} ${puzzle.actualSize}`);
      svg.setAttribute("aria-hidden", "true");
      puzzle.placements.forEach((placement, index) => {
        const first = placement.cells[0];
        const last = placement.cells[placement.cells.length - 1];
        const length = Math.hypot(last.row - first.row, last.col - first.col);
        const angle = Math.atan2(last.row - first.row, last.col - first.col) * 180 / Math.PI;
        const ring = document.createElementNS(ns, "rect");
        ring.setAttribute("class", `variant-mark wc-${index % 5}`);
        ring.setAttribute("x", "-0.4");
        ring.setAttribute("y", "-0.4");
        ring.setAttribute("width", String(length + 0.8));
        ring.setAttribute("height", "0.8");
        ring.setAttribute("rx", "0.4");
        ring.setAttribute("transform", `translate(${first.col + 0.5} ${first.row + 0.5}) rotate(${angle})`);
        svg.append(ring);
      });
      return svg;
    }

    // `single` prints the current activity on its own (worksheet or answer key)
    // with the same sheet as the variants, so every printout shares one style.
    function createSheet(puzzle, index, solution = false, { single = false } = {}) {
      const t = getTranslations();
      const label = t.variants_model.replace("{model}", String.fromCharCode(65 + index));
      const sheet = element("article", "variant-sheet");
      sheet.dataset.model = String.fromCharCode(65 + index);
      sheet.dataset.solution = String(solution);
      sheet.classList.toggle("is-dense", puzzle.words.length > 24 || puzzle.actualSize > 16);
      const sheetLabel = single
        ? (solution ? t.print_solution_suffix : "")
        : (solution ? `${label} · ${t.print_solution_suffix}` : label);
      if (sheetLabel) sheet.append(element("p", "variant-label", sheetLabel));
      sheet.append(element("h3", "variant-title", puzzle.title));
      if (!solution) {
        const meta = element("div", "variant-meta");
        meta.append(element("span", "", `${t.print_name_label}:`), element("span", "", `${t.print_date_label}:`));
        sheet.append(meta, element("p", "variant-instructions", t.print_instructions));
      }
      const answers = new Set(solution ? puzzle.placements.flatMap(placement => placement.cells.map(cell => `${cell.row}.${cell.col}`)) : []);
      const grid = element("div", "variant-grid");
      grid.style.setProperty("--variant-size", puzzle.actualSize);
      grid.dataset.size = String(puzzle.actualSize);
      grid.setAttribute("role", "img");
      grid.setAttribute("aria-label", single ? t.grid_label : `${label}: ${t.grid_label}`);
      puzzle.grid.forEach((row, rowIndex) => row.forEach((letter, colIndex) => {
        const cell = element("span", "variant-cell", letter);
        cell.setAttribute("aria-hidden", "true");
        if (answers.has(`${rowIndex}.${colIndex}`)) cell.classList.add("is-answer");
        grid.append(cell);
      }));
      if (solution) grid.append(createAnswerMarks(puzzle));
      const words = element("ul", "variant-words");
      puzzle.words.forEach(word => words.append(element("li", "", word.display)));
      sheet.append(grid, words);
      if (!solution) sheet.append(element("p", "variant-learning", t.learning_prompt));
      return sheet;
    }

    function clearPrint() {
      delete document.body.dataset.printVariants;
      root.classList.remove("is-measuring");
      root.replaceChildren();
    }

    function sheetsFit() {
      root.classList.add("is-measuring");
      const fits = [...root.children].every(sheet => sheet.scrollHeight <= sheet.clientHeight + 1 && sheet.scrollWidth <= sheet.clientWidth + 1);
      root.classList.remove("is-measuring");
      return fits;
    }

    function stagePrint() {
      clearPrint();
      const selected = models.slice(0, Number(countInput.value));
      selected.forEach((puzzle, index) => root.append(createSheet(puzzle, index)));
      if (solutionsInput.checked) selected.forEach((puzzle, index) => root.append(createSheet(puzzle, index, true)));
      return sheetsFit();
    }

    // Returns false when the sheet does not fit one A4 page, so the caller can fall
    // back to printing the on-screen board.
    function printSheet({ solution = false } = {}) {
      const puzzle = getPuzzle();
      if (!puzzle) return false;
      clearPrint();
      root.append(createSheet(puzzle, 0, solution, { single: true }));
      if (!sheetsFit()) {
        clearPrint();
        return false;
      }
      document.body.dataset.printVariants = "true";
      // Synchronous with the user's tap for Safari's print dialog.
      try { window.print(); } catch { clearPrint(); }
      return true;
    }

    function showPreview() {
      const count = Number(countInput.value);
      ready = source === getPuzzle() && models.length >= count;
      preview.replaceChildren();
      if (ready) {
        models.slice(0, count).forEach((model, index) => preview.append(createSheet(model, index)));
        ready = stagePrint();
        status.textContent = ready
          ? getTranslations().variants_summary.replace("{count}", count).replace("{pages}", count * (solutionsInput.checked ? 2 : 1))
          : getTranslations().variants_too_large;
      } else {
        clearPrint();
        // #variants-intro already explains the models; repeating it here read twice.
        status.textContent = "";
      }
      print.disabled = !ready || busy;
    }

    function setBusy(value) {
      busy = value;
      countInput.disabled = value;
      solutionsInput.disabled = value;
      prepare.disabled = value;
      print.disabled = value || !ready;
      preview.setAttribute("aria-busy", String(value));
    }

    function dismiss() {
      generation++;
      setBusy(false);
      clearPrint();
      closeModal(modal);
    }

    document.querySelector("#teacher-variants-button").addEventListener("click", event => {
      if (!getPuzzle() || !requireCurrentActivity()) return;
      if (source !== getPuzzle()) {
        source = getPuzzle();
        models = [];
        countInput.value = "2";
        solutionsInput.checked = true;
      }
      // Safari does not focus a button on pointer activation. Record the actual
      // launcher so closing the dialog restores a useful place in every engine.
      event.currentTarget.focus({ preventScroll: true });
      openModal(modal, countInput);
      showPreview();
    });
    countInput.addEventListener("change", showPreview);
    solutionsInput.addEventListener("change", showPreview);
    close.addEventListener("click", dismiss);
    modal.addEventListener("click", event => { if (event.target === modal) dismiss(); });
    modal.addEventListener("keydown", event => {
      if (event.key === "Escape") { event.preventDefault(); dismiss(); }
      else trapModalFocus(event, modal);
    });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (busy || !requireCurrentActivity() || source !== getPuzzle()) return;
      const current = ++generation;
      setBusy(true);
      ready = false;
      preview.replaceChildren();
      clearPrint();
      try {
        const result = await buildVariantBatch(source, Number(countInput.value), {
          previous: models,
          cancelled: () => current !== generation || source !== getPuzzle(),
          onProgress: (index, total) => {
            status.textContent = getTranslations().variants_generating.replace("{model}", String.fromCharCode(64 + index)).replace("{count}", total);
          },
        });
        await document.fonts.ready;
        if (current !== generation || source !== getPuzzle()) return;
        // Keep already generated models when the user chooses a smaller batch.
        if (result.length > models.length) models = result;
        setBusy(false);
        showPreview();
        if (ready) print.focus();
      } catch (error) {
        if (current === generation && error.message !== "CANCELLED") {
          status.textContent = getTranslations().variants_error;
          setBusy(false);
          prepare.focus();
        }
      } finally {
        if (current === generation) setBusy(false);
      }
    });
    print.addEventListener("click", () => {
      if (!ready || busy || !requireCurrentActivity() || source !== getPuzzle()) return;
      if (!stagePrint()) {
        ready = false;
        print.disabled = true;
        status.textContent = getTranslations().variants_too_large;
        return;
      }
      document.body.dataset.printVariants = "true";
      // Keep the call synchronous with the user's tap for Safari's print dialog.
      try { window.print(); } catch {
        clearPrint();
        status.textContent = getTranslations().variants_print_error;
      }
    });
    window.addEventListener("afterprint", clearPrint);
    window.matchMedia("print").addEventListener("change", event => { if (!event.matches) clearPrint(); });

    return Object.freeze({
      updateLanguage() { if (!modal.hidden && !busy) showPreview(); },
      printSheet,
    });
  }

  return Object.freeze({ buildVariantBatch, placementSignature, createPrintController });
});
