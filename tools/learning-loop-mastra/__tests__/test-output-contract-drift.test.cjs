/**
 * test-output-contract-drift.test.cjs — Phase 5 contract drift & cross-surface
 * validation (plan 260809-1538-vitest-recurrence-telemetry-and-unexpected-match-classification).
 *
 * Pins the canonical L2 Vitest test-output contract and proves the executable
 * artifacts do not drift from it:
 *
 *   - canonical `pnpm-test-discipline` prose in core/hint-registry.js
 *   - package.json `test:iter` / `test:one` scripts
 *   - vitest.config.mjs JSON reporter → `.test-logs/vitest-results.json`
 *   - tools/scripts/vitest-failures.sh / test-one.sh parser exit semantics
 *   - the EFFECTIVE promoted `rule-no-raw-stdout-vitest` rule (resolved through
 *     the canonical max-version projection, never raw-line comparison)
 *   - runtime adapters project from the registry and never re-type the policy
 *   - .mastracode stays pull-only (hooks-lock.json wiring = none)
 *   - projection parity for the canonical slug across loop-introspect builders,
 *     the Claude hooks, the Factory adapter, and loop_get_instruction
 *
 * Expected current values are passed through canonical resolution
 * (loadPromotedRules + the registry builders), NOT hardcoded raw registry lines.
 */

const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

// Canonical contract tokens — the single source the executable artifacts must
// agree with. The prose itself lives in hint-registry.js (the canonical owner);
// these constants are the machine-checkable projection of that prose.
const CANONICAL_SLUG = "pnpm-test-discipline";
const HINT_JSON_PATH = ".test-logs/vitest-results.json";
const SANCTIONED_ITER = "pnpm test:iter";
const SANCTIONED_ONE = "pnpm test:one";
const PARSER_SCRIPT = "tools/scripts/vitest-failures.sh";
const ONE_SCRIPT = "tools/scripts/test-one.sh";
const RULE_ID = "rule-no-raw-stdout-vitest";
// The v0 historical row is `tail|grep`; the effective (canonical max-version)
// rule is `tail|head|grep`. The drift test requires the reader set INCLUDING
// `head` so a projection that still names the narrower set fails loudly.
const RULE_READER_SET = ["tail", "head", "grep"];

const HINT_REGISTRY_PATH = resolve(PROJECT_ROOT, "tools/learning-loop-mastra/core/hint-registry.js");
const PACKAGE_PATH = resolve(PROJECT_ROOT, "package.json");
const VITEST_CONFIG_PATH = resolve(PROJECT_ROOT, "vitest.config.mjs");
const VITEST_FAILURES_PATH = resolve(PROJECT_ROOT, PARSER_SCRIPT);
const TEST_ONE_PATH = resolve(PROJECT_ROOT, ONE_SCRIPT);
const HOOKS_LOCK_PATH = resolve(PROJECT_ROOT, "hooks-lock.json");
const META_STATE_PATH = resolve(PROJECT_ROOT, "meta-state.jsonl");
const MASTRACODE_HOOKS_PATH = resolve(PROJECT_ROOT, ".mastracode", "hooks.json");

// Runtime adapters that MUST project from the registry, never re-type the
// full Vitest policy. Actual paths per hooks-lock.json wiring (the
// .claude universal hooks live under tools/learning-loop-mastra/hooks/universal/;
// the Factory adapter under .factory/hooks/).
const RUNTIME_ADAPTERS = [
  resolve(PROJECT_ROOT, "tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs"),
  resolve(PROJECT_ROOT, "tools/learning-loop-mastra/hooks/universal/session-start-inject-process-hints.cjs"),
  resolve(PROJECT_ROOT, ".factory/hooks/loop-surface-inject.cjs"),
];

let registry;
let introspect;
let gateLogic;
let loopGetInstructionTool;
let factoryHook;
let discoverabilityHook;
let surfaces;

function read(path) {
  return readFileSync(path, "utf8");
}

/** Resolve the hooks-lock surface key + on-disk surface dir for a runtime. */
function surfaceDir(name) {
  return resolve(PROJECT_ROOT, name);
}

