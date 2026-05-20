import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadRegistry, evaluateWorkflows, validateCommand, triggerWorkflow } from "./workflow-runner.js";

function createTmpDir() {
  return mkdtempSync(join(tmpdir(), "workflow-runner-test-"));
}

describe("loadRegistry", () => {
  it("returns empty workflows when file is missing", () => {
    const tmp = createTmpDir();
    const registry = loadRegistry(tmp);
    assert.deepEqual(registry, { workflows: {} });
    rmSync(tmp, { recursive: true, force: true });
  });

  it("loads valid workflows.json", () => {
    const tmp = createTmpDir();
    const coordDir = join(tmp, ".claude", "coordination");
    mkdirSync(coordDir, { recursive: true });
    writeFileSync(
      join(coordDir, "workflows.json"),
      JSON.stringify({ workflows: { test: { triggers: ["docs/**"], change_types: ["updated"], commands: [["node", "tools/x.js"]] } } })
    );
    const registry = loadRegistry(tmp);
    assert.equal(registry.workflows.test.triggers[0], "docs/**");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns error on invalid JSON", () => {
    const tmp = createTmpDir();
    const coordDir = join(tmp, ".claude", "coordination");
    mkdirSync(coordDir, { recursive: true });
    writeFileSync(join(coordDir, "workflows.json"), "not json");
    const registry = loadRegistry(tmp);
    assert.ok(registry.registry_error);
    assert.deepEqual(registry.workflows, {});
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("evaluateWorkflows", () => {
  it("matches triggers by glob and filters by change_type", () => {
    const tmp = createTmpDir();
    const coordDir = join(tmp, ".claude", "coordination");
    mkdirSync(coordDir, { recursive: true });
    writeFileSync(
      join(coordDir, "workflows.json"),
      JSON.stringify({
        workflows: {
          docs: {
            triggers: ["docs/**"],
            change_types: ["created", "updated"],
            commands: [["node", "tools/docs.js"]],
          },
          records: {
            triggers: ["records/**"],
            change_types: ["deleted"],
            commands: [["node", "tools/records.js"]],
          },
        },
      })
    );

    const matches = evaluateWorkflows("docs/readme.md", "created", tmp);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].name, "docs");

    const noMatch = evaluateWorkflows("docs/readme.md", "deleted", tmp);
    assert.equal(noMatch.length, 0);

    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns registry error when workflows.json is invalid", () => {
    const tmp = createTmpDir();
    const coordDir = join(tmp, ".claude", "coordination");
    mkdirSync(coordDir, { recursive: true });
    writeFileSync(join(coordDir, "workflows.json"), "bad json");
    const matches = evaluateWorkflows("a", "b", tmp);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].name, "__registry_error");
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("validateCommand", () => {
  it("allows node with script under tools/", () => {
    assert.equal(validateCommand(["node", "tools/x.js"], "/tmp"), true);
    assert.equal(validateCommand(["node", "tools/sub/y.js"], "/tmp"), true);
  });

  it("rejects shell strings", () => {
    assert.equal(validateCommand(["bash", "-c", "echo bad"], "/tmp"), false);
    assert.equal(validateCommand(["sh", "script.sh"], "/tmp"), false);
  });

  it("rejects paths outside tools/", () => {
    assert.equal(validateCommand(["node", "/etc/passwd"], "/tmp"), false);
    assert.equal(validateCommand(["node", "../server.js"], "/tmp"), false);
    assert.equal(validateCommand(["node", "src/main.js"], "/tmp"), false);
  });

  it("rejects path traversal within tools/ prefix", () => {
    assert.equal(validateCommand(["node", "tools/../../etc/passwd"], "/tmp"), false);
    assert.equal(validateCommand(["node", "tools/../server.js"], "/tmp"), false);
    assert.equal(validateCommand(["node", "tools/sub/../../../etc/passwd"], "/tmp"), false);
  });

  it("rejects malformed commands", () => {
    assert.equal(validateCommand([], "/tmp"), false);
    assert.equal(validateCommand(["node"], "/tmp"), false);
    assert.equal(validateCommand("node tools/x.js", "/tmp"), false);
    assert.equal(validateCommand([123, "tools/x.js"], "/tmp"), false);
  });
});

describe("triggerWorkflow", () => {
  it("spawns with isolated stdio and logs to workflow-log.jsonl", async () => {
    const tmp = createTmpDir();
    const coordDir = join(tmp, ".claude", "coordination");
    const toolsDir = join(tmp, "tools");
    mkdirSync(coordDir, { recursive: true });
    mkdirSync(toolsDir, { recursive: true });

    writeFileSync(
      join(toolsDir, "echo.js"),
      "console.log('hello');\n"
    );
    writeFileSync(
      join(coordDir, "workflows.json"),
      JSON.stringify({
        workflows: {
          echo: {
            triggers: [],
            change_types: [],
            commands: [["node", "tools/echo.js"]],
          },
        },
      })
    );

    const result = await triggerWorkflow("echo", {}, tmp);
    assert.equal(result.triggered, true);
    assert.ok(Array.isArray(result.results));
    assert.ok(result.results[0].pid > 0);

    // Allow time for stdout handler to append to log
    await new Promise((r) => setTimeout(r, 300));

    const logPath = join(tmp, ".claude", "coordination", "workflow-log.jsonl");
    assert.ok(existsSync(logPath));
    const logs = readFileSync(logPath, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    assert.ok(logs.some((l) => l.workflow === "echo" && l.cmd));

    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns not_found for missing workflow", async () => {
    const tmp = createTmpDir();
    const coordDir = join(tmp, ".claude", "coordination");
    mkdirSync(coordDir, { recursive: true });
    writeFileSync(join(coordDir, "workflows.json"), JSON.stringify({ workflows: {} }));

    const result = await triggerWorkflow("missing", {}, tmp);
    assert.equal(result.triggered, false);
    assert.equal(result.reason, "not_found");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("returns not_allowed for disallowed commands", async () => {
    const tmp = createTmpDir();
    const coordDir = join(tmp, ".claude", "coordination");
    mkdirSync(coordDir, { recursive: true });
    writeFileSync(
      join(coordDir, "workflows.json"),
      JSON.stringify({
        workflows: {
          bad: {
            triggers: [],
            change_types: [],
            commands: [["bash", "-c", "echo bad"]],
          },
        },
      })
    );

    const result = await triggerWorkflow("bad", {}, tmp);
    assert.equal(result.triggered, true);
    assert.equal(result.results[0].triggered, false);
    assert.equal(result.results[0].reason, "not_allowed");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("substitutes {path} in command arguments", async () => {
    const tmp = createTmpDir();
    const coordDir = join(tmp, ".claude", "coordination");
    const toolsDir = join(tmp, "tools");
    mkdirSync(coordDir, { recursive: true });
    mkdirSync(toolsDir, { recursive: true });

    writeFileSync(
      join(toolsDir, "print.js"),
      "console.log(process.argv[2]);\n"
    );
    writeFileSync(
      join(coordDir, "workflows.json"),
      JSON.stringify({
        workflows: {
          print: {
            triggers: [],
            change_types: [],
            commands: [["node", "tools/print.js", "{path}"]],
          },
        },
      })
    );

    const result = await triggerWorkflow("print", { path: "docs/readme.md" }, tmp);
    assert.equal(result.triggered, true);
    assert.equal(result.results[0].triggered, true);
    assert.ok(result.results[0].pid > 0);
    rmSync(tmp, { recursive: true, force: true });
  });
});

describe("End-to-end: evidence-changed workflow", () => {
  it("triggerWorkflow spawns extract-index and logs to workflow-log.jsonl", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "workflow-e2e-"));
    mkdirSync(join(tmpDir, ".claude", "coordination"), { recursive: true });
    mkdirSync(join(tmpDir, "records", "evidence"), { recursive: true });
    mkdirSync(join(tmpDir, "records", "index"), { recursive: true });
    mkdirSync(join(tmpDir, "tools", "extract-index"), { recursive: true });
    mkdirSync(join(tmpDir, "tools", "validate-records"), { recursive: true });

    // Write a dummy evidence file
    writeFileSync(join(tmpDir, "records", "evidence", "test.md"), "# Test\n\n## Findings\n\n- [claim] something is true");

    // Create stub scripts that exit 0
    writeFileSync(join(tmpDir, "tools", "extract-index", "extract-index.js"), `console.log("extract-index ran");`);
    writeFileSync(join(tmpDir, "tools", "validate-records", "validate-records.js"), `console.log("validate-records ran");`);

    // Write workflows.json
    writeFileSync(join(tmpDir, ".claude", "coordination", "workflows.json"), JSON.stringify({
      workflows: {
        "evidence-changed": {
          triggers: ["records/evidence/**"],
          change_types: ["created", "updated"],
          commands: [
            ["node", "tools/extract-index/extract-index.js"],
            ["node", "tools/validate-records/validate-records.js"]
          ]
        }
      }
    }));

    const result = await triggerWorkflow("evidence-changed", { path: "records/evidence/test.md" }, tmpDir);
    assert.strictEqual(result.triggered, true);
    assert.ok(Array.isArray(result.results));
    assert.strictEqual(result.results.length, 2);

    // Wait a bit for spawn to finish and logs to be written
    await new Promise(r => setTimeout(r, 500));

    // Verify workflow-log.jsonl was created and has entries
    const logPath = join(tmpDir, ".claude", "coordination", "workflow-log.jsonl");
    assert.ok(existsSync(logPath), "workflow-log.jsonl should exist");
    const lines = readFileSync(logPath, "utf8").trim().split("\n");
    assert.ok(lines.length >= 2, "should have log entries for both commands");

    // Verify no .workflow-failures marker (since stubs exit 0)
    assert.ok(!existsSync(join(tmpDir, ".claude", "coordination", ".workflow-failures")), "no failures for exit 0");

    rmSync(tmpDir, { recursive: true, force: true });
  });
});
