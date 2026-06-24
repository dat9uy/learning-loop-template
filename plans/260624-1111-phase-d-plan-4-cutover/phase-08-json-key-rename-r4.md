---
phase: 8
title: "json-key-rename-r4"
status: pending
priority: P1
effort: "2h"
dependencies: ["7"]
---

# Phase 8: JSON Key Rename (R4) — `learning-loop-mastra` → `learning-loop`

## Overview

**Completes the R4 deferred item from the master tracker.** The MCP server key `learning-loop-mastra` (used in `.mcp.json`, `.factory/mcp.json`, and `.claude/settings.local.json`) is renamed to `learning-loop`. The rename cascades to:
- 2 MCP config files (`.mcp.json`, `.factory/mcp.json`)
- 1 settings file (`.claude/settings.local.json`) — 6 `mcp__learning-loop-mastra__*` allowlist entries + 1 `enabledMcpjsonServers` entry
- 30+ files across `tools/`, `.factory/`, `.claude/` that reference the server name (test files, hook loader, hook tests, coordination tests, scripts, source code)
- 2 probe scripts in `plans/260618-1418-GH-0029-pr5-shim-followup/`
- Operator-facing state outside the repo (Droid state + Claude Code state) — documented in `docs/operator-notes/mcp-server-rename.md`

**Per scout report §6:** SKILL.md files do NOT use the `learning-loop-mastra` string anywhere; they only reference the legacy `tools/learning-loop-mcp/references/...` paths. R4 does not touch SKILL.md.

**Why this phase exists:** the `learning-loop-mastra` name was inherited from Plan C's atomic adoption (peer MCP server, parallel to the legacy `learning-loop-mcp`). Post-Phase-C cut-over, there's no peer — there's only one MCP server. The `learning-loop-mastra` suffix is a vestigial Phase-C artifact. Renaming to `learning-loop` simplifies the namespace and removes the legacy-sounding `mastra` substring.

## Requirements

