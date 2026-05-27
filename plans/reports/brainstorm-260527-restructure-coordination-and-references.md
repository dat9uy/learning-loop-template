---
title: "Restructure Coordination Gate & Co-locate Learning-Loop References"
description: >-
  Brainstorm report: rename tools/coordination-gate to tools/learning-loop-mcp,
  flatten the mcp/ subfolder, and move .claude/skills/learning-loop/references
  and evals/ into the MCP package so skills become thin pointers.
status: agreed
priority: P1
tags: [brainstorm, technical-debt, mcp, project-organization, agent-experience]
created: "2026-05-27T00:00:00Z"
createdBy: "ck:brainstorm"
---

# Restructure Coordination Gate & Co-locate Learning-Loop References

## Problem Statement

Two structural inconveniences in the current architecture were identified:

1. **References/evals live in `.claude/skills/learning-loop/` but are consumed by both Claude and Droid skills.** The `.factory/skills/learning-loop/SKILL.md` references `references/learning-loop-rules.md` and other files, yet the `.factory` skill tree contains only `SKILL.md` — the referenced files do not exist there. This is an active inconsistency. The references describe system rules that the MCP server enforces (observation state, verification dimensions, budget rules, prompt blueprints). They belong with the runtime, not with a single consumer skill.

2. **`tools/coordination-gate/mcp/` is unnecessarily nested.** The `mcp/` subfolder sits at the same level as `core/` and `hooks/`, but `server.js` and 33 tool files import core logic via `../../core/` and shared libs via `../../../lib/`. The path `tools/coordination-gate/mcp/server.js` is hard for humans to parse, and the import depth is deeper than it needs to be. The server name "coordination-gate" also does not match the repo brand "learning-loop".

## Requirements

| Requirement | Detail |
|-------------|--------|
| **Expected output** | Renamed `tools/learning-loop-mcp/` directory with flattened `mcp/` content, plus `references/` and `evals/` co-located inside it. Updated skill files pointing to new paths. All imports simplified. |
| **Acceptance criteria** | `pnpm check` passes after refactor. `.mcp.json` entrypoint works. Hooks in `.claude/coordination/hooks/` and `.factory/coordination/hooks/` resolve. Both skills load references from new paths. Zero logic changes in core/gate-logic or tool implementations. |
| **Scope boundary** | Does NOT change MCP tool implementations, gate logic, record schemas, or the learning-loop protocol itself. Pure rename/move refactor. |
| **Non-negotiable constraints** | `.mcp.json` entrypoint may change freely. Must not break `pnpm test`. Must keep backward compatibility for `records/`, `schemas/`, `docs/` lanes. |
| **Touchpoints** | `tools/coordination-gate/` → `tools/learning-loop-mcp/`. `.claude/skills/learning-loop/SKILL.md`. `.factory/skills/learning-loop/SKILL.md`. `package.json` scripts. `README.md`. `CLAUDE.md`. `.mcp.json`. Hook wrappers in `.claude/coordination/hooks/` and `.factory/coordination/hooks/`. |

## Scout Findings

- `.claude/skills/learning-loop/references/` contains 8 markdown files: `learning-loop-rules.md`, `prompt-blueprints.md`, `prompt-blueprints-state-gated.md`, `prompt-blueprints-product-build.md`, `orchestration-patterns.md`, `context-retrieval-patterns.md`, `resource-budget-rules.md`, `meta-evidence-self-improvement.md`, plus `agent-anti-confusion-checklist.md` and `plan-phase-0-template.md`.
- `.claude/skills/learning-loop/evals/evals.json` contains 3 eval cases: runtime-proof-prompt, orchestration-prompt, meta-improvement-prompt.
- `.factory/skills/learning-loop/` only contains `SKILL.md` — no `references/` or `evals/` subtree. This means `.factory` skill references files at relative paths that do not exist in its own tree.
- `tools/coordination-gate/` has: `core/` (gate-logic, file-readers, writers), `hooks/` (bash-gate, write-gate, inbound-gate + lib/protocol-adapter.js), `mcp/` (server.js, tool-registry.js, workflow-runner.js, agent-manifest.json, lib/, tools/ with 33 tool files), and `__tests__/`.
- `tools/lib/` is shared across all tools (resolve-root.js, gate-logging.js, frontmatter-splitter.js, etc.), located at `tools/lib/` — 2 levels above `coordination-gate/`, 3 levels above `coordination-gate/mcp/tools/`.
- Current server name in `server.js`: `"coordination-gate"`. Current `.mcp.json`: `{"mcpServers": {"coordination-gate": {"command": "node", "args": ["tools/coordination-gate/mcp/server.js"]}}}`. Current `package.json` script: `"gate:server": "node tools/coordination-gate/mcp/server.js"`.

