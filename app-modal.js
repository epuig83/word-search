(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  global.WORD_SEARCH_APP_MODAL = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function createModalController({
    documentRef = globalThis.document,
    requestAnimationFrameRef = globalThis.requestAnimationFrame?.bind(globalThis) || (callback => callback()),
    focusableSelector = DEFAULT_FOCUSABLE_SELECTOR,
  } = {}) {
    let lastFocusedElement = null;

    function getFocusableElements(container) {
      return [...container.querySelectorAll(focusableSelector)].filter(element => !element.hasAttribute("hidden"));
    }

    function openModal(overlay, focusTarget) {
      if (!overlay) return;
      const isHtmlElement = typeof globalThis.HTMLElement === "function"
        ? documentRef.activeElement instanceof globalThis.HTMLElement
        : Boolean(documentRef.activeElement);
      lastFocusedElement = isHtmlElement ? documentRef.activeElement : null;
      overlay.hidden = false;
      documentRef.body.classList.add("has-modal");
      requestAnimationFrameRef(() => {
        const fallbackTarget = overlay.querySelector(".modal-content");
        (focusTarget || getFocusableElements(overlay)[0] || fallbackTarget)?.focus();
      });
    }

    function closeModal(overlay, { restoreFocus = true } = {}) {
      if (!overlay || overlay.hidden) return;
      overlay.hidden = true;
      if (![...documentRef.querySelectorAll(".modal-overlay")].some(modal => !modal.hidden)) {
        documentRef.body.classList.remove("has-modal");
      }
      const focusTarget = restoreFocus ? lastFocusedElement : null;
      lastFocusedElement = null;
      if (focusTarget?.isConnected) {
        requestAnimationFrameRef(() => focusTarget.focus());
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
      if (event.shiftKey && documentRef.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && documentRef.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    return Object.freeze({
      openModal,
      closeModal,
      trapModalFocus,
    });
  }

  return Object.freeze({
    DEFAULT_FOCUSABLE_SELECTOR,
    createModalController,
  });
});