- Functional: `.mcp.json` key is `learning-loop` (not `learning-loop-mastra`). `.factory/mcp.json` same. `.claude/settings.local.json` allowlist is `mcp__learning-loop__*` (not `mcp__learning-loop-mastra__*`); `enabledMcpjsonServers` is `["learning-loop"]`. All 30+ files referencing the server name are updated. Operator-facing note documents the manual state updates.
- Non-functional: `git grep "learning-loop-mastra"` returns 0 matches outside `node_modules`, `data/`, and `meta-state.jsonl` (the meta-state has historical references that are immutable per the loop's append-only audit log).

## Architecture

The R4 cascade is mechanical: rename the MCP server key everywhere it appears in JSON configs and test code. The MCP tool NAMES (e.g., `mastra_meta_state_log_change`) are NOT renamed — they keep the `mastra_` prefix per the existing convention (server.js:23). The `mastra_` prefix is a tool-name prefix, not a server-name prefix; R4 is only the server-name prefix.

**Cascade map:**

| Before | After | Files |
|---|---|---|
| `"learning-loop-mastra"` (key in mcpServers) | `"learning-loop"` | `.mcp.json`, `.factory/mcp.json` |
| `mcp__learning-loop-mastra__*` (allowlist, 6 entries) | `mcp__learning-loop__*` | `.claude/settings.local.json` |
| `enabledMcpjsonServers: ["learning-loop-mastra"]` | `enabledMcpjsonServers: ["learning-loop"]` | `.claude/settings.local.json` |
| `"learning-loop-mastra"` in test fixtures | `"learning-loop"` | 30+ test files across tools/, .factory/, .claude/ (per grep audit) |
| `"learning-loop-mastra"` in probe scripts | `"learning-loop"` | 2 probe scripts |

**Operator state files (NOT in repo):**
- Droid state: `~/.factory/...` (per-machine; operator must update manually)
- Claude Code state: `~/.claude/...` (per-machine; operator must update manually)

These are documented in `docs/operator-notes/mcp-server-rename.md`.

## Related Code Files

### Files to modify

- **Modify:** `.mcp.json` (rename key)
- **Modify:** `.factory/mcp.json` (rename key)
- **Modify:** `.claude/settings.local.json` (rename 6 allowlist entries + `enabledMcpjsonServers`)
- **Modify:** 12+ test files under `tools/` (per grep audit)
- **Modify:** 4 test files under `.factory/hooks/__tests__/` (loop-surface-inject*.test.cjs)
- **Modify:** 3 test files under `.claude/coordination/__tests__/` (claude-code-mcp-loading, inbound-state-gate, gate-integration)
- **Modify:** `.factory/hooks/loop-surface-inject.cjs` (server name refs at lines 4, 79, 166)
- **Modify:** `tools/learning-loop-mastra/server.js` (id/name at lines 165-166; log at line 69)
- **Modify:** `tools/learning-loop-mastra/core/legacy/gate-logic.js:583` (peer-check)
- **Modify:** 2 probe scripts in `plans/260618-1418-GH-0029-pr5-shim-followup/`

### Files to create

- **Create:** `docs/operator-notes/mcp-server-rename.md` (operator-facing note)
- **Create:** `tools/learning-loop-mastra/__tests__/server-name-rename.test.cjs` (asserts the rename cascade; no `learning-loop-mastra` strings in non-legacy files)

### Files to NOT modify

- `AGENTS.md` references to "learning-loop-mastra" — see Step 8.7 for the audit.
- `meta-state.jsonl` historical references — immutable per the loop's append-only audit log.
- SKILL.md files — they do not reference the server name.
- `tools/learning-loop-mastra/core/legacy/loop-introspect.js:141,146,153` — these are filesystem paths, NOT server names (per Step 8.6).
- `tools/learning-loop-mastra/` directory path — the directory is unchanged; only the MCP namespace key is renamed.

## Implementation Steps

### Step 8.1: Audit all `learning-loop-mastra` occurrences

Per scout report §6, the total is **1666 occurrences** across all file types (excluding `node_modules`, `.git`, `data/`). The relevant occurrences (in-scope for R4) are:

| Category | Count | Files |
|---|---|---|
| MCP config | 4 | `.mcp.json`, `.factory/mcp.json` |
| `package.json` | 3 | `package.json:8,18,20` (the `#mastra/*` import alias + scripts) |
| Source code | 6 | `tools/learning-loop-mastra/server.js`, `agent-manifest.json`, `agents-manifest.json`, `storage.js`, `agents/load-agents-manifest.js`, `agents/build-meta-state-tools.js` |
| Settings | 7 | `.claude/settings.local.json` (6 allowlist + 1 enabledMcpjsonServers) |
| Hook | 3 | `.factory/hooks/loop-surface-inject.cjs` |
| Test files (tools/) | ~20 | 12+ test files under `tools/learning-loop-mcp/__tests__/` and `tools/learning-loop-mastra/__tests__/` |
| Test files (.factory/) | 4 | `.factory/hooks/__tests__/loop-surface-inject*.test.cjs` (4 files) |
| Test files (.claude/) | 3 | `.claude/coordination/__tests__/` (claude-code-mcp-loading.test.cjs has 17 refs; inbound-state-gate.test.cjs; gate-integration.test.cjs) |
| Scripts | 2 | `tools/scripts/run-pnpm-test-namespaced.mjs`, `tools/scripts/refresh-fingerprints-pre-closeout.mjs` |
| Probe scripts | 2 | `plans/260618-1418-GH-0029-pr5-shim-followup/*probe*.cjs` |
| Legacy core | 3 | `tools/learning-loop-mcp/core/gate-logic.js:583`, `loop-introspect.js:141,146,153` |
| Cold cache | ~48 | `records/meta/.cache/loop-describe-cold.json` (regenerated on next run) |
| Docs (top-level) | 7+ | `AGENTS.md`, `CLAUDE.md`, `README.md`, etc. |
| Plans/reports | many | (historical record; do NOT modify) |

**Critical question:** which categories of occurrences are inside-scope for R4?

**R4 in-scope:**
- MCP config (4) — primary target
- Settings (6) — primary target
- Test files (where the test references the server key) — must update for tests to pass
- Source code (the loader-level `learning-loop-mastra` references) — must update for the server to start
- Hook (3) — must update for the hook to find the server
- Scripts (2) — must update for `pnpm test` to work
- Probe scripts (2) — must update for the probes to work

**R4 out-of-scope (historical record):**
- `meta-state.jsonl` — immutable audit log
- `plans/` and `plans/reports/` — historical engineering record
- `docs/journals/` — historical engineering record

**R4 deferred:**
- `AGENTS.md`, `CLAUDE.md`, `README.md` — these are documentation; they reference the server name in prose. R4 can either (a) update the references or (b) leave them as historical documentation. Decision: update the operational references (where the doc is telling the user "the server is at `learning-loop-mastra`") but leave the historical references (where the doc is citing a plan that referenced the old name). See Step 8.6.
- Cold cache — regenerate on next run. The cache file is at `records/meta/.cache/loop-describe-cold.json`; it's a frozen snapshot of the loop's cold tier. R4 does not modify it; it will be regenerated when the cold tier is next computed.

**Legacy core files (`tools/learning-loop-mcp/core/gate-logic.js:583`, `loop-introspect.js:141,146,153`):** these are in the legacy `core/` directory which is moved to `legacy/` in Phase 7. Per Phase 7, the legacy `core/` is now at `tools/learning-loop-mastra/core/legacy/`. The references to `learning-loop-mastra` in the legacy core files are likely peer-check strings (e.g., `learning-loop-mcp || learning-loop-mastra`) used during Phase C's coexistence. R4 should update them to `learning-loop`.

### Step 8.2: Update `.mcp.json` and `.factory/mcp.json`

**Current `.mcp.json`:**

```json
{
  "mcpServers": {
    "learning-loop-mastra": {
      "command": "node",
      "args": ["tools/learning-loop-mastra/server.js"]
    }
  }
}
```

**Replace with:**

```json
{
  "mcpServers": {
    "learning-loop": {
      "command": "node",
      "args": ["tools/learning-loop-mastra/server.js"]
    }
  }
}
```

The `args` value (`"tools/learning-loop-mastra/server.js"`) is the **filesystem path** to the server entry, not the MCP server key. The filesystem path is unchanged (the server is still in the `tools/learning-loop-mastra/` directory; only the MCP namespace key is renamed). The rename is namespace-only.

**Same change for `.factory/mcp.json`.**

### Step 8.3: Update `.claude/settings.local.json`

**Current (likely):**

```json
{
  "enabledMcpjsonServers": ["learning-loop-mastra"],
  "permissions": {
    "allow": [
      "mcp__learning-loop-mastra__mastra_meta_state_log_change",
      "mcp__learning-loop-mastra__mastra_meta_state_list",
      "mcp__learning-loop-mastra__mastra_meta_state_query_drift",
      "mcp__learning-loop-mastra__mastra_meta_state_derive_status",
      "mcp__learning-loop-mastra__mastra_meta_state_list",  // (doubly-prefixed typo; see scout report §9.7)
      "mcp__learning-loop-mastra__mastra_workflow_trigger",
      ...
    ]
  }
}
```

**Replace with:**

```json
{
  "enabledMcpjsonServers": ["learning-loop"],
  "permissions": {
    "allow": [
      "mcp__learning-loop__mastra_meta_state_log_change",
      "mcp__learning-loop__mastra_meta_state_list",
      "mcp__learning-loop__mastra_meta_state_query_drift",
      "mcp__learning-loop__mastra_meta_state_derive_status",
      "mcp__learning-loop__mastra_meta_state_list",
      "mcp__learning-loop__mastra_workflow_trigger",
      ...
    ]
  }
}
```

The doubly-prefixed `mcp__learning-loop-mastra__mastra_meta_state_list` becomes `mcp__learning-loop__mastra_meta_state_list` (which is correct: the MCP namespace is `learning-loop`, the tool prefix is `mastra_`).

### Step 8.4: Update the 30+ test files + hook loader + scripts

The rename scope is larger than the scout report's "13 test files." Use `grep -rl` to get the actual file list:

```bash
grep -rln "learning-loop-mastra" tools/ .factory/ .claude/ --include="*.js" --include="*.cjs" --include="*.mjs" --include="*.json" | grep -v node_modules
```

**Critical distinction:** `learning-loop-mastra` appears in BOTH server-name contexts AND filesystem-path contexts. Only rename server-name references; leave filesystem paths alone.

**Server-name contexts (RENAME):**
- `.mcp.json` key: `"learning-loop-mastra": { ... }`
- `.factory/mcp.json` key: same
- `mcp__learning-loop-mastra__*` allowlist entries in `.claude/settings.local.json`
- `enabledMcpjsonServers: ["learning-loop-mastra"]`
- Test assertions: `config.mcpServers["learning-loop-mastra"]`, `assert.ok(mcpServers["learning-loop-mastra"])`
- Hook loader: `mcpCfg.mcpServers["learning-loop-mastra"]` (`.factory/hooks/loop-surface-inject.cjs:79`)
- `server.js` id/name fields: `id: "learning-loop-mastra"`, `name: "learning-loop-mastra"` (lines 165-166)
- Log messages: `console.error("learning-loop-mastra: registered ...")` (line 69) — optional

**Filesystem-path contexts (DO NOT RENAME):**
- `tools/learning-loop-mastra/server.js` — the directory is unchanged
- `#mastra/*` import alias in `package.json` — filesystem path
- `tools/learning-loop-mastra/storage.js`, `tools/learning-loop-mastra/data/` — filesystem paths
- `tools/learning-loop-mastra/core/legacy/loop-introspect.js:141,146,153` — filesystem paths (per Step 8.6)

**Recommended regex:** Replace `"learning-loop-mastra"` when it appears as a standalone JSON string value or key (surrounded by `"`), but NOT when followed by `/` (path component). Pattern: replace `"learning-loop-mastra"` (the JSON key/value) but not `learning-loop-mastra/` (the directory path).

**Additional files to update (missed by scout report):**
- `.factory/hooks/__tests__/loop-surface-inject.test.cjs` (4 refs)
- `.factory/hooks/__tests__/loop-surface-inject-mcp-failure.test.cjs` (3 refs)
- `.factory/hooks/__tests__/loop-surface-inject-format-block.test.cjs` (1 ref)
- `.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs` (2 refs)
- `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs` (17 refs — critical: asserts `config.mcpServers["learning-loop-mastra"]`)
- `.claude/coordination/__tests__/inbound-state-gate.test.cjs` (1 ref)
- `.claude/coordination/__tests__/gate-integration.test.cjs` (1 ref)

### Step 8.5: Update the 2 probe scripts and 2 scripts

**Probe scripts in `plans/260618-1418-GH-0029-pr5-shim-followup/`:**

- `e2e-tools-list-parity-probe.cjs:2,13`
- `override-introspection-probe.cjs:12`

Read each, find the `learning-loop-mastra` reference, replace with `learning-loop`. (These are probe scripts; they may be obsolete; verify if they're still run before editing.)

**Scripts:**

- `tools/scripts/run-pnpm-test-namespaced.mjs:28-29,118` — references in test runner; replace if applicable.
- `tools/scripts/refresh-fingerprints-pre-closeout.mjs:19` — references in closeout script; replace if applicable.

### Step 8.6: Update the legacy core files

**`tools/learning-loop-mastra/core/legacy/gate-logic.js:583`** (the `learning-loop-mcp || learning-loop-mastra` peer-check):

Before:
```js
// Phase C coexistence peer-check: allow either legacy or new server name
if (serverName === "learning-loop-mcp" || serverName === "learning-loop-mastra") {
  return true;
}
```

After:
```js
// Post-Phase-D: only the canonical server name is allowed (legacy peer-check removed)
if (serverName === "learning-loop") {
  return true;
}
```

**`tools/learning-loop-mastra/core/legacy/loop-introspect.js:141,146,153`** — **DO NOT RENAME.** These 3 references are **filesystem paths** (e.g., `tools/learning-loop-mastra/storage.js`, `tools/learning-loop-mastra/data/mastra-memory.db`), NOT MCP server names. R4 renames the MCP namespace key only; the directory `tools/learning-loop-mastra/` is unchanged. Renaming these paths would break storage resolution.

### Step 8.7: Update `AGENTS.md`, `CLAUDE.md`, `README.md` (operational references only)

**Decision:** update operational references in docs but leave historical references.

**Operational references to update:**
- `AGENTS.md` line 51: `MCP server (\`tools/learning-loop-mastra/server.js\`) — 44 tools ...` — the file path `tools/learning-loop-mastra/server.js` is unchanged (filesystem path), but the prose may reference the server name. Audit and update if found.
- `CLAUDE.md`: `MCP server: \`tools/learning-loop-mastra/server.js\` — see \`tools/learning-loop-mastra/tools/manifest.json\`` — the file paths are unchanged; the server name reference is the file path. **No change needed.**
- `README.md`: scan for `learning-loop-mastra` references; update operational references.

**Historical references to leave:**
- Plans (e.g., `plans/260618-1911-phase-d-plan-1-workflows/`) that mention `learning-loop-mastra` as the file/directory name — unchanged.
- Journals (e.g., `docs/journals/260624-phase-d-plan-3-post-review-hardened.md`) — unchanged.
- Reports (e.g., `plans/reports/...`) — unchanged.

### Step 8.8: Update the hook loader `.factory/hooks/loop-surface-inject.cjs`

**Lines 4, 79, 166** (per scout report §6) reference the server name. The hook loader spawns the server; it needs to know the new key.

Read the file; identify the references; replace with `learning-loop`.

### Step 8.9: Update `package.json#imports` (the `#mastra/*` alias)

Per scout report §6, `package.json:8,18,20` reference `learning-loop-mastra`:

- Line 8 (likely): `"#mastra/*": "./tools/learning-loop-mastra/*"` — the import alias. This is a filesystem path, not a server name. **No change needed** (the directory is still `tools/learning-loop-mastra/`).
- Line 18 (likely): `"test:debug": "node --test --test-timeout=120000 tools/learning-loop-mastra/__tests__/debug/*.test.cjs"` — the test runner script. Filesystem path, not server name. **No change needed.**
- Line 20 (likely): `"gate:server": "node tools/learning-loop-mastra/server.js"` — the server entry path. Filesystem path, not server name. **No change needed.**

**Conclusion:** `package.json` does not need to be modified. The references are filesystem paths, not server names. R4 only renames the MCP namespace key.

### Step 8.10: Create the operator-facing note

Create `docs/operator-notes/mcp-server-rename.md`:

```markdown
# MCP Server Rename — Operator Action Required

**Date:** 2026-06-24
**Plan:** `plans/260624-1111-phase-d-plan-4-cutover/phase-08-json-key-rename-r4.md`
**R4 deferred item:** closeout

The MCP server key was renamed from `learning-loop-mastra` to `learning-loop` in Plan 4 phase-08. The repo's `.mcp.json`, `.factory/mcp.json`, and `.claude/settings.local.json` were updated.

## What the operator must do

After Plan 4 merges to main, the operator must update the per-machine state files (these are NOT in the repo):

### Droid state

- Droid CLI maintains an internal state file that references the MCP server key. The operator must update this state to use the new key `learning-loop`.
- Reference: `~/.factory/...` (per-machine; consult Droid docs for the exact path)
- Action: restart Droid; the new key will be picked up from `.factory/mcp.json` on the next cold session.

### Claude Code state

- Claude Code maintains a per-machine state file (e.g., `~/.claude.json` or similar). The operator must update this state to use the new key `learning-loop`.
- Action: restart Claude Code; the new key will be picked up from `.mcp.json` on the next cold session.

## What is NOT in the operator's scope

- The MCP server entry path (`tools/learning-loop-mastra/server.js`) is unchanged. The directory is still `tools/learning-loop-mastra/`.
- The MCP tool names (e.g., `mastra_meta_state_log_change`, `ask_intake_agent`) are unchanged. The `mastra_` prefix and `ask_` prefix are tool-name conventions, not server-name conventions.
- The `meta-state.jsonl` audit log is unchanged (historical references to `learning-loop-mastra` are immutable).

## Verification

After the operator updates their per-machine state, run:

```bash
# From the repo root
pnpm test:cold-session
# Expected: 11/11 GREEN
```

If the cold-session test fails, check that the operator's state files reference `learning-loop` (not `learning-loop-mastra`).
```

### Step 8.11: Create the server-name-rename test

Create `tools/learning-loop-mastra/__tests__/server-name-rename.test.cjs`:

```js
// Server name rename test — asserts the R4 cascade is complete:
//   1. .mcp.json has key "learning-loop" (not "learning-loop-mastra")
//   2. .factory/mcp.json has key "learning-loop"
//   3. .claude/settings.local.json allowlist uses "mcp__learning-loop__*"
//   4. .claude/settings.local.json enabledMcpjsonServers is ["learning-loop"]
//   5. No "learning-loop-mastra" string in non-legacy code (.js/.cjs/.mjs in tools/, .claude/, .factory/)
//   6. The 3 historical references in plans/reports/ are preserved (sample audit)

const { describe, test } = require("node:test");
const assert = require("node:assert");
const { readFileSync, existsSync } = require("node:fs");
const { execSync } = require("node:child_process");
const { join, resolve } = require("node:path");

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");

describe("server name rename (R4)", () => {
  test(".mcp.json has key learning-loop", () => {
    const mcp = JSON.parse(readFileSync(join(PROJECT_ROOT, ".mcp.json"), "utf8"));
    assert.ok(mcp.mcpServers["learning-loop"], ".mcp.json should have key learning-loop");
    assert.strictEqual(mcp.mcpServers["learning-loop-mastra"], undefined,
      ".mcp.json should not have key learning-loop-mastra");
  });

  test(".factory/mcp.json has key learning-loop", () => {
    const mcp = JSON.parse(readFileSync(join(PROJECT_ROOT, ".factory/mcp.json"), "utf8"));
    assert.ok(mcp.mcpServers["learning-loop"], ".factory/mcp.json should have key learning-loop");
    assert.strictEqual(mcp.mcpServers["learning-loop-mastra"], undefined,
      ".factory/mcp.json should not have key learning-loop-mastra");
  });

  test(".claude/settings.local.json allowlist uses mcp__learning-loop__*", () => {
    const settings = JSON.parse(readFileSync(join(PROJECT_ROOT, ".claude/settings.local.json"), "utf8"));
    const allow = settings.permissions?.allow ?? [];
    for (const entry of allow) {
      if (typeof entry === "string" && entry.startsWith("mcp__")) {
        assert.ok(entry.startsWith("mcp__learning-loop__"),
          `allowlist entry should start with mcp__learning-loop__, got ${entry}`);
      }
    }
  });

  test(".claude/settings.local.json enabledMcpjsonServers is [learning-loop]", () => {
    const settings = JSON.parse(readFileSync(join(PROJECT_ROOT, ".claude/settings.local.json"), "utf8"));
    const enabled = settings.enabledMcpjsonServers ?? [];
    assert.ok(enabled.includes("learning-loop"),
      `enabledMcpjsonServers should include learning-loop, got ${JSON.stringify(enabled)}`);
    assert.ok(!enabled.includes("learning-loop-mastra"),
      `enabledMcpjsonServers should not include learning-loop-mastra, got ${JSON.stringify(enabled)}`);
  });

  test("no learning-loop-mastra in non-legacy code (tools/, .claude/, .factory/)", () => {
    let result;
    try {
      result = execSync(
        'grep -rln "learning-loop-mastra" tools/ .claude/ .factory/ --include="*.js" --include="*.cjs" --include="*.mjs" --include="*.json" || true',
        { cwd: PROJECT_ROOT, encoding: "utf8" },
      );
    } catch (e) {
      result = "";
    }
    const files = result.trim().split("\n").filter(Boolean);
    // Allow legacy/ to have historical references (legacy code is moved in Phase 7)
    const nonLegacy = files.filter((f) => !f.includes("/legacy/"));
    assert.deepStrictEqual(nonLegacy, [],
      `expected 0 non-legacy files with learning-loop-mastra, got ${nonLegacy.length}: ${nonLegacy.join(", ")}`);
  });

  test("historical references in plans/reports/ are preserved", () => {
    // Sample audit: confirm at least 1 plan file still has learning-loop-mastra
    // (the historical record should not be erased)
    let result;
    try {
      result = execSync(
        'grep -rln "learning-loop-mastra" plans/reports/ | head -3',
        { cwd: PROJECT_ROOT, encoding: "utf8" },
      );
    } catch (e) {
      result = "";
    }
    const files = result.trim().split("\n").filter(Boolean);
    assert.ok(files.length >= 1,
      `expected at least 1 historical plan/report with learning-loop-mastra, got ${files.length}`);
  });
});
```

### Step 8.12: Run the rename test + full test suite

```bash
node --test tools/learning-loop-mastra/__tests__/server-name-rename.test.cjs
pnpm test
pnpm test:cold-session
```

Expected: all tests pass. The rename test asserts the 4 MCP config + settings files have the new key, and the non-legacy code is clean.

### Step 8.13: Commit the rename

**Commit message:**

```
refactor(rename): R4 cascade — MCP server key learning-loop-mastra → learning-loop

Phase D Plan 4 phase-08:
- .mcp.json + .factory/mcp.json: key renamed
- .claude/settings.local.json: allowlist + enabledMcpjsonServers updated
- 30+ files updated (test files, hook loader, scripts, source code)
- 3 legacy core files (now in core/legacy/) updated; peer-check removed
- .factory/hooks/loop-surface-inject.cjs: server reference updated
- New docs/operator-notes/mcp-server-rename.md: Droid + Claude Code state
  update required (manual, per-machine)
- New __tests__/server-name-rename.test.cjs (6 tests) asserts the cascade

The MCP tool NAMES (mastra_*, ask_*) are unchanged. The MCP server ENTRY
PATH (tools/learning-loop-mastra/server.js) is unchanged. Only the MCP
namespace key is renamed.

The meta-state.jsonl audit log is unchanged (historical references are
immutable). plans/ and plans/reports/ are unchanged (historical record).
```

## Success Criteria

- [ ] `.mcp.json` key is `learning-loop`.
- [ ] `.factory/mcp.json` key is `learning-loop`.
- [ ] `.claude/settings.local.json` allowlist uses `mcp__learning-loop__*` (6 entries).
- [ ] `.claude/settings.local.json` `enabledMcpjsonServers` is `["learning-loop"]`.
- [ ] 30+ files updated (12+ in tools/, 4 in .factory/hooks/__tests__/, 3 in .claude/coordination/__tests__/, hook loader, scripts, source code).
- [ ] 2 probe scripts updated.
- [ ] 2 build scripts updated.
- [ ] 3 legacy core files updated (now in `core/legacy/`).
- [ ] `.factory/hooks/loop-surface-inject.cjs` updated.
- [ ] `docs/operator-notes/mcp-server-rename.md` exists.
- [ ] `tools/learning-loop-mastra/__tests__/server-name-rename.test.cjs` exists with 6 tests, all GREEN.
- [ ] `git grep "learning-loop-mastra"` returns 0 matches in non-legacy code (test #5 in rename test).
- [ ] `pnpm test` passes (delta: +6 tests for rename).
- [ ] `pnpm test:cold-session` passes.
- [ ] 1 commit with the rename.

## Risk Assessment

| Risk | Likelihood | Mitigation |
|---|---|---|
| The rename test (Step 8.11) is itself affected by the `learning-loop-mastra` string in the test (e.g., the test asserts non-existence of the string) | Low | The test uses `execSync('grep -rln "learning-loop-mastra" ...')` which shells out; the grep pattern is the literal string. The test's own code uses the string in shell commands, not as an import. The test file does not use the string as an MCP namespace key. |
| The rename breaks the operator's per-machine state (Droid/Claude Code) | High | The `docs/operator-notes/mcp-server-rename.md` documents the manual update. The PR body also calls this out. The test does not check per-machine state (out of scope). |
| The 30+ files contain subtle references to the server name (e.g., as part of a longer string or mixed with filesystem paths) that the mechanical rename misses | Low | The rename test (Step 8.11) uses `grep -rln "learning-loop-mastra" tools/ .claude/ .factory/ --include="*.js" ...` which catches any remaining references. The test's own code uses the string as a literal, but that's in the test's shell command (expected). |
| The doubly-prefixed `mcp__learning-loop-mastra__mastra_meta_state_list` becomes ambiguous after rename (now `mcp__learning-loop__mastra_meta_state_list` — correct) | Low | The rename is mechanical: replace `learning-loop-mastra` with `learning-loop` everywhere. The doubly-prefixed form becomes `mcp__learning-loop__mastra_meta_state_list` which is the canonical pattern. |
| The probe scripts in `plans/260618-1418-GH-0029-pr5-shim-followup/` are obsolete (not run anymore) | Medium | Audit the probe scripts before editing. If obsolete, delete them. If still run, update. |
| The cold cache file at `records/meta/.cache/loop-describe-cold.json` has historical references to `learning-loop-mastra` (frozen) | Low | The cold cache is regenerated on next run; R4 does not modify it. The rename test (Step 8.11 test #6) confirms historical references in plans/reports/ are preserved. The cold cache is a runtime artifact, not a historical record. |
| The `AGENTS.md` updates change the meaning of a load-bearing reference | Low | Step 8.7 explicitly limits updates to operational references (where the doc tells the user "the server is at ..."). Historical references (where the doc cites a plan) are left unchanged. |
| The hook loader update at `.factory/hooks/loop-surface-inject.cjs` breaks the runtime hook | Low | Read the loader carefully; identify the reference; replace; verify by running `pnpm test:cold-session` and the pre-commit test hooks. |
| The `#mastra/*` import alias in `package.json` is renamed to `#loop/*` or similar (out of scope) | Low | R4 is the MCP namespace key rename, not the import alias rename. The import alias `#mastra/*` is a different concept (file system alias for `tools/learning-loop-mastra/*`). R4 leaves it alone. |
