const test = require("node:test");
const assert = require("node:assert/strict");

const modalModule = require("../../app-modal.js");

function createFakeElement(attributes = {}) {
  const attrs = new Map(Object.entries(attributes));
  return {
    focused: 0,
    hasAttribute: name => attrs.has(name),
    getAttribute: name => (attrs.has(name) ? attrs.get(name) : null),
    setAttribute(name, value) {
      attrs.set(name, String(value));
    },
    focus() {
      this.focused += 1;
    },
    isConnected: true,
  };
}

// Mirrors #pin-modal: an autocomplete honeypot the browser never tabs to, then the
// controls a keyboard user actually reaches.
function createModalFixture() {
  const honeypot = createFakeElement({ tabindex: "-1", "aria-hidden": "true" });
  const pinInput = createFakeElement();
  const submit = createFakeElement();
  const cancel = createFakeElement();
  const overlay = {
    hidden: false,
    querySelectorAll: () => [honeypot, pinInput, submit, cancel],
    querySelector: () => null,
    classList: { add() {}, remove() {} },
  };
  return { overlay, honeypot, pinInput, submit, cancel };
}

function createController(activeElement) {
  const documentRef = {
    activeElement,
    body: { classList: { add() {}, remove() {} } },
    querySelectorAll: () => [],
  };
  const controller = modalModule.createModalController({
    documentRef,
    requestAnimationFrameRef: callback => callback(),
  });
  return { controller, documentRef };
}

function tabEvent(shiftKey) {
  return { key: "Tab", shiftKey, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
}

test("focus trap ignores elements the browser will never tab to", () => {
  const { overlay, honeypot, pinInput, cancel } = createModalFixture();
  const { controller } = createController(pinInput);

  const event = tabEvent(true);
  controller.trapModalFocus(event, overlay);

  // pinInput is the real first focusable, so Shift+Tab must wrap to the last one.
  // While the honeypot counted as first, this branch never ran and focus escaped.
  assert.equal(event.defaultPrevented, true);
  assert.equal(cancel.focused, 1);
  assert.equal(honeypot.focused, 0);
});

test("focus trap wraps forward to the first real focusable, not the honeypot", () => {
  const { overlay, honeypot, pinInput, cancel } = createModalFixture();
  const { controller } = createController(cancel);

  const event = tabEvent(false);
  controller.trapModalFocus(event, overlay);

  assert.equal(event.defaultPrevented, true);
  assert.equal(pinInput.focused, 1);
  assert.equal(honeypot.focused, 0);
});

test("focus trap leaves Tab alone in the middle of the modal", () => {
  const { overlay, submit } = createModalFixture();
  const { controller } = createController(submit);

  const event = tabEvent(false);
  controller.trapModalFocus(event, overlay);

  assert.equal(event.defaultPrevented, false);
});

test("hidden elements stay out of the focus order", () => {
  const visible = createFakeElement();
  const hidden = createFakeElement({ hidden: "" });
  const overlay = {
    hidden: false,
    querySelectorAll: () => [hidden, visible],
    querySelector: () => null,
  };
  const { controller } = createController(visible);

  const event = tabEvent(true);
  controller.trapModalFocus(event, overlay);

  assert.equal(hidden.focused, 0);
  assert.equal(visible.focused, 1);
});

test("openModal focuses the requested target and closeModal restores focus", () => {
  const { overlay, pinInput } = createModalFixture();
  const opener = createFakeElement();
  const { controller, documentRef } = createController(opener);
  overlay.hidden = true;

  controller.openModal(overlay, pinInput);
  assert.equal(overlay.hidden, false);
  assert.equal(pinInput.focused, 1);

  documentRef.activeElement = pinInput;
  controller.closeModal(overlay);
  assert.equal(overlay.hidden, true);
  assert.equal(opener.focused, 1);
});

test("closeModal can skip focus restore", () => {
  const { overlay, pinInput } = createModalFixture();
  const opener = createFakeElement();
  const { controller } = createController(opener);
  overlay.hidden = true;

  controller.openModal(overlay, pinInput);
  controller.closeModal(overlay, { restoreFocus: false });
  assert.equal(opener.focused, 0);
});
