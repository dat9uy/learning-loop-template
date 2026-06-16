---
title: "Runtime-Agnostic Features: Codify the Universal Pattern as a Layered Rule"
description: "Codifies the existing runtime-agnostic pattern (shim not fork, cross-surface iteration, protocol-adapter) as a layered rule that future features must follow. Six-artifact design: AGENTS.md amendment (design spec), meta-state rule entry (codified invariant), new pattern_type consult-checklist (rule shape), new MCP tool check_runtime_agnostic (audit surface), core/surfaces.js helper (cross-surface API), __tests__/runtime-agnostic.test.js (regression guard). The rule surfaces in loop_describe warm tier. Targets Claude Code + Droid CLI today; the helper is parameterized so future runtimes add themselves by appending to the SURFACES list."
date: "2026-06-15T14:00:00Z"
tags: [meta, runtime-agnostic, rule, design-principle, meta-state, agent-manifest, surfaces, cross-surface, protocol-adapter, layered-enforcement]
status: draft
session: 260615-runtime-agnostic-rule
supersedes: null
superseded_by: null
related:
  - meta-state.jsonl entry (new) rule-runtime-agnostic-features (the rule this report authors)
  - meta-state.jsonl entry rule-no-new-artifact-types (existing gate/regex rule; the new rule is a different shape, lives alongside)
  - meta-state.jsonl entry rule-project-skill-boundary (closest precedent: agent/glob on .factory/skills/**; the new rule adds cross-surface iteration semantics)
  - tools/learning-loop-mcp/hooks/lib/protocol-adapter.js (the universal surface this rule formalizes)
  - tools/learning-loop-mcp/hooks/{bash,write,inbound}-gate.js (universal hooks; the targets of the rule)
  - .claude/coordination/hooks/{bash,write,inbound}-coordination-gate.cjs (Claude shim)
  - .factory/coordination/hooks/{bash,write,inbound}-coordination-gate.cjs (Droid shim)
  - tools/learning-loop-mcp/core/inbound-state.js (target: refactor to use surfaces.js)
  - tools/learning-loop-mcp/core/gate-logic.js#GLOB_SCOPE_WHITELIST (target: refactor to use surfaces.js; known asymmetry: missing .claude/)
  - tools/learning-loop-mcp/core/gate-logic.js#applyPromotedRules (target: handle new pattern_type consult-checklist)
  - tools/learning-loop-mcp/tools/loop-describe-tool.js#buildDiscoverabilityHints (target: add rule-runtime-agnostic hint)
  - tools/learning-loop-mcp/agent-manifest.json (target: add runtime_agnostic group)
  - AGENTS.md §2 Hook Matrix (target: new subsection "Runtime-Agnostic Pattern")
  - AGENTS.md §3 Meta-Surface Tools (target: list the new MCP tool)
  - plans/reports/brainstorm-260615-1300-bash-gate-debate-friendly-and-string-literal-fix.md (prior brainstorm; this report extends the same layered philosophy)
  - docs/philosophy.md (no change; the rule honors the existing Pillar 4 dependency-balance convention)
related_findings:
  - (no existing finding; this report is preventive — the rule is codifying a pattern that already mostly works)
related_gaps:
  - tools/learning-loop-mcp/core/gate-logic.js:407 GLOB_SCOPE_WHITELIST asymmetry (missing .claude/; refactored in this design)
  - tools/learning-loop-mcp/core/inbound-state.js:34-65 hard-coded surface paths (refactored in this design)
---

# Runtime-Agnostic Features: Codify the Universal Pattern as a Layered Rule

## TL;DR

The existing runtime-agnostic pattern in this codebase is **already mostly in place** (thin shims, universal `core/`, `protocol-adapter.js`, cross-surface marker reads). What's missing is the **codified invariant** that teaches the pattern to future features and audits compliance.

This report authors one design with six implementation artifacts:

1. **AGENTS.md §2 subsection** ("Runtime-Agnostic Pattern") — the human-readable design spec; lists the 6-item checklist; cites the existing pattern.
2. **Meta-state rule entry** (`id: rule-runtime-agnostic-features`) — the codified invariant. `enforcement: "agent"`, `pattern_type: "consult-checklist"`, `pattern` is the JSON-serialized checklist. Surfaces in `loop_describe` warm tier via a new `discoverability_hint`.
3. **New pattern type `consult-checklist`** in `core/gate-logic.js#applyPromotedRules` — a no-op for the bash gate (the rule is design-time, not command-time); a hook for the new `check_runtime_agnostic` MCP tool.
4. **New MCP tool `check_runtime_agnostic`** — `tools/learning-loop-mcp/tools/check-runtime-agnostic-tool.js`. Audits a file or feature path against the checklist. Returns structured feedback. The rule's enforcement surface.
5. **`core/surfaces.js`** — the cross-surface helper. `export const SURFACES = [".claude", ".factory"]`; helpers `getAllCoordinationPaths(subpath)`, `writeToAllSurfaces(subpath, content)`, `readFromAllSurfaces(subpath)`. The API for code that needs to touch all surfaces.
6. **`__tests__/runtime-agnostic.test.js`** — regression guard. Scans `core/` for hard-coded surface paths, asserts they all go through `surfaces.js`. Locks in the universal pattern.

Plus two refactors that fix existing asymmetries:
- `core/gate-logic.js#GLOB_SCOPE_WHITELIST` — extend to use `surfaces.js#SURFACES` (fixes the missing `.claude/` asymmetry).
- `core/inbound-state.js#readLastOperatorMessage` — refactor to use `surfaces.js#readFromAllSurfaces` (DRY; the function currently inlines the cross-surface iteration).

The design honors the prior brainstorm's layered philosophy: AGENTS.md is the spec, the rule is the codified invariant, the tool is the audit, the test is the automated catch, the helper is the API. **The rule record sits at the center as the canonical machine-readable form, but it does not run code by itself** — the behavior is distributed across the gate (pattern-type handler), the tool (audit), the test (regression), and the helper (API).

## Problem Statement

### The existing pattern (the loop already does this, mostly)

Empirical scout 2026-06-15 confirms the runtime-agnostic pattern is real and working:

- **Universal core**: `tools/learning-loop-mcp/{core,hooks,tools}/` contains all gate logic, MCP tools, and hook bodies. The `protocol-adapter.js` translates between Claude Code (tool names: `Bash`/`Write`/`Edit`/`ApplyPatch`) and Droid CLI (tool names: `Execute`/`Create`).
- **Thin surface shims**: `.claude/coordination/hooks/{bash,write,inbound}-coordination-gate.cjs` and `.factory/coordination/hooks/{bash,write,inbound}-coordination-gate.cjs` are ~20 lines each — they `execFileSync` the universal hook with `stdio: ['pipe', 'inherit', 'inherit']`. This is the canonical "shim not fork" pattern.
- **Cross-surface iteration**: `core/inbound-state.js#readLastOperatorMessage` reads from `.claude/coordination/` first, then falls back to `.factory/coordination/`. The bash gate writes to both surfaces in the proposed Plan 1.
- **Single MCP manifest**: `tools/learning-loop-mcp/agent-manifest.json` is the only manifest. Both runtimes read it.

### The two existing asymmetries (the rule should fix)

1. `core/gate-logic.js:407` — `GLOB_SCOPE_WHITELIST = ["product/", "docs/", "plans/", "tools/", ".factory/", "meta-state.jsonl"]`. **Missing `.claude/`.** This is a known asymmetry: the rule allows `.factory/`-prefixed paths but not `.claude/`-prefixed paths, even though both are legitimate surface prefixes for coordination hooks. A future Claude-targeted glob pattern would be silently dropped by the whitelist check.
2. `core/inbound-state.js:34-65` — hard-codes both `.claude` and `.factory` paths inline. The cross-surface iteration is duplicated logic; if a third surface is added, the function needs editing in two places.

### What's missing (the rule's purpose)

The pattern exists, but nothing **teaches** it to a fresh agent. A new agent reading AGENTS.md would see the Hook Matrix in §2 (the surface→hook table) but would not see the design principle "all features must be runtime-agnostic". A new MCP tool added today would not be audited for the pattern. A new `core/` function that hard-codes a surface path would not be caught by a regression test.

The rule codifies the principle and provides the surfaces that enforce it.

### The user's reframe (operator-stated, 2026-06-15)

> Following this [prior brainstorm], I think we should setup the rule that every feature from now on need to be runtime-agnostic. What's the correct way to setup this in learning-loop way? (Claude Code + Droid for now)

Three load-bearing requirements from the reframe:
- **"From now on"** — the rule applies to future features, not retroactively. Existing code is refactored only when the asymmetry is a real bug (the two cases above).
- **"Runtime-agnostic"** — the design principle. Encoded as the 6-item checklist (see Scoping).
- **"Learning-loop way"** — the rule must be: discoverable (loop_describe), auditable (MCP tool), testable (regression test), evolvable (refinement via meta_state_patch). All four surfaces present.
- **"Claude Code + Droid for now"** — the rule must be parameterized so a future runtime (e.g., Cursor, Aider) adds itself by appending to the `SURFACES` list, not by editing core logic.

### Scoping decisions (from the discovery round)

| Question | Decision | Why |
|---|---|---|
| Checklist scope | All 6 items (universal core, shim sync, protocol-adapter, manifest, cross-surface iteration, parameterized for new surfaces) | User explicit. Each item maps to an existing pattern in the code. |
| Enforcement shape | Layered (rule + tool + test + helper + spec) | User explicit. Matches the prior brainstorm's layered philosophy. |
| Output artifact | Full brainstorm report (like the previous one) | User explicit. |
| Rule enforcement | `agent` (consult), not `gate` (hard block) | The rule is design-time, not command-time. Hard-blocking commands for "missing runtime-agnostic declaration" would create more friction than it catches. Agent-consulted is the right shape. |
| Pattern type | New type `consult-checklist` (no command/path matching; pure discoverability + audit) | The existing pattern types (regex, glob, resolution-evidence-required) don't fit a design-time checklist. A new type is justified; same precedent as `resolution-evidence-required` (added 2026-06-06 in `meta-260606T1656Z-...`). |

## Evaluated Approaches

### Position 1: Markdown-only rule in AGENTS.md (rejected)

Add a new AGENTS.md subsection explaining the runtime-agnostic pattern. No meta-state entry, no MCP tool, no test.

**Pros:** Smallest possible change. The AGENTS.md file is already the human-readable design spec; this adds to it.

**Cons:** **The loop cannot enforce or audit a markdown-only rule.** A fresh agent can skip AGENTS.md. A new MCP tool can be added without the checklist being applied. A regression is invisible until someone reads the file. The user's reframe says "learning-loop way" — the loop is supposed to participate in the rule, not just host the prose.

### Position 2: Meta-state rule entry only (rejected as standalone)

Add `rule-runtime-agnostic-features` as a meta-state entry. Surface in `loop_describe` warm tier. No MCP tool, no test, no helper.

**Pros:** Codifies the invariant. Discoverable via `loop_describe`. Agent can `meta_state_list({ entry_kind: "rule" })` and see it.

**Cons:** The rule is data, not behavior. **Without a tool to audit, the rule is a wish.** A new feature added today would have to voluntarily call `meta_state_derive_status` on the rule, which is not a natural step. The rule is invisible to the existing pre-commit / test pipeline.

### Position 3: Rule + MCP tool only (rejected as standalone)

Rule entry + new MCP tool `check_runtime_agnostic`. No test, no helper.

**Pros:** The rule is codifiable AND auditable. The tool is the enforcement surface.

**Cons:** **The tool's audit logic duplicates the design principle.** If a future feature is added that doesn't call the tool, the audit is skipped. A regression test that scans `core/` for hard-coded surface paths would catch violations at test time, not at tool-call time. The user's reframe values testability.

### Position 4: Rule + MCP tool + regression test + cross-surface helper (selected, with AGENTS.md amendment)

All four enforcement surfaces, plus the AGENTS.md design spec amendment.

**Pros:** Closes the loop. The rule is discoverable (loop_describe). The tool is auditable (explicit call). The test is the automated catch (runs on every change). The helper is the API (code that needs to touch surfaces has a clean entry point). AGENTS.md is the spec (human-readable).

**Cons:** Bigger surface. ~6 implementation artifacts. Each is small, but the total is moderate. Worth the cost given the user's reframe ("learning-loop way" implies all four surfaces).

### Position 5: Rule + auto-fail-on-anti-pattern (over-engineered, rejected)

Same as Position 4, plus a git pre-commit hook that auto-fails commits containing hard-coded surface paths in `core/`.

**Pros:** Catches violations before they reach the registry.

**Cons:** **Pre-commit hooks are out-of-scope for the loop's design.** The loop's enforcement is via gates (PreToolUse hooks for write operations) and tools, not git hooks. Auto-failing commits would be a new mechanism that doesn't fit the existing architecture. The regression test in `__tests__/` is the canonical catch — it runs on every test run, not just on commit.

### Position 6: Rule + sidecar .runtime-agnostic-decls.json (rejected)

A new sidecar file where each feature declares its runtime-agnostic compliance. The rule checks the sidecar at audit time.

**Pros:** Declarative; explicit per-feature compliance.

**Cons:** **New sidecar = new artifact type.** The user's prior `rule-no-new-artifact-types` rule is `enforcement: "gate"`, which would block this. Cross-references go in meta-state; the existing 4-kind union is the right surface for declarations. The rule + the test + the helper achieves the same outcome without a new artifact type.

## Final Recommended Solution

### The 6-item checklist (the rule's content)

The checklist is the rule's `pattern` field (JSON-serialized). Each item maps to an existing pattern in the code:

```json
{
  "version": 1,
  "items": [
    {
      "id": "core-in-universal-location",
      "description": "Core logic lives in tools/learning-loop-mcp/{core,hooks,tools}/ (not under .claude/ or .factory/)",
      "verify": "globMatch('tools/learning-loop-mcp/**', filePath) for the feature's primary file"
    },
    {
      "id": "shims-in-sync",
      "description": "If hooks are needed, both .claude/coordination/hooks/ and .factory/coordination/hooks/ have a shim that delegates to the universal hook",
      "verify": "existsSync('.claude/coordination/hooks/<name>') AND existsSync('.factory/coordination/hooks/<name>')"
    },
    {
      "id": "protocol-adapter-i-o",
      "description": "Hook stdin/stdout goes through protocol-adapter.js (parseInput, formatOutput, normalizeToolName)",
      "verify": "import { parseInput, formatOutput, normalizeToolName } from 'protocol-adapter'"
    },
    {
      "id": "manifest-registered",
      "description": "New MCP tools are registered in tools/learning-loop-mcp/agent-manifest.json (with group and description)",
      "verify": "manifest.groups[groupName].tools.includes(toolName)"
    },
    {
      "id": "cross-surface-iteration",
      "description": "Code that needs to touch surface-specific paths uses the surfaces.js helper (SURFACES constant + getAllCoordinationPaths / writeToAllSurfaces / readFromAllSurfaces), not hard-coded .claude/ or .factory/ paths",
      "verify": "regex scan: no hard-coded 'join(root, \".claude\"' or 'join(root, \".factory\"' in core/; all such paths go through surfaces.js"
    },
    {
      "id": "parameterized-for-new-surfaces",
      "description": "The SURFACES constant is the single source of truth for the set of supported runtimes; adding a new runtime is a 1-line append, not a refactor",
      "verify": "import { SURFACES } from 'surfaces.js'; SURFACES is the only place runtime names are listed"
    }
  ]
}
```

### Implementation: 6 artifacts + 2 refactors

#### Artifact 1: AGENTS.md §2 subsection amendment

Add a new subsection "Runtime-Agnostic Pattern" to AGENTS.md §2 (the Hook Matrix). The subsection:

- States the design principle: "Every feature must work identically on Claude Code and Droid CLI (and future runtimes). The shim-not-fork pattern is the canonical way to achieve this."
- Lists the 6-item checklist (or summarizes it with a pointer to the rule entry).
- Cites the existing pattern: bash-gate.js, protocol-adapter.js, the two shim directories.
- Notes the meta-state rule entry (`rule-runtime-agnostic-features`) as the machine-readable codification.
- Notes the new MCP tool (`check_runtime_agnostic`) as the audit surface.

This is the human-readable design spec. It tells the agent what runtime-agnostic MEANS, with examples. The rule entry tells the agent what's EXPECTED; the tool audits compliance.

#### Artifact 2: meta-state rule entry

The rule is a new entry in `meta-state.jsonl`:

```json
{
  "id": "rule-runtime-agnostic-features",
  "entry_kind": "rule",
  "origin": "meta-260615T1400Z-runtime-agnostic-features-rule (or a new id, the entry that the change-log references)",
  "enforcement": "agent",
  "pattern_type": "consult-checklist",
  "pattern": "<the JSON-serialized 6-item checklist above>",
  "description": "Consult-gate rule: every feature must be runtime-agnostic. Codifies the shim-not-fork + cross-surface-iteration pattern. Use check_runtime_agnostic MCP tool to audit a feature; new runtimes add themselves to SURFACES in core/surfaces.js.",
  "status": "active",
  "promoted_at": "<now>",
  "promoted_by": "operator",
  "affected_system": "meta"
}
```

The rule is `enforcement: "agent"` because the rule is design-time, not command-time. `enforcement: "gate"` would mean the gate hard-blocks commands matching some pattern; there's no command pattern for a design-time rule. Agent enforcement means: the rule is surfaced in `loop_describe`, the agent is expected to consult it, the tool audits compliance, the test catches violations at test time.

The new pattern type `consult-checklist` is added to `core/gate-logic.js#applyPromotedRules` as a no-op (the rule doesn't match commands or paths). The type is recognized by the gate logic so the rule loads correctly; the behavior is in the tool and the test.

#### Artifact 3: new pattern type `consult-checklist`

In `core/gate-logic.js#applyPromotedRules`, add a branch for `pattern_type === "consult-checklist"`:

```js
} else if (pattern_type === "consult-checklist") {
  // Design-time rule; no command/path matching. The check is in
  // the new check_runtime_agnostic MCP tool and the regression test.
  // We log a one-time warning per session so the operator knows the
  // rule loaded but didn't apply to this command.
  if (process.env.LL_DEBUG_RUNTIME_AGNOSTIC === "1") {
    console.warn(`Rule ${rule_id}: consult-checklist pattern; not enforced on commands. Use check_runtime_agnostic to audit.`);
  }
  continue;
}
```

This is a no-op for the bash gate but makes the rule shape valid. The actual audit logic lives in the tool.

#### Artifact 4: new MCP tool `check_runtime_agnostic`

New file: `tools/learning-loop-mcp/tools/check-runtime-agnostic-tool.js`. Schema:

- **Input**: `{ feature_path: string }` (a file or directory to audit).
- **Output**: `{ feature_path, items_checked, items_passed, items_failed, failures: [{ item_id, description, expected, found, fix_suggestion }] }`.
- **Behavior**: 
  1. Load the rule from `meta-state.jsonl` (via `loadPromotedRules(root)` or direct registry read).
  2. For each checklist item, run the `verify` predicate against the feature path.
  3. Return structured feedback.

The tool is the enforcement surface. The agent is expected to call it when adding a new feature. The tool can also be called by a CI / pre-merge check.

#### Artifact 5: `core/surfaces.js` — the cross-surface helper

New file: `tools/learning-loop-mcp/core/surfaces.js`. Content:

```js
/**
 * The canonical set of supported runtimes.
 * Adding a new runtime: append the surface prefix here. No other code changes needed.
 */
export const SURFACES = [".claude", ".factory"];

/**
 * Get all coordination subdirectory paths for a given subpath.
 * Example: getAllCoordinationPaths(".last-operator-message")
 *   => [".claude/coordination/.last-operator-message", ".factory/coordination/.last-operator-message"]
 */
export function getAllCoordinationPaths(subpath) {
  return SURFACES.map((surface) => `${surface}/coordination/${subpath}`);
}

/**
 * Write content to all surface coordination directories.
 * Uses write-temp-then-rename for atomicity.
 */
export function writeToAllSurfaces(root, subpath, content) {
  // ... implementation
}

/**
 * Read from all surface coordination directories, returning the first non-null value.
 * Mirrors the existing readLastOperatorMessage pattern in core/inbound-state.js.
 */
export function readFromAllSurfaces(root, subpath, options = {}) {
  // ... implementation
}
```

The helper is the API for code that needs to touch all surfaces. Adding a new runtime (e.g., Cursor) is a 1-line append to `SURFACES`. No other code changes needed.

#### Artifact 6: `__tests__/runtime-agnostic.test.js` — regression guard

New test file. Tests:

- `surfaces.js exports SURFACES` and the constant is the single source of truth (asserted by checking that `core/` and `hooks/` import from it).
- `grep "join(root, \\"\\.claude\\"" tools/learning-loop-mcp/core/` returns 0 matches in production code (only in the helper itself, which is allowed).
- `grep "join(root, \\"\\.factory\\"" tools/learning-loop-mcp/core/` returns 0 matches in production code.
- The two shim directories have the same set of hook names (`bash-coordination-gate.cjs`, `write-coordination-gate.cjs`, `inbound-state-gate.cjs`).
- The `agent-manifest.json` has a group structure that doesn't reference surface-specific tool names.
- For each hook in `tools/learning-loop-mcp/hooks/`, both shim files exist and have equivalent content (delegation pattern).

This test is the automated catch. It runs on every test run; violations surface as test failures.

#### Refactor 1: `core/gate-logic.js#GLOB_SCOPE_WHITELIST`

Current:
```js
const GLOB_SCOPE_WHITELIST = ["product/", "docs/", "plans/", "tools/", ".factory/", "meta-state.jsonl"];
```

Refactored:
```js
import { SURFACES } from "./surfaces.js";
const GLOB_SCOPE_WHITELIST = [
  "product/", "docs/", "plans/", "tools/", "meta-state.jsonl",
  ...SURFACES.map((s) => `${s}/`),
];
```

This fixes the missing `.claude/` asymmetry.

#### Refactor 2: `core/inbound-state.js#readLastOperatorMessage`

Current: hard-codes both `.claude/coordination/` and `.factory/coordination/` paths inline.

Refactored: uses `surfaces.js#readFromAllSurfaces`. The function becomes a thin wrapper around the helper. (The existing TTL check, error handling, and env-var override stay in this function; only the path iteration is delegated.)

This DRYs the cross-surface iteration. Adding a third surface is automatic.

### Phased ship plan (6 phases, small each)

The implementation ships in 6 phases, each independently testable:

- **Phase 0**: `core/surfaces.js` (the helper). 30 lines. No callers yet.
- **Phase 1**: Refactor `core/gate-logic.js#GLOB_SCOPE_WHITELIST` and `core/inbound-state.js` to use the helper. 2 files. Existing tests must still pass.
- **Phase 2**: `__tests__/runtime-agnostic.test.js` (the regression test). 100 lines. Asserts the existing pattern. 0 new code in production.
- **Phase 3**: New pattern type `consult-checklist` in `core/gate-logic.js#applyPromotedRules`. 5 lines. Rule loads correctly.
- **Phase 4**: New MCP tool `check_runtime_agnostic`. 200 lines. Calls the regression test logic + the rule's checklist.
- **Phase 5**: Meta-state rule entry + AGENTS.md amendment + `loop_describe` discoverability hint. 3 changes. Rule is live and discoverable.

The phases are independent; each can ship separately. The natural order is 0→1→2→3→4→5 (helper first, refactors second, test third, tool fourth, rule entry last).

## Implementation Considerations and Risks

### Risks

| Risk | Mitigation |
|---|---|
| `core/surfaces.js` is a new module; existing code might not import it correctly | Phase 0 ships the helper; Phase 1 is the only call site refactor. Existing tests must pass. |
| The `consult-checklist` pattern type is new; could regress the rule-loading code | The new branch is a no-op (`continue`); the rule loads the same as before. The pattern type is recognized; the behavior is in the tool. |
| `check_runtime_agnostic` tool might return false positives if the `verify` predicates are too strict | The tool's output includes `fix_suggestion` for each failure; the agent can see why. The predicates are conservative (only assert existing patterns, not invent new ones). |
| AGENTS.md amendment creates 2 truths (markdown vs rule) | The markdown subsection explicitly cites the rule entry as the machine-readable form. The rule entry's `description` cites the markdown as the human-readable form. They're a 1:1 pair, not a duplication. |
| The 6-item checklist is too rigid; future features may need exceptions | The rule is `enforcement: "agent"`; exceptions are consult-gate, not gate-block. The agent can override per-feature with `operator_note`. The tool's output includes `fix_suggestion` for exceptions ("if this is intentional, ignore this item"). |
| Phase 0-5 sequence is too many small ships | Each phase is a single PR. The user can ship them as a single multi-phase plan (`/ck:plan` with phases 0-5) or as 6 individual plans. The user-stated preference in the prior brainstorm is "bundled plan for both gaps"; this is the same shape. |
| `core/gate-logic.js#GLOB_SCOPE_WHITELIST` refactor could regress the `rule-project-skill-boundary` rule | The refactor only changes the WHITELIST; the rule's pattern (`.factory/skills/{use-mcp,find-skills}/**`) is unchanged. The whitelist includes `.factory/` after the refactor; the rule still matches. |

### Non-risks (the design avoids common failure modes)

- **No new artifact type.** The rule is a `rule` entry; the helper is a `core/` module; the tool is an MCP tool. All existing kinds.
- **No new top-level file.** `core/surfaces.js` is in `core/`, not at the project root.
- **No new gate enforcement.** The rule is `agent`, not `gate`. The existing gates are unchanged.
- **No new mechanism.** The 6 artifacts are existing kinds (rule entry, MCP tool, core module, test file, AGENTS.md amendment, pattern type). Each is small.

### What the operator should expect after the design ships

- A new agent reading `loop_describe({tier: "warm"})` sees the runtime-agnostic rule surfaced in `discoverability_hints`.
- A new agent adding a feature is expected to call `check_runtime_agnostic({ feature_path })` and address any failures.
- A new `core/` file that hard-codes a surface path fails the regression test in CI.
- Adding a new runtime (e.g., Cursor) is `SURFACES.push(".cursor")` — 1 line, no other code changes.
- The `GLOB_SCOPE_WHITELIST` asymmetry is fixed (`.claude/` is now allowed alongside `.factory/`).
- The `readLastOperatorMessage` function is DRY (no more inline cross-surface iteration).

### What stays human forever (per AGENTS.md §10)

- The checklist content (the 6 items). A future operator may add a 7th item; the loop can record the refinement via `meta_state_patch`.
- The `SURFACES` list. A future operator may add a new runtime; the loop doesn't auto-detect runtimes.
- The `check_runtime_agnostic` tool's `verify` predicates. A future operator may refine the predicates as the pattern evolves.
- The AGENTS.md prose. The human-readable spec evolves with the loop's design philosophy.

## Success Metrics and Validation Criteria

### Design success metrics

- **Discoverability**: `loop_describe({tier: "warm"})` includes the runtime-agnostic rule in `discoverability_hints`. Verified by an extension to `loop-describe-warm-tier.test.js`.
- **Auditability**: `check_runtime_agnostic({ feature_path: "tools/learning-loop-mcp/core/surfaces.js" })` returns `{ items_passed: 6, items_failed: 0 }`. Verified by an end-to-end test.
- **Testability**: `__tests__/runtime-agnostic.test.js` passes; the test fails if a new file in `core/` hard-codes a surface path. Verified by a mutation test (intentionally add a hard-coded path; the test fails; remove it; the test passes).
- **Evolve-ability**: Adding `.cursor` to `SURFACES` in `core/surfaces.js` results in 0 test failures (the helper is parameterized). Verified by a temporary append + test run + revert.
- **Backward compatibility**: All 840+ existing tests pass after the 2 refactors (GLOB_SCOPE_WHITELIST, readLastOperatorMessage). Verified by the standard `pnpm test` run.

### Acceptance criteria

- AGENTS.md §2 has a "Runtime-Agnostic Pattern" subsection that lists the 6 items.
- `meta-state.jsonl` has a `rule-runtime-agnostic-features` entry with `enforcement: "agent"`, `pattern_type: "consult-checklist"`, `status: "active"`.
- `core/gate-logic.js#applyPromotedRules` handles the new pattern type as a no-op (with a debug-only warning).
- `tools/learning-loop-mcp/tools/check-runtime-agnostic-tool.js` exists, is registered in `agent-manifest.json`, returns structured feedback.
- `tools/learning-loop-mcp/core/surfaces.js` exists; `SURFACES` is the single source of truth; helpers are tested.
- `tools/learning-loop-mcp/__tests__/runtime-agnostic.test.js` passes.
- `core/gate-logic.js#GLOB_SCOPE_WHITELIST` uses `surfaces.js#SURFACES`.
- `core/inbound-state.js#readLastOperatorMessage` uses `surfaces.js#readFromAllSurfaces`.
- 840+ tests pass; 0 regressions; new tests for all 6 artifacts.

## Next Steps and Dependencies

### Order of operations

1. **This report** (now): design locked in.
2. **`/ck:plan` for the 6-phase ship** (when the operator is ready). Each phase is a small PR; the bundled plan captures the full surface.

### Dependencies

- **Phase 0** (helper): no dependencies. Standalone.
- **Phase 1** (refactors): depends on Phase 0.
- **Phase 2** (regression test): depends on Phase 0 (the helper must exist for the test to assert against it).
- **Phase 3** (pattern type): no dependencies. Standalone.
- **Phase 4** (MCP tool): depends on Phase 0 (the helper is used by the tool's predicates) and Phase 3 (the pattern type is recognized for the rule to load).
- **Phase 5** (rule entry + AGENTS.md + loop_describe hint): depends on Phase 3 (the pattern type is recognized) and Phase 4 (the tool exists, so the rule's `description` can reference it).

### Recommended sequencing

Ship **Phases 0-2 first** as the "foundation + safety net" release. This gives:
- The helper (Phase 0) — code can start using it.
- The refactors (Phase 1) — existing code uses the helper; the GLOB_SCOPE_WHITELIST asymmetry is fixed.
- The regression test (Phase 2) — the loop is now watching for new violations.

Then ship **Phases 3-5** as the "rule is live" release. This gives:
- The new pattern type (Phase 3) — the rule shape is recognized.
- The MCP tool (Phase 4) — the audit surface.
- The rule entry + AGENTS.md + loop_describe hint (Phase 5) — the rule is discoverable.

### What does NOT change

- The 5 existing promoted rules in `meta-state.jsonl` — no change.
- The 4-kind discriminated union — no new kind added.
- The bash gate entry point — no change (the new pattern type is a no-op for command-time enforcement).
- The protocol-adapter.js — no change (it's already the universal surface; the rule just codifies its use).
- The two shim directories — no change to existing shims; new features are expected to add shims following the same pattern.
- The test count baseline (840+) — Phase 0-2 adds 1 new test file with ~10 tests; Phases 3-5 add ~5 more.

### What the operator should expect after both phases ship

- A new agent reading the SessionStart hook's discoverability hints sees the runtime-agnostic rule and the 6-item checklist.
- A new feature added with hard-coded `.claude/` or `.factory/` paths in `core/` fails the regression test in CI.
- Adding a new runtime (e.g., Cursor) is `SURFACES.push(".cursor")` — 1 line, no other code changes.
- The existing GLOB_SCOPE_WHITELIST asymmetry is fixed (both surfaces are whitelisted).
- The existing readLastOperatorMessage function is DRY (uses the helper).
- The rule is auditable via `check_runtime_agnostic` MCP tool.
- The rule is evolvable via `meta_state_patch` (add a 7th item, refine the 6 existing ones, etc.).

### What stays human forever (per AGENTS.md §10)

- The 6-item checklist content.
- The `SURFACES` list.
- The `check_runtime_agnostic` tool's verify predicates.
- The AGENTS.md prose.

The loop can observe (the test catches violations), suggest (the tool returns `fix_suggestion`), and remember (the rule is in the registry with provenance), but the human decides what runtime-agnostic MEANS.

---

**Status:** draft. Ready for `/ck:plan` (6-phase ship) when the operator calls. Per operator decision 2026-06-15 (prior brainstorm), no plan is launched automatically from this report.