beforeAll(async () => {
  registry = await import(pathToFileURL(HINT_REGISTRY_PATH).href);
  introspect = await import(pathToFileURL(resolve(PROJECT_ROOT, "tools/learning-loop-mastra/core/loop-introspect.js")).href);
  gateLogic = await import(pathToFileURL(resolve(PROJECT_ROOT, "tools/learning-loop-mastra/core/gate-logic.js")).href);
  loopGetInstructionTool = await import(pathToFileURL(resolve(PROJECT_ROOT, "tools/learning-loop-mastra/tools/handlers/loop-get-instruction-tool.js")).href);
  factoryHook = require(resolve(PROJECT_ROOT, ".factory/hooks/loop-surface-inject.cjs"));
  discoverabilityHook = require(resolve(PROJECT_ROOT, "tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs"));
  // SURFACES from core/surfaces.js is the single source of truth for the
  // supported runtime set. Deriving the .mastracode / .factory / .claude dirs
  // from it (rather than hand-coding) keeps the drift matrix parameterized for
  // any future runtime and satisfies the runtime-agnostic
  // `parameterized-for-new-surfaces` checklist item.
  const surfacesMod = await import(pathToFileURL(resolve(PROJECT_ROOT, "tools/learning-loop-mastra/core/surfaces.js")).href);
  surfaces = surfacesMod.SURFACES;
});

function canonicalHint() {
  const entry = registry.findHintBySlug(CANONICAL_SLUG);
  assert.ok(entry, `registry must contain canonical slug ${CANONICAL_SLUG}`);
  return entry;
}

function rulesByIdFromRoot(root) {
  return new Map(gateLogic.loadPromotedRules(root).map((r) => [r.id, r]));
}

describe("canonical pnpm-test-discipline contract (hint-registry prose)", () => {
  test("hint text names the JSON artifact path, both sanctioned commands, and the exit-code semantics", () => {
    const { text } = canonicalHint();
    assert.ok(text.includes(HINT_JSON_PATH), `hint text must name the JSON artifact path ${HINT_JSON_PATH}`);
    assert.ok(text.includes(SANCTIONED_ITER), `hint text must name ${SANCTIONED_ITER}`);
    assert.ok(text.includes(SANCTIONED_ONE), `hint text must name ${SANCTIONED_ONE}`);
    assert.ok(text.includes("exit 0 green / 1 failed / 2 missing-or-invalid"),
      "hint text must state the exit-code semantics (0 green / 1 failed / 2 missing-or-invalid)");
    assert.ok(text.includes("vitest run --bail=1"), "hint text must name vitest run --bail=1");
    assert.ok(text.includes(PARSER_SCRIPT), `hint text must name ${PARSER_SCRIPT}`);
    // The JSON is the source of truth, not raw stdout — the core of the discipline.
    assert.ok(text.includes("JSON is the source of truth"), "hint text must call the JSON the source of truth");
  });
});

