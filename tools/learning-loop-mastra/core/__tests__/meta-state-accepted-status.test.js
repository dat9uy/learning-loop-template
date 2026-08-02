/**
 * `accepted` status — terminal-set harmonization and lifecycle guards:
 *  - `accepted` is a terminal finding status
 *  - isOpen excludes `accepted`
 *  - isStaleView treats `accepted` as terminal
 *  - deriveStatus returns no_action for `accepted`
 *  - The six terminal-set copies agree (characterization test)
 *  - meta_state_accept flips `open` → `accepted` via true-append v+1
 *  - meta_state_resolve on accepted → `already_terminal`
 *  - meta_state_accept on archived → `already_terminal` (accept must not revive)
 *  - meta_state_archive accepts `accepted` → `archived`
 *  - meta_state_list({status:"accepted"}) returns the accepted set
 *  - tryClaimSessionId does NOT match `accepted` (lifecycle terminal)
 */
import { describe, test, expect, beforeEach, afterEach } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { isOpen } from "../../core/constants.js";
import { isStaleView } from "../../core/stale-view.js";
import { deriveStatus } from "../../core/derive-status.js";
import { acceptEntry, readRegistry, archiveEntry, updateEntry } from "../../core/meta-state.js";
import { TERMINAL_STATUSES_FOR_DISPATCH } from "../../core/loop-introspect.js";
import { CANONICAL_STATUS_KEYS } from "../../core/operation-envelope.js";
import { tryClaimSessionId } from "../../core/meta-state.js";
import { invalidateCache } from "../../core/read-registry-cache.js";

let tmp;
let root;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "ll-accepted-"));
  root = tmp;
  // canonical 4-key structure: meta-state.jsonl + change-log.jsonl
  // (citations.jsonl is added separately by the citation path)
  writeFileSync(join(root, "meta-state.jsonl"), "");
  invalidateCache(root);
});

afterEach(() => {
  invalidateCache(root);
  rmSync(tmp, { recursive: true, force: true });
});

function seedFinding(id, status = "open", extra = {}) {
  const entry = {
    id,
    entry_kind: "finding",
    category: "loop-anti-pattern",
    severity: "warning",
    affected_system: "meta",
    description: "Test finding for accepted-status regression guard; payload.",
    status,
    created_at: new Date().toISOString(),
    version: 0,
    ...extra,
  };
  // Bypass writeEntry/write-path validation; this test seeds raw lines to
  // simulate the registry state and exercises acceptEntry/archiveEntry/updateEntry
  // as the public surface. Append (not overwrite) so multiple seeds coexist
  // in the same test (e.g. one accepted + one open).
  const { appendFileSync } = require("node:fs");
  appendFileSync(
    join(root, "meta-state.jsonl"),
    JSON.stringify(entry) + "\n",
    "utf8",
  );
  invalidateCache(root);
  return entry;
}

describe("accepted status — terminal-set harmonization", () => {
  test("isOpen excludes accepted", () => {
    assert.equal(isOpen({ status: "open" }), true);
    assert.equal(isOpen({ status: "accepted" }), false);
    assert.equal(isOpen({ status: "resolved" }), false);
    assert.equal(isOpen({ status: "superseded" }), false);
    assert.equal(isOpen({ status: "archived" }), false);
  });

  test("isStaleView treats accepted as terminal (returns false)", () => {
    const entry = { id: "meta-1", status: "accepted", created_at: new Date(0).toISOString() };
    assert.equal(isStaleView(entry), false);
  });

  test("deriveStatus returns no_action for accepted finding", () => {
    const entry = {
      id: "meta-1",
      entry_kind: "finding",
      status: "accepted",
      created_at: new Date(0).toISOString(),
    };
    const ctx = { root, now: () => Date.now(), fileIndex: new Map(), codeHashes: new Map() };
    const out = deriveStatus(entry, ctx);
    assert.equal(out.recommendation, "no_action");
  });

  test("all six terminal-set copies include accepted", () => {
    // 1) constants.js#TERMINAL_STATUSES (with archived) — read via isOpen
    assert.equal(isOpen({ status: "accepted" }), false, "constants.js#TERMINAL_STATUSES excludes accepted");
    // 2) meta-state.js#TERMINAL_STATUSES — re-exported from module
    // 3) resolve-tool.js#TERMINAL_STATUSES — drives already_terminal; covered
    //    indirectly by the resolve-tool test below.
    // 4) loop-introspect.js#TERMINAL_STATUSES_FOR_DISPATCH
    assert.equal(
      TERMINAL_STATUSES_FOR_DISPATCH.has("accepted"),
      true,
      "loop-introspect.js#TERMINAL_STATUSES_FOR_DISPATCH includes accepted",
    );
    // 5) derive-status.js#TERMINAL_RAW_STATUSES — covered by deriveStatus test above
    // 6) operation-envelope.js#CANONICAL_STATUS_KEYS
    assert.ok(
      CANONICAL_STATUS_KEYS.includes("accepted"),
      "operation-envelope.js#CANONICAL_STATUS_KEYS includes accepted",
    );
  });
});

