const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "index.html");
const source = fs.readFileSync(sourcePath, "utf8");

const variants = {
  es: {
    title: "Generador de Sopas de Letras para Primaria",
    description: "Generador de sopas de letras para primaria, listo para usar en portátil o imprimir.",
    socialDescription: "Crea sopas de letras personalizadas para el aula en segundos. Perfectas para imprimir o usar con ordenador.",
    siteName: "Generador de Sopas de Letras",
    locale: "es_ES",
    alternateLocales: ["ca_ES", "en_US"],
  },
  en: {
    title: "Word Search Generator for Primary School",
    description: "Word search generator for primary school, ready to use on laptops or print.",
    socialDescription: "Create custom classroom word searches in seconds. Perfect for printing or using on a computer.",
    siteName: "Word Search Generator",
    locale: "en_US",
    alternateLocales: ["ca_ES", "es_ES"],
  },
};

require(path.join(root, "i18n.js"));
const translations = globalThis.WORD_SEARCH_I18N;

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/"/g, "&quot;").replace(/\n/g, "&#10;");
}

// Pre-render the text app.js would set through data-t, so crawlers and slow first
// loads see the page language instead of Catalan until the scripts run. Only
// text-only elements are touched, matching what textContent replaces at runtime.
function translateTextNodes(content, strings) {
  return content.replace(
    /(<([a-z][a-z0-9]*)\b[^>]*\sdata-t="([^"]+)"[^>]*>)([^<]*)(<\/\2>)/g,
    (match, open, tag, key, text, close) => (strings[key] ? `${open}${escapeHtml(strings[key])}${close}` : match)
  );
}

function translatePlaceholder(content, id, value) {
  const pattern = new RegExp(`(<(?:input|textarea)\\b[^>]*\\sid="${id}"[^>]*\\splaceholder=")[^"]*(")`);
  if (!pattern.test(content)) {
    throw new Error(`Could not generate localized pages: missing placeholder for #${id}.`);
  }
  return content.replace(pattern, `$1${escapeAttribute(value)}$2`);
}

// Default text of elements that app.js fills by id instead of data-t.
function translateById(content, id, value) {
  const pattern = new RegExp(`(<([a-z][a-z0-9]*)\\b[^>]*\\sid="${id}"[^>]*>)[^<]*(<\\/\\2>)`);
  if (!pattern.test(content)) {
    throw new Error(`Could not generate localized pages: missing text for #${id}.`);
  }
  return content.replace(pattern, (match, open, tag, close) => `${open}${escapeHtml(value)}${close}`);
}

function replaceRequired(content, from, to, label) {
  if (!content.includes(from)) {
    throw new Error(`Could not generate localized pages: missing ${label}.`);
  }
  return content.split(from).join(to);
}

for (const [lang, variant] of Object.entries(variants)) {
  const publicUrl = `https://epuig83.github.io/word-search/${lang}.html`;
  let html = source;

  html = replaceRequired(html, "<!DOCTYPE html>", `<!DOCTYPE html>\n<!-- Generated from index.html by scripts/generate-localized-pages.js. -->`, "doctype");
  html = replaceRequired(html, '<html lang="ca">', `<html lang="${lang}" data-initial-lang="${lang}">`, "document language");
  // Mark the page language as active in the markup so the selector does not
  // flash Catalan before app.js runs.
  html = replaceRequired(
    html,
    '<button type="button" class="lang-btn is-active" data-lang="ca" aria-pressed="true">',
    '<button type="button" class="lang-btn" data-lang="ca" aria-pressed="false">',
    "Catalan language button"
  );
  html = replaceRequired(
    html,
    `<button type="button" class="lang-btn" data-lang="${lang}" aria-pressed="false">`,
    `<button type="button" class="lang-btn is-active" data-lang="${lang}" aria-pressed="true">`,
    "active language button"
  );
  html = replaceRequired(html, "Generador de Sopes de Lletres per a Primària", variant.title, "page title");
  html = replaceRequired(
    html,
    "Generador de sopes de lletres per a primària, preparat per fer servir a l'aula o imprimir.",
    variant.description,
    "page description"
  );
  html = replaceRequired(
    html,
    "Crea sopes de lletres personalitzades per a l'aula en segons. Perfecte per imprimir o usar amb ordinador.",
    variant.socialDescription,
    "social description"
  );
  html = replaceRequired(
    html,
    '<meta property="og:site_name" content="Generador de Sopes de Lletres" />',
    `<meta property="og:site_name" content="${variant.siteName}" />`,
    "site name"
  );
  html = replaceRequired(html, '<meta property="og:locale" content="ca_ES" />', `<meta property="og:locale" content="${variant.locale}" />`, "Open Graph locale");
  html = replaceRequired(
    html,
    '    <meta property="og:locale:alternate" content="es_ES" />\n    <meta property="og:locale:alternate" content="en_US" />',
    variant.alternateLocales
      .map(locale => `    <meta property="og:locale:alternate" content="${locale}" />`)
      .join("\n"),
    "Open Graph alternate locales"
  );
  html = replaceRequired(
    html,
    '<link rel="canonical" href="https://epuig83.github.io/word-search/" />',
    `<link rel="canonical" href="${publicUrl}" />`,
    "canonical URL"
  );
  html = replaceRequired(
    html,
    '<meta property="og:url" content="https://epuig83.github.io/word-search/" />',
    `<meta property="og:url" content="${publicUrl}" />`,
    "Open Graph URL"
  );
  html = replaceRequired(
    html,
    '"url": "https://epuig83.github.io/word-search/",',
    `"url": "${publicUrl}",`,
    "structured data URL"
  );
  html = replaceRequired(html, '"inLanguage": ["ca", "es", "en"],', `"inLanguage": "${lang}",`, "structured data language");

  const strings = translations[lang];
  html = translateTextNodes(html, strings);
  html = translatePlaceholder(html, "title-input", strings.field_topic_placeholder);
  html = translatePlaceholder(html, "words-input", strings.field_words_placeholder);
  html = translatePlaceholder(html, "lib-search", strings.lib_search_placeholder);

  html = translateById(html, "words-count", strings.words_count.replace("{count}", "0"));
  html = translateById(html, "words-feedback", strings.words_summary_empty);
  html = translateById(html, "student-start-timer", strings.timer_none);
  html = replaceRequired(
    html,
    `<option value="">${escapeHtml(translations.ca.sample_placeholder)}</option>`,
    `<option value="">${escapeHtml(strings.sample_placeholder)}</option>`,
    "sample placeholder option"
  );

  // Screen-reader labels that app.js sets outside data-t.
  const ca = translations.ca;
  for (const [key, markup] of [
    ["lang_selector_label", '<div class="lang-selector" role="group" aria-label="{label}">'],
    ["nav_sections", '<nav class="main-tabs" role="tablist" aria-label="{label}">'],
    ["lib_search_label", 'aria-label="{label}" data-t="lib_search_placeholder">'],
    ["theme_label", '<div class="theme-selector" role="group" aria-label="{label}">'],
    ["pin_input_label", 'autocomplete="current-password" aria-label="{label}">'],
  ]) {
    html = replaceRequired(
      html,
      markup.replace("{label}", escapeAttribute(ca[key])),
      markup.replace("{label}", escapeAttribute(strings[key])),
      `${key} label`
    );
  }

  const outputPath = path.join(root, `${lang}.html`);
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, "utf8") : "";
    if (current !== html) {
      throw new Error(`${lang}.html is out of date. Run pnpm build:locales.`);
    }
  } else {
    fs.writeFileSync(outputPath, html);
  }
}
