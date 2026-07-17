import { test } from "vitest";
import assert from "node:assert/strict";
import { metaStatePatchTool } from "../../tools/handlers/meta-state-patch-tool.js";
import { metaStateReportTool } from "../../tools/handlers/meta-state-report-tool.js";
import { metaStateLogChangeTool } from "../../tools/handlers/meta-state-log-change-tool.js";
import { metaStateResolveTool } from "../../tools/handlers/meta-state-resolve-tool.js";
import { readRegistry } from "../../core/meta-state.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalEnv = process.env.GATE_ROOT;

function setup() {
  const tempDir = mkdtempSync(join(tmpdir(), "patch-test-"));
  process.env.GATE_ROOT = tempDir;
  return tempDir;
}

function teardown() {
  if (originalEnv === undefined) {
    delete process.env.GATE_ROOT;
  } else {
    process.env.GATE_ROOT = originalEnv;
  }
}

async function patchCall(args) {
  return JSON.parse((await metaStatePatchTool.handler(args)).content[0].text);
}

async function reportCall(args) {
  return JSON.parse((await metaStateReportTool.handler(args)).content[0].text);
}

async function logChangeCall(args) {
  return JSON.parse((await metaStateLogChangeTool.handler(args)).content[0].text);
}

async function resolveCall(args) {
  return JSON.parse((await metaStateResolveTool.handler(args)).content[0].text);
}

test("meta_state_patch happy path patches a finding's evidence_journal with CAS", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for patch tool happy path (min 20 chars)",
    });
    assert.equal(reportResult.reported, true);
    const id = reportResult.id;

    const result = await patchCall({
      id,
      entry_kind: "finding",
      patch: { evidence_journal: "docs/journals/test.md" },
      _expected_version: 0,
    });

    assert.equal(result.patched, true);
    assert.equal(result.version, 1);
    assert.equal(result.id, id);

    const entries = readRegistry(root);
    const updated = entries.find((e) => e.id === id);
    assert(updated, "updated entry not found in registry");
    assert.equal(updated.evidence_journal, "docs/journals/test.md");
    assert.equal(updated.version, 1);
  } finally {
    teardown();
  }
});

test("meta_state_patch CAS mismatch returns version_mismatch", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for CAS mismatch (min 20 chars)",
    });
    const id = reportResult.id;

    const result = await patchCall({
      id,
      entry_kind: "finding",
      patch: { evidence_journal: "docs/journals/test.md" },
      _expected_version: 99,
    });

    assert.equal(result.patched, false);
    assert.equal(result.reason, "version_mismatch");
    assert.equal(result.id, id);
    assert.equal(result.current_version, 0);
  } finally {
    teardown();
  }
});

test("meta_state_patch not found returns not_found", async () => {
  const root = setup();
  try {
    const result = await patchCall({
      id: "nonexistent-id-12345",
      entry_kind: "finding",
      patch: { evidence_journal: "docs/journals/test.md" },
    });

    assert.equal(result.patched, false);
    assert.equal(result.reason, "not_found");
    assert.equal(result.id, "nonexistent-id-12345");
  } finally {
    teardown();
  }
});

test("meta_state_patch change-log immutable returns change_log_immutable", async () => {
  const root = setup();
  try {
    const logResult = await logChangeCall({
      change_dimension: "surface",
      change_target: "tools/test.js",
      change_diff: { added: ["test"], removed: [], changed: [] },
      reason: "Test change-log for immutability check (min 20 chars)",
    });
    assert.equal(logResult.logged, true);
    const id = logResult.id;

    const result = await patchCall({
      id,
      entry_kind: "change-log",
      patch: { reason: "should not work" },
    });

    assert.equal(result.patched, false);
    assert.equal(result.reason, "change_log_immutable");
    assert.equal(result.id, id);
  } finally {
    teardown();
  }
});

test("meta_state_patch branch mismatch returns branch_mismatch", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for branch mismatch (min 20 chars)",
    });
    const id = reportResult.id;

    const result = await patchCall({
      id,
      entry_kind: "loop-design",
      patch: { title: "wrong kind" },
    });

    assert.equal(result.patched, false);
    assert.equal(result.reason, "branch_mismatch");
    assert.equal(result.id, id);
    assert.equal(result.expected, "loop-design");
    assert.equal(result.actual, "finding");
  } finally {
    teardown();
  }
});

