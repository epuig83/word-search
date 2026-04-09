(function (global, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
    return;
  }
  global.WORD_SEARCH_CORE = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const LETTERS = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ";
  const MAX_GENERATION_ATTEMPTS = 180;
  const MAX_GRID_SIZE = 22;
  const SAMPLE_LANGS = ["ca", "es", "en"];
  const SAMPLE_DIFFICULTIES = new Set(["easy", "medium", "hard"]);
  const SAMPLE_SIZES = new Set(["auto", "10", "12", "14", "16"]);
  const SHARED_PUZZLE_VERSION = 2;

  function createEmptyCustomSamples() {
    return { ca: [], es: [], en: [] };
  }

  function normalizeWord(value) {
    return String(value ?? "")
      .toUpperCase()
      .replace(/Ñ/g, "\u0000")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\u0000/g, "Ñ")
      .replace(/[^A-ZÑ]/g, "");
  }

  function parseWords(rawText) {
    const tokens = String(rawText ?? "").split(/[\n,;]+/).map(token => token.trim()).filter(Boolean);
    const words = [];
    const seen = new Set();
    for (const token of tokens) {
      const cleaned = normalizeWord(token);
      if (cleaned.length >= 2 && !seen.has(cleaned)) {
        seen.add(cleaned);
        words.push({ id: cleaned, cleaned, display: token });
      }
    }
    return { words };
  }

  function countValidWords(rawText) {
    return parseWords(rawText).words.length;
  }

  function normalizeSharedSize(value) {
    const size = String(value ?? "");
    if (SAMPLE_SIZES.has(size)) return size;
    const numeric = Number(size);
    if (Number.isInteger(numeric) && numeric >= 3 && numeric <= MAX_GRID_SIZE) {
      return String(numeric);
    }
    return "auto";
  }

  function sameCell(left, right) {
    return Boolean(left && right && left.row === right.row && left.col === right.col);
  }

  function buildPlacementRecord(word, cells, placementId) {
    return {
      wordId: word.id,
      display: word.display,
      cells,
      key: cells.map(cell => `${cell.row}:${cell.col}`).join("|"),
      reversedKey: [...cells].reverse().map(cell => `${cell.row}:${cell.col}`).join("|"),
      placementId,
    };
  }

  function serializeGridRows(grid) {
    return grid.map(row => row.join(""));
  }

  function parseGridRows(rawRows) {
    if (!Array.isArray(rawRows) || rawRows.length < 3 || rawRows.length > MAX_GRID_SIZE) {
      return null;
    }

    const normalizedRows = rawRows.map(row => typeof row === "string" ? normalizeWord(row) : "");
    const size = normalizedRows.length;
    if (normalizedRows.some(row => row.length !== size)) {
      return null;
    }

    return normalizedRows.map(row => row.split(""));
  }

  function serializePlacementCells(cells) {
    return cells.map(cell => `${cell.row}.${cell.col}`).join(",");
  }

  function parsePlacementCells(rawPath, expectedLength, size) {
    if (typeof rawPath !== "string" || !rawPath) {
      return null;
    }

    const cells = rawPath.split(",").map(token => {
      const [row, col] = token.split(".").map(Number);
      if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= size || col >= size) {
        return null;
      }
      return { row, col };
    });

    if (cells.length !== expectedLength || cells.some(cell => cell === null)) {
      return null;
    }

    return cells;
  }

  function calculateAutoSize(words) {
    const longest = words.reduce((max, word) => Math.max(max, word.cleaned.length), 0);
    const total = words.reduce((sum, word) => sum + word.cleaned.length, 0);
    return Math.min(MAX_GRID_SIZE, Math.max(longest + 2, Math.ceil(Math.sqrt(total * 1.6)) + 2));
  }

  function buildEmptyGrid(size) {
    return Array.from({ length: size }, () => Array(size).fill(""));
  }

  function buildPuzzleData(words, requestedSize, difficultyKey, metadata, options = {}) {
    const random = options.random || Math.random;
    const size = requestedSize === "auto" ? calculateAutoSize(words) : Number(requestedSize);
    const directions = [{ row: 0, col: 1 }, { row: 1, col: 0 }];
    if (difficultyKey !== "easy") directions.push({ row: 1, col: 1 });
    if (difficultyKey === "hard") {
      directions.push(
        { row: 1, col: -1 },
        { row: 0, col: -1 },
        { row: -1, col: 0 },
        { row: -1, col: -1 },
        { row: -1, col: 1 }
      );
    }

    const tooLong = words.find(w => w.cleaned.length > size);
    if (tooLong) throw new Error(`WORD_TOO_LONG:${tooLong.display}`);

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const grid = buildEmptyGrid(size);
      const placements = [];
      let success = true;

      for (const word of words) {
        const optionsForWord = [];
        for (let row = 0; row < size; row++) {
          for (let col = 0; col < size; col++) {
            for (const direction of directions) {
              let canPlace = true;
              for (let index = 0; index < word.cleaned.length; index++) {
                const nextRow = row + direction.row * index;
                const nextCol = col + direction.col * index;
                if (
                  nextRow < 0 ||
                  nextRow >= size ||
                  nextCol < 0 ||
                  nextCol >= size ||
                  (grid[nextRow][nextCol] && grid[nextRow][nextCol] !== word.cleaned[index])
                ) {
                  canPlace = false;
                  break;
                }
              }
              if (canPlace) optionsForWord.push({ row, col, direction });
            }
          }
        }

        if (!optionsForWord.length) {
          success = false;
          break;
        }

        const selected = optionsForWord[Math.floor(random() * optionsForWord.length)];
        const cells = [];
        for (let index = 0; index < word.cleaned.length; index++) {
          const nextRow = selected.row + selected.direction.row * index;
          const nextCol = selected.col + selected.direction.col * index;
          grid[nextRow][nextCol] = word.cleaned[index];
          cells.push({ row: nextRow, col: nextCol });
        }
        placements.push(buildPlacementRecord(word, cells, `${word.id}-${selected.row}-${selected.col}`));
      }

      if (!success) continue;

      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          if (!grid[row][col]) {
            grid[row][col] = LETTERS[Math.floor(random() * LETTERS.length)];
          }
        }
      }

      return {
        ...metadata,
        grid,
        placements,
        actualSize: grid.length,
        requestedSize,
        words,
        difficulty: difficultyKey,
      };
    }

    throw new Error("Error generating puzzle.");
  }

  function buildPuzzleFromSnapshotData(words, config, metadata) {
    const grid = parseGridRows(config.gridRows);
    if (!grid || !Array.isArray(config.placementPaths) || config.placementPaths.length !== words.length) {
      throw new Error("invalid_snapshot");
    }

    const size = grid.length;
    const placements = config.placementPaths.map((rawPath, index) => {
      const word = words[index];
      const cells = parsePlacementCells(rawPath, word.cleaned.length, size);
      if (!cells) {
        throw new Error("invalid_snapshot");
      }

      const letters = cells.map(cell => grid[cell.row]?.[cell.col]).join("");
      if (letters !== word.cleaned) {
        throw new Error("invalid_snapshot");
      }

      return buildPlacementRecord(word, cells, `${word.id}-${index}-${cells[0].row}-${cells[0].col}`);
    });

    return {
      ...metadata,
      grid,
      placements,
      actualSize: grid.length,
      requestedSize: config.requestedSize,
      words,
      difficulty: config.difficulty,
    };
  }

  function encodeBase64(value) {
    if (typeof btoa === "function" && typeof TextEncoder === "function") {
      return btoa(String.fromCharCode(...new TextEncoder().encode(value)));
    }
    return Buffer.from(value, "utf8").toString("base64");
  }

  function decodeBase64(value) {
    if (typeof atob === "function" && typeof TextDecoder === "function") {
      return new TextDecoder().decode(Uint8Array.from(atob(value), char => char.charCodeAt(0)));
    }
    return Buffer.from(value, "base64").toString("utf8");
  }

  function encodePuzzleConfig(config) {
    const json = JSON.stringify({
      v: config.version ?? 1,
      t: config.title,
      w: config.words,
      d: config.difficulty,
      s: config.size,
      l: config.lang,
      tm: config.timer,
      h: config.hints,
      f: config.formTemplate || "",
      g: config.gridRows,
      p: config.placementPaths,
    });
    return encodeBase64(json);
  }

  function decodePuzzleConfig(encoded) {
    try {
      const json = decodeBase64(encoded);
      const obj = JSON.parse(json);
      const requestedSize = normalizeSharedSize(obj.s);
      return {
        version: Number(obj.v) || 1,
        title: typeof obj.t === "string" ? obj.t : "",
        words: typeof obj.w === "string" ? obj.w : "",
        difficulty: SAMPLE_DIFFICULTIES.has(obj.d) ? obj.d : "easy",
        size: requestedSize,
        requestedSize,
        lang: SAMPLE_LANGS.includes(obj.l) ? obj.l : "ca",
        timer: Number(obj.tm) || 0,
        hints: Number(obj.h) || 0,
        formTemplate: typeof obj.f === "string" ? obj.f : "",
        gridRows: Array.isArray(obj.g) ? obj.g : null,
        placementPaths: Array.isArray(obj.p) ? obj.p : null,
      };
    } catch {
      return null;
    }
  }

  function parseFormEntries(templateUrl) {
    try {
      const url = new URL(templateUrl);
      const entries = [...url.searchParams.keys()].filter(key => key.startsWith("entry."));
      if (!entries.length) return null;
      return { baseUrl: url.origin + url.pathname, entries };
    } catch {
      return null;
    }
  }

  function buildFormSubmitUrl(parsed, nom, cognoms, resultat, puzzle) {
    const url = new URL(parsed.baseUrl);
    const values = [nom, cognoms, resultat, puzzle];
    parsed.entries.forEach((entry, index) => {
      if (values[index] !== undefined) {
        url.searchParams.set(entry, values[index]);
      }
    });
    return url.toString();
  }

  return Object.freeze({
    LETTERS,
    MAX_GENERATION_ATTEMPTS,
    MAX_GRID_SIZE,
    SAMPLE_LANGS,
    SAMPLE_DIFFICULTIES,
    SAMPLE_SIZES,
    SHARED_PUZZLE_VERSION,
    createEmptyCustomSamples,
    normalizeWord,
    parseWords,
    countValidWords,
    normalizeSharedSize,
    sameCell,
    buildPlacementRecord,
    serializeGridRows,
    parseGridRows,
    serializePlacementCells,
    parsePlacementCells,
    calculateAutoSize,
    buildEmptyGrid,
    buildPuzzleData,
    buildPuzzleFromSnapshotData,
    encodePuzzleConfig,
    decodePuzzleConfig,
    parseFormEntries,
    buildFormSubmitUrl,
  });
});
