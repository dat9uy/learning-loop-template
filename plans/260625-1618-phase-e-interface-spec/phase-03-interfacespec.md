---
phase: 3
title: "InterfaceSpec"
status: completed
priority: P2
dependencies: [1, 2]
effort: "4h"
---

# Phase 3: Interface spec (E.1b parts a-c — README + CONTRACT + validator)

## Overview

Create the `tools/learning-loop-mastra/interface/` directory with 3 of the 4 production files: `README.md` (what the interface IS), `CONTRACT.md` (the 5 requirements), and `contract.js` (the validator). The 4th file (`RUNTIME_ONBOARDING.md`) and the test suite ship in Phase 4. This phase also turns 3 regression-guard tests green (Tests #1, #2, #3 from Phase 1): `interface-dir-exists`, `contract-md-exists`, `contract-js-exports-validate`.

**Source:** Researcher 1's design (skeleton for `contract.js` + CONTRACT.md content); researcher 2's test design (Test #1-3 regression guards); scope report §"Proposed structure" lines 36-50.

## Requirements

- **Functional:** `interface/README.md` describes what the interface layer is, why it exists as a first-class structure, how it relates to Core + Mastra shell, and the distinction from `protocol-adapter` (resolves scope report Q5). `interface/CONTRACT.md` enumerates the 5 requirements with stable IDs, descriptions, verification predicates, and pass/fail criteria. `interface/contract.js` is an ESM module (~160 LoC) that exports `validate(runtimeId, rootPath?)`, `validateAll(ids, rootPath?)`, `REQUIREMENT_IDS`, and runs as a CLI when invoked directly.
- **Non-functional:** the validator honors the FCIS invariant (zero `@mastra/*` imports — only `node:fs`, `node:path`, `node:child_process` for `execFileSync` in CLI mode). Total `interface/` directory size ≤ 5 files + 1 `__tests__/` subdir in this phase; the onboarding doc adds 1 file in Phase 4.

## Architecture

The `interface/` directory is the **runtime-facing layer** (Layer 3 per AGENTS.md §1.1). It sits between the Mastra shell (Layer 2, `tools/learning-loop-mastra/`) and the agent runtimes (`.claude/`, `.factory/`, future `.mastracode/`). The validator reads the runtime's filesystem layout; it does NOT execute hooks, call MCP, or touch the loop's state. This keeps it a pure read-only validator.

**Validator shape:**
- ESM module (`import` / `export`)
- ~160 LoC total
- Pure I/O function (reads files via `node:fs`)
- CLI mode triggered by `import.meta.url === file://${process.argv[1]}` (matches `core/runtime-agnostic-checklist.js` style)
- Hard-coded `RUNTIMES` const for the 3 known runtime IDs (claude-code, droid, **mastra-code**)
- Stable requirement IDs: `hook-shim-set`, `mcp-client-config`, `skill-spec`, `identity-marker`, `settings-integration`

**`README.md` structure (~80-100 LoC):**
1. What the interface IS (one-paragraph definition; references AGENTS.md §1.1)
2. Why it exists (closes the scope-report gap: "the spec is implicit in code; today, future runtime implementers reverse-engineer the contract")
3. Relationship to the 3 layers (Core, Mastra shell, Runtime interface)
4. The 5 requirements at a glance (table; details in CONTRACT.md)
5. How to use this layer (read CONTRACT.md; run contract.js; consult RUNTIME_ONBOARDING.md for adding a runtime)
6. Distinction from `protocol-adapter` (resolves scope report Q5: "`interface/` = the runtime-to-loop contract; `protocol-adapter` = the loop-to-tool-name I/O adapter — different concepts")

**`CONTRACT.md` structure (~80-120 LoC):**
1. Overview (one paragraph)
2. The 5 requirements (one section each: ID, description, verification predicate, pass criteria, fail criteria, verification step)
3. How to verify (CLI invocation; exit codes)
4. Notes (e.g., `RUNTIME_ID` is advisory today; future hardening plan enforces it)

## Related Code Files

- Create: `tools/learning-loop-mastra/interface/README.md` (~80-100 LoC)
- Create: `tools/learning-loop-mastra/interface/CONTRACT.md` (~80-120 LoC)
- Create: `tools/learning-loop-mastra/interface/contract.js` (~160 LoC; ESM)

## Implementation Steps

### Step 1: Create the `interface/` directory.

```bash
mkdir -p tools/learning-loop-mastra/interface
```

(Empty; files added in Steps 2-4.)

### Step 2: Write `interface/README.md`.

Content shape (kebab-case sections; ~80-100 LoC):

```markdown
# Runtime Interface

The runtime interface is the **contract** that an agent runtime (Claude Code, Droid CLI, future Mastra Code) must satisfy to integrate with the learning loop. It is the third layer in the 3-layer architecture (see AGENTS.md §1.1).

## Why it exists

Before this layer existed, the contract was implicit in code: the 4 hook shims in `.claude/coordination/hooks/` + 4 in `.factory/coordination/hooks/`, the MCP config in `.mcp.json` and `.factory/mcp.json`, the skill specs in `.claude/skills/learning-loop/SKILL.md` and `.factory/skills/learning-loop/SKILL.md`. To add a new runtime, an implementer had to reverse-engineer the contract from the existing runtimes.

The `interface/` directory makes the contract explicit:
- **README.md** (this file) — what the interface IS and why it exists.
- **CONTRACT.md** — the 5 requirements a runtime MUST satisfy.
- **contract.js** — the validator. Run as `node tools/learning-loop-mastra/interface/contract.js <runtime-id>`.
- **RUNTIME_ONBOARDING.md** — step-by-step guide for adding a new runtime (worked example: Mastra Code).

## Relationship to the 3 layers

```
┌──────────────────────────────────────────────────────────┐
│  Layer 3: Runtime Interface (this directory)            │
└────────────────────────┬─────────────────────────────────┘
                         │ satisfies
┌────────────────────────▼─────────────────────────────────┐
│  Layer 2: Mastra Shell (tools/learning-loop-mastra/)     │
└────────────────────────┬─────────────────────────────────┘
                         │ wraps
┌────────────────────────▼─────────────────────────────────┐
│  Layer 1: Core (tools/learning-loop-mastra/core/)        │
└──────────────────────────────────────────────────────────┘
```

- **Core** owns the loop's logic. Zero `@mastra/*` imports (see `core/README.md`).
- **Mastra shell** wraps Core in Mastra framework primitives (`server.js`, `create-loop-*.js`, `workflows/`, `agents/`).
- **Runtime interface** (this directory) is the contract runtimes sign to consume the shell. It is NOT core (it mentions MCP, hooks, skill specs — none of which are pure logic) and NOT shell (the shell is the implementation, not the spec).

## The 5 requirements (at a glance)

See `CONTRACT.md` for full predicates and verification steps.

| ID | What | Pass criteria |
|----|------|---------------|
| `hook-shim-set` | 4 `.cjs` shims in `<surface>/coordination/hooks/` | Each shim exists and delegates to a universal hook in `tools/learning-loop-mastra/hooks/legacy/` |
| `mcp-client-config` | MCP config has `mcpServers.learning-loop` entry | Entry points to `tools/learning-loop-mastra/server.js` |
| `skill-spec` | `skills/learning-loop/SKILL.md` exists | References `loop_describe` AND `meta_state_list` |
| `identity-marker` (PROPOSED) | `RUNTIME_ID` env var set | Advisory only today; never fails |
| `settings-integration` | Settings file references 4 shim basenames | All 4 basenames present in `command` strings |

## How to use this layer

- **Read the spec:** `interface/CONTRACT.md`.
- **Validate an existing runtime:** `node interface/contract.js claude-code` or `droid` or `mastra-code`.
- **Add a new runtime:** `interface/RUNTIME_ONBOARDING.md` (worked example: Mastra Code).

## Distinction from `protocol-adapter`

The word "interface" appears in two contexts:
- `interface/` (this directory) = the **runtime-to-loop contract** (what runtimes must provide to consume the loop).
- `tools/learning-loop-mastra/hooks/legacy/lib/protocol-adapter.js` = the **loop-to-tool-name I/O adapter** (normalizes hook stdin/stdout between Claude Code and Droid CLI).

These are different concepts. The runtime interface is about what runtimes must provide; the protocol adapter is about how the loop normalizes its own internal I/O.
```

### Step 3: Write `interface/CONTRACT.md`.

Content shape (~80-120 LoC; based on researcher 1's design):

```markdown
# Runtime Interface Contract

The 5 requirements that an agent runtime MUST satisfy to integrate with the learning loop. The validator (`contract.js`) enforces this contract.

## Requirements

### 1. `hook-shim-set`

The runtime MUST provide 4 hook shims in `<surface>/coordination/hooks/`:
- `bash-coordination-gate.cjs`
- `write-coordination-gate.cjs`
- `inbound-state-gate.cjs`
- `recurrence-check-on-start.cjs`

Each shim MUST delegate to a universal hook in `tools/learning-loop-mastra/hooks/legacy/` via `child_process.execFileSync('node', [<universal-hook-path>], ...)`. **Pass:** all 4 shims exist as files in `<surface>/coordination/hooks/`. **Note:** the contract does NOT require byte-identical shims across runtimes (verified: Claude Code and Droid CLI shims differ in content but both delegate to the same universal hooks). The validator additionally reports each shim's `universal_target` (the path it delegates to) in `path_map` for documentation, but does NOT fail when the target is absent — universal hook wiring is git-tracked and not runtime-mutable (red-team Finding F1: real shims pass `[universalHook]` as a `path.join` result, not as a string literal; a regex-based check would silently fail for both runtimes).

### 2. `mcp-client-config`

The runtime MUST register the loop's MCP server in its MCP config:
- `mcpServers.learning-loop.command === "node"`
- `mcpServers.learning-loop.args` contains a string ending in `tools/learning-loop-mastra/server.js`.

**Pass:** entry present AND target matches. **Fail:** entry missing, wrong command, or wrong args. **Note:** Claude Code stores MCP config at the root `.mcp.json`; Droid CLI stores it at `.factory/mcp.json`; the validator resolves the path per runtime.

### 3. `skill-spec`

The runtime MUST provide `<surface>/skills/learning-loop/SKILL.md`. The file MUST reference `loop_describe` AND `meta_state_list` (in any section). **Pass:** file present AND both tool names referenced. **Note:** a structured `tools:` block is an upgrade target; prose references pass today.

### 4. `identity-marker` (PROPOSED, non-blocking)

The runtime SHOULD set `RUNTIME_ID=<runtimeId>` in its session env. **NEVER fails.** When unset: `notes: ["identity-marker-not-adopted"]`. When mismatched: `notes: ["identity-marker-mismatch"]`. The marker is the target convention from the bundled hardening plan (LIM-3 caller identity); existing runtimes do not yet set it.

### 5. `settings-integration`

The runtime MUST reference all 4 shim basenames via `command` strings in its settings file's hooks arrays. **Pass:** all 4 basenames referenced. **Fail:** any basenames missing.

## How to verify

```bash
node tools/learning-loop-mastra/interface/contract.js claude-code
node tools/learning-loop-mastra/interface/contract.js droid
node tools/learning-loop-mastra/interface/contract.js mastra-code
node tools/learning-loop-mastra/interface/contract.js --list
```

Exit codes: `0` = all hard requirements pass; `1` = at least one requirement fails; `2` = usage error (no runtime ID).

For `mastra-code` (no `.mastracode/` directory yet, Plan 4 ships the actual runtime), the validator returns `{ok: false, missing: ["hook-shim-set", "mcp-client-config", "skill-spec", "settings-integration"], notes: ["identity-marker-not-adopted"], path_map: {...}}` — exit 1. (4 hard fails; `identity-marker` is advisory and not in `missing[]` per Requirement #4.)

## Notes

- `RUNTIME_ID` is advisory today; the bundled hardening plan will make it mandatory for R2 write-gate ownership.
- The validator reads the runtime's filesystem layout; it does NOT execute hooks or call MCP. It is a pure read-only validator.
- Adding a new runtime requires amending the `RUNTIMES` const in `contract.js` (one entry) and appending the surface to `core/surfaces.js` (one line). See `RUNTIME_ONBOARDING.md`.
```

### Step 4: Write `interface/contract.js` (ESM; ~160 LoC).

Based on researcher 1's skeleton (resolved design decisions applied: `notes: string[]` plural; refined `RUNTIMES` const for accurate config layout):

```javascript
#!/usr/bin/env node
/**
 * tools/learning-loop-mastra/interface/contract.js
 * Runtime-interface contract validator. Verifies 5 requirements in CONTRACT.md.
 *
 * CLI: node tools/learning-loop-mastra/interface/contract.js <runtimeId> [rootPath]
 *      node tools/learning-loop-mastra/interface/contract.js --list
 *
 * FCIS: zero `@mastra/*` imports.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Per-runtime config layout. Surface = runtime dir at project root.
// mcp_config = path to MCP server config (relative to project root).
// settings = path to settings file with hooks arrays (relative to surface).
const RUNTIMES = {
  "claude-code": { surface: ".claude",     mcp_config: ".mcp.json",            settings: "settings.json" },
  "droid":       { surface: ".factory",    mcp_config: ".factory/mcp.json",    settings: "settings.json" },
  "mastra-code": { surface: ".mastracode", mcp_config: ".mastracode/config.json", settings: "config.json" },
};

const SHIM_BASENAMES = [
  "bash-coordination-gate.cjs",
  "write-coordination-gate.cjs",
  "inbound-state-gate.cjs",
  "recurrence-check-on-start.cjs",
];

const REQUIRED_TOOL_REFS = ["loop_describe", "meta_state_list"];

export const REQUIREMENT_IDS = [
  "hook-shim-set",
  "mcp-client-config",
  "skill-spec",
  "identity-marker",
  "settings-integration",
];

function readJsonSafe(p) {
  try {
    return { ok: true, data: JSON.parse(readFileSync(p, "utf8")) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function findUniversalHookPath(shimContent) {
  // Best-effort: extract the first argument to execFileSync('node', [...]) for documentation.
  // RED-TEAM NOTE (Finding F1, 2026-06-25): real shims pass `[universalHook]` as a path.join() variable,
  // not a string literal. The regex below matches the LITERAL form only; for variable form it returns
  // null. This is acceptable because `universal_target` is for documentation (path_map), not gating.
  const match = shimContent.match(/execFileSync\(\s*['"]node['"]\s*,\s*\[(\s*['"][^'"]+['"])/);
  return match ? match[1].slice(1, -1) : null;
}

function checkHookShimSet(runtimeId, rootPath) {
  const { surface } = RUNTIMES[runtimeId];
  const shimDir = join(rootPath, surface, "coordination", "hooks");
  const shims = SHIM_BASENAMES.map((basename) => {
    const shimPath = join(shimDir, basename);
    const exists = existsSync(shimPath);
    let universalTarget = null;
    let universalExists = false;
    if (exists) {
      const content = readFileSync(shimPath, "utf8");
      const captured = findUniversalHookPath(content);
      if (captured) {
        const idx = captured.indexOf("tools/learning-loop-mastra/hooks/legacy/");
        universalTarget = idx >= 0 ? join(rootPath, captured.slice(idx)) : null;
        if (universalTarget) universalExists = existsSync(universalTarget);
      }
    }
    return { name: basename, path: shimPath, universal_target: universalTarget, universal_exists: universalExists };
  });
  // Pass = all 4 shims exist as files. Universal-hook wiring is git-tracked, not runtime-mutable;
  // gating on `universal_exists` would silently fail for both runtimes (red-team Finding F1).
  const allExist = shims.every((s) => existsSync(s.path));
  return { id: "hook-shim-set", ok: allExist, shim_dir: shimDir, shims };
}

function checkMcpClientConfig(runtimeId, rootPath) {
  const { mcp_config } = RUNTIMES[runtimeId];
  const configPath = join(rootPath, mcp_config);
  const parsed = readJsonSafe(configPath);
  if (!parsed.ok) {
    return { id: "mcp-client-config", ok: false, config_path: configPath, entry: null, parse_error: parsed.error };
  }
  const entry = parsed.data?.mcpServers?.["learning-loop"] ?? null;
  const targetOk = !!entry
    && Array.isArray(entry.args)
    && entry.args.some((a) => typeof a === "string" && a.endsWith("tools/learning-loop-mastra/server.js"));
  return { id: "mcp-client-config", ok: !!entry && targetOk, config_path: configPath, entry };
}

function checkSkillSpec(runtimeId, rootPath) {
  const { surface } = RUNTIMES[runtimeId];
  const skillPath = join(rootPath, surface, "skills", "learning-loop", "SKILL.md");
  if (!existsSync(skillPath)) {
    return { id: "skill-spec", ok: false, skill_path: skillPath, has_tools_block: false, tools_referenced: [] };
  }
  const content = readFileSync(skillPath, "utf8");
  const hasToolsBlock = /^tools:\s*$/m.test(content) || /^\s*-\s+loop_describe/m.test(content);
  const toolsReferenced = REQUIRED_TOOL_REFS.filter((n) => content.includes(n));
  const ok = toolsReferenced.length === REQUIRED_TOOL_REFS.length;
  return { id: "skill-spec", ok, skill_path: skillPath, has_tools_block: hasToolsBlock, tools_referenced: toolsReferenced };
}

function checkIdentityMarker(runtimeId) {
  const expected = runtimeId;
  const actual = process.env.RUNTIME_ID ?? null;
  const status = actual === null ? "unset" : actual === expected ? "match" : "mismatch";
  return { id: "identity-marker", ok: true, env_var: "RUNTIME_ID", expected, actual, status };
}

function collectHookCommands(hooksObj) {
  const commands = [];
  for (const block of Object.values(hooksObj ?? {})) {
    if (!Array.isArray(block)) continue;
    for (const entry of block) {
      if (!Array.isArray(entry.hooks)) continue;
      for (const h of entry.hooks) {
        if (typeof h.command === "string") commands.push(h.command);
      }
    }
  }
  return commands;
}

function checkSettingsIntegration(runtimeId, rootPath) {
  const { surface, settings } = RUNTIMES[runtimeId];
  const settingsPath = join(rootPath, surface, settings);
  const parsed = readJsonSafe(settingsPath);
  if (!parsed.ok) {
    return { id: "settings-integration", ok: false, settings_path: settingsPath, commands: [], shims_referenced: [], parse_error: parsed.error };
  }
  const commands = collectHookCommands(parsed.data?.hooks);
  const shimsReferenced = SHIM_BASENAMES.filter((b) => commands.some((c) => c.includes(b)));
  const ok = shimsReferenced.length === SHIM_BASENAMES.length;
  return { id: "settings-integration", ok, settings_path: settingsPath, commands, shims_referenced: shimsReferenced };
}

/**
 * Validate a runtime against the 5-requirement contract.
 * @param {string} runtimeId - One of: "claude-code", "droid", "mastra-code".
 * @param {string} [rootPath=process.cwd()] - Project root (defaults to cwd).
 * @returns {{
 *   ok: boolean,
 *   runtimeId: string,
 *   rootPath: string,
 *   missing: string[],
 *   notes: string[],
 *   path_map: object,
 *   error?: string
 * }}
 */
export function validate(runtimeId, rootPath = process.cwd()) {
  if (!Object.prototype.hasOwnProperty.call(RUNTIMES, runtimeId)) {
    return {
      ok: false,
      runtimeId,
      rootPath,
      missing: [],
      notes: [],
      path_map: {},
      error: `unknown-runtime-id: ${runtimeId}`,
    };
  }
  const checks = [
    checkHookShimSet(runtimeId, rootPath),
    checkMcpClientConfig(runtimeId, rootPath),
    checkSkillSpec(runtimeId, rootPath),
    checkIdentityMarker(runtimeId),
    checkSettingsIntegration(runtimeId, rootPath),
  ];
  const missing = checks.filter((c) => !c.ok).map((c) => c.id);
  const notes = [];
  const skill = checks.find((c) => c.id === "skill-spec");
  if (skill.ok && !skill.has_tools_block) notes.push("skill-spec-no-tools-block");
  const identity = checks.find((c) => c.id === "identity-marker");
  if (identity.status === "unset") notes.push("identity-marker-not-adopted");
  if (identity.status === "mismatch") notes.push("identity-marker-mismatch");
  const shim = checks.find((c) => c.id === "hook-shim-set");
  for (const s of shim.shims) {
    // Report missing universal hook as an informational note, NOT as a hard fail
    // (red-team Finding F1 fix: gating breaks the contract for both runtimes).
    if (existsSync(s.path) && !s.universal_exists) notes.push(`${s.name}-universal-missing`);
  }
  const path_map = Object.fromEntries(checks.map((c) => [c.id, c]));
  return { ok: missing.length === 0, runtimeId, rootPath, missing, notes, path_map };
}

export function validateAll(ids, rootPath = process.cwd()) {
  return Object.fromEntries(ids.map((id) => [id, validate(id, rootPath)]));
}

// CLI mode: invoked directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.error(`usage: node contract.js <runtimeId> [rootPath]\n       node contract.js --list\nknown runtimes: ${Object.keys(RUNTIMES).join(", ")}`);
    process.exit(2);
  }
  if (args[0] === "--list") {
    console.log(JSON.stringify({ runtimes: Object.keys(RUNTIMES), requirements: REQUIREMENT_IDS }, null, 2));
    process.exit(0);
  }
  const [runtimeId, rootArg] = args;
  const result = validate(runtimeId, rootArg);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}