test("meta_state_patch full lifecycle: create -> patch -> resolve", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for full lifecycle (min 20 chars)",
    });
    const id = reportResult.id;

    // Plan 260707-0812 Phase 2: ack removed; report writes status:"open" directly,
    // so we skip the ack step and resolve the open finding directly.
    const patchResult = await patchCall({
      id,
      entry_kind: "finding",
      patch: { evidence_code_ref: "tools/test.js:42" },
    });
    assert.equal(patchResult.patched, true);
    assert.equal(patchResult.version, 1);

    const resolveResult = await resolveCall({
      id,
      resolution: "Resolved via patch tool lifecycle test",
    });
    assert.equal(resolveResult.resolved, true);

    const entries = readRegistry(root);
    const final = entries.find((e) => e.id === id);
    assert.equal(final.status, "resolved");
    assert.equal(final.evidence_code_ref, "tools/test.js:42");
  } finally {
    teardown();
  }
});

test("meta_state_patch deny-list rejects identity/audit-trail field mutations", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for deny-list check (min 20 chars)",
    });
    const id = reportResult.id;

    const result = await patchCall({
      id,
      entry_kind: "finding",
      patch: { id: "new-id", created_at: "fake", resolved_at: "fake" },
    });

    assert.equal(result.patched, false);
    assert.equal(result.reason, "immutable_field");
    assert.equal(result.id, id);
    assert.ok(Array.isArray(result.denied_fields));
    assert.ok(result.denied_fields.includes("id"));
    assert.ok(result.denied_fields.includes("created_at"));
    assert.ok(result.denied_fields.includes("resolved_at"));
  } finally {
    teardown();
  }
});

// CV-B: code_fingerprint is a deprecated back-door write to the per-record
// baseline. It must be blocked (no-op) with a deprecation note pointing at the
// authoritative refresh path (meta_state_refresh_file_index).
test("meta_state_patch blocks code_fingerprint with a deprecation note pointing at refresh_file_index (CV-B)", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for code_fingerprint patch block (min 20 chars)",
    });
    const id = reportResult.id;

    const result = await patchCall({
      id,
      entry_kind: "finding",
      code_fingerprint: "sha256:" + "a".repeat(64),
    });

    assert.equal(result.patched, false, "code_fingerprint patch must be a no-op");
    assert.equal(result.reason, "immutable_field");
    assert.ok(result.denied_fields.includes("code_fingerprint"));
    assert.ok(
      typeof result.deprecation_note === "string" && result.deprecation_note.includes("meta_state_refresh_file_index"),
      "denial must point the caller at meta_state_refresh_file_index",
    );
    // The registry entry must be unchanged (no code_fingerprint written).
    const entry = readRegistry(root).find((e) => e.id === id);
    assert.equal(entry.code_fingerprint, undefined);
  } finally {
    teardown();
  }
});

// meta-260717T1026Z-...empty-patch: empty patches must NOT return patched:true.
// Two flavors cover the exposure surface: literal empty object, and
// immutable-fields-only (where every field is in the deny-list, leaving
// the effective patch empty after stripping).
test("meta_state_patch rejects empty patch object with reason empty_patch (meta-260717T1026Z)", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for empty-patch rejection (min 20 chars)",
    });
    const id = reportResult.id;

    const result = await patchCall({
      id,
      entry_kind: "finding",
      patch: {},
      _expected_version: 0,
    });

    assert.equal(result.patched, false, "empty patch must NOT report patched:true");
    assert.equal(result.reason, "empty_patch");
    assert.equal(result.id, id);
    assert.equal(result.entry_kind, "finding");
    assert.ok(
      typeof result.hint === "string" && result.hint.includes("meta_state_supersede") && result.hint.includes("meta_state_resolve"),
      "empty_patch rejection must point the caller at the right alternative tools",
    );

    // Registry unchanged: no version bump, no new line.
    const entries = readRegistry(root);
    const matching = entries.filter((e) => e.id === id);
    assert.equal(matching.length, 1, "empty patch must not append a new line");
    assert.equal(matching[0].version, 0, "version must not bump on empty patch");
  } finally {
    teardown();
  }
});

test("meta_state_patch never mutates when patch contains only immutable fields (meta-260717T1026Z)", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for immutable-only patch rejection (min 20 chars)",
    });
    const id = reportResult.id;

    // All four fields are immutable / identity — every field is stripped,
    // so the effective patch would be empty.
    const result = await patchCall({
      id,
      entry_kind: "finding",
      patch: {
        id: "meta-999999T9999Z-attempted-identity-override",
        version: 99,
        status: "resolved",
        resolved_at: "2099-01-01T00:00:00.000Z",
      },
      _expected_version: 0,
    });

    // The fields trigger immutable_field (deny-list catches them first).
    // The point of this test is that no mutation lands regardless of path.
    assert.equal(result.patched, false);
    assert.ok(
      result.reason === "immutable_field" || result.reason === "empty_patch",
      `expected immutable_field or empty_patch, got ${result.reason}`,
    );

    // Registry unchanged: no version bump.
    const entries = readRegistry(root);
    const matching = entries.filter((e) => e.id === id);
    assert.equal(matching.length, 1, "no mutation line may be appended");
    assert.equal(matching[0].version, 0, "version must not bump on this path");
    assert.equal(matching[0].id, id, "id must not be replaced via the patch path");
    assert.equal(matching[0].status, "open", "status must not be flipped via the patch path");
  } finally {
    teardown();
  }
});