describe("executable artifacts agree with the canonical contract", () => {
  test("package.json test:iter / test:one reference the sanctioned workflow", () => {
    const pkg = JSON.parse(read(PACKAGE_PATH));
    const iter = pkg.scripts && pkg.scripts["test:iter"];
    const one = pkg.scripts && pkg.scripts["test:one"];
    assert.ok(typeof iter === "string", "scripts.test:iter must exist");
    assert.ok(typeof one === "string", "scripts.test:one must exist");
    assert.ok(iter.includes("vitest run --bail=1"), "test:iter must run vitest with --bail=1");
    assert.ok(iter.includes(PARSER_SCRIPT), `test:iter must call ${PARSER_SCRIPT}`);
    // test:iter must suppress raw stdout (the JSON is the parsed source of truth).
    assert.ok(/1>\s*\/dev\/null|2>&1\s*\/dev\/null|>\s*\/dev\/null/.test(iter),
      "test:iter must suppress raw vitest stdout (redirect to /dev/null)");
    assert.ok(one.includes(ONE_SCRIPT), `test:one must call ${ONE_SCRIPT}`);
  });

  test("vitest.config.mjs has a JSON reporter writing .test-logs/vitest-results.json", () => {
    const src = read(VITEST_CONFIG_PATH);
    assert.ok(/reporters\s*:\s*\[[^\]]*["']json["']/.test(src),
      "vitest config must declare a json reporter");
    assert.ok(/outputFile\s*:\s*\{[^}]*["']\.test-logs\/vitest-results\.json["']/.test(src),
      `vitest config outputFile.json must be ${HINT_JSON_PATH}`);
  });

  test("vitest-failures.sh parses the JSON artifact and exits 0/1/2", () => {
    const src = read(VITEST_FAILURES_PATH);
    assert.ok(src.includes(`PATH_ARG="\${1:-${HINT_JSON_PATH}}"`),
      "parser default path must be .test-logs/vitest-results.json");
    assert.ok(src.includes("numFailedTests"), "parser must read numFailedTests from the JSON");
    assert.ok(src.includes("exit 0"), "parser must exit 0 on green");
    assert.ok(src.includes("exit 1"), "parser must exit 1 on failures");
    assert.ok(src.includes("exit 2"), "parser must exit 2 on missing/invalid JSON");
  });

  test("test-one.sh runs vitest --bail=1 and delegates to vitest-failures.sh", () => {
    const src = read(TEST_ONE_PATH);
    assert.ok(src.includes("vitest run --bail=1"), "test-one.sh must run vitest with --bail=1");
    assert.ok(src.includes("vitest-failures.sh"), "test-one.sh must delegate to vitest-failures.sh");
    assert.ok(src.includes("1>/dev/null"), "test-one.sh must suppress raw vitest stdout");
  });
});

describe("effective promoted rule resolves through canonical max-version", () => {
  test("findProjectRoot() resolves the repo root", () => {
    assert.strictEqual(gateLogic.findProjectRoot(), PROJECT_ROOT,
      "findProjectRoot() must resolve the real repo root (drift test runs against live data)");
  });

  test("loadPromotedRules() resolves rule-no-raw-stdout-vitest with reader set INCLUDING head", () => {
    const rules = gateLogic.loadPromotedRules(PROJECT_ROOT);
    const v = rules.filter((r) => r.id === RULE_ID);
    assert.strictEqual(v.length, 1, `exactly one promoted ${RULE_ID} row (canonical max-version dedupe)`);
    const rule = v[0];
    for (const reader of RULE_READER_SET) {
      assert.ok(rule.pattern.includes(reader), `effective rule pattern must include reader "${reader}"`);
    }
  });

  test("the v0/v1/v2 version history is detected but resolved to the max-version row (no suppression)", () => {
    // Raw rows: 3 active versions exist (v0 tail|grep at line 12, v1/v2
    // tail|head|grep at lines 99/292). The test REPORTS the disagreement by
    // asserting it exists in raw data while the canonical resolution picks the
    // max-version row — never by treating the same-kind version history as a
    // suppression or delete task.
    const rawRows = read(META_STATE_PATH)
      .split("\n").filter((l) => l.trim() !== "")
      .map((l) => JSON.parse(l))
      .filter((e) => e.entry_kind === "rule" && e.id === RULE_ID && e.status === "active");
    assert.ok(rawRows.length >= 3,
      `expected the v0/v1/v2 version history (>=3 active rows); got ${rawRows.length}`);

    const hasNarrowHistoricalRow = rawRows.some((r) => !r.pattern.includes("head"));
    assert.ok(hasNarrowHistoricalRow,
      "the raw history must include a narrower v0 row (tail|grep) — the disagreement is a legitimate versioned record");
    const hasWideRow = rawRows.some((r) => r.pattern.includes("head"));
    assert.ok(hasWideRow, "the raw history must include a wide row (tail|head|grep)");

    const maxRawVersion = Math.max(...rawRows.map((r) => r.version ?? 0));
    assert.ok(maxRawVersion >= 2, `max raw version must be >= 2 (head-closing refinement)`);

    const resolved = gateLogic.loadPromotedRules(PROJECT_ROOT).find((r) => r.id === RULE_ID);
    assert.strictEqual(resolved.version, maxRawVersion,
      "loadPromotedRules() must resolve to the max-version row, not a historical duplicate");
    assert.ok(resolved.pattern.includes("head"),
      "the effective rule must be the wide reader set (tail|head|grep), never the narrower tail|grep");
  });
});

describe("runtime adapters project from the registry, never duplicate the policy", () => {
  test("no runtime adapter carries a SECOND full Vitest policy paragraph", () => {
    // Markers that would indicate a re-typed (manual) copy of the full
    // contract instead of a projection through the core builders.
    const fullPolicyMarkers = [
      SANCTIONED_ITER,
      SANCTIONED_ONE,
      "vitest run --bail=1",
      PARSER_SCRIPT,
      HINT_JSON_PATH,
      CANONICAL_SLUG,
    ];
    for (const adapter of RUNTIME_ADAPTERS) {
      assert.ok(existsSync(adapter), `runtime adapter must exist: ${adapter}`);
      const src = read(adapter);
      for (const marker of fullPolicyMarkers) {
        assert.ok(!src.includes(marker),
          `${adapter} must not re-type the Vitest policy (found "${marker}") — it must project from the registry`);
      }
    }
  });

  test("runtime adapters do project from core loop-introspect builders", () => {
    const processHintsSrc = read(resolve(PROJECT_ROOT, "tools/learning-loop-mastra/hooks/universal/session-start-inject-process-hints.cjs"));
    assert.ok(processHintsSrc.includes("buildProcessPointers"), "process-hints hook must use buildProcessPointers (core projection)");
    assert.ok(processHintsSrc.includes("loop-introspect.js"), "process-hints hook must import the core builders, not mirror prose");

    const discoverabilitySrc = read(resolve(PROJECT_ROOT, "tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs"));
    assert.ok(discoverabilitySrc.includes("buildProcessPointers") && discoverabilitySrc.includes("buildHintIndex"),
      "discoverability hook must project pointers + hint_index from the core builders");

    const factorySrc = read(resolve(PROJECT_ROOT, ".factory/hooks/loop-surface-inject.cjs"));
    assert.ok(factorySrc.includes("loop-introspect.js"), "factory adapter must import core loop-introspect builders");
    assert.ok(factorySrc.includes("buildProcessHints") && factorySrc.includes("buildHintIndex"),
      "factory adapter must project process hints + hint index from the core builders");
  });
});

describe("Mastracode stays pull-only (no SessionStart hint injection)", () => {
  // `.mastracode` is derived from the canonical SURFACES set so the pull-only
  // matrix stays parameterized for future runtimes. Resolved lazily at test
  // time (module top-level runs before beforeAll assigns `surfaces`).
  const mastracodeSurface = () => {
    const found = surfaces.includes(".mastracode") ? ".mastracode" : null;
    assert.ok(found, "SURFACES must include the mastracode runtime");
    return found;
  };

  test("hooks-lock.json marks the mastracode surface SessionStart hint wiring as none", () => {
    const mastraSurface = mastracodeSurface();
    const manifest = JSON.parse(read(HOOKS_LOCK_PATH));
    for (const hookKey of ["session-start-inject-discoverability", "session-start-inject-process-hints"]) {
      const wiring = manifest.hooks[hookKey]?.wiring;
      assert.ok(wiring, `hooks-lock.json must declare ${hookKey}`);
      assert.ok(wiring[mastraSurface], `hooks-lock.json must declare ${mastraSurface} wiring for ${hookKey}`);
      assert.strictEqual(wiring[mastraSurface].kind, "none",
        `${hookKey}: ${mastraSurface} wiring must be kind:"none" (pull-only, no SessionStart hint injection)`);
    }
  });

  test("no mastracode SessionStart hint hook exists and its hooks.json does not wire one", () => {
    const mastraSurface = mastracodeSurface();
    const mastraHooks = JSON.parse(read(MASTRACODE_HOOKS_PATH));
    const sessionStart = mastraHooks.SessionStart ?? [];
    for (const hook of sessionStart) {
      const cmd = String(hook.command ?? "");
      assert.ok(!cmd.includes("session-start-inject"),
        `${mastraSurface} SessionStart must not wire a hint-injection hook; got: ${cmd}`);
    }
    // No injected hook artifact under the surface's hooks/ dir either (the
    // directory does not exist — pull-only by explicit matrix test, not by
    // accident).
    assert.ok(!existsSync(resolve(PROJECT_ROOT, mastraSurface, "hooks")),
      `no ${mastraSurface}/hooks/ directory must exist (hint injection is pull-only)`);
  });
});

describe("projection parity for pnpm-test-discipline across surfaces", () => {
  test("loop-introspect builders project the canonical text + pointer unchanged", () => {
    const hint = canonicalHint();
    const rulesById = rulesByIdFromRoot(PROJECT_ROOT);

    const processTexts = introspect.buildProcessHints({ rulesById });
    assert.ok(processTexts.includes(hint.text),
      "buildProcessHints (unfiltered) must surface the canonical pnpm-test-discipline text unchanged");

    const pointers = introspect.buildProcessPointers({ rulesById });
    assert.ok(pointers.includes(`${CANONICAL_SLUG} — ${hint.suggestion}`),
      "buildProcessPointers must project `${slug} — ${suggestion}` from the registry");
  });

  test("loop_get_instruction resolves the canonical slug to the registry text", async () => {
    const hint = canonicalHint();
    const result = await loopGetInstructionTool.loopGetInstructionTool.handler({ key: CANONICAL_SLUG });
    const parsed = JSON.parse(result.content[0].text);
    assert.strictEqual(parsed.count, 1, "loop_get_instruction must resolve exactly one result");
    const row = parsed.results[0];
    assert.strictEqual(row.key, CANONICAL_SLUG);
    assert.strictEqual(row.hint, hint.text, "loop_get_instruction must return the registry's canonical text, not a copy");
    assert.strictEqual(row.suggestion, hint.suggestion, "loop_get_instruction must return the registry's canonical suggestion");
  });

  test("Factory adapter projects the pointer into hint_index and pushes no full text", () => {
    const hint = canonicalHint();
    const block = factoryHook.formatBlock(
      { tool_count: 41, record_type_count: 5, rule_count: 1, active_finding_count: 0 },
      { discoverability_hints: [], process_hints: [], hint_index: [{ slug: CANONICAL_SLUG, suggestion: hint.suggestion }] },
      "warm",
    );
    assert.ok(block.includes(`${CANONICAL_SLUG} — ${hint.suggestion}`),
      "factory block must advertise the pull path as `slug — suggestion` in hint_index");
    assert.ok(!block.includes(hint.text),
      "factory block must NOT push the full pnpm-test-discipline text (on-demand full text is pulled)");
  });

  test("Claude sidecar payload projects the canonical pointer into hint_index", () => {
    const hint = canonicalHint();
    const payload = discoverabilityHook.buildContextPayload(
      {
        hint_index: [{ slug: CANONICAL_SLUG, suggestion: hint.suggestion }],
        hint_index_source: "core",
        hint_index_error: null,
        discoverability_hints: [],
        discoverability_hints_source: "core",
        discoverability_hints_error: null,
        process_hints: [],
        process_hints_source: "core",
        process_hints_error: null,
      },
      { registry_source: "core", registry_error: null },
      { fixable_candidates: [], orphan_findings: [], dispatch_protocol_prompt: "" },
      { gap_candidates: [], gap_protocol_prompt: "" },
      "2026-08-09T00:00:00.000Z",
    );
    const indexRow = payload.hint_index.find((e) => e.slug === CANONICAL_SLUG);
    assert.ok(indexRow, "claude sidecar hint_index must carry the pnpm-test-discipline slug");
    assert.strictEqual(indexRow.suggestion, hint.suggestion,
      "claude sidecar hint_index must carry the registry's canonical suggestion");
    assert.ok(!payload.process_hints.includes(hint.text),
      "claude sidecar must not embed the full pnpm-test-discipline text (pull-only for on-demand rows)");
  });
});
