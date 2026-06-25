# Phase E Plan 2 Research: Test Suite + SKILL.md Updates + RUNTIME_ONBOARDING.md

**Type:** research (design, no implementation)
**Date:** 2026-06-25 16:18
**Slug:** plan-2-test-skill-onboarding
**For:** Phase E Plan 2 (Interface spec) — `plans/260625-0930-phase-e-interface-spec/`
**Scope sources:**
- `/home/datguy/codingProjects/learning-loop-template/plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` (the 5-requirement contract, 3-layer architecture)
- `/home/datguy/codingProjects/learning-loop-template/plans/260624-2335-phase-e-foundation/plan.md` (Plan 1, shipped)

---

## 0. Scope recap (so the plan author does not have to re-read the scope report)

Plan 2 ships two items:
1. **E.0** — Update both `SKILL.md` files (`.claude/` + `.factory/`) to point at the new contract instead of legacy paths.
2. **E.1b** — Create `tools/learning-loop-mastra/interface/` with `README.md`, `CONTRACT.md`, `contract.js`, `RUNTIME_ONBOARDING.md`, `__tests__/contract.test.js`.

The 5 contract requirements (per scope report line 52-60):

| # | Requirement | How verified (validator input) |
|---|-------------|-------------------------------|
| 1 | Hook shim set | 4 `.cjs` files exist at `<runtime-root>/coordination/hooks/{bash,write,inbound-state,recurrence-check-on-start}-*.cjs` |
| 2 | MCP client config | `mcpServers.learning-loop` entry exists in runtime's MCP config file pointing to `tools/learning-loop-mastra/server.js` |
| 3 | Skill spec | `<runtime-root>/skills/learning-loop/SKILL.md` exists |
| 4 | Identity marker (`RUNTIME_ID` env var) | PROPOSED — not yet adopted by `claude-code` or `droid`. Returns `missing: []` with `note: 'identity-marker-not-adopted'` when unset (per scope report line 59). |
| 5 | Settings integration | Settings file references the 4 hook shim paths |

**Existing runtimes (per repo state):**
- `.claude/` → Claude Code. Settings file: `.claude/settings.json`. MCP: `.mcp.json`. Hook shims: `.claude/coordination/hooks/{bash,write,inbound-state,recurrence-check-on-start}-*.cjs` (4 files; confirmed via `ls`).
- `.factory/` → Droid CLI. Settings file: `.factory/settings.json` + `.factory/hooks.json`. MCP: `.factory/mcp.json`. Hook shims: `.factory/coordination/hooks/*.cjs` (4 files).

---

## A. Test design: `tools/learning-loop-mastra/interface/__tests__/contract.test.js`

### A.1 Design principles

- Use `node:test` + `node:assert/strict` (matches all 4 `phase-e-foundation/*.test.js` files + `legacy-mcp/runtime-agnostic.test.js`).
- Fixtures: use `fs.mkdtempSync` for fake-runtime dirs; auto-cleanup in `finally`.
- Per-runtime dirs (`.claude/`, `.factory/`) must be **inspected, not mutated** — the tests are regression guards; never write to a real runtime's dir.
- Test count: ~24 tests (5 req × ~3 scenarios + structural). Cap at 30 per YAGNI.
- Each test must produce a single, named failure message (use `assert.strictEqual` + a diagnostic string).

### A.2 Validator API (target shape — design contract for `contract.js`)

```js
// tools/learning-loop-mastra/interface/contract.js
//
// ESM. Pure function. No I/O beyond filesystem reads.
//
// Usage (programmatic):
//   import { validate } from "./contract.js";
//   const result = validate("claude-code", { projectRoot: process.cwd() });
//
// Usage (CLI):
//   node interface/contract.js <runtime-id>
//   node interface/contract.js --list        # list known runtime IDs + contract reqs
//
// Return shape:
//   {
//     ok: boolean,                          // true iff missing.length === 0 AND identity-marker-adopted (or note present)
//     runtime_id: "claude-code",
//     missing: ["hook-shim-set", ...],      // requirement IDs that failed
//     notes: ["identity-marker-not-adopted"], // advisory, does not flip ok to false
//     path_map: {                           // resolved paths (for debugging)
//       hook_shim_dir: "<abs path>",
//       mcp_config_file: "<abs path>",
//       skill_spec_file: "<abs path>",
//       settings_file: "<abs path>"
//     }
//   }
//
// Requirement IDs (stable strings — used in `missing` and in tests):
//   "hook-shim-set" | "mcp-client-config" | "skill-spec"
//   "identity-marker" | "settings-integration"
```