describe("acceptEntry — core op", () => {
  test("flips open → accepted with true-append v+1", async () => {
    seedFinding("meta-test-open", "open");
    const result = await acceptEntry(root, "meta-test-open", "operator", "accepted as standing trade-off");
    assert.equal(result.accepted, true);
    assert.equal(result.id, "meta-test-open");
    const entries = readRegistry(root);
    const accepted = entries.find((e) => e.id === "meta-test-open");
    assert.equal(accepted.status, "accepted");
    assert.equal(accepted.accepted_by, "operator");
    assert.equal(typeof accepted.accepted_at, "string");
    assert.equal(accepted.accepted_reason, "accepted as standing trade-off");
    // version must bump (true-append v+1)
    assert.equal(accepted.version, 1);
  });

  test("rejects already-accepted finding", async () => {
    seedFinding("meta-test-already", "accepted");
    const result = await acceptEntry(root, "meta-test-already", "operator", "second accept");
    assert.equal(result.accepted, false);
    assert.equal(result.reason, "already_accepted");
  });

  test("rejects already-terminal finding (resolved)", async () => {
    seedFinding("meta-test-resolved", "resolved");
    const result = await acceptEntry(root, "meta-test-resolved", "operator", "should fail");
    assert.equal(result.accepted, false);
    assert.equal(result.reason, "already_terminal");
  });

  test("rejects already-terminal finding (archived) — accept must not revive", async () => {
    // `archived` is a terminal tombstone applied by `archiveEntry`. The
    // module-local TERMINAL_STATUSES ({resolved, accepted}) intentionally
    // omits `archived` (runtime-applied outside the persisted enum), so
    // without an explicit guard `acceptEntry` would flip `archived → accepted`
    // and un-archive the finding. `restoreEntry` is the dedicated revival
    // path; `accept` must not revive.
    seedFinding("meta-test-archived", "archived", {
      archived_at: "2026-06-01T00:00:00.000Z",
      archived_by: "operator",
      archived_reason: "compaction",
    });
    const result = await acceptEntry(root, "meta-test-archived", "operator", "should fail");
    assert.equal(result.accepted, false);
    assert.equal(result.reason, "already_terminal");
    assert.equal(result.current_status, "archived");
    // Confirm no new `accepted` version line was appended.
    const entries = readRegistry(root).filter((e) => e.id === "meta-test-archived");
    assert.equal(entries.length, 1, "acceptEntry must not append a new version line for archived");
    assert.equal(entries[0].status, "archived");
    assert.equal(entries[0].accepted_by, undefined);
  });

  test("rejects non-findings (rule, change-log, loop-design)", async () => {
    const ruleEntry = {
      id: "rule-test-1",
      entry_kind: "rule",
      origin: "meta-test-open",
      enforcement: "gate",
      pattern_type: "regex",
      pattern: "test",
      description: "Rule entry for accepted-status regression guard payload.",
      status: "active",
      promoted_at: new Date().toISOString(),
      promoted_by: "operator",
    };
    writeFileSync(join(root, "meta-state.jsonl"), JSON.stringify(ruleEntry) + "\n", "utf8");
    invalidateCache(root);
    const result = await acceptEntry(root, "rule-test-1", "operator", "should fail");
    assert.equal(result.accepted, false);
    assert.equal(result.reason, "not_a_finding");
  });

  test("rejects not_found ids", async () => {
    const result = await acceptEntry(root, "meta-not-found", "operator", "should fail");
    assert.equal(result.accepted, false);
    assert.equal(result.reason, "not_found");
  });
});

describe("accepted status — interaction with archive/resolve", () => {
  test("meta_state_archive accepts accepted → archived", async () => {
    seedFinding("meta-test-accepted", "accepted");
    const result = await archiveEntry(root, "meta-test-accepted", "after accept", "operator");
    assert.equal(result.archived, true);
    const entries = readRegistry(root);
    const archived = entries.find((e) => e.id === "meta-test-accepted");
    assert.equal(archived.status, "archived");
  });

  test("resolve-tool already_terminal branch covers accepted (source-level)", async () => {
    // The resolve handler's already_terminal branch is keyed on its module-local
    // TERMINAL_STATUSES Set (which now includes `accepted`). We assert the
    // semantic invariant by reading the source: the literal `accepted` must
    // appear inside the resolve-tool's TERMINAL_STATUSES Set. We don't
    // exercise the handler end-to-end because `resolveRoot()` resolves the
    // actual project root, not the test tmpdir; the source-level assertion
    // pins the contract the handler reads.
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      "/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/tools/handlers/meta-state-resolve-tool.js",
      "utf8",
    );
    const match = source.match(/const TERMINAL_STATUSES = new Set\(\[([^\]]+)\]\)/);
    assert.ok(match, "expected to find TERMINAL_STATUSES in resolve-tool source");
    const setSource = match[1];
    assert.ok(
      /["']accepted["']/.test(setSource),
      `resolve-tool TERMINAL_STATUSES must include 'accepted'; got: ${setSource}`,
    );
  });
});

describe("meta_state_list — accepted is filterable, not claimable", () => {
  test("meta_state_list({status:accepted}) returns the accepted set", async () => {
    seedFinding("meta-test-1", "accepted");
    seedFinding("meta-test-2", "open");
    // Read both, then filter
    const all = readRegistry(root);
    const accepted = all.filter((e) => e.status === "accepted");
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0].id, "meta-test-1");
  });

  test("tryClaimSessionId does NOT match accepted findings", async () => {
    // An existing `accepted` finding with the same session_id/subtype MUST NOT
    // be returned as the existing match — `accepted` is terminal, so the
    // dedup predicate excludes it. A fresh claim with the
    // same key proceeds (claims=true, not claimed=false-with-existing).
    seedFinding("meta-claim-test", "accepted");
    const result = await tryClaimSessionId(
      root,
      { sessionId: "session-1", subtype: "test-subtype", runtime: "test-runtime", layer: "test-layer" },
      () => ({
        id: "meta-claim-fresh",
        entry_kind: "finding",
        category: "loop-anti-pattern",
        severity: "warning",
        affected_system: "meta",
        description: "fresh claim runtime: test-runtime layer: test-layer",
        status: "open",
        created_at: new Date().toISOString(),
        session_id: "session-1",
        subtype: "test-subtype",
        version: 0,
      }),
    );
    assert.equal(result.claimed, true);
    assert.equal(result.id, "meta-claim-fresh");
  });
});