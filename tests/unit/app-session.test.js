const test = require("node:test");
const assert = require("node:assert/strict");

const sessionModule = require("../../app-session.js");
require("../../i18n.js");

const TRANSLATIONS = globalThis.WORD_SEARCH_I18N;

function createClassList() {
  const classes = new Set();
  return {
    toggle(name, force) {
      if (force === undefined) {
        if (classes.has(name)) classes.delete(name);
        else classes.add(name);
        return classes.has(name);
      }
      if (force) classes.add(name);
      else classes.delete(name);
      return force;
    },
    contains(name) {
      return classes.has(name);
    },
  };
}

function createFakeElement(overrides = {}) {
  const listeners = new Map();
  const attributes = new Map();
  return {
    hidden: false,
    disabled: false,
    value: "",
    textContent: "",
    className: "",
    open: false,
    placeholder: "",
    style: {},
    dataset: {},
    classList: createClassList(),
    addEventListener(type, handler) {
      const handlers = listeners.get(type) || [];
      handlers.push(handler);
      listeners.set(type, handlers);
    },
    dispatch(type, eventInit = {}) {
      const handlers = listeners.get(type) || [];
      const event = {
        type,
        currentTarget: this,
        target: this,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...eventInit,
      };
      handlers.forEach(handler => handler(event));
      return event;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.get(name);
    },
    ...overrides,
  };
}

function withBrowserGlobals(run, windowOverrides = {}) {
  const previousWindow = global.window;
  const previousDocument = global.document;
  const openCalls = [];
  const fakeWindow = {
    confirm: () => true,
    open: (...args) => {
      openCalls.push(args);
    },
    ...windowOverrides,
  };
  const fakeDocument = {
    body: {
      dataset: {},
    },
  };

  global.window = fakeWindow;
  global.document = fakeDocument;

  try {
    return run({ window: fakeWindow, document: fakeDocument, openCalls });
  } finally {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
    if (previousDocument === undefined) delete global.document;
    else global.document = previousDocument;
  }
}