## Evaluated Approaches

### Approach A: Keep everything as-is

**Description:** Do not move references. Do not rename coordination-gate.

**Pros:**
- Zero churn. No file moves, no path updates.
- "coordination-gate" is already established in muscle memory and docs.

**Cons:**
- `.factory/skills/learning-loop/SKILL.md` references non-existent files. This is broken today.
- References describe system rules but live in a Claude-specific path. Droid skill cannot access them without duplication or external path reach.
- Import paths from `mcp/tools/foo.js` to `core/` and `lib/` are unnecessarily deep (`../../core/`, `../../../lib/`).
- Server name does not match repo brand. Agent discoverability suffers.

**Verdict:** Rejected. The broken `.factory` skill reference and deep imports are real costs.

---

### Approach B: Flatten `mcp/` only, keep name "coordination-gate"

**Description:** Move `mcp/server.js` to `coordination-gate/server.js`, `mcp/tools/` to `coordination-gate/tools/`, etc. Keep the directory name `tools/coordination-gate/`.

**Pros:**
- Fixes import depth. `tools/foo.js` → `core/` becomes `../core/` instead of `../../core/`.
- Zero risk of external consumers breaking (directory name unchanged).

**Cons:**
- Does not fix the references/evals location problem.
- Server name still says "coordination-gate" instead of "learning-loop".
- The term "coordination" is overloaded (also used for `.claude/coordination/` and `.factory/coordination/` hook directories).

**Verdict:** Partial fix. Rejected as insufficient — leaves two of the three problems unsolved.

---

### Approach C: Full restructure — rename to `learning-loop-mcp`, flatten `mcp/`, co-locate references/evals

**Description:**
1. Rename `tools/coordination-gate/` → `tools/learning-loop-mcp/`.
2. Flatten `mcp/` contents into the top level: `server.js`, `tool-registry.js`, `workflow-runner.js`, `agent-manifest.json`, `lib/`, `tools/`.
3. Move `.claude/skills/learning-loop/references/` and `evals/` into `tools/learning-loop-mcp/references/` and `tools/learning-loop-mcp/evals/`.
4. Update both skill `SKILL.md` files to reference new paths.
5. Update `package.json`, `.mcp.json`, `README.md`, `CLAUDE.md`, hook wrappers.
6. Rename server name from `"coordination-gate"` to `"learning-loop-mcp"` in `server.js` and `agent-manifest.json`.

**Pros:**
- Fixes all three problems in one pass.
- Import paths simplified: deepest traversal (`tools/foo.js` → `lib/`) drops from `../../../lib/` to `../../lib/`.
- References now live with the system they describe. Both Claude and Droid skills point to the same shared source.
- Server name matches repo brand and is self-describing.
- The `.factory` skill inconsistency is eliminated.
- Sets up future agentize packaging: `tools/learning-loop-mcp/` can become a publishable MCP server package with its own `package.json` and `README.md`.

**Cons:**
- Higher churn than Approach B. More files to update.
- Risk of missing a path reference in docs or scripts.
- "coordination-gate" appears in many historical plans and reports — those become stale references (acceptable for historical docs).

**Verdict:** Recommended. Accept the churn cost for a clean, agent-friendly structure.

---

### Approach D: Extract references to `docs/references/` or `tools/learning-loop/`

**Description:** Move references to a neutral shared path (e.g., `docs/references/learning-loop/`) rather than into the MCP package. Skills and MCP server both reference from there.