### A.3 Fixture strategy: `_fixtures/` — do NOT commit a `_fixtures/` dir

**Decision (recommended):** do not commit a `tools/learning-loop-mastra/interface/__tests__/_fixtures/` directory at all. Instead, **build fake runtime dirs in-memory** with `fs.mkdtempSync` and populate them with `writeFileSync`. This is cleaner, self-cleaning, and matches `legacy-mcp/runtime-agnostic.test.js` (which uses `mkdtempSync`).

```js
// Test setup pattern
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function fakeRuntimeRoot(setup = {}) {
  const root = mkdtempSync(join(tmpdir(), "ll-contract-"));
  // Default: empty (every requirement fails)
  if (setup.hookShims) {
    const hooksDir = join(root, ".fake/coordination/hooks");
    mkdirSync(hooksDir, { recursive: true });
    for (const name of setup.hookShims) {
      writeFileSync(join(hooksDir, name), "// stub\n");
    }
  }
  if (setup.mcpConfigPath) {
    writeFileSync(setup.mcpConfigPath, JSON.stringify({
      mcpServers: { "learning-loop": { command: "node", args: ["tools/learning-loop-mastra/server.js"] } }
    }));
  }
  if (setup.skillSpec) {
    mkdirSync(join(root, ".fake/skills/learning-loop"), { recursive: true });
    writeFileSync(join(root, ".fake/skills/learning-loop/SKILL.md"), setup.skillSpec);
  }
  if (setup.settingsPath) {
    writeFileSync(setup.settingsPath, JSON.stringify(setup.settings || { hooks: {} }));
  }
  return root;
}

// In tests:
test("...", () => {
  const root = fakeRuntimeRoot({ /* ... */ });
  try {
    // ... call validator with root as projectRoot ...
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

**Rationale:** zero committed fixtures = zero maintenance burden. `mkdtempSync` is atomic and OS-cleaned; `finally` block guarantees cleanup even on assertion failure.

### A.4 Test inventory (target: 24 tests)

#### Group 1 — Structural / module-shape (4 tests)

| # | Test name | What it asserts |
|---|-----------|----------------|
| S1 | `contract.js exports validate as named export` | `import { validate } from "../contract.js"` resolves; `typeof validate === "function"` |
| S2 | `contract.js exposes REQUIREMENT_IDS constant` | A frozen array containing the 5 requirement IDs in order |
| S3 | `contract.js runs as CLI (--list)` | `node contract.js --list` exits 0 and prints the 5 requirement IDs |
| S4 | `contract.js runs as CLI with a runtime id` | `node contract.js claude-code` exits 0 and prints a JSON result |

#### Group 2 — Pass mode (2 runtimes × 1 summary test) = 2 tests

| # | Test name | What it asserts |
|---|-----------|----------------|
| P1 | `claude-code passes all requirements (ok: true, missing: [])` | Against the real `.claude/` dir |
| P2 | `droid passes all requirements (ok: true, missing: [])` | Against the real `.factory/` dir |

**Note:** "passes all requirements" for `claude-code` and `droid` means `missing.length === 0` AND any `notes` are advisory only. Identity marker (Req #4) returns `note: 'identity-marker-not-adopted'` but does not flip `ok` to false (per scope report line 59).

#### Group 3 — Per-requirement pass tests (5 reqs × 2 runtimes = 10 tests)

Each test constructs a fake runtime root that satisfies ONLY the requirement under test (everything else empty). Asserts `missing` contains exactly the 4 OTHER requirement IDs.

| # | Test name | What it asserts (for both `claude-code` and `droid` shape) |
|---|-----------|-------------------------------------------------------------|
| R1a | `req 1 (hook-shim-set) alone passes — claude-code shape` | Fake runtime with 4 hook shims in `coordination/hooks/`. Expect `missing` to exclude `hook-shim-set`. |
| R1b | `req 1 (hook-shim-set) alone passes — droid shape` | Same; uses `.factory/coordination/hooks/` style path (validator resolves via runtime-id). |
| R2a | `req 2 (mcp-client-config) alone passes — claude-code shape` | Fake runtime with `.mcp.json` containing `mcpServers.learning-loop`. |
| R2b | `req 2 (mcp-client-config) alone passes — droid shape` | Same; with `.factory/mcp.json`. |
| R3a | `req 3 (skill-spec) alone passes` | Fake runtime with `skills/learning-loop/SKILL.md` containing `tools:` block. |
| R3b | `req 3 (skill-spec) alone fails without tools: block` | Same; file exists but has no `tools:` block → `missing` includes `skill-spec`. |
| R4a | `req 4 (identity-marker) alone passes when RUNTIME_ID set` | Fake runtime with `RUNTIME_ID=fake` env → `missing` excludes `identity-marker`; no `note`. |
| R4b | `req 4 (identity-marker) returns note when unset (PROPOSED)` | Fake runtime without `RUNTIME_ID` → `missing: []` if other reqs pass, but `notes: ["identity-marker-not-adopted"]`. |
| R5a | `req 5 (settings-integration) alone passes — claude-code shape` | Fake runtime with `.claude/settings.json` referencing 4 hook paths. |
| R5b | `req 5 (settings-integration) alone fails on bad JSON` | Settings file has invalid JSON → `missing` includes `settings-integration`. |

#### Group 4 — Per-requirement fail tests (5 reqs × 1 minimal test = 5 tests)

| # | Test name | What it asserts |
|---|-----------|-----------------|
| F1 | `req 1 fails when shim file is missing` | Fake runtime with only 3 of 4 shims → `missing` includes `hook-shim-set` |
| F2 | `req 2 fails when mcpServers entry is missing` | Fake runtime with `.mcp.json` but no `learning-loop` key → `missing` includes `mcp-client-config` |
| F3 | `req 3 fails when SKILL.md is absent` | No skill file → `missing` includes `skill-spec` |
| F4 | `req 4 fails only on explicit `require: true`` mode` | Out of scope for default mode. Skip this test — covered by R4b. |
| F5 | `req 5 fails when settings file is absent` | No settings file → `missing` includes `settings-integration` |

