(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  global.WORD_SEARCH_APP_OFFLINE = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function requestOfflineStatus(worker, { timeout = 3000, Channel = globalThis.MessageChannel } = {}) {
    return new Promise(resolve => {
      const channel = new Channel();
      const finish = value => {
        clearTimeout(timer);
        channel.port1.close();
        channel.port2.close();
        resolve(value);
      };
      const timer = setTimeout(() => finish(null), timeout);
      channel.port1.onmessage = event => {
        const value = event.data;
        finish(typeof value?.revision === "string" && typeof value.complete === "boolean" ? value : null);
      };
      channel.port1.onmessageerror = () => finish(null);
      try {
        worker.postMessage({ type: "OFFLINE_STATUS" }, [channel.port2]);
      } catch {
        finish(null);
      }
    });
  }

  function createOfflineController({ status, icon, updateNote, retry, getTranslations }) {
    let phase = location.protocol === "file:" ? "local" : "preparing";
    let updateAvailable = false;
    let registration = null;
    let sequence = 0;
    let serviceWorker;
    const watchedWorkers = new WeakSet();
    const watchedRegistrations = new WeakSet();
    try { serviceWorker = navigator.serviceWorker; } catch { /* Storage can be denied. */ }
    const supported = phase !== "local" && Boolean(serviceWorker) && window.isSecureContext;
    if (!supported && phase !== "local") phase = "unknown";

    function render() {
      const t = getTranslations();
      const key = phase === "ready" && navigator.onLine === false ? "ready_offline" : phase;
      status.textContent = t[`offline_${key}`];
      status.parentElement.dataset.state = phase;
      icon.textContent = { ready: "✓", preparing: "↻", unknown: "!", local: "⌂" }[phase];
      updateNote.hidden = !updateAvailable;
      updateNote.textContent = t.offline_update;
      retry.hidden = !supported || phase !== "unknown";
      retry.textContent = t.offline_check;
    }

    function watch(next) {
      if (!next) return;
      registration = next;
      if (!watchedRegistrations.has(next)) {
        watchedRegistrations.add(next);
        next.addEventListener("updatefound", () => { watch(next); void check(); });
      }
      for (const worker of [next.installing, next.waiting, next.active]) {
        if (!worker || watchedWorkers.has(worker)) continue;
        watchedWorkers.add(worker);
        worker.addEventListener("statechange", () => { watch(next); void check(); });
      }
    }

    async function check() {
      if (!supported) return render();
      const current = ++sequence;
      try {
        const next = await serviceWorker.getRegistration();
        if (current !== sequence) return;
        watch(next);
        registration = next || null;
        updateAvailable = Boolean(next?.waiting);
        const active = next?.active;
        if (!active || active.state !== "activated") {
          phase = next?.installing || active ? "preparing" : "unknown";
        } else {
          const result = await requestOfflineStatus(active);
          if (current !== sequence) return;
          if (registration?.active !== active) return check();
          phase = result?.complete ? "ready" : "unknown";
        }
      } catch {
        if (current !== sequence) return;
        phase = "unknown";
      }
      render();
    }

    async function register() {
      if (!supported) return;
      try {
        watch(await serviceWorker.register("sw.js", { updateViaCache: "none" }));
      } catch {
        // A failed update must not hide a previous complete offline release.
      }
      await check();
    }

    retry.addEventListener("click", () => {
      phase = "preparing";
      render();
      void register();
    });
    if (supported) {
      window.addEventListener("online", () => { void register(); });
      window.addEventListener("offline", () => { void check(); });
      window.addEventListener("pageshow", () => { void check(); });
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void check();
      });
      serviceWorker.addEventListener("controllerchange", () => { void check(); });
      if (document.readyState === "complete") void register();
      else window.addEventListener("load", () => { void register(); }, { once: true });
    }
    render();
    return Object.freeze({ render, check });
  }

  return Object.freeze({ createOfflineController, requestOfflineStatus });
});