function createFixture() {
  const calls = {
    openModal: [],
    closeModal: [],
    focusStudentStartButton: 0,
    focusGridCell: [],
    setFocusedCell: [],
    stopTimer: 0,
    startTimer: [],
    clearSelection: 0,
    render: 0,
    updateHintButton: 0,
    resetPuzzleProgress: 0,
    closeWordDefinitionModal: 0,
    printCurrentPuzzle: 0,
    shareCurrentPuzzle: [],
    saveTeacherPin: [],
    buildFormSubmitUrl: [],
  };

  const dom = {
    tabTeacher: createFakeElement(),
    tabStudent: createFakeElement(),
    sectionTeacher: createFakeElement({ hidden: false }),
    sectionStudent: createFakeElement({ hidden: true }),
    teacherTools: createFakeElement({ open: true }),
    studentNameModal: createFakeElement(),
    studentNomInput: createFakeElement(),
    studentCognomsInput: createFakeElement(),
    solutionToggleButton: createFakeElement(),
    studentStartButton: createFakeElement(),
    resetProgressButton: createFakeElement(),
    playAgainButton: createFakeElement(),
    printButton: createFakeElement(),
    form: createFakeElement({
      reportValidity() {
        return true;
      },
    }),
    generateOpenButton: createFakeElement(),
    teacherOpenStudentButton: createFakeElement(),
    teacherShareButton: createFakeElement(),
    teacherPrintButton: createFakeElement(),
    shareButton: createFakeElement(),
    pinForm: createFakeElement(),
    pinInput: createFakeElement({ value: "" }),
    pinError: createFakeElement({ style: { display: "none" } }),
    pinCancel: createFakeElement(),
    pinModal: createFakeElement(),
    studentNameForm: createFakeElement(),
    wordDefinitionClose: createFakeElement(),
    wordDefinitionModal: createFakeElement(),
    pinChangeForm: createFakeElement(),
    newPinInput: createFakeElement({ value: "" }),
    confirmPinInput: createFakeElement({ value: "" }),
    pinChangeMessage: createFakeElement({ style: { display: "none" } }),
    pinChangeDetails: createFakeElement({ open: true }),
    sendResultsButton: createFakeElement(),
  };

  const state = {
    lang: "ca",
    puzzle: {
      timerDuration: 300,
      hintsAllowed: 3,
      title: "Animals del bosc",
      words: [{ id: "a" }, { id: "b" }, { id: "c" }],
    },
    activeTab: "teacher",
    mode: "teacher",
    studentSessionStarted: false,
    timerExpired: false,
    timerIntervalId: null,
    timerSecondsLeft: 0,
    formTemplate: "",
    studentName: { nom: "", cognoms: "" },
    pinCallback: null,
    teacherPin: "1234",
    hintsRemaining: 3,
    foundWordIds: new Set(["a", "b"]),
    focusedCell: null,
  };

  const controller = sessionModule.createSessionController({
    dom,
    state,
    getTranslations: () => TRANSLATIONS[state.lang],
    openModal: (...args) => {
      calls.openModal.push(args);
    },
    closeModal: (...args) => {
      calls.closeModal.push(args);
    },
    trapModalFocus() {},
    parseFormEntries: value => (value ? { url: value } : null),
    buildFormSubmitUrl: (...args) => {
      calls.buildFormSubmitUrl.push(args);
      return "https://example.com/form-submit";
    },
    saveTeacherPin: pin => {
      calls.saveTeacherPin.push(pin);
      return true;
    },
    shouldShowStudentStartOverlay: () => true,
    focusStudentStartButton: () => {
      calls.focusStudentStartButton += 1;
    },
    focusGridCell: cell => {
      calls.focusGridCell.push(cell);
    },
    setFocusedCell: cell => {
      calls.setFocusedCell.push(cell);
      state.focusedCell = cell;
      return cell;
    },
    stopTimer: () => {
      calls.stopTimer += 1;
    },
    startTimer: seconds => {
      calls.startTimer.push(seconds);
    },
    clearSelection: () => {
      calls.clearSelection += 1;
    },
    render: () => {
      calls.render += 1;
    },
    updateHintButton: () => {
      calls.updateHintButton += 1;
    },
    resetPuzzleProgress: () => {
      calls.resetPuzzleProgress += 1;
    },
    closeWordDefinitionModal: () => {
      calls.closeWordDefinitionModal += 1;
    },
    printCurrentPuzzle: () => {
      calls.printCurrentPuzzle += 1;
    },
    shareCurrentPuzzle: button => {
      calls.shareCurrentPuzzle.push(button);
    },
  });

  return { controller, dom, state, calls };
}

test("setTab('student') resumes the timer and opens the student-name modal when a form is configured", () => {
  withBrowserGlobals(({ document }) => {
    const { controller, dom, state, calls } = createFixture();
    state.studentSessionStarted = true;
    state.timerSecondsLeft = 120;
    state.formTemplate = "https://forms.example.com";

    controller.setTab("student");

    assert.equal(state.activeTab, "student");
    assert.equal(state.mode, "student");
    assert.equal(document.body.dataset.tab, "student");
    assert.equal(dom.sectionTeacher.hidden, true);
    assert.equal(dom.sectionStudent.hidden, false);
    assert.equal(dom.teacherTools.open, false);
    assert.deepEqual(calls.startTimer, [120]);
    assert.equal(calls.render, 1);
    assert.equal(calls.updateHintButton, 1);
    assert.deepEqual(calls.openModal, [[dom.studentNameModal, dom.studentNomInput]]);
    assert.equal(dom.studentNomInput.placeholder, TRANSLATIONS.ca.name_nom_placeholder);
    assert.equal(dom.studentCognomsInput.placeholder, TRANSLATIONS.ca.name_cognoms_placeholder);
    assert.equal(dom.tabTeacher.getAttribute("aria-selected"), "false");
    assert.equal(dom.tabStudent.getAttribute("aria-selected"), "true");
    assert.equal(dom.tabStudent.classList.contains("is-active"), true);
  });
});

