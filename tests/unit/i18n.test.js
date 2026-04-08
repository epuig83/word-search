const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

// i18n.js assigns to globalThis.WORD_SEARCH_I18N; simulate browser global.
globalThis.window = globalThis;
require(path.resolve(__dirname, "../../i18n.js"));
const i18n = globalThis.WORD_SEARCH_I18N;

const LANGS = ["ca", "es", "en"];
const CRITICAL_KEYS = [
  "page_title", "page_description",
  "tab_teacher", "tab_student",
  "btn_generate", "btn_generate_open_student",
  "btn_show_solution", "btn_hide_solution", "btn_reset",
  "msg_success", "msg_puzzle_error", "msg_found",
  "diff_easy", "diff_medium", "diff_hard",
  "timer_none", "timer_expired",
  "hints_none", "hints_unlimited",
  "btn_hint", "msg_hint_used",
  "pin_title", "pin_error",
  "msg_sample_saved", "msg_import_invalid", "msg_import_read_error", "msg_import_success",
  "msg_export_success", "msg_export_no_samples",
  "msg_storage_unavailable",
  "completion_msg",
  "grid_cell_label",
  "msg_link_error",
];

// Keys that contain interpolation placeholders
const PLACEHOLDER_KEYS = [
  "words_count", "msg_found", "btn_hint", "msg_import_success",
  "board_status_progress", "teacher_ready_meta", "grid_cell_label",
];

// Keys that must exist in every language (superset of critical + placeholders)
const ALL_EXPECTED_KEYS = new Set([...CRITICAL_KEYS, ...PLACEHOLDER_KEYS,
  "hero_eyebrow", "hero_title", "hero_text", "config_title", "field_topic",
  "field_words", "btn_clear_words", "field_sample", "btn_example",
  "btn_save_sample", "btn_export_samples", "btn_import_samples",
  "btn_print", "btn_share", "btn_share_copied", "btn_student", "btn_teacher",
  "status_default", "board_instructions", "board_status_pending",
  "board_status_start", "board_status_complete", "board_status_expired",
  "board_progress", "word_bank_title", "teacher_tools_summary",
  "btn_send_results", "form_config_title", "form_url_label",
  "name_modal_title", "name_modal_text", "btn_continue", "btn_start_game",
  "btn_generating", "msg_confirm_reset", "form_url_invalid",
  "pin_text", "pin_btn_validate", "pin_btn_cancel",
  "msg_no_examples", "msg_choose_sample", "msg_confirm_replace",
  "msg_confirm_replace_custom_sample", "msg_sample_requires_title",
  "msg_sample_requires_words", "msg_import_empty", "msg_import_read_error",
  "msg_print_without_puzzle", "view_teacher", "lib_title",
  "lib_search_placeholder", "sample_placeholder", "sample_group_builtin",
  "sample_group_custom", "sample_note", "lib_empty_mobile", "lib_empty_search",
  "words_summary_empty", "words_summary_sparse", "words_summary_ready",
  "teacher_ready_title", "teacher_ready_note",
  "student_start_kicker", "student_start_title", "student_start_text",
  "all_categories", "hints_label", "timer_label",
  "pin_change_title", "btn_save_pin", "pin_change_success",
  "pin_change_mismatch", "pin_too_short", "pin_label_new", "pin_label_confirm",
  "grid_label", "grid_cell_anchor", "grid_cell_preview",
  "grid_cell_found", "grid_cell_solution",
]);

// ── Structure ──────────────────────────────────────────────────────────────

test("i18n exports an object with three language keys", () => {
  assert.equal(typeof i18n, "object");
  for (const lang of LANGS) {
    assert.ok(i18n[lang], `Missing language: ${lang}`);
    assert.equal(typeof i18n[lang], "object");
  }
});

test("each language object is frozen (immutable)", () => {
  for (const lang of LANGS) {
    assert.ok(Object.isFrozen(i18n[lang]), `${lang} should be frozen`);
  }
});

// ── Key parity across languages ────────────────────────────────────────────

test("all languages share the same set of keys", () => {
  const caKeys = new Set(Object.keys(i18n.ca));
  for (const lang of LANGS) {
    const keys = new Set(Object.keys(i18n[lang]));
    assert.deepEqual(keys, caKeys, `Keys mismatch between ca and ${lang}`);
  }
});

test("all critical keys are present in every language", () => {
  for (const lang of LANGS) {
    for (const key of CRITICAL_KEYS) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(i18n[lang], key),
        `${lang} is missing key: ${key}`
      );
    }
  }
});

// ── No empty values ────────────────────────────────────────────────────────

test("no translation value is empty or undefined", () => {
  for (const lang of LANGS) {
    for (const [key, value] of Object.entries(i18n[lang])) {
      assert.ok(
        value !== undefined && value !== null && value !== "",
        `${lang}.${key} is empty or undefined`
      );
    }
  }
});

// ── Placeholder consistency ────────────────────────────────────────────────

test("placeholder keys contain expected tokens across all languages", () => {
  const expectedTokens = {
    words_count: ["{count}"],
    msg_found: ["{word}"],
    btn_hint: ["{n}"],
    msg_import_success: ["{count}"],
    board_status_progress: ["{found}", "{total}"],
    teacher_ready_meta: ["{count}", "{size}", "{difficulty}"],
    grid_cell_label: ["{letter}", "{row}", "{col}"],
  };

  for (const [key, tokens] of Object.entries(expectedTokens)) {
    for (const lang of LANGS) {
      const value = i18n[lang][key];
      assert.ok(typeof value === "string", `${lang}.${key} should be a string`);
      for (const token of tokens) {
        assert.ok(
          value.includes(token),
          `${lang}.${key} should contain placeholder ${token}`
        );
      }
    }
  }
});

// ── Difficulty labels exist ────────────────────────────────────────────────

test("difficulty labels exist for all languages", () => {
  for (const lang of LANGS) {
    assert.ok(i18n[lang].diff_easy, `${lang} missing diff_easy`);
    assert.ok(i18n[lang].diff_medium, `${lang} missing diff_medium`);
    assert.ok(i18n[lang].diff_hard, `${lang} missing diff_hard`);
  }
});

// ── Languages are distinct ─────────────────────────────────────────────────

test("page_title differs across languages", () => {
  const titles = LANGS.map(lang => i18n[lang].page_title);
  const unique = new Set(titles);
  assert.equal(unique.size, LANGS.length, "Each language should have a unique page_title");
});

test("reviewed high-visibility teacher labels use the expected localized wording", () => {
  assert.equal(i18n.ca.tab_teacher, "Panell de creació");
  assert.equal(i18n.es.tab_teacher, "Panel de creación");
  assert.equal(i18n.ca.teacher_tools_summary, "Eines docents");
  assert.equal(i18n.es.teacher_tools_summary, "Herramientas docentes");
});

// ── All expected keys are covered ──────────────────────────────────────────

test("all expected keys exist in ca", () => {
  for (const key of ALL_EXPECTED_KEYS) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(i18n.ca, key),
      `ca is missing key: ${key}`
    );
  }
});
