/**
 * Cross-surface dedup invariant: a guidance claim lives in exactly one
 * canonical surface. The hint registry, AGENTS.md, and CLAUDE.md must not
 * carry the same prose passage verbatim — trims move content to its canonical
 * home and leave at most a one-line pointer elsewhere.
 *
 * Scope: PROSE passages (sentence boundaries), not raw character runs —
 * shared tool-call recipes (e.g. `meta_state_list`) are operational
 * incantations, not prose duplication, and are allowlisted below.
 */
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const REGISTRY_PATH = resolve(PROJECT_ROOT, "tools/learning-loop-mastra/core/hint-registry.js");
const AGENTS_MD = readFileSync(resolve(PROJECT_ROOT, "AGENTS.md"), "utf8");
const CLAUDE_MD = readFileSync(resolve(PROJECT_ROOT, "CLAUDE.md"), "utf8");
const DOCS = { "AGENTS.md": AGENTS_MD, "CLAUDE.md": CLAUDE_MD };

// Operational tool-call recipes shared by design across surfaces. These are
// incantations an agent copies verbatim, not prose duplication.
const OPERATIONAL_ALLOWLIST = [
  "meta_state_re_verify({ id, refresh: true })",
  "meta_state_touch({ id })",
  "loop_get_instruction",
  "meta_state_list",
];

const MIN_PASSAGE_LEN = 60;

function proseSentences(text) {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

function stripAllowlisted(sentence) {
  let out = sentence;
  for (const recipe of OPERATIONAL_ALLOWLIST) out = out.split(recipe).join("");
  return out;
}

function isCodeDominated(sentence) {
  const withoutCode = sentence.replace(/`[^`]*`/g, "");
  return withoutCode.length < sentence.length / 2;
}

let registry;
beforeAll(async () => {
  registry = await import(pathToFileURL(REGISTRY_PATH).href);
});

describe("hint ↔ docs prose dedup invariant", () => {
  test("no hint text sentence is duplicated verbatim in AGENTS.md or CLAUDE.md prose", () => {
    const offenders = [];
    for (const entry of registry.HINT_REGISTRY) {
      if (entry.derived_from_rule != null) continue;
      for (const sentence of proseSentences(entry.text)) {
        if (isCodeDominated(sentence)) continue;
        const stripped = stripAllowlisted(sentence);
        if (stripped.length < MIN_PASSAGE_LEN) continue;
        for (const [docName, docText] of Object.entries(DOCS)) {
          if (docText.includes(sentence)) {
            offenders.push(`${entry.slug}: sentence duplicated in ${docName}: "${sentence.slice(0, 80)}…"`);
          }
        }
      }
    }
    assert.deepStrictEqual(offenders, [], "prose passages must live in exactly one canonical surface");
  });

  test("trimmed hints carry pointers to their canonical homes, not the moved passage", () => {
    const bySlug = (s) => registry.findHintBySlug(s).text;

    // internalization-rule → AGENTS.md §2
    assert.ok(bySlug("internalization-rule").includes("AGENTS.md §2"), "pointer to canonical home");

    // source-refs → general in AGENTS.md §2, sentinel stays in the hint
    assert.ok(bySlug("source-refs").includes("AGENTS.md §2"), "general guidance points at AGENTS.md §2");
    assert.ok(bySlug("source-refs").includes("local:meta-state:gate-verb-allowance"), "sentinel residue stays");

    // status-lifecycle → vocabulary in AGENTS.md §1, ops residue stays
    assert.ok(bySlug("status-lifecycle").includes("AGENTS.md §1"), "vocabulary points at AGENTS.md §1");
    assert.ok(bySlug("status-lifecycle").includes("meta_state_re_verify"), "re_verify ops residue stays");
    assert.ok(!bySlug("status-lifecycle").includes("the canonical post-migration status"),
      "full vocabulary enumeration moved out");

    // loop-get-instruction → tool pointer + index framing; surface framing moved to AGENTS.md §1
    assert.ok(bySlug("loop-get-instruction").includes("hint_index"), "on-demand index framing stays");
    assert.ok(!bySlug("loop-get-instruction").includes("provokes learning"),
      "meta-state/product/substrate framing moved out");

    // phase-a-reframe → one-line startup orientation pointer (AGENTS.md §1 + CLAUDE.md Records bullet)
    assert.ok(bySlug("phase-a-reframe").includes("AGENTS.md §1"), "pointer to canonical framing");
    assert.ok(!bySlug("phase-a-reframe").includes("Substrate writes"),
      "bound/unbound + records-via-tools passage moved out");

    // AGENTS.md §2 step 3 aside → pointer to the canonical hints
    assert.ok(!AGENTS_MD.includes("set `mechanism_check: true` on the finding"),
      "mechanism-check aside trimmed to a pointer");
    assert.ok(!AGENTS_MD.includes("via `meta_state_refresh_file_index`"),
      "derive-refresh tool-name restatement trimmed");
  });

  test("gate-verb-allowance hint and the bash-gate block message share the canonical incantation substrings", () => {
    const { text } = registry.findHintBySlug("gate-verb-allowance");
    const gateSrc = readFileSync(
      resolve(PROJECT_ROOT, "tools/learning-loop-mastra/core/command-constraint-policy.js"),
      "utf8",
    );
    for (const shared of [
      'gate_mark_preflight({surface:"runtime-state"})',
      "runtime_state_record",
      "local:meta-state:gate-verb-allowance",
    ]) {
      assert.ok(text.includes(shared), `hint must carry: ${shared}`);
      assert.ok(gateSrc.includes(shared), `gate block message must carry: ${shared}`);
    }
  });

  test("CLAUDE.md carries a gate-verb pointer, not the full incantation", () => {
    assert.ok(
      CLAUDE_MD.includes("loop_get_instruction({key:'gate-verb-allowance'})"),
      "CLAUDE.md must point at the on-demand canonical recipe",
    );
    assert.ok(
      !CLAUDE_MD.includes('runtime_state_record({affected_system:"gate-verb:'),
      "CLAUDE.md must not contain the full runtime_state_record incantation",
    );
  });
});