**Pros:**
- References are not "owned" by the MCP server; they are system policy docs.
- `docs/` is already the canonical lane for policy and operator guides.

**Cons:**
- Does not solve the `mcp/` nesting or import depth problem.
- `docs/` is for human-readable policy, not machine-consumed evals and prompt blueprints. Evals belong with the runtime/validation layer.
- Adds a third location (`docs/`, `tools/`, `.claude/`) instead of consolidating.

**Verdict:** Rejected. References are consumed by the MCP server (prompt generation tools, workflow tools) and by skills. They are runtime configuration, not human docs. Co-locating with the MCP package is the correct coupling.

## Final Recommended Solution

### Approach C: Full Restructure

#### New directory tree

```
tools/learning-loop-mcp/
├── server.js                    ← was mcp/server.js
├── tool-registry.js             ← was mcp/tool-registry.js
├── workflow-runner.js           ← was mcp/workflow-runner.js
├── agent-manifest.json          ← was mcp/agent-manifest.json (name updated)
├── core/                        ← unchanged from coordination-gate/core/
│   ├── index.js
│   ├── gate-logic.js
│   ├── file-readers.js
│   ├── observation-writer.js
│   ├── record-writer.js
│   ├── decision-writer.js
│   ├── experiment-writer.js
│   ├── risk-writer.js
│   └── inbound-state.js
├── hooks/                       ← unchanged from coordination-gate/hooks/
│   ├── bash-gate.js
│   ├── write-gate.js
│   ├── inbound-gate.js
│   └── lib/
│       └── protocol-adapter.js
├── tools/                       ← was mcp/tools/
│   ├── manifest.json
│   ├── gate-tool.js
│   ├── mark-preflight-complete-tool.js
│   ├── record-observation-tool.js
│   ├── create-decision-record-tool.js
│   ├── update-decision-record-tool.js
│   ├── create-experiment-record-tool.js
│   ├── update-experiment-record-tool.js
│   ├── create-risk-record-tool.js
│   ├── update-risk-record-tool.js
│   ├── update-observation-tool.js
│   ├── update-claim-tool.js
│   ├── delete-record-tool.js
│   ├── validate-records-tool.js
│   ├── extract-index-tool.js
│   ├── search-index-tool.js
│   ├── generate-capabilities-tool.js
│   ├── list-probes-tool.js
│   ├── list-verified-tool.js
│   ├── notify-artifact-tool.js
│   ├── trigger-workflow-tool.js
│   ├── workflow-intake-orient-tool.js
│   ├── workflow-intake-plan-tool.js
│   ├── workflow-classify-prompt-tool.js
│   ├── workflow-generate-prompt-tool.js
│   ├── workflow-convert-evidence-tool.js
│   ├── workflow-verify-evidence-tool.js
│   ├── workflow-external-decision-tool.js
│   ├── workflow-self-improvement-tool.js
│   ├── workflow-intentional-skip-tool.js
│   ├── workflow-report-phase-status-tool.js
│   ├── workflow-prepare-runtime-request-tool.js
│   ├── workflow-runtime-probe-tool.js
│   ├── workflow-product-build-tool.js
│   └── workflow-notify-artifact-tool.js
├── lib/                         ← was mcp/lib/
│   └── source-ref-validator.js
│   └── source-ref-validator.test.js
├── references/                  ← NEW (from .claude/skills/learning-loop/references/)
│   ├── learning-loop-rules.md
│   ├── prompt-blueprints.md
│   ├── prompt-blueprints-state-gated.md
│   ├── prompt-blueprints-product-build.md
│   ├── orchestration-patterns.md
│   ├── context-retrieval-patterns.md
│   ├── resource-budget-rules.md
│   ├── meta-evidence-self-improvement.md
│   ├── agent-anti-confusion-checklist.md
│   └── plan-phase-0-template.md
├── evals/                       ← NEW (from .claude/skills/learning-loop/evals/)
│   └── evals.json
└── __tests__/                   ← unchanged from coordination-gate/__tests__/
```

#### Updated skill references

Both `.claude/skills/learning-loop/SKILL.md` and `.factory/skills/learning-loop/SKILL.md` update their `## References` section:

