// Behavioral test for the SARIF patch step in .github/workflows/test.yml.
// Plan 260630-0536-fallow-action-swap-with-sarif-split phase 2 step 2.12.
//
// The text-pattern tests in workflow-shape.test.js prove the workflow CONTAINS
// the right YAML structure. This test proves the jq patch step BEHAVES as
// expected: it correctly classifies runs, preserves pre-set automationDetails,
// and produces unique automationDetails.id values that satisfy codeql-action
// v4's areAllRunsUnique validator.
//
// The patch script is extracted directly from the workflow YAML at test time,
// so any drift between the inline script and the tests is caught immediately.

import assert from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "vitest";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");
const WORKFLOW_PATH = resolve(PROJECT_ROOT, ".github/workflows/test.yml");
const FIXTURE_PATH = resolve(
  PROJECT_ROOT,
  "tools/learning-loop-mastra/reports/fallow/audit.sarif",
);

// Extract the inline jq script from the workflow's patch step.
function extractPatchScript() {
  const wfRaw = readFileSync(WORKFLOW_PATH, "utf8");
  // Locate the patch step's `run:` block — multi-line YAML literal.
  const patchMarker = "Patch fallow SARIF per analyzer (jq)";
  const idx = wfRaw.indexOf(patchMarker);
  assert.ok(idx >= 0, "Patch step must be present in workflow");
  // Find the next `run: |` after the step marker, then capture up to the next
  // step (line starting with `- name:` or `- uses:` at 6-space indent).
  const runIdx = wfRaw.indexOf("run: |", idx);
  assert.ok(runIdx > idx, "Patch step must have run: |");
  const blockStart = wfRaw.indexOf("\n", runIdx) + 1;
  // Find end of block: next line starting with "      - " (6 spaces + dash).
  const remaining = wfRaw.slice(blockStart);
  const endMatch = remaining.search(/\n      -\s/);
  const blockEnd = endMatch >= 0 ? blockStart + endMatch : wfRaw.length;
  const block = wfRaw.slice(blockStart, blockEnd);
  // The patch step may contain more than one `jq '...'` invocation (e.g. a
  // single-line dropped-result count query). Anchor on the `> "$TMP_OUTPUT"`
  // redirect so we extract the actual patch filter written to the output file,
  // not an earlier count query whose closing quote is followed by `)` not `>`.
  const jqMatch = block.match(/jq\s+'([^']*)'\s+"\$SARIF_INPUT"\s*>\s*"\$TMP_OUTPUT"/);
  assert.ok(
    jqMatch,
    "Patch step must contain a `jq '...' \"$SARIF_INPUT\" > \"$TMP_OUTPUT\"` filter",
  );
  return jqMatch[1];
}

// Run a SARIF through the patch filter and return the patched result.
function applyPatch(filter, inputJson) {
  const result = spawnSync("jq", [filter], {
    input: JSON.stringify(inputJson),
    encoding: "utf8",
  });
  assert.strictEqual(
    result.status,
    0,
    `jq exited ${result.status}: ${result.stderr}`,
  );
  return JSON.parse(result.stdout);
}

// Tests -----------------------------------------------------------------

test("fixture SARIF exists at expected path", { skip: !existsSync(FIXTURE_PATH) }, () => {
  assert.ok(existsSync(FIXTURE_PATH), `Expected fixture at ${FIXTURE_PATH}`);
});

test("patch step's jq filter can be extracted from workflow YAML", () => {
  const filter = extractPatchScript();
  assert.ok(filter.length > 100, "Extracted filter should be non-trivial");
  assert.match(filter, /\.automationDetails/, "Filter must touch automationDetails");
  assert.match(
    filter,
    /fallow\/audit\/(dead-code|health|dupes)/,
    "Filter must classify into the 3 known IDs",
  );
});

test("3-run fixture produces 3 unique automationDetails.id values", { skip: !existsSync(FIXTURE_PATH) }, () => {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  const filter = extractPatchScript();
  const patched = applyPatch(filter, fixture);

  assert.strictEqual(patched.runs.length, 3, "Expected 3 runs in fixture");
  const ids = patched.runs.map((r) => r.automationDetails?.id);
  // All 3 must be defined (null or {} gets patched).
  for (const [i, id] of ids.entries()) {
    assert.ok(
      typeof id === "string",
      `Run ${i} automationDetails.id should be defined (got: ${JSON.stringify(id)})`,
    );
  }
  // All 3 must be unique (no createRunKey collision).
  assert.strictEqual(
    new Set(ids).size,
    ids.length,
    `automationDetails.id values must be unique for areAllRunsUnique; got: ${JSON.stringify(ids)}`,
  );
});

