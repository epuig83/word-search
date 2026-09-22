const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../../core.js");
const { buildVariantBatch, placementSignature } = require("../../app-print.js");
const { requestOfflineStatus } = require("../../app-offline.js");

function generator() {
  let seed = 27;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  return (...args) => core.buildPuzzleData(...args, { random });
}

function original(generate) {
  return generate(core.parseWords("sol\nmar\nluna").words, "8", "easy", { title: "Tema", sourceLang: "es" });
}

test("variants preserve the reviewed board, vocabulary and difficulty without mutating it", async () => {
  const generate = generator();
  const puzzle = original(generate);
  const before = structuredClone(puzzle);
  const models = await buildVariantBatch(puzzle, 4, { generate });
  assert.equal(models[0], puzzle);
  assert.deepEqual(puzzle, before);
  assert.equal(new Set(models.map(placementSignature)).size, 4);
  for (const model of models) {
    assert.deepEqual(model.words, puzzle.words);
    assert.equal(model.actualSize, 8);
    assert.equal(model.difficulty, "easy");
    for (const placement of model.placements) {
      assert.equal(placement.cells.map(({ row, col }) => model.grid[row][col]).join(""), placement.wordId);
    }
  }
  const extended = await buildVariantBatch(puzzle, 4, { previous: models, generate: () => assert.fail("must reuse the prepared batch") });
  assert.deepEqual(extended, models);
});

test("duplicates exhaust only three attempts and never produce a misleading partial batch", async () => {
  const puzzle = original(generator());
  let attempts = 0;
  await assert.rejects(buildVariantBatch(puzzle, 2, {
    generate: () => { attempts++; return structuredClone(puzzle); },
  }), /GENERATION_FAILED/);
  assert.equal(attempts, 3);
});

test("generation respects cancellation and its elapsed-time budget", async () => {
  const puzzle = original(generator());
  await assert.rejects(buildVariantBatch(puzzle, 2, { cancelled: () => true, generate: () => assert.fail() }), /CANCELLED/);
  let time = 0;
  await assert.rejects(buildVariantBatch(puzzle, 2, {
    now: () => time,
    yieldFrame: async () => { time = 6000; },
    generate: () => assert.fail("deadline must stop generation"),
  }), /GENERATION_FAILED/);
  await assert.rejects(buildVariantBatch(puzzle, 30), /INVALID_COUNT/);
});

test("offline protocol accepts only a complete, typed worker response", async () => {
  for (const complete of [true, false]) {
    const worker = { postMessage(message, [port]) {
      assert.equal(message.type, "OFFLINE_STATUS");
      port.postMessage({ revision: "test-release", complete });
    } };
    assert.deepEqual(await requestOfflineStatus(worker), { revision: "test-release", complete });
  }
  const malformed = { postMessage(_message, [port]) { port.postMessage({ revision: "test", complete: "yes" }); } };
  assert.equal(await requestOfflineStatus(malformed), null);
});

test("legacy, inaccessible and terminated workers cannot report a false ready state", async () => {
  assert.equal(await requestOfflineStatus({ postMessage() {} }, { timeout: 10 }), null);
  assert.equal(await requestOfflineStatus({ postMessage() { throw new Error("terminated"); } }), null);
});
