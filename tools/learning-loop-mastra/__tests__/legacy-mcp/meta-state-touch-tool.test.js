/**
 * Tests for the meta_state_touch tool — operator attestation path that
 * re-grounds an open finding whose `verification.steps` is empty (the
 * re-verify path requires steps; touch accepts "evidence hash still
 * matches the stored baseline" as the verification signal).
 *
 * Contract (plans/260724-1931-meta-state-touch-grounding-guarded-re-grounding-for-aged-findings
 * phase 1):
 *   1. `not_found` for unknown id.
 *   2. `wrong_status` for terminal (resolved/superseded) entries.
 *   3. `wrong_kind` for non-finding entries (rule/change-log/loop-design).
 *   4. Allow + stamp `last_verified_at` when grounding is grounded / skipped / null.
 *   5. Reject `drifted` when file bytes changed after baseline (hash_match:false).
 *   6. Reject `missing` when evidence file deleted (code_ref_exists:false).
 *   7. CAS conflict → `version_mismatch` returned with current_version.
 *   8. Success result includes `last_verified_at` and grounding snapshot; registry
 *      entry is otherwise unchanged (version bumped, status still `open`).
 *   9. Audit trail: gate-log entry on every call (success + rejection), plus
 *      a grounding-snapshot entry on success.
 */

import { describe, test, beforeAll, afterAll } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateTouchTool } from "../../tools/handlers/meta-state-touch-tool.js";
import { writeEntry, readRegistry, readFileIndex, upsertFileIndexEntry } from "../../core/meta-state.js";

const touchHandler = metaStateTouchTool.handler;
const TOOL_NAME = "meta_state_touch";