#### Group 5 — End-to-end / golden (3 tests)

| # | Test name | What it asserts |
|---|-----------|-----------------|
| G1 | `validate("fake-runtime") on empty dir returns all 5 reqs missing` | Empty fake root → `missing.length === 5`, `notes` may contain `identity-marker-not-adopted` |
| G2 | `validate("unknown-runtime-id") returns helpful error` | Unknown ID → returns `{ok: false, error: "unknown-runtime-id: <id>", missing: []}` (NOT a throw) |
| G3 | `validate() result is JSON-serializable` | `JSON.parse(JSON.stringify(result))` deep-equals the original (no functions, no circular refs) |

**Total: 4 + 2 + 10 + 5 + 3 = 24 tests.** Within the 20–30 target.

### A.5 Edge cases that drive the design (from the brief)

| Edge case | Where it appears | Validator behavior (recommended) |
|-----------|------------------|---------------------------------|
| SKILL.md exists but has no `tools:` block | R3b | `missing` includes `skill-spec`. Detection: read file, check for `tools:\s*\n` or `tools:.*loop_describe`. KISS: presence of file alone is not enough; require a content marker. |
| Settings file with bad JSON | R5b | Try `JSON.parse`; on throw, add `settings-integration` to `missing` with diagnostic. |
| Partial runtime (3 of 5 reqs met) | F-tests + G1 | `missing` lists the 2 unmet reqs; `ok: false`. No partial credit. |
| `RUNTIME_ID` set in env vs `.env` file | R4a/R4b | Validator reads `process.env.RUNTIME_ID` (env-only for v1; .env support is YAGNI). |
| Runtime id with special chars | G2 | Validator rejects with structured error (no throw). |

### A.6 Test file skeleton (representative; not the final code)

