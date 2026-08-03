(function () {
  "use strict";

  if (location.protocol !== "http:" && location.protocol !== "https:") return;

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
