import { test } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readRegistry,
  readRegistryAllVersions,
  updateEntry,
  writeEntry,
} from "../../core/meta-state.js";

function makeRoot() {
  return mkdtempSync(join(tmpdir(), "meta-state-rule-contract-"));
}

function canonicalRule(overrides = {}) {
  return {
    id: "rule-contract-fixture",
    entry_kind: "rule",
    internalization_level: "I2",
    pattern_type: "agent-checklist",
    pattern: JSON.stringify({
      version: 1,
      items: [{ id: "contract", description: "Deliver the Rule before agent judgment" }],
    }),
    description: "An authoritative description for the Rule contract fixture.",
    status: "active",
    promoted_at: "2026-08-13T00:00:00.000Z",
    promoted_by: "operator",
    version: 0,
    ...overrides,
  };
}

test("Rule reads keep stable ids, collapse latest versions, and retain forensic history", () => {
  const root = makeRoot();
  const legacy = {
    ...canonicalRule(),
    internalization_level: undefined,
    enforcement: "gate",
    pattern_type: "regex",
    pattern: "legacy-rule",
    version: 0,
  };
  const current = canonicalRule({
    internalization_level: "I3",
    pattern_type: "regex",
    pattern: "current-rule",
    evidence_code_ref: "tools/learning-loop-mastra/core/gate-logic.js#applyPromotedRules",
    version: 1,
  });
  writeFileSync(join(root, "meta-state.jsonl"), `${JSON.stringify(legacy)}\n${JSON.stringify(current)}\n`);

  const latest = readRegistry(root).find((entry) => entry.id === current.id);
  assert.equal(latest.version, 1);
  assert.equal(latest.internalization_level, "I3");
  assert.equal(latest.enforcement, undefined);

  const history = readRegistryAllVersions(root).filter((entry) => entry.id === current.id);
  assert.deepEqual(history.map((entry) => entry.version), [0, 1]);
  assert.equal(history[0].enforcement, "gate");
  assert.equal(history[1].id, history[0].id);
});

test("Rule patches append a version and reject an I3 transition without evidence", async () => {
  const root = makeRoot();
  await writeEntry(root, canonicalRule({ id: "rule-contract-prior" }));
  await writeEntry(root, canonicalRule());

  const rejected = await updateEntry(root, "rule-contract-fixture", {
    internalization_level: "I3",
    pattern_type: "regex",
    pattern: "deterministic-action",
  });
  assert.equal(rejected, "validation_failed");
  assert.equal(readRegistryAllVersions(root).filter((entry) => entry.id === "rule-contract-fixture").length, 1);

  const updated = await updateEntry(root, "rule-contract-fixture", {
    description: "A refined authoritative description for the Rule fixture.",
    supersedes: "rule-contract-prior",
  });
  assert.equal(updated, true);
  const latest = readRegistry(root).find((entry) => entry.id === "rule-contract-fixture");
  assert.equal(latest.version, 1);
  assert.equal(latest.internalization_level, "I2");
  assert.equal(latest.supersedes, undefined);
  const citations = readFileSync(join(root, "citations.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  assert.ok(citations.some((citation) =>
    citation.source === "rule-contract-fixture"
    && citation.target === "rule-contract-prior"
    && citation.rationale === "supersedes"));
  assert.equal(readRegistryAllVersions(root).filter((entry) => entry.id === "rule-contract-fixture").length, 2);
});

test("material Rule patches require and retain a supersession relation", async () => {
  const root = makeRoot();
  await writeEntry(root, canonicalRule({ id: "rule-contract-prior" }));
  await writeEntry(root, canonicalRule({ id: "rule-contract-material" }));

  const rejected = await updateEntry(root, "rule-contract-material", {
    pattern_type: "regex",
    pattern: "material-action",
  });
  assert.equal(rejected, "supersedes_required");
  assert.equal(readRegistryAllVersions(root).filter((entry) => entry.id === "rule-contract-material").length, 1);

  const updated = await updateEntry(root, "rule-contract-material", {
    pattern_type: "regex",
    pattern: "material-action",
    supersedes: "rule-contract-prior",
  });
  assert.equal(updated, true);
  const latest = readRegistry(root).find((entry) => entry.id === "rule-contract-material");
  assert.equal(latest.version, 1);
  assert.equal(latest.supersedes, undefined);
  const citations = readFileSync(join(root, "citations.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  assert.ok(citations.some((citation) =>
    citation.source === "rule-contract-material"
    && citation.target === "rule-contract-prior"
    && citation.rationale === "supersedes"));
});

test("delivery metadata is material and no-op Rule patches do not append phantom versions", async () => {
  const root = makeRoot();
  await writeEntry(root, canonicalRule({
    id: "rule-contract-delivery",
    hint_text: "Deliver this Rule through the session-start process surface.",
    hint_suggestion: "Read the Rule delivery guidance before acting.",
    hint_order: 1,
    hint_slug: "contract-delivery",
  }));
  await writeEntry(root, canonicalRule({ id: "rule-contract-delivery-prior" }));

  const rejected = await updateEntry(root, "rule-contract-delivery", {
    hint_order: 2,
  });
  assert.equal(rejected, "supersedes_required");

  const noOp = await updateEntry(root, "rule-contract-delivery", {
    hint_order: 1,
  });
  assert.equal(noOp, true);
  assert.equal(readRegistryAllVersions(root).filter((entry) => entry.id === "rule-contract-delivery").length, 1);
});
