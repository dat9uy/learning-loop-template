import { describe, test, beforeAll, afterAll, beforeEach } from "vitest";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { withR2Gate } from "../../mastra/with-r2-gate.js";
import { pinRuntimeIdAtBoot, __resetForTests } from "../../core/identity-pin.js";
import { __clearCache } from "../../core/r2/allowlist-cache.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = resolve(__dirname, "..", "..", "mastra", "server.js");
const CREATE_LOOP_TOOL = resolve(__dirname, "..", "..", "mastra", "create-loop-tool.js");

const SCHEMA_V1 = {
  version: 1,
  schema: "r2-allowlist/v1",
  "claude-code": { own: [".claude/**"], deny: [".factory/**", ".mastracode/**", ".loop/r2-allowlist.json", "runtime-state.jsonl", ".gate-override"] },
  droid: { own: [".factory/**"], deny: [".claude/**", ".mastracode/**", ".loop/r2-allowlist.json", "runtime-state.jsonl", ".gate-override"] },
  "mastra-code": { own: [".mastracode/**"], deny: [".claude/**", ".factory/**", ".loop/r2-allowlist.json", "runtime-state.jsonl", ".gate-override"] },
  universal: ["records/**", "plans/**", "docs/**", "AGENTS.md", "tools/learning-loop-mastra/**", ".loop/.cache/**", "meta-state.jsonl"],
};

describe("workflow + tool R2 coverage (F13/R4)", () => {
  let tempRoot;

  beforeAll(() => {
    __resetForTests();
    process.env.LOOP_SURFACE = ".claude";
    pinRuntimeIdAtBoot();
  });

  afterAll(() => {
    __resetForTests();
    __clearCache();
    delete process.env.LOOP_SURFACE;
  });

  beforeEach(() => {
    __clearCache();
    tempRoot = mkdtempSync(join(tmpdir(), "r2-wf-"));
    mkdirSync(join(tempRoot, ".loop"), { recursive: true });
    mkdirSync(join(tempRoot, ".claude"), { recursive: true });
    mkdirSync(join(tempRoot, ".factory"), { recursive: true });
    mkdirSync(join(tempRoot, "records"), { recursive: true });
    writeFileSync(join(tempRoot, ".loop", "r2-allowlist.json"), JSON.stringify(SCHEMA_V1));
    process.env.GATE_ROOT = tempRoot;
  });

  test("workflow_write_goes_through_r2: workflow tool with pathField targeting .factory/x from claude-code → throws", async () => {
    let executeCalled = false;
    const gated = withR2Gate({
      id: "run_workflow_test_write",
      pathFields: ["target_path"],
      execute: async () => { executeCalled = true; return "should not reach"; },
    });
    await assert.rejects(
      () => gated({ target_path: ".factory/x" }, {}),
      (err) => {
        if (err.name !== "R2WriteDeniedError") return false;
        const denial = err.denial;
        assert.equal(denial.error, "cross_runtime_write_denied");
        assert.equal(denial.runtime, "claude-code");
        assert.equal(denial.tool, "run_workflow_test_write");
        assert.ok(denial.hint.length > 0);
        return true;
      },
    );
    assert.equal(executeCalled, false, "execute must NOT run when the gate denies");
  });

  test("workflow_read_not_gated: pathField is empty → passthrough allow (no allowlist load)", async () => {
    // A read-only workflow tool with pathFields: [] is a passthrough.
    let executeCalled = false;
    const gated = withR2Gate({
      id: "run_workflow_read",
      pathFields: [],
      execute: async () => { executeCalled = true; return { ok: true }; },
    });
    const out = await gated({ some_arg: "anything" }, {});
    assert.equal(executeCalled, true);
    assert.deepEqual(out, { ok: true });
  });

  test("workflow_own_surface_allowed: claude-code → .claude/x via pathField → allow + execute runs", async () => {
    let executeCalled = false;
    const gated = withR2Gate({
      id: "run_workflow_own_write",
      pathFields: ["target_path"],
      execute: async (args) => { executeCalled = true; return { wrote: args.target_path }; },
    });
    const out = await gated({ target_path: ".claude/x" }, {});
    assert.equal(executeCalled, true);
    assert.deepEqual(out, { wrote: ".claude/x" });
  });

  test("bootstrap_deny_blocks_allowlist_write_via_gate: claude-code → .loop/r2-allowlist.json pathField → throws", async () => {
    const gated = withR2Gate({
      id: "run_workflow_smuggle",
      pathFields: ["target_path"],
      execute: async () => "should not reach",
    });
    await assert.rejects(
      () => gated({ target_path: ".loop/r2-allowlist.json" }, {}),
      (err) => err.name === "R2WriteDeniedError" && err.denial.reason === "bootstrap_deny",
    );
  });

  test("server.js convertWorkflowsToTools uses createLoopTool (R4 source-text guard)", () => {
    const src = readFileSync(SERVER_ENTRY, "utf8");
    // The workflow conversion must route through createLoopTool, not raw createTool.
    assert.ok(
      src.includes("createLoopTool"),
      "server.js must import/uses createLoopTool so workflow tools flow through R2",
    );
  });

  test("create-loop-tool.js wraps execute with withR2Gate (single auth point)", () => {
    const src = readFileSync(CREATE_LOOP_TOOL, "utf8");
    assert.ok(
      src.includes("withR2Gate"),
      "create-loop-tool.js must wrap execute with withR2Gate",
    );
  });

  test("round-trip: update_r2_allowlist-style cache invalidation → next R2 call sees new allowlist", async () => {
    // First, a path that is denied under the initial allowlist.
    const gated = withR2Gate({
      id: "run_workflow_rt",
      pathFields: ["target_path"],
      execute: async (args) => ({ wrote: args.target_path }),
    });
    // .factory/x is denied for claude-code initially.
    await assert.rejects(() => gated({ target_path: ".factory/x" }, {}));

    // Simulate the update_r2_allowlist tool: edit + invalidate cache.
    const edited = {
      ...SCHEMA_V1,
      "claude-code": { own: [".claude/**", ".factory/**"], deny: SCHEMA_V1["claude-code"].deny.filter((p) => p !== ".factory/**") },
    };
    writeFileSync(join(tempRoot, ".loop", "r2-allowlist.json"), JSON.stringify(edited));
    const { invalidateAllowlist } = await import("../../core/r2/allowlist-cache.js");
    invalidateAllowlist(tempRoot);

    // Now .factory/x is allowed for claude-code.
    const out = await gated({ target_path: ".factory/x" }, {});
    assert.deepEqual(out, { wrote: ".factory/x" });
  });
});