```markdown
## References

- `tools/learning-loop-mcp/references/learning-loop-rules.md` — condensed repo rules.
- `tools/learning-loop-mcp/references/resource-budget-rules.md` — hard constraints.
- `tools/learning-loop-mcp/references/prompt-blueprints.md` — reusable prompt skeletons.
- `tools/learning-loop-mcp/references/prompt-blueprints-state-gated.md` — state-gated templates.
- `tools/learning-loop-mcp/references/prompt-blueprints-product-build.md` — product-build skeletons.
- `tools/learning-loop-mcp/references/meta-evidence-self-improvement.md` — meta-improvement rules.
- `tools/learning-loop-mcp/references/orchestration-patterns.md` — full-lifecycle orchestration.
- `tools/learning-loop-mcp/evals/evals.json` — skill eval cases.
```

#### Updated config files

| File | Before | After |
|------|--------|-------|
| `.mcp.json` | `tools/coordination-gate/mcp/server.js` | `tools/learning-loop-mcp/server.js` |
| `package.json` script `gate:server` | `node tools/coordination-gate/mcp/server.js` | `node tools/learning-loop-mcp/server.js` |
| `server.js` name | `"coordination-gate"` | `"learning-loop-mcp"` |
| `agent-manifest.json` server field | `"coordination-gate"` | `"learning-loop-mcp"` |
| Hook wrappers (`.claude` / `.factory`) | `../../../tools/coordination-gate/hooks/bash-gate.js` | `../../../tools/learning-loop-mcp/hooks/bash-gate.js` |

#### Import path improvements

| Source | Target | Before | After |
|--------|--------|--------|-------|
| `server.js` | `tool-registry.js` | `./tool-registry.js` | `./tool-registry.js` |
| `server.js` | `lib/resolve-root.js` | `../../lib/resolve-root.js` | `../lib/resolve-root.js` |
| `tool-registry.js` | `lib/resolve-root.js` | `../../lib/resolve-root.js` | `../lib/resolve-root.js` |
| `tools/*.js` | `core/gate-logic.js` | `../../core/gate-logic.js` | `../core/gate-logic.js` |
| `tools/*.js` | `lib/resolve-root.js` | `../../../lib/resolve-root.js` | `../../lib/resolve-root.js` |

## Implementation Considerations & Risks

| Risk | Mitigation |
|------|-----------|
| Missed path reference in docs/plans | Grep for `"coordination-gate"` and `"coordination_gate"` across repo before commit. Update `README.md`, `CLAUDE.md`, and any `docs/` files that reference the old path. |
| Import path errors after move | `pnpm test` validates all hooks and core logic. Run full test suite after refactor. |
| `.factory` skill already has stale references | This refactor fixes the root cause. The `.factory` skill will now point to real files. |
| Historical plan/report references become stale | Acceptable. Historical docs reference the state at time of writing. Do not retroactively edit old brainstorm reports. |
| External consumers of `.mcp.json` | `.mcp.json` entrypoint may change freely per user confirmation. Update any local Claude/Droid configurations that point to the old path. |
| `__tests__/` imports | `__tests__/mcp-lifecycle-integration.test.js` and `cross-surface.test.js` may import from `../core/` or `../mcp/`. Update to `../core/` and `../` respectively. |

## Success Metrics & Validation Criteria

1. `pnpm test` passes with zero failures.
2. `pnpm check` (validate:records + validate:plan-loop + test) passes.
3. `node tools/learning-loop-mcp/server.js` starts without errors and registers all 33 tools.
4. Both `.claude/settings.json` and `.factory/settings.json` hook paths resolve to existing files.
5. Grep for `"coordination-gate"` across `tools/`, `.claude/`, `.factory/`, `package.json`, `.mcp.json` returns zero matches (except historical docs/plans).
6. `ls tools/learning-loop-mcp/references/` shows 10 markdown files.
7. `ls tools/learning-loop-mcp/evals/` shows `evals.json`.

## Appendix: Eliminating `../../` Relative Path Imports

### Problem