// Plan 260717-1145 Phase 3: localized branch validation errors. When the
// model emits a real-but-invalid field, the rejection must name the field
// + constraint — not the opaque z.union "Invalid input" path:[] string that
// drives the model to retreat to {}.
test("meta_state_patch short description returns invalid_field with field_errors naming description (plan 260717-1145)", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for short-description invalid_field (min 20 chars)",
    });
    const id = reportResult.id;

    // description has min(20); "too short" is 9 chars (clearly under).
    const result = await patchCall({
      id,
      entry_kind: "finding",
      patch: { description: "too short" },
    });

    assert.equal(result.patched, false);
    assert.equal(result.reason, "invalid_field");
    assert.ok(Array.isArray(result.field_errors), "field_errors must be an array");
    const descErr = result.field_errors.find((e) => e.field === "description");
    assert.ok(descErr, `field_errors must include description (got ${JSON.stringify(result.field_errors)})`);
    assert.ok(
      typeof descErr.message === "string" && descErr.message.length > 0,
      "field_errors[].message must be a non-empty string",
    );

    // Registry unchanged: no version bump.
    const entries = readRegistry(root);
    const updated = entries.find((e) => e.id === id);
    assert.equal(updated.version, 0, "description<20 rejection must not bump version");
  } finally {
    teardown();
  }
});

test("meta_state_patch unknown key returns invalid_field naming the offending key (plan 260717-1145)", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for unknown-key invalid_field (min 20 chars)",
    });
    const id = reportResult.id;

    // bogus is not in the finding projection — strict() rejects.
    const result = await patchCall({
      id,
      entry_kind: "finding",
      patch: { bogus: "not a real field" },
    });

    assert.equal(result.patched, false);
    assert.equal(result.reason, "invalid_field");
    assert.ok(Array.isArray(result.field_errors));
    const offending = result.field_errors.find((e) => e.field === "bogus" || /bogus|unrecognized/i.test(e.message));
    assert.ok(
      offending,
      `field_errors must surface the bogus key (got ${JSON.stringify(result.field_errors)})`,
    );
  } finally {
    teardown();
  }
});

test("meta_state_patch bad enum value returns invalid_field naming the field (plan 260717-1145)", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for bad-enum invalid_field (min 20 chars)",
    });
    const id = reportResult.id;

    // category is enum loop-anti-pattern|gate-logic-bug|...
    const result = await patchCall({
      id,
      entry_kind: "finding",
      patch: { category: "not-an-enum-value" },
    });

    assert.equal(result.patched, false);
    assert.equal(result.reason, "invalid_field");
    assert.ok(Array.isArray(result.field_errors));
    assert.ok(
      result.field_errors.some((e) => e.field === "category"),
      `field_errors must name the category field (got ${JSON.stringify(result.field_errors)})`,
    );
  } finally {
    teardown();
  }
});

test("meta_state_patch finding-valid/rule-invalid field via entry_kind:rule is rejected per branch (plan 260717-1145)", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for cross-branch validation (min 20 chars)",
    });
    const id = reportResult.id;

    // Patch claims entry_kind:"rule" but contains finding-only keys (severity,
    // category, recurrence_key) — the per-rule branch projection rejects them.
    const result = await patchCall({
      id,
      entry_kind: "rule",
      patch: { severity: "warning" },
    });

    // The runtime sees a finding (existing entry.entry_kind === "finding"),
    // so the entry_kind mismatch guard at handler top is what fires (the
    // per-branch validator runs only AFTER that check). We assert that the
    // either rejection is surfaced — neither path is opaque "Invalid input".
    assert.equal(result.patched, false);
    assert.ok(
      result.reason === "branch_mismatch" ||
        (result.reason === "invalid_field" && Array.isArray(result.field_errors) && result.field_errors.length > 0),
      `expected branch_mismatch or invalid_field, got reason=${result.reason}`,
    );
  } finally {
    teardown();
  }
});

