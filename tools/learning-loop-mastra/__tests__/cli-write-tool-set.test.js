// cli-write-tool-set.test.js — Phase 1 of plans/260722-1343-write-capable-cli-w,
// extended by Phase 3 of plans/260722-2147.
//
// Membership test for the CLI write tool set. `CLI_WRITE_TOOLS` is the
// single source of truth for which mutation handlers the CLI carries; the
// MCP exclusion set (`CLI_TOOLS = CLI_READ_TOOLS ∪ CLI_WRITE_TOOLS`)
// drops the same names when `LOOP_RECORDS_VIA_CLI=1`. A future manifest
// addition is handled by the drift test (cli-write-tool-set-drift.test.js).
//
// Phase 3 added 2 workflow helper handlers to CLI_WRITE_TOOLS
// (`workflow_notify_artifact`, `workflow_trigger`) — stateless handlers
// that emit gate-log / trigger-log side effects. The 5 auxiliary read-ish
// tools moved into CLI_READ_TOOLS (see cli-mcp-subset-registration.test.js).
//
// `meta_state_dispatch_finding` is in the set — both `prepare` and
// `commit` stages ride the CLI. The handler does not call `gh`; the
// agent runs `gh issue create` between stages (handler comment line 14
// of meta-state-dispatch-finding-tool.js).

import { test } from "vitest";
import assert from "node:assert/strict";

import {
  CLI_WRITE_TOOLS,
  CLI_TOOLS,
  CLI_READ_TOOLS,
} from "../core/cli-tools.js";

const EXPECTED_WRITE_TOOLS = [
  "meta_state_report",
  "meta_state_resolve",
  "meta_state_promote_rule",
  "meta_state_log_change",
  "meta_state_patch",
  "meta_state_batch",
  "meta_state_archive",
  "meta_state_supersede",
  "meta_state_propose_design",
  "meta_state_ship_loop_design",
  "meta_state_dispatch_finding",
  "meta_state_re_verify",
  "meta_state_refresh_file_index",
  "runtime_state_record",
  "runtime_state_pause",
  "runtime_state_resume",
  "runtime_state_prune_surface",
  "gate_mark_preflight",
  "gate_override",
  "workflow_notify_artifact",
  "workflow_trigger",
];

test("CLI_WRITE_TOOLS is a Set with the exact expected write surface", () => {
  assert.ok(CLI_WRITE_TOOLS instanceof Set, "CLI_WRITE_TOOLS must be a Set");
  assert.deepStrictEqual(
    [...CLI_WRITE_TOOLS].sort(),
    [...EXPECTED_WRITE_TOOLS].sort(),
    "CLI_WRITE_TOOLS must equal the enumerated write tool list",
  );
});

test("CLI_TOOLS is the union of CLI_READ_TOOLS and CLI_WRITE_TOOLS", () => {
  assert.ok(CLI_TOOLS instanceof Set, "CLI_TOOLS must be a Set");
  const union = new Set([...CLI_READ_TOOLS, ...CLI_WRITE_TOOLS]);
  assert.deepStrictEqual(
    [...CLI_TOOLS].sort(),
    [...union].sort(),
    "CLI_TOOLS must equal CLI_READ_TOOLS ∪ CLI_WRITE_TOOLS (single source of truth)",
  );
});

test("read and write sets are disjoint", () => {
  for (const t of CLI_READ_TOOLS) {
    assert.ok(!CLI_WRITE_TOOLS.has(t), `read tool ${t} must not appear in CLI_WRITE_TOOLS`);
  }
});

test("auxiliary read-ish tools now ride CLI_READ_TOOLS (Phase 3 reclassification)", () => {
  // Inverted from pre-Phase-3 contract. These stateless handlers in
  // tools/manifest.json were reclassified out of MCP_RESIDUE into
  // CLI_READ_TOOLS by plans/260722-2147 Phase 3 (closes the audit gap
  // named in plans/reports/ak-problem-solving-260722-2125).
  const AUX_NOW_CLI = [
    "gate_check",
    "gate_check_recurrence",
    "meta_state_sweep",
    "meta_state_query_drift",
    "meta_state_relationship_validate",
  ];
  for (const t of AUX_NOW_CLI) {
    assert.ok(CLI_READ_TOOLS.has(t), `auxiliary tool ${t} must be in CLI_READ_TOOLS after Phase 3 reclassification`);
    assert.ok(CLI_TOOLS.has(t), `auxiliary tool ${t} must be in CLI_TOOLS`);
    assert.ok(!CLI_WRITE_TOOLS.has(t), `auxiliary tool ${t} must not be a write tool`);
  }
});

test("workflow write helpers ride CLI (Phase 3 reclassification)", () => {
  // workflow_generate_prompt is intentionally NOT here: it stays MCP
  // (deferred-rehoming) because its prompt blueprints resolve only under the
  // loop repo root. See cli-write-tool-set-drift.test.js MCP_RESIDUE.
  assert.ok(
    !CLI_READ_TOOLS.has("workflow_generate_prompt"),
    "workflow_generate_prompt must NOT ride CLI (deferred-rehoming; blueprints are loop-root-relative)",
  );
  assert.ok(
    CLI_WRITE_TOOLS.has("workflow_notify_artifact"),
    "workflow_notify_artifact emits gate-log side effects; rides CLI_WRITE_TOOLS",
  );
  assert.ok(
    CLI_WRITE_TOOLS.has("workflow_trigger"),
    "workflow_trigger emits trigger-log side effects; rides CLI_WRITE_TOOLS",
  );
});

test("meta_state_dispatch_finding is in CLI_WRITE_TOOLS (both prepare + commit stages)", () => {
  assert.ok(
    CLI_WRITE_TOOLS.has("meta_state_dispatch_finding"),
    "meta_state_dispatch_finding must ride the CLI for both stages (handler does not call gh)",
  );
});