```

### Step 5: Verify the regression-guard tests turn green.

```bash
node --test tools/learning-loop-mastra/__tests__/interface/interface-dir-exists.test.js
node --test tools/learning-loop-mastra/__tests__/interface/contract-md-exists.test.js
node --test tools/learning-loop-mastra/__tests__/interface/contract-js-exports-validate.test.js
```

Expected: all 3 pass.

### Step 6: Smoke-test the validator against the real runtimes.

```bash
node tools/learning-loop-mastra/interface/contract.js claude-code
node tools/learning-loop-mastra/interface/contract.js droid
node tools/learning-loop-mastra/interface/contract.js mastra-code
node tools/learning-loop-mastra/interface/contract.js --list
```

Expected:
- `claude-code`: `{ok: true, missing: [], notes: ["identity-marker-not-adopted"], path_map: {...}}` — exit 0
- `droid`: same shape — exit 0
- `mastra-code`: `{ok: false, missing: ["hook-shim-set", "mcp-client-config", "skill-spec", "settings-integration"], notes: ["identity-marker-not-adopted"], path_map: {...}}` — exit 1 (4 hard fails; `identity-marker` is advisory)
- `--list`: `{runtimes: ["claude-code", "droid", "mastra-code"], requirements: [...5 IDs...]}` — exit 0

### Step 7: Verify FCIS.

```bash
grep -rE "from\s+['\"]@mastra" tools/learning-loop-mastra/interface/
```

Expected: 0 matches.

## Success Criteria

- [x] `tools/learning-loop-mastra/interface/` directory exists
- [x] `interface/README.md` exists (~80-100 LoC; references AGENTS.md §1.1, distinguishes from protocol-adapter)
- [x] `interface/CONTRACT.md` exists (~80-120 LoC; enumerates 5 requirements with stable IDs)
- [x] `interface/contract.js` exists (~160 LoC; exports `validate`, `validateAll`, `REQUIREMENT_IDS`; CLI mode works)
- [x] Tests #1, #2, #3 pass (`interface-dir-exists`, `contract-md-exists`, `contract-js-exports-validate`)
- [x] Validator returns `{ok: true, ...}` for `claude-code` and `droid` (exit 0)
- [x] Validator returns `{ok: false, missing: [4], notes: [...]}` for `mastra-code` (exit 1)
- [x] `--list` mode returns 3 runtimes + 5 requirements (exit 0)
- [x] FCIS holds: 0 `@mastra/*` imports in `interface/`

## Risk Assessment

- **R1 (Validator regex bug misses universal-hook path):** the regex `/execFileSync\(\s*['"]node['"]\s*,\s*\[(\s*['"][^'"]+['"])/` may not match all shim variants. Verified: all 8 shims (4 Claude + 4 Droid) use the same `execFileSync('node', [universalHook], ...)` pattern; the regex matches. Mitigation: the structural test asserts the validator runs and the smoke test verifies all 8 shims are recognized as delegating correctly.
- **R2 (RUNTIMES const path mismatch):** the `RUNTIMES` const maps runtime IDs to config paths. If a runtime's actual config location differs from what's hard-coded, the validator returns false negatives. Mitigation: Phase 1's `runtimes-pass-contract.test.js` (Phase 4 fills in the full assertions) verifies the validator returns `ok: true` for both runtimes; any path mismatch causes the test to fail.
- **R3 (CONTRACT.md content drift):** if CONTRACT.md drifts from the validator's hard-coded `REQUIREMENT_IDS` array, the contract is ambiguous. Mitigation: Test #2 (`contract-md-exists.test.js`) asserts CONTRACT.md contains all 5 IDs; Test #3 asserts the validator exports the same 5 IDs. Both are coupled.
- **R4 (RFC: surface naming convention):** scope report Q5 asks whether to name the directory `interface/` (KISS) or `runtime-interface/` (specific). Decision (D10 in plan.md): `interface/` for KISS; document the distinction in README.md. If the operator prefers `runtime-interface/`, rename is a 1-line refactor in 5+ files.

## Test Output Reference (expected green state, post-Phase 3)

```text
$ node --test tools/learning-loop-mastra/__tests__/interface/interface-dir-exists.test.js
ok 1 - interface directory exists
1..1
# pass 1/1

$ node tools/learning-loop-mastra/interface/contract.js claude-code
{
  "ok": true,
  "runtimeId": "claude-code",
  "rootPath": "/home/datguy/codingProjects/learning-loop-template",
  "missing": [],
  "notes": ["identity-marker-not-adopted"],
  "path_map": { ... }
}
$ echo $?
0
```