test("3-run fixture classifier routes dead-code / dupes / health", { skip: !existsSync(FIXTURE_PATH) }, () => {
  const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));
  const filter = extractPatchScript();
  const patched = applyPatch(filter, fixture);
  const ids = patched.runs.map((r) => r.automationDetails.id);

  // Verified against the live fixture: rules[0].id per run
  //   run 0: fallow/unused-file       → dead-code (matches unused- prefix)
  //   run 1: null rules               → dupes fallback (idempotent pass-through)
  //   run 2: fallow/high-cyclomatic-  → health (matches high- prefix)
  assert.deepStrictEqual(ids, [
    "fallow/audit/dead-code",
    "fallow/audit/dupes",
    "fallow/audit/health",
  ]);
});

test("empty-object automationDetails { } is patched (forward-compat)", () => {
  const input = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: { driver: { name: "fallow", version: "2.102.0", rules: [{ id: "fallow/unused-file" }] } },
        automationDetails: {},
        results: [],
      },
    ],
  };
  const filter = extractPatchScript();
  const patched = applyPatch(filter, input);
  assert.strictEqual(
    patched.runs[0].automationDetails.id,
    "fallow/audit/dead-code",
  );
});

test("pre-set automationDetails.id is NOT overwritten (idempotency)", () => {
  const input = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: { driver: { name: "fallow", version: "2.102.0" } },
        automationDetails: { id: "fallow/audit/dupes" },
        results: [],
      },
    ],
  };
  const filter = extractPatchScript();
  const patched = applyPatch(filter, input);
  assert.strictEqual(
    patched.runs[0].automationDetails.id,
    "fallow/audit/dupes",
    "Pre-set automationDetails.id must not be overwritten",
  );
});

test("empty-rules run falls through to dupes classifier", () => {
  // Synthesized dupes run has empty rules array; rules[0].id is null and the
  // // "" fallback routes to fallow/audit/dupes.
  const input = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: { driver: { name: "fallow", version: "2.102.0", rules: [] } },
        results: [],
      },
    ],
  };
  const filter = extractPatchScript();
  const patched = applyPatch(filter, input);
  assert.strictEqual(
    patched.runs[0].automationDetails.id,
    "fallow/audit/dupes",
    "Empty-rules run should fall through to dupes",
  );
});

test("patch filter drops results with null or empty locations", () => {
  // fallow emits fallow/code-duplication clone-group summaries with
  // locations: null (a clone group spans multiple regions, no single primary
  // location). GitHub Code Scanning rejects any location-less result, so the
  // patch filter must drop them; the Fallow audit gate still enforces the
  // duplication policy separately.
  const input = {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "fallow",
            version: "2.102.0",
            rules: [{ id: "fallow/unused-file" }],
          },
        },
        automationDetails: {},
        results: [
          {
            ruleId: "fallow/unused-file",
            level: "warning",
            message: { text: "unused export" },
            locations: [
              {
                physicalLocation: { artifactLocation: { uri: "a.js" } },
              },
            ],
          },
          {
            ruleId: "fallow/code-duplication",
            level: "warning",
            message: { text: "Clone group 1 (29 lines, 2 instances)" },
            locations: null,
          },
          {
            ruleId: "fallow/code-duplication",
            level: "warning",
            message: { text: "Clone group 2 (14 lines, 2 instances)" },
            locations: [],
          },
        ],
      },
    ],
  };
  const filter = extractPatchScript();
  const patched = applyPatch(filter, input);
  assert.strictEqual(
    patched.runs[0].results.length,
    1,
    "Null-location and empty-location results must be dropped",
  );
  assert.strictEqual(
    patched.runs[0].results[0].ruleId,
    "fallow/unused-file",
    "The located result must survive",
  );
  assert.strictEqual(
    patched.runs[0].automationDetails.id,
    "fallow/audit/dead-code",
  );
});