```js
// tools/learning-loop-mastra/interface/__tests__/contract.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";

import { validate, REQUIREMENT_IDS } from "../contract.js";

const PROJECT_ROOT = join(import.meta.dirname, "..", "..", "..", "..");

const HOOK_SHIMS = [
  "bash-coordination-gate.cjs",
  "write-coordination-gate.cjs",
  "inbound-state-gate.cjs",
  "recurrence-check-on-start.cjs",
];

function fakeRoot(opts = {}) {
  const root = mkdtempSync(join(tmpdir(), "ll-contract-"));
  // ... populate based on opts ...
  return root;
}

function withRoot(opts, fn) {
  const root = fakeRoot(opts);
  try { return fn(root); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

// --- Group 1: structural ---
test("contract.js exports validate as named export", () => {
  assert.equal(typeof validate, "function");
});

test("contract.js exposes REQUIREMENT_IDS constant", () => {
  assert.ok(Array.isArray(REQUIREMENT_IDS));
  assert.equal(REQUIREMENT_IDS.length, 5);
  assert.deepEqual(REQUIREMENT_IDS, [
    "hook-shim-set",
    "mcp-client-config",
    "skill-spec",
    "identity-marker",
    "settings-integration",
  ]);
});

// ... etc. (full file ~150 LoC) ...
```

---

## B. SKILL.md update design

### B.1 Current state (both files)