Even after flattening `mcp/`, imports from `tools/learning-loop-mcp/tools/*.js` to `tools/lib/` still traverse `../../lib/`. The user asked for an option to eliminate the `../../` paradigm entirely, similar to Vite's `@/` aliases.

### Option A: Node.js subpath imports (Recommended)

Add `"imports"` field to `package.json`:

```json
{
  "imports": {
    "#mcp/*": "./tools/learning-loop-mcp/*",
    "#lib/*": "./tools/lib/*",
    "#records/*": "./records/*",
    "#schemas/*": "./schemas/*"
  }
}
```

Import paths become:

```js
// Before
import { resolveRoot } from "../../../lib/resolve-root.js";
import { makeGateDecision } from "../../core/gate-logic.js";

// After
import { resolveRoot } from "#lib/resolve-root.js";
import { makeGateDecision } from "#mcp/core/gate-logic.js";
```

**Pros:**
- Native Node.js (ESM subpath imports, v14.6.0+), zero dependencies.
- No build step required. Works with `node --test`, `node server.js`.
- IDE autocomplete friendly (VS Code / Vim understand `#` aliases).
- Greppable: `grep -r "#lib/"` finds all consumers of shared lib.
- Self-documenting: `#mcp/core/` clearly signals cross-package boundary.

**Cons:**
- Every alias must be declared in `package.json`. No runtime wildcard discovery.
- If `tools/` moves again, `package.json` must update (single source of truth, manageable).

### Option B: Barrel re-export files at repo root

Create `pkg/mcp.js` and `pkg/lib.js` that re-export from their target directories:

```js
// pkg/mcp.js
export * from "../tools/learning-loop-mcp/core/gate-logic.js";
export * from "../tools/learning-loop-mcp/core/file-readers.js";
```

Then import from anywhere with one consistent relative depth:

```js
import { makeGateDecision } from "../../pkg/mcp.js";
```

**Pros:** One path depth works from any file. No `package.json` changes needed.

**Cons:** Manual barrel maintenance. Tree-shaking concerns. Adds indirection. Not self-documenting (what's in `pkg/mcp.js` vs `pkg/lib.js`?).

### Option C: Status quo (flattened paths only)

After the restructure, deepest import is `../../lib/` from `tools/foo.js`. Tolerable but not ideal.

### Verdict

**Adopt Option A (subpath imports) in the same refactor.** It pairs cleanly with the rename/flatten:

1. Restructure directories (rename, flatten, move references).
2. Add `"imports"` to `package.json`.
3. Update all `../../../lib/` and `../../core/` to `#lib/` and `#mcp/core/`.

This gives the project Vite-level import ergonomics without a build tool.

## Updated file tree (with subpath imports)

```
package.json                    ← "imports" field added
tools/
├── learning-loop-mcp/
│   ├── server.js               ← import { resolveRoot } from "#lib/resolve-root.js"
│   ├── tool-registry.js
│   ├── workflow-runner.js
│   ├── agent-manifest.json
│   ├── core/
│   │   └── index.js            ← import { resolveRoot } from "#lib/resolve-root.js"
│   ├── hooks/
│   │   └── bash-gate.js        ← import { resolveRoot } from "#lib/resolve-root.js"
│   ├── tools/
│   │   ├── gate-tool.js        ← import { makeGateDecision } from "#mcp/core/gate-logic.js"
│   │   └── ...
│   ├── lib/
│   ├── references/
│   ├── evals/
│   └── __tests__/
└── lib/
    ├── resolve-root.js
    ├── gate-loging.js
    └── frontmatter-splitter.js
```

## Next Steps & Dependencies

1. **Run `/ck:plan`** to produce the phase-by-phase implementation plan. Recommended mode: `/ck:plan` (default) — this is a pure rename/move refactor with no logic changes, so TDD is not necessary.
2. **Implement the plan** with `/ck:cook` or manual execution.
3. **Validate** with `pnpm check` and `pnpm test`.
4. **Commit** with a descriptive message: `refactor(tools): rename coordination-gate to learning-loop-mcp, flatten mcp/, co-locate references and evals, add subpath imports`.
5. **Journal** the outcome with `/ck:journal`.