// Sanity: a valid patch still succeeds after the validator is in place.
test("meta_state_patch valid patch succeeds alongside new invalid_field path (plan 260717-1145)", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for valid-patch regression (min 20 chars)",
    });
    const id = reportResult.id;

    const result = await patchCall({
      id,
      entry_kind: "finding",
      patch: { evidence_journal: "docs/journals/regression.md" },
      _expected_version: 0,
    });

    assert.equal(result.patched, true);
    assert.equal(result.version, 1);
    assert.equal(result.id, id);
  } finally {
    teardown();
  }
});

// --- Plan 260717-1145 Phase 4: content-aware empty_patch hint ---
// The prior hint (line 116) only names lifecycle tools — none of which update
// description or evidence_code_ref, the actual goal in session e10944c4.
// Phase 4 derives the hint from buildPatchSchemaFor's shape so each kind's
// hint names its own mutable fields (no cross-kind leakage).

test("empty_patch hint for finding names description + evidence_code_ref + lifecycle tools (plan 260717-1145)", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for content-aware hint (min 20 chars)",
    });
    const id = reportResult.id;

    const result = await patchCall({
      id,
      entry_kind: "finding",
      patch: {},
      _expected_version: 0,
    });

    assert.equal(result.patched, false);
    assert.equal(result.reason, "empty_patch");
    assert.ok(typeof result.hint === "string", "hint must be a string");
    // Phase 4 requirements (finding hint):
    //   - description + evidence_code_ref first (common refresh case)
    //   - still names supersede / resolve / log_change
    assert.ok(
      result.hint.includes("description"),
      `finding hint must name description (got: ${result.hint})`,
    );
    assert.ok(
      result.hint.includes("evidence_code_ref"),
      `finding hint must name evidence_code_ref (got: ${result.hint})`,
    );
    assert.ok(result.hint.includes("meta_state_supersede"), "hint must still name meta_state_supersede");
    assert.ok(result.hint.includes("meta_state_resolve"), "hint must still name meta_state_resolve");
    assert.ok(result.hint.includes("meta_state_log_change"), "hint must still name meta_state_log_change");
  } finally {
    teardown();
  }
});

test("empty_patch hint for rule names rule-specific fields, no finding leakage (plan 260717-1145)", async () => {
  const root = setup();
  try {
    const reportResult = await reportCall({
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test finding for empty_patch per-kind hint (min 20 chars)",
    });
    const id = reportResult.id;

    // Reuse the finding id — the handler only checks the entry exists; the
    // empty_patch hint is built off the entry_kind param, which we send as
    // "rule" here. (The branch_mismatch guard fires first because the entry
    // is a finding, so to exercise the rule hint we must construct the
    // scenario differently. Use the resolve check on a non-existent id to
    // trigger empty_patch off the entry_kind — but empty_patch only fires
    // AFTER entry is found. So instead: change entry_kind to 'rule' for an
    // existing rule entry.)
    // Simpler: directly invoke metaStatePatchTool.handler bypassing the
    // branch_mismatch check by stubbing — use reportCall to make a
    // rule-kind entry via logChange (no rule reporting tool, so seed
    // manually via core).
    const { writeFileSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const seedEntry = {
      id: "meta-260717T2000Z-rule-empty-hint-fixture",
      entry_kind: "rule",
      status: "active",
      enforcement: "gate",
      pattern_type: "regex",
      pattern: "(test)-hint",
      description: "Rule fixture for empty_patch per-kind hint test (min 20 chars)",
      affected_system: "meta",
      created_at: new Date().toISOString(),
      version: 0,
    };
    const registryPath = join(root, "meta-state.jsonl");
    const existing = readFileSync(registryPath, "utf8").trimEnd();
    writeFileSync(registryPath, existing + "\n" + JSON.stringify(seedEntry), "utf8");

    const result = await patchCall({
      id: seedEntry.id,
      entry_kind: "rule",
      patch: {},
      _expected_version: 0,
    });

    assert.equal(result.patched, false);
    assert.equal(result.reason, "empty_patch");
    assert.ok(typeof result.hint === "string");
    // Rule-specific fields (per buildPatchSchemaFor('rule') projection):
    assert.ok(
      result.hint.includes("pattern"),
      `rule hint must name pattern (got: ${result.hint})`,
    );
    assert.ok(
      result.hint.includes("enforcement"),
      `rule hint must name enforcement (got: ${result.hint})`,
    );
    // No finding-specific leakage:
    assert.ok(
      !result.hint.includes("recurrence_key"),
      `rule hint must NOT contain finding-specific recurrence_key (got: ${result.hint})`,
    );
    // Lifecycle tools still named:
    assert.ok(result.hint.includes("meta_state_supersede"), "rule hint must still mention supersede");
    assert.ok(result.hint.includes("meta_state_log_change"), "rule hint must still mention log_change");
  } finally {
    teardown();
  }
});