describe("meta_state_touch — grounding-guarded re-grounding for aged findings", () => {
  let root;
  let prevGateRoot;

  beforeAll(() => {
    prevGateRoot = process.env.GATE_ROOT;
    root = mkdtempSync(join(tmpdir(), "meta-state-touch-"));
    process.env.GATE_ROOT = root;
    mkdirSync(root, { recursive: true });
  });

  afterAll(() => {
    if (prevGateRoot === undefined) delete process.env.GATE_ROOT;
    else process.env.GATE_ROOT = prevGateRoot;
    try { rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  async function setupEntry(id, overrides = {}) {
    await writeEntry(root, {
      id,
      entry_kind: "finding",
      category: "loop-anti-pattern",
      severity: "warning",
      affected_system: "mcp-tools",
      description: "Test fixture for meta_state_touch (min 20 chars)",
      status: "open",
      verification: { steps: [], history: [] },
      ...overrides,
      created_at: new Date().toISOString(),
      version: 0,
    });
  }

  function parse(result) {
    return JSON.parse(result.content[0].text);
  }

  function gateLogPath() {
    return join(root, ".claude", "coordination", "gate-log.jsonl");
  }

  function readGateLog() {
    const p = gateLogPath();
    if (!existsSync(p)) return [];
    return readFileSync(p, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
  }

  // ─── 1. not_found ──────────────────────────────────────────────────────
  test("not_found for unknown id", async () => {
    const r = await touchHandler({ id: "meta-does-not-exist" });
    const parsed = parse(r);
    assert.strictEqual(parsed.touched, false);
    assert.strictEqual(parsed.reason, "not_found");
    assert.strictEqual(parsed.id, "meta-does-not-exist");
  });

  // ─── 2. wrong_status ───────────────────────────────────────────────────
  test("wrong_status for resolved entry", async () => {
    await setupEntry("meta-touch-resolved", { status: "resolved" });
    const r = await touchHandler({ id: "meta-touch-resolved" });
    const parsed = parse(r);
    assert.strictEqual(parsed.touched, false);
    assert.strictEqual(parsed.reason, "wrong_status");
    assert.strictEqual(parsed.id, "meta-touch-resolved");
    assert.strictEqual(parsed.current_status, "resolved");
  });

  test("wrong_status for superseded entry", async () => {
    await setupEntry("meta-touch-superseded", { status: "superseded" });
    const r = await touchHandler({ id: "meta-touch-superseded" });
    const parsed = parse(r);
    assert.strictEqual(parsed.touched, false);
    assert.strictEqual(parsed.reason, "wrong_status");
  });

  // ─── 3. wrong_kind ─────────────────────────────────────────────────────
  // Use direct JSONL writes (bypassing writeEntry's union-schema validation)
  // so the fixtures stay minimal — the handler's wrong_kind guard is what
  // we are testing, not the entry schemas.
  function writeRawLine(id, payload) {
    const line = JSON.stringify({ id, ...payload, version: 0 });
    appendFileSync(join(root, "meta-state.jsonl"), line + "\n");
  }

  test("wrong_kind for rule entry", async () => {
    writeRawLine("meta-touch-rule", {
      entry_kind: "rule",
      rule_id: "rule-test-touch",
      pattern_type: "regex",
      pattern: ".*",
      enforcement: "deny",
      status: "active",
      created_at: new Date().toISOString(),
    });
    const r = await touchHandler({ id: "meta-touch-rule" });
    const parsed = parse(r);
    assert.strictEqual(parsed.touched, false);
    assert.strictEqual(parsed.reason, "wrong_kind");
    assert.strictEqual(parsed.entry_kind, "rule");
  });

  test("wrong_kind for change-log entry", async () => {
    writeRawLine("meta-touch-changelog", {
      entry_kind: "change-log",
      change_dimension: "tooling",
      change_target: "test",
      change_diff: { added: [], removed: [], changed: [] },
      reason: "Test fixture for meta_state_touch wrong_kind (min 20 chars)",
      status: "active",
      created_at: new Date().toISOString(),
    });
    const r = await touchHandler({ id: "meta-touch-changelog" });
    const parsed = parse(r);
    assert.strictEqual(parsed.touched, false);
    assert.strictEqual(parsed.reason, "wrong_kind");
  });

  // ─── 4. allow + stamp (no evidence_code_ref) — common case ─────────────
  test("allow + stamp last_verified_at when entry has no evidence_code_ref (mechanism_check:false)", async () => {
    // No evidence_code_ref → checkGrounding returns status: "skipped" → allow.
    // This is the dominant 22-finding common case: a reported finding without
    // a code anchor whose only freshness signal is operator attestation.
    await setupEntry("meta-touch-no-evidence");
    const before = readRegistry(root).find((e) => e.id === "meta-touch-no-evidence");
    assert.ok(!before.last_verified_at, "fixture precondition: no prior last_verified_at");

    const r = await touchHandler({ id: "meta-touch-no-evidence" });
    const parsed = parse(r);
    assert.strictEqual(parsed.touched, true);
    assert.strictEqual(parsed.id, "meta-touch-no-evidence");
    assert.ok(parsed.last_verified_at, "last_verified_at must be stamped");
    assert.strictEqual(typeof parsed.last_verified_at, "string");
    // Grounding snapshot.
    assert.ok(parsed.grounding, "grounding snapshot must be returned");
    assert.strictEqual(parsed.grounding.status, "skipped");

    const after = readRegistry(root).find((e) => e.id === "meta-touch-no-evidence");
    assert.strictEqual(after.last_verified_at, parsed.last_verified_at);
    assert.strictEqual(after.status, "open", "status must remain open (no transition)");
    assert.strictEqual(after.version, 1, "version must bump by 1");
  });

  // ─── 5. allow when hash_match:true ─────────────────────────────────────
  test("allow when evidence exists, mechanism_check:true, hash matches baseline", async () => {
    const targetRel = "tools/touch-target.js";
    mkdirSync(join(root, "tools"), { recursive: true });
    writeFileSync(join(root, targetRel), "// initial content");
    // Seed baseline index entry to current hash so checkGrounding hash_match:true.
    const { computeFileHash } = await import("../../core/check-grounding.js");
    const currentHash = computeFileHash(join(root, targetRel));
    await upsertFileIndexEntry(root, targetRel, currentHash);

    await setupEntry("meta-touch-grounded", {
      evidence_code_ref: targetRel,
      mechanism_check: true,
    });

    const r = await touchHandler({ id: "meta-touch-grounded" });
    const parsed = parse(r);
    assert.strictEqual(parsed.touched, true);
    assert.strictEqual(parsed.grounding.status, "grounded");
    assert.strictEqual(parsed.grounding.hash_match, true);
  });

  // ─── 6. reject drifted (hash mismatch) ─────────────────────────────────
  test("reject drifted when file bytes changed after baseline (hash_match:false)", async () => {
    const targetRel = "tools/touch-drift.js";
    mkdirSync(join(root, "tools"), { recursive: true });
    writeFileSync(join(root, targetRel), "// original");
    const { computeFileHash } = await import("../../core/check-grounding.js");
    const originalHash = computeFileHash(join(root, targetRel));
    await upsertFileIndexEntry(root, targetRel, originalHash);

    await setupEntry("meta-touch-drifted", {
      evidence_code_ref: targetRel,
      mechanism_check: true,
    });

    // Mutate file bytes so the baseline no longer matches.
    writeFileSync(join(root, targetRel), "// modified bytes after baseline");

    const r = await touchHandler({ id: "meta-touch-drifted" });
    const parsed = parse(r);
    assert.strictEqual(parsed.touched, false);
    assert.strictEqual(parsed.reason, "drifted");
    assert.strictEqual(parsed.grounding.status, "drifted");
    assert.strictEqual(parsed.grounding.hash_match, false);

    // No stamp applied.
    const after = readRegistry(root).find((e) => e.id === "meta-touch-drifted");
    assert.ok(!after.last_verified_at, "no stamp on drifted entry");
  });

  // ─── 7. reject missing (file deleted) ──────────────────────────────────
  test("reject missing when evidence file deleted (code_ref_exists:false)", async () => {
    const targetRel = "tools/touch-missing.js";
    mkdirSync(join(root, "tools"), { recursive: true });
    // File intentionally never created.
    await setupEntry("meta-touch-missing", {
      evidence_code_ref: targetRel,
      mechanism_check: true,
    });

    const r = await touchHandler({ id: "meta-touch-missing" });
    const parsed = parse(r);
    assert.strictEqual(parsed.touched, false);
    assert.strictEqual(parsed.reason, "missing");
    assert.strictEqual(parsed.grounding.code_ref_exists, false);

    const after = readRegistry(root).find((e) => e.id === "meta-touch-missing");
    assert.ok(!after.last_verified_at, "no stamp on missing entry");
  });

  // ─── 8. CAS conflict ───────────────────────────────────────────────────
  test("CAS conflict → version_mismatch, no stamp", async () => {
    await setupEntry("meta-touch-cas");
    const r = await touchHandler({ id: "meta-touch-cas", _expected_version: 99 });
    const parsed = parse(r);
    assert.strictEqual(parsed.touched, false);
    assert.strictEqual(parsed.reason, "version_mismatch");
    assert.ok(typeof parsed.current_version === "number", "current_version must be returned");

    const after = readRegistry(root).find((e) => e.id === "meta-touch-cas");
    assert.ok(!after.last_verified_at, "no stamp on CAS conflict");
    assert.strictEqual(after.version, 0, "version unchanged on conflict");
  });

  // ─── 9. audit trail ────────────────────────────────────────────────────
  test("audit: every call logs a gate-log breadcrumb; success adds a grounding snapshot entry", async () => {
    await setupEntry("meta-touch-audit-success");

    const r = await touchHandler({ id: "meta-touch-audit-success" });
    const parsed = parse(r);
    assert.strictEqual(parsed.touched, true);

    const log = readGateLog();
    const toolEntries = log.filter((e) => e.tool === TOOL_NAME && e.id === "meta-touch-audit-success");
    assert.ok(toolEntries.length >= 1, "at least one gate-log entry per call");
    // First entry carries the result shape.
    assert.strictEqual(toolEntries[0].touched, true);
    assert.ok(toolEntries[0].grounding, "grounding snapshot must be on the breadcrumb");
  });

  test("audit: rejection (drifted) also logs a breadcrumb", async () => {
    const targetRel = "tools/touch-audit-drift.js";
    mkdirSync(join(root, "tools"), { recursive: true });
    writeFileSync(join(root, targetRel), "// original");
    const { computeFileHash } = await import("../../core/check-grounding.js");
    const originalHash = computeFileHash(join(root, targetRel));
    await upsertFileIndexEntry(root, targetRel, originalHash);

    await setupEntry("meta-touch-audit-drift", {
      evidence_code_ref: targetRel,
      mechanism_check: true,
    });
    writeFileSync(join(root, targetRel), "// mutated");

    const r = await touchHandler({ id: "meta-touch-audit-drift" });
    const parsed = parse(r);
    assert.strictEqual(parsed.touched, false);
    assert.strictEqual(parsed.reason, "drifted");

    const log = readGateLog();
    const entry = log.find((e) => e.tool === TOOL_NAME && e.id === "meta-touch-audit-drift");
    assert.ok(entry, "rejection must still log a breadcrumb");
    assert.strictEqual(entry.touched, false);
    assert.strictEqual(entry.reason, "drifted");
  });
});