- Both `SKILL.md` files are 100% byte-identical (verified by full read).
- Length: 98 LoC each.
- Yaml frontmatter (lines 1-4): `name: learning-loop`, description referencing "evidence, records, experiments, runtime proofs, or meta self-improvement".
- The "When to Use" and "Workflow" sections describe **prompt authoring** for the learning-loop system.
- The "References" section (lines 89-97) points to 7 legacy paths: `tools/learning-loop-mastra/tools/legacy/references/*.md`. None of these paths exist in the current tree (the legacy path was renamed during Plan 1's `core/legacy/` → `core/` rename, but the references section was not updated).
- The "References" also omits: `tools/learning-loop-mastra/agent-manifest.json` (the 44-tool manifest), `tools/learning-loop-mastra/docs/schemas.md` (Plan 1's schema doc), `tools/learning-loop-mastra/interface/CONTRACT.md` (Plan 2's new contract).

**Confirmed by `ls`:** `tools/learning-loop-mastra/tools/legacy/references/` does not exist. Plan 1's rename moved the `core/legacy/` files but did not move the `tools/legacy/references/` directory contents. The references section is therefore BROKEN today (E.0 closes this drift).

### B.2 SKILL.md update shape (before/after)

**Before (lines 89-97, current):**

```markdown
## References

- `tools/learning-loop-mastra/tools/legacy/references/learning-loop-rules.md` — condensed repo rules from `docs/` and meta evidence.
- `tools/learning-loop-mastra/tools/legacy/references/resource-budget-rules.md` — hard constraints for external systems with irreversible state.
- `tools/learning-loop-mastra/tools/legacy/references/prompt-blueprints.md` — reusable prompt skeletons.
- `tools/learning-loop-mastra/tools/legacy/references/prompt-blueprints-state-gated.md` — state-gated prompt templates for budget-constrained tasks.
- `tools/learning-loop-mastra/tools/legacy/references/prompt-blueprints-product-build.md` — product-build prompt skeletons.
- `tools/learning-loop-mastra/tools/legacy/references/meta-evidence-self-improvement.md` — self-improvement and `meta` evidence rules.
- `tools/learning-loop-mastra/tools/legacy/references/orchestration-patterns.md` — full-lifecycle experiment orchestration, claim update, and promotion rules.
```

**After (proposed; ~10 LoC delta):**

```markdown
## References

### Tool manifest
- `tools/learning-loop-mastra/agent-manifest.json` — current 44-tool manifest, 6 groups (gate, workflow, meta_state, introspection, runtime_agnostic, agent). Call `mastra_loop_describe({tier: "warm"})` to discover the surface at session start.

### 3-layer architecture
- `AGENTS.md` §1.1 — Core / Mastra shell / Runtime interface (the contract you satisfy by being loaded as this skill).
- `tools/learning-loop-mastra/core/README.md` — FCIS invariant: zero `@mastra/*` imports in core.
- `tools/learning-loop-mastra/docs/schemas.md` — meta-state 4-kind schema, wire envelope, parity contract.

### Runtime interface contract (Phase E.1b)
- `tools/learning-loop-mastra/interface/CONTRACT.md` — the 5 requirements a runtime MUST satisfy (hook shims, MCP config, this skill, identity marker, settings).
- `tools/learning-loop-mastra/interface/RUNTIME_ONBOARDING.md` — how to onboard a new runtime (worked example: Mastra Code).
- `node tools/learning-loop-mastra/interface/contract.js <runtime-id>` — validate a runtime against the contract. Returns `{ok, missing[], notes[], path_map}`.
```

### B.3 New section (between Workflow and Prompt Requirements; ~8 LoC)

Add a brief "Runtime contract" section so the skill signals it knows about its own role in the contract:

```markdown
## Runtime contract

This skill is Requirement #3 (skill spec) of the runtime interface contract. The runtime that loads it must also satisfy Requirements #1, #2, #4, #5. To audit: run `node tools/learning-loop-mastra/interface/contract.js <runtime-id>`. See `tools/learning-loop-mastra/interface/CONTRACT.md`.
```

### B.4 LoC budget

| Change | Lines added | Lines removed |
|--------|-------------|---------------|
| New "Runtime contract" section | +8 | 0 |
| Rewritten "References" section | +14 | -9 (legacy paths removed) |
| **Net delta** | **+22** | -9 → **+13 net** |

Total file size: 98 + 13 = **~111 LoC** (well under the 200 LoC cap).

### B.5 Where to apply

Both `.claude/skills/learning-loop/SKILL.md` AND `.factory/skills/learning-loop/SKILL.md` get the same edit (YAGNI — keep them identical; the only runtime-specific data is the validator call's runtime-id, which the agent supplies). **Note for planner:** the scope report says "Update both SKILL.md files to reference the current 44-tool manifest + 6 groups + the new 3-layer architecture + the interface contract" — confirm with the operator whether a future-proofing opportunity exists to extract a shared template (e.g., `.factory/skills/learning-loop/SKILL.md` symlinks to `.claude/skills/learning-loop/SKILL.md`). For Plan 2: keep them as two independent copies; revisit if drift appears.

---

## C. RUNTIME_ONBOARDING.md outline

### C.1 File location and length

- Path: `tools/learning-loop-mastra/interface/RUNTIME_ONBOARDING.md`
- Target length: 80–150 LoC (per brief)
- Audience: an operator or new-agent implementer adding a runtime (e.g., Mastra Code)

### C.2 Outline

```markdown
# Runtime Onboarding

How to add a new agent runtime that integrates with the learning loop. Read this end-to-end before starting. Use the checklist at each step. The worked example at the end (Mastra Code) is the canonical reference.

## When to onboard a new runtime

You need this when:
- You're adding a new agent CLI/IDE that should run learning-loop prompts.
- You're migrating from `.claude/` or `.factory/` to your own runtime dir.
- The 2 existing runtimes (Claude Code, Droid CLI) don't fit your environment.

You do NOT need this if:
- You're just running prompts — use one of the existing runtimes.
- You're writing a new MCP tool — that's a Core/Mastra shell change, not runtime integration.

## The 5 requirements (checklist)

A runtime MUST satisfy all 5. Validate with `node tools/learning-loop-mastra/interface/contract.js <your-runtime-id>`.

- [ ] **1. Hook shim set.** Create `<your-runtime>/coordination/hooks/{bash,write,inbound-state,recurrence-check-on-start}-*.cjs`. Each shim is a thin wrapper that `execFileSync`'s the matching universal script in `tools/learning-loop-mastra/hooks/legacy/`. See `.claude/coordination/hooks/*.cjs` for the canonical 4-file shape.
- [ ] **2. MCP client config.** Register `learning-loop` in your runtime's MCP config, pointing to `node tools/learning-loop-mastra/server.js`. See `.factory/mcp.json` for the canonical shape.
- [ ] **3. Skill spec.** Provide `<your-runtime>/skills/learning-loop/SKILL.md` describing how to use the loop's MCP tools. Must include a `tools:` block referencing at least `loop_describe` and `meta_state_list`. Template: `.factory/skills/learning-loop/SKILL.md` (now updated in E.0 to reference the 3-layer contract).
- [ ] **4. Identity marker (PROPOSED).** Set `RUNTIME_ID=<your-runtime-id>` in your runtime's session env. Validator returns `note: 'identity-marker-not-adopted'` when unset (not yet required; future hardening plan enforces this for R2 write-gate ownership).
- [ ] **5. Settings integration.** Wire your runtime's hook system to invoke the 4 shims at the right lifecycle points (SessionStart, UserPromptSubmit, PreToolUse). See `.factory/settings.json` for the canonical shape (Droid uses `Execute` matcher; Claude Code uses `Bash`).

## Validator invocation

```bash
# Run from project root
node tools/learning-loop-mastra/interface/contract.js <your-runtime-id>

# Output (success):
# {"ok":true,"runtime_id":"mastra-code","missing":[],"notes":["identity-marker-not-adopted"],"path_map":{...}}

# Output (failure):
# {"ok":false,"runtime_id":"mastra-code","missing":["hook-shim-set","settings-integration"],"notes":[],"path_map":{...}}
```

If the validator is missing or buggy, the contract is the source of truth: read `interface/CONTRACT.md` and self-audit.

## Worked example: Mastra Code

(Reference: scope report line 50, 124; npm `mastracode`.)

**Target:** `.mastracode/` (new runtime dir at project root).

1. **Create the shim set.** Mirror the 4 files in `.claude/coordination/hooks/` to `.mastracode/coordination/hooks/`. Each shim must `require()` the matching universal script from `tools/learning-loop-mastra/hooks/legacy/`. No business logic in the shim.
2. **Register MCP client.** Add to `createMastraCode({ configDir: ".mastracode" })` config: `mcpServers.learning-loop = { command: "node", args: ["tools/learning-loop-mastra/server.js"] }`. Verify by running `mcp_client_list` and checking `learning-loop` is registered.
3. **Copy the skill spec.** Copy `.factory/skills/learning-loop/SKILL.md` to `.mastracode/skills/learning-loop/SKILL.md`. No edits needed — the post-E.0 file is runtime-agnostic.
4. **Set the identity marker.** In your Mastra Code session config: `env: { RUNTIME_ID: "mastra-code" }`.
5. **Configure settings.** Wire Mastra Code's hook system to invoke the 4 shims at SessionStart / UserPromptSubmit / PreToolUse. Mastra Code's API differs from Claude Code's; consult `docs/agents/mastra-code.md` (to be written in E.5).
6. **Run the validator.** `node tools/learning-loop-mastra/interface/contract.js mastra-code`. Expect `{ok: true, missing: [], notes: []}` (or `notes: ["identity-marker-not-adopted"]` if you skipped step 4).
7. **Smoke test.** From a Mastra Code session, run `mastra_loop_describe({tier: "warm"})`. Expect the 6-group manifest back. Then run `mastra_meta_state_list({entry_kind: "rule"})`. Expect ≥ 1 rule.

## Troubleshooting

- **`hook-shim-set` failing.** Each shim must exist with the exact filename pattern `{bash,write,inbound-state,recurrence-check-on-start}-*.cjs`. The `*.cjs` suffix means any prefix the runtime uses is fine; check the trailing `-gate.cjs` / `-check.cjs` pattern.
- **`mcp-client-config` failing.** Your runtime's MCP config must have a `learning-loop` key under `mcpServers`. Some runtimes use `mcp_servers` (snake-case); the validator normalizes both.
- **`skill-spec` failing.** The file must exist AND contain a `tools:` block. A blank SKILL.md fails — write the contract section from §B.3 above.
- **`settings-integration` failing on bad JSON.** Run `node -e "JSON.parse(require('fs').readFileSync('<your-settings-file>'))"` to confirm. If it throws, fix the JSON.

## Cross-references

- `interface/CONTRACT.md` — the formal 5-requirement spec (authoritative).
- `interface/contract.js` — the validator (single source of truth for "is X met").
- `AGENTS.md` §1.1 — the 3-layer architecture (where the runtime interface lives).
- `AGENTS.md` §2 — hook matrix (the per-runtime implementation pattern).
- `.claude/coordination/hooks/README.md` — the existing per-runtime docs pattern (used as the model for `docs/agents/mastra-code.md` in E.5).
```

**Estimated LoC: ~110** (within the 80–150 target).

---

## D. Edge cases (consolidated, for the plan author)

The brief asks for edge case coverage. Here are all edge cases surfaced by this design, with the recommended validator behavior:

| Edge case | Where it appears | Recommended validator behavior |
|-----------|------------------|---------------------------------|
| SKILL.md exists but has no `tools:` block | R3b test | `missing` includes `skill-spec`; presence alone insufficient |
| Settings file has bad JSON | R5b test | `missing` includes `settings-integration`; validator does NOT throw |
| Settings file is empty | F5 test | `missing` includes `settings-integration` (treated as no hooks referenced) |
| Partial runtime (3 of 5 reqs met) | G1 test | `missing` lists the 2 unmet reqs; no partial credit |
| `RUNTIME_ID` unset (current state for `claude-code` + `droid`) | R4b test | `missing: []`, `notes: ["identity-marker-not-adopted"]`. Validator must NOT fail `claude-code`/`droid` on this (per scope report line 59) |
| `RUNTIME_ID` set to empty string | R4a test (variant) | Treat as unset → `note` present |
| Unknown runtime-id (e.g., `validate("typo")`) | G2 test | Return `{ok: false, error: "...", missing: []}`; do NOT throw |
| Symlink loop in runtime dir | G3 test | `realpathSync` the runtime root before walking |
| Hook shim file is 0 bytes | F1 test variant | Validator checks existence + extension, not contents (content shape is enforced by `gate-logic.js` separately) |
| MCP config in unusual location (env var override) | Open question | v1 supports `projectRoot`-relative only; env-var override is YAGNI |
| Runtime dir doesn't exist | P1/P2 path | Validator returns `{ok: false, missing: [all 5]}` |
| Both `.mcp.json` and `.factory/mcp.json` exist (current state) | P2 test | Validator reads BOTH and passes if EITHER contains `mcpServers.learning-loop`. Document in CONTRACT.md. |

---

## E. Open questions (for the plan author to resolve before implementation)

These are blocking questions for Plan 2 implementation. The plan author should resolve or escalate to the operator.

1. **Should the validator fail `claude-code`/`droid` on `RUNTIME_ID` missing?** The scope report (line 59) is clear: NO. The note should be advisory only. **But** the scope report also says (line 377, Q1): "Is the 5-requirement contract complete?" — and Q4 (line 380): "Are there other first-class structures missing?" If the operator wants `RUNTIME_ID` to be mandatory from Plan 2, both `claude-code` and `droid` will fail the contract and tests will need to set `RUNTIME_ID=claude-code` / `RUNTIME_ID=droid` in test setup (env var). **Recommendation:** keep advisory per scope report; revisit when LIM-3 ships in the hardening plan.

2. **Should `.factory/settings.json` AND `.factory/hooks.json` both count toward Requirement #5?** The current `ls` shows Droid splits hooks into `.factory/settings.json` + `.factory/hooks.json`. The validator should check both (any one satisfies). **Recommendation:** check both files; pass if EITHER references the shim paths. Confirm with operator if Droid's split is intentional.

3. **Where does the `mcp-client-config` requirement look for `claude-code`?** Two files exist: `.mcp.json` (root) AND `.claude/settings.local.json` (Claude Code's local overrides). Today's Claude Code MCP config is in `.mcp.json` (root). **Recommendation:** validator checks `.mcp.json` first; falls back to `.claude/settings.local.json`. Confirm with operator if `.claude/settings.json` should also be checked.

4. **What runtime-id does Mastra Code use?** The scope report line 50 says `.mastracode/` but does not name the id. **Recommendation:** `mastra-code` (kebab-case to match `claude-code`, `droid`). Confirm with operator when Plan 4 (E.5) starts.

5. **Should the validator be importable from CJS?** The hook shims (`.cjs`) may want to import `contract.js` for self-validation. **Recommendation:** keep `contract.js` ESM-only for v1; add CJS wrapper if hooks need it (YAGNI until proven needed).

6. **Should the validator be wired into the existing `runtime-agnostic-checklist.js`?** The 6-item checklist in `core/runtime-agnostic-checklist.js` validates `surfaces.js`-style properties of a feature; the new contract validates runtime-level integration. **Recommendation:** NO coupling for v1. Two separate concerns; two separate validators. If they overlap later, refactor.

7. **Should the test file run as part of `pnpm test` or be plan-specific?** The 4 `phase-e-foundation/*.test.js` files run with `node --test tools/learning-loop-mastra/__tests__/phase-e-foundation/`. The plan-specific `fingerprint-repoint-existence.test.js` runs manually. **Recommendation:** `contract.test.js` runs in CI (locks the contract against regression). The runtime-agnostic test pattern shows this is the convention.

8. **Does `RUNTIME_ID` need a per-runtime constant?** The validator reads `process.env.RUNTIME_ID`. Should there be a hardcoded map (e.g., `const RUNTIME_IDS = { "claude-code": ".claude", "droid": ".factory", "mastra-code": ".mastracode" }`)? **Recommendation:** YES — this is the runtime-id → runtime-root mapping. Keep it in `contract.js` (not exported; internal to the validator). Add a `KNOWN_RUNTIMES` export for the `--list` CLI mode.

9. **What happens to the 6-item `runtime-agnostic-checklist.js` after Plan 2?** The checklist validates feature-level compliance (shim-not-fork); the contract validates runtime-level compliance (5 requirements). They are orthogonal. **Recommendation:** keep both. Document the distinction in `interface/README.md`.

10. **Should `interface/__tests__/contract.test.js` validate the CONTRACT.md spec content (e.g., that `CONTRACT.md` exists, names the 5 reqs, etc.)?** Plan 1's `schema-doc-exists.test.js` follows this pattern (asserts the doc exists + is non-trivial + contains expected content markers). **Recommendation:** YES, add 1–2 tests for CONTRACT.md + RUNTIME_ONBOARDING.md existence + content shape. Counts toward the 24-test budget.

---

## F. Constraints honored (YAGNI / KISS / DRY)

- ~150 LoC for `RUNTIME_ONBOARDING.md` — proposed outline is ~110 LoC.
- ~30 LoC for SKILL.md additions (per file) — proposed delta is +13 LoC net (well under).
- ~150 LoC for `contract.test.js` — proposed test inventory is 24 tests; estimated file size ~140 LoC.
- 20–30 tests total — proposed count is 24.
- Tests use `node:test` + `node:assert/strict` — matches existing pattern.
- Fixtures use `fs.mkdtempSync` + `finally` cleanup — no committed `_fixtures/` dir.
- SKILL.md stays concise (111 LoC after update) — references docs rather than re-stating them.
- Validator is a pure function — no I/O beyond filesystem reads, easy to test, no side effects.

---

## G. Reference paths (absolute)

- Scope report: `/home/datguy/codingProjects/learning-loop-template/plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md`
- Plan 1: `/home/datguy/codingProjects/learning-loop-template/plans/260624-2335-phase-e-foundation/plan.md`
- Target SKILL.md files: `/home/datguy/codingProjects/learning-loop-template/.claude/skills/learning-loop/SKILL.md`, `/home/datguy/codingProjects/learning-loop-template/.factory/skills/learning-loop/SKILL.md`
- Manifest: `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/agent-manifest.json`
- Test patterns studied: `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/__tests__/phase-e-foundation/{fcis-invariant,no-core-legacy-refs,schema-doc-exists,agents-section-1-layers}.test.js`
- Validator-style test pattern: `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js`
- Runtime layout (read-only): `/home/datguy/codingProjects/learning-loop-template/.claude/`, `/home/datguy/codingProjects/learning-loop-template/.factory/`
- AGENTS.md (3-layer context): `/home/datguy/codingProjects/learning-loop-template/AGENTS.md` §1.1
- Existing per-runtime docs pattern: `/home/datguy/codingProjects/learning-loop-template/.claude/coordination/hooks/README.md`

---

## H. Limitations of this research

- **Did not read `tools/learning-loop-mastra/hooks/legacy/*.js`** to confirm the universal hook scripts are importable from the new shim set shape. The validator checks existence + extension only (per F1 test), so the universal-script wiring is out of scope for `contract.test.js`. A future hardening plan may add a content-shape check.
- **Did not verify whether Mastra Code's npm API matches the scope report's claim** (`createMastraCode({ configDir })`). That is Plan 4 (E.5) work; Plan 2's onboarding doc assumes the API per the scope report.
- **Did not design `interface/README.md` or `interface/CONTRACT.md` content.** The brief scopes this research to tests + SKILL.md + RUNTIME_ONBOARDING.md. The plan author should reference the scope report's `§Proposed structure` (lines 36-50) for the README/CONTRACT content shape.
- **Did not propose a CJS wrapper for `contract.js`.** Open question E5; defer until a hook shim actually needs it.

---

**End of research report.**

