(function () {
  "use strict";

  // index.html is pre-rendered in Catalan. Send a visitor who last chose es/en to
  // the matching pre-rendered page before the Catalan markup paints. Shared links
  // (?p=) and explicit ?lang= keep app.js in charge of the language.
  try {
    const lang = localStorage.getItem("word-search-lang-v1");
    const params = new URLSearchParams(location.search);
    if ((lang === "es" || lang === "en") && !params.has("p") && !params.has("lang") &&
      !/\/(es|en)\.html$/.test(location.pathname)) {
      location.replace(`${lang}.html${location.search}${location.hash}`);
      return;
    }
  } catch {
    // Storage can be denied; app.js still applies the language after loading.
  }

  if (location.protocol !== "http:" && location.protocol !== "https:") return;

  // Local files cannot install a PWA; WebKit rejects their manifest request.
  const manifest = document.querySelector('link[rel="manifest"]');
  manifest.href = manifest.dataset.href;

  document.documentElement.dataset.fonts = "andika";
  [
    "assets/fonts/andika-regular-latin.woff2",
    "assets/fonts/andika-bold-latin.woff2",
  ].forEach(href => {
    const preload = document.createElement("link");
    preload.rel = "preload";
    preload.as = "font";
    preload.type = "font/woff2";
    preload.crossOrigin = "anonymous";
    preload.href = href;
    document.head.appendChild(preload);
  });
})();
