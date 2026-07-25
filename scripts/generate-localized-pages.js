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