test("startStudentSession marks the session as started and focuses the first grid cell", () => {
  withBrowserGlobals(() => {
    const { controller, state, calls } = createFixture();

    controller.startStudentSession();

    assert.equal(state.studentSessionStarted, true);
    assert.equal(calls.clearSelection, 1);
    assert.deepEqual(calls.startTimer, [300]);
    assert.equal(calls.render, 1);
    assert.deepEqual(calls.setFocusedCell, [{ row: 0, col: 0 }]);
    assert.deepEqual(calls.focusGridCell, [{ row: 0, col: 0 }]);
  });
});

test("pin submission only unlocks the teacher view when the configured PIN matches", () => {
  withBrowserGlobals(() => {
    const { controller, dom, state, calls } = createFixture();
    let unlockCount = 0;
    controller.bindEvents();

    state.pinCallback = () => {
      unlockCount += 1;
    };
    dom.pinInput.value = "0000";
    dom.pinForm.dispatch("submit");

    assert.equal(unlockCount, 0);
    assert.equal(dom.pinError.style.display, "block");
    assert.equal(calls.closeModal.length, 0);

    state.pinCallback = () => {
      unlockCount += 1;
    };
    dom.pinInput.value = "1234";
    dom.pinForm.dispatch("submit");

    assert.equal(unlockCount, 1);
    assert.equal(state.pinCallback, null);
    assert.deepEqual(calls.closeModal, [[dom.pinModal]]);
  });
});

test("sendResultsButton uses the parsed form configuration and opens the expected submit URL", () => {
  withBrowserGlobals(({ openCalls }) => {
    const { controller, dom, state, calls } = createFixture();
    controller.bindEvents();
    state.formTemplate = "https://forms.example.com";
    state.studentName = { nom: "Ada", cognoms: "Lovelace" };

    dom.sendResultsButton.dispatch("click");

    assert.deepEqual(calls.buildFormSubmitUrl, [[
      { url: "https://forms.example.com" },
      "Ada",
      "Lovelace",
      "2/3",
      "Animals del bosc",
    ]]);
    assert.deepEqual(openCalls, [["https://example.com/form-submit", "_blank", "noopener"]]);
  });
});

test("pin change persists the new local teacher PIN and closes the disclosure", () => {
  withBrowserGlobals(() => {
    const { controller, dom, state, calls } = createFixture();
    controller.bindEvents();
    dom.newPinInput.value = "4729";
    dom.confirmPinInput.value = "4729";

    dom.pinChangeForm.dispatch("submit");

    assert.equal(state.teacherPin, "4729");
    assert.deepEqual(calls.saveTeacherPin, ["4729"]);
    assert.equal(dom.pinChangeMessage.textContent, TRANSLATIONS.ca.pin_change_success);
    assert.equal(dom.pinChangeMessage.className, "status-message is-success");
    assert.equal(dom.pinChangeDetails.open, false);
  });
});

test("pin change rejects trivial PINs (repeated digits, ascending/descending sequences)", () => {
  const trivialPins = ["0000", "1111", "9999", "1234", "4321", "12345", "87654321"];
  trivialPins.forEach(pin => {
    withBrowserGlobals(() => {
      const { controller, dom, state, calls } = createFixture();
      controller.bindEvents();
      dom.newPinInput.value = pin;
      dom.confirmPinInput.value = pin;

      dom.pinChangeForm.dispatch("submit");

      assert.equal(state.teacherPin, "1234", `trivial PIN ${pin} should not overwrite state`);
      assert.deepEqual(calls.saveTeacherPin, [], `trivial PIN ${pin} should not be persisted`);
      assert.equal(dom.pinChangeMessage.textContent, TRANSLATIONS.ca.pin_too_simple);
      assert.equal(dom.pinChangeMessage.className, "status-message is-error");
    });
  });
});
