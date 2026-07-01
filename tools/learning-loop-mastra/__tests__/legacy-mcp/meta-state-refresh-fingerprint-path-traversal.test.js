import { describe, test, before, after } from "node:test";
import assert from "node:assert";
import { writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { metaStateRefreshFingerprintTool } from "../../tools/legacy/meta-state-refresh-fingerprint-tool.js";
import {
  _clearIdempotencyCacheForTests,
} from "../../tools/legacy/meta-state-refresh-fingerprint-tool.js";

let previousGateRoot;

before(() => {
  previousGateRoot = process.env.GATE_ROOT;
});

after(() => {
  if (previousGateRoot === undefined) delete process.env.GATE_ROOT;
  else process.env.GATE_ROOT = previousGateRoot;
});

function setupTempMetaState() {
  const root = mkdtempSync(join(tmpdir(), "path-traversal-"));
  mkdirSync(join(root, "meta-state"), { recursive: true });
  mkdirSync(join(root, ".claude", "coordination", "hooks"), { recursive: true });
  // The refresh-fingerprint tool resolves root via resolveRoot() which honors
  // GATE_ROOT; export GATE_ROOT for this test before invoking the handler.
  process.env.GATE_ROOT = root;
  // Write a meta-state registry with an entry whose evidence_code_ref points
  // outside the project root.
  const entry = {
    id: "meta-260701T0000Z-path-traversal",
    entry_kind: "finding",
    category: "gate-logic-bug",
    severity: "warning",
    affected_system: "gate-logic",
    status: "active",
    mechanism_check: true,
    evidence_code_ref: "/etc/passwd",
    created_at: "2026-07-01T00:00:00.000Z",
  };
  writeFileSync(
    join(root, "meta-state.jsonl"),
    JSON.stringify(entry) + "\n",
    "utf8",
  );
  return { root, entry };
}

describe("meta_state_refresh_fingerprint — path traversal guard", () => {
  test("refuses /etc/passwd with code_missing + path_containment outside_root", async () => {
    _clearIdempotencyCacheForTests();
    setupTempMetaState();
    const result = await metaStateRefreshFingerprintTool.handler(
      { id: "meta-260701T0000Z-path-traversal" },
      undefined,
    );
    const payload = JSON.parse(result.content[0].text);
    assert.strictEqual(payload.error, "code_missing");
    assert.strictEqual(payload.path_containment, "outside_root");
    assert.strictEqual(payload.evidence_code_ref, "/etc/passwd");
    assert.strictEqual(payload.cache_hit, false);
  });

  test("does NOT hash a file outside project root (no implicit realpath bypass)", async () => {
    _clearIdempotencyCacheForTests();
    const { entry } = setupTempMetaState();
    const result = await metaStateRefreshFingerprintTool.handler(
      { id: entry.id },
      undefined,
    );
    const payload = JSON.parse(result.content[0].text);
    // The tool MUST NOT report a fingerprint hash for an outside-root path.
    assert.strictEqual(payload.code_fingerprint, undefined);
    assert.strictEqual(payload.status, undefined);
  });
});
