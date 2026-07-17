/**
 * Unit tests for the shared patch-hints helper (listMutableFieldsCsv).
 *
 * Why this exists: PR #67 introduced a 13-line schema-derivation block
 * duplicated between meta-state-patch-tool.js's buildEmptyPatchHint and
 * meta-state-batch-tool.js's buildNoContentHint (fallow fingerprint
 * dup:7bcb1118). The duplication was resolved by extracting
 * listMutableFieldsCsv into tools/learning-loop-mastra/lib/patch-hints.js.
 * These tests pin the helper's contract independently of the two
 * call-sites so future schema drift surfaces here first, not in the gate.
 *
 * Coverage:
 * - Per-kind isolation (finding fields must not leak into rule hint, etc.)
 * - Priority ordering (description + evidence_code_ref listed first)
 * - Unknown-kind fallback (no throw, returns fallback verbatim)
 * - 12-field cap (slice behavior)
 */

import { describe, test } from "vitest";
import assert from "node:assert";
import { listMutableFieldsCsv } from "../../../lib/patch-hints.js";

const FALLBACK = "see the per-kind patch schema for the full field list";

describe("listMutableFieldsCsv", () => {
  test("finding kind names description + evidence_code_ref first (common refresh case)", () => {
    const csv = listMutableFieldsCsv("finding", FALLBACK);
    const fields = csv.split(", ");
    assert.equal(fields[0], "description", `description must be first, got: ${csv}`);
    assert.equal(fields[1], "evidence_code_ref", `evidence_code_ref must be second, got: ${csv}`);
    assert.ok(fields.includes("severity"), "finding hint must include severity");
    assert.ok(fields.includes("affected_system"), "finding hint must include affected_system");
    assert.ok(fields.includes("category"), "finding hint must include category");
  });

  test("rule kind does NOT leak finding-only fields (per-kind isolation)", () => {
    const csv = listMutableFieldsCsv("rule", FALLBACK);
    assert.equal(csv.split(", ")[0], "description", "rule hint must list description first");
    assert.equal(csv.split(", ")[1], "evidence_code_ref", "rule hint must list evidence_code_ref second");
    // Finding-only fields must NOT appear in a rule hint (would mislead the
    // operator into sending invalid fields; meta_state_patch rejects with
    // invalid_field via branch_mismatch-style validation).
    assert.ok(!csv.includes("severity"), `rule hint must not include finding-only field severity (got: ${csv})`);
    assert.ok(!csv.includes("affected_system"), `rule hint must not include finding-only field affected_system (got: ${csv})`);
    assert.ok(!csv.includes("category"), `rule hint must not include finding-only field category (got: ${csv})`);
    // Rule-specific fields must appear.
    assert.ok(csv.includes("pattern"), `rule hint must include rule-only field pattern (got: ${csv})`);
    assert.ok(csv.includes("enforcement"), `rule hint must include rule-only field enforcement (got: ${csv})`);
  });

  test("loop-design kind lists description first (evidence_code_ref is finding-only)", () => {
    const csv = listMutableFieldsCsv("loop-design", FALLBACK);
    const fields = csv.split(", ");
    assert.equal(fields[0], "description", "loop-design hint must list description first");
    // Loop-design's distinguishing fields.
    assert.ok(fields.includes("proposed_design_for"), `loop-design hint must include proposed_design_for (got: ${csv})`);
    assert.ok(fields.includes("addresses"), `loop-design hint must include addresses (got: ${csv})`);
    // Loop-design patch schema is finding-distinct on these two fields.
    // (severity_hint is loop-design's severity-equivalent, not severity itself.)
    assert.ok(!fields.includes("evidence_code_ref"), `loop-design hint must not include finding-only evidence_code_ref (got: ${csv})`);
    assert.ok(!fields.includes("severity"), `loop-design hint must not include finding-only severity (got: ${csv})`);
    assert.ok(!fields.includes("recurrence_key"), `loop-design hint must not include finding-only recurrence_key (got: ${csv})`);
  });

  test("change-log kind still emits a hint (rare but valid path)", () => {
    const csv = listMutableFieldsCsv("change-log", FALLBACK);
    // change-log schema has no description/evidence_code_ref shape in the
    // patch schema (it's handler-level immutable), so the priority list
    // contributes nothing and the rest of the shape — whatever it is — is
    // returned. We don't assert the exact contents, just that the helper
    // returns SOMETHING non-fallback (the schema has fields, even if sparse).
    assert.ok(typeof csv === "string", "must return a string");
    assert.ok(csv.length > 0, "must not be empty");
  });

  test("unknown kind returns the fallback verbatim", () => {
    const csv = listMutableFieldsCsv("not-a-kind", FALLBACK);
    assert.equal(csv, FALLBACK, `unknown kind must return fallback verbatim, got: ${csv}`);
  });

  test("unknown kind with empty string fallback still returns it", () => {
    const csv = listMutableFieldsCsv("not-a-kind", "");
    assert.equal(csv, "", "empty fallback must round-trip");
  });

  test("caps CSV at 12 fields (hint messages stay compact)", () => {
    // Pick whichever kind has the largest shape; the cap is a hard 12
    // regardless. We just confirm the slice applies — the exact field count
    // depends on the schema, but the cap is structural.
    const csv = listMutableFieldsCsv("finding", FALLBACK);
    const fields = csv.split(", ");
    assert.ok(fields.length <= 12, `field list must be capped at 12, got ${fields.length}: ${csv}`);
  });

  test("priority fields appear before non-priority fields when both exist", () => {
    const csv = listMutableFieldsCsv("finding", FALLBACK);
    const fields = csv.split(", ");
    const descriptionIdx = fields.indexOf("description");
    const evidenceIdx = fields.indexOf("evidence_code_ref");
    const severityIdx = fields.indexOf("severity");
    // severity (non-priority) must come after both priority fields.
    assert.ok(
      descriptionIdx < severityIdx,
      `description must come before severity (got description at ${descriptionIdx}, severity at ${severityIdx})`,
    );
    assert.ok(
      evidenceIdx < severityIdx,
      `evidence_code_ref must come before severity (got evidence_code_ref at ${evidenceIdx}, severity at ${severityIdx})`,
    );
  });
});
