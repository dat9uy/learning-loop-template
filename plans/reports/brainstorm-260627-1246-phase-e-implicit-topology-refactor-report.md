# Brainstorm: Implicit Topology Refactor — Placement Tree + Entry Domain Model

**Status:** CONVERGED. Replaces/supersedes `brainstorm-260627-0000-phase-e-write-gate-layer-placement.md`. Step-by-step execution: Mechanism A (placement) first, Mechanism B (entry domain model) second, gated on A.

**Triggered by:** operator pushback on the prior convergence addendum — "the solution is kind of ad-hoc … there is no way to make sure that in the future, the agent could make the correct choice … the current way of managing core/ is kind of add more and more function file without any coherence." Then a predict-verdict pass on inversion direction.

**Date:** 2026-06-27 12:46 (post-midnight session + continuation)
**Slug:** phase-e-implicit-topology-refactor
**Techniques applied:** Meta-Pattern Recognition + Simplification Cascades (continuation of prior session). `/ck:predict` 5-persona debate for the soft-vs-hard inversion question.

---

## 1. The unifier — implicit vs explicit topology

The prior convergence addendum converged on Option 2 (3 new `evaluate-*.js` core files; 3 refactored hook adapters). That move was correct *for the rules it moved*. What it did NOT install was the *mechanism* that produced those decisions.

Two operator concerns reduced to the same root cause:

1. **Placement concern:** When a future agent adds logic, the decision *which layer, which file, which pattern* (hardcoded vs promoted, regex vs glob, consult-checklist vs gate) lives in operator history (the prior addendum, prior plans), not in any machine-consultable artifact.
2. **Coherence concern:** `meta-state.js` defines 4 entry kinds as Zod schemas. Functions like `writeEntry(root, entry)`, `updateEntry(root, id, patch)`, `applyPromotedRules(command, filePath, rules, root)`, `checkResolutionEvidence(rule, root)` take field names and root paths, not Entry objects. The schemas validate; they don't own lifecycle or composition.

**Same problem, two scales.** The system topology is held in developers' heads, not in code. This report fixes both.

---

## 2. Two mechanisms — A first, then B

### Mechanism A — Placement Decision Tree (ships first)

**Output 1:** `tools/learning-loop-mastra/docs/placement.md` (minimal doc, mirrors `schemas.md` style, ≤80 lines)

**Output 2:** `tools/learning-loop-mastra/core/placement.yaml` (manifest listing every core file with `layer` + `role`)

**Output 3:** Test extension in `__tests__/phase-e-foundation/fcis-invariant.test.js` (or a sibling `placement-manifest.test.js`) — model after `schema-doc-exists.test.js`. Asserts: every core file appears in manifest, every manifest entry exists as a file, role-specific layering invariants hold (e.g., `evaluator` may only import `primitive` files; `primitive` may not import other core files).

### Mechanism B — Entry Domain Model with Relationships (ships second, gated on A)

**Output 1:** `tools/learning-loop-mastra/core/entry/` directory with 4 factory files + index:
- `entry/finding.js` — `createFinding(data)` returns frozen Finding
- `entry/rule.js` — `createRule(data)` returns frozen Rule
- `entry/change-log.js` — `createChangeLog(data)` returns frozen ChangeLog
- `entry/loop-design.js` — `createLoopDesign(data)` returns frozen LoopDesign
- `entry/index.js` — re-exports + cross-cutting helpers

**Output 2:** Relationship methods per operator scope expansion — *"core should be related to modelling relationship as well. So let's expand the scope (rules is not just validation or status check, but the relationship between entry)"*. Every Entry kind exposes `outboundRefs()` and `inboundRefs(root)`. Cross-cutting helpers in `entry/index.js`: `validateCrossRefs(root)`, `findOrphans(root)`, `outboundRefsAll(root)`.

**Output 3:** Reimplement `meta_state_relationships` MCP tool on top of the new methods (1-hop traversal via `entry.outboundRefs()`).

**Output 4:** Tests for each factory + cross-cutting helpers. Existing 1189 tests must pass without modification.

---

## 3. Mechanism A — concrete design

### 3.1 The placement decision tree (`docs/placement.md`)

The decision tree an agent walks to decide "where does my new code go?":

```
1. Does it mutate meta-state.jsonl or runtime-state.jsonl?
   → Yes: core/meta-state.js (registry) or core/{gate-decision-log,runtime-state}.js
   → No: continue.

2. Does it parse/transform/match data with NO I/O and NO @mastra/* imports?
   → Yes: core/ as a single-file concern (matches existing primitive/evaluator pattern)
   → No: continue.

3. Does it wrap a Mastra primitive (tool, workflow, agent, harness)?
   → Yes: mastra/create-loop-*.js (factory) or mastra/{workflows,agents,tools}/ (entity)
   → No: continue.

4. Does it translate between a runtime's hook protocol and our internal API?
   → Yes: hooks/legacy/<gate>.js (universal) + .claude|.factory/coordination/hooks/*.cjs (shim)
   → No: continue.

5. Is it an MCP tool that exposes a core function?
   → Yes: tools/legacy/<tool>.js (legacy substrate, NOT in mastra/)
   → No: escalate to operator — outside documented layers.
```

This is the rule that produced the prior addendum's file list. Encoding it makes the rule survive the session.

### 3.2 Role taxonomy (`placement.yaml`)

The manifest uses a closed taxonomy of roles. New roles require an ADR. The taxonomy:

| Role | I/O? | Imports | Examples |
|---|---|---|---|
| `primitive` | No | Only stdlib + sibling primitives | `slugify.js`, `strict-boolean-guard.js`, `surfaces.js`, `envelope-stripper.js`, `file-readers.js` |
| `evaluator` | No | `primitive` only | `evaluate-write-gate.js`, `evaluate-bash-gate.js`, `evaluate-inbound-gate.js` (Option 2); future thin composers |
| `facade` | Yes | All | `meta-state.js`, `gate-decision-log.js`, `gate-override.js`, `loop-introspect.js`, `inbound-state.js` |
| `verification` | Yes (on-demand) | `primitive` + `facade` | `check-grounding.js`, `consistency-check.js`, `query-drift.js`, `derive-status.js`, `runtime-agnostic-checklist.js`, `verification-runner.js` |
| `validator` | No | `primitive` only | `record-validation-rules.js` |
| `cache` | Yes | Wraps one sibling | `read-registry-cache.js`, `loop-introspect-cache.js` |
| `helper` | mixed | mixed | `recurrence-tracker.js`, `list-probes.js`, `workflow-registry.js` |

**The key separation the user asked for:** `evaluator` is distinct from `primitive`. Evaluators compose primitives + read registry; primitives are pure utilities. The layering test enforces this: an `evaluator` file's import list may only contain `primitive` files + Zod + stdlib.

### 3.3 Manifest format (`core/placement.yaml`)

```yaml
# core/placement.yaml — single source of truth for where code lives.
# Tested by __tests__/phase-e-foundation/fcis-invariant.test.js (placement-manifest section).
# New files MUST be added here; tests fail until they are.

files:
  - path: gate-logic.js
    role: primitive
    summary: Pure gate decision library — globMatch, splitSegments, applyPromotedRules.
  - path: meta-state.js
    role: facade
    summary: Registry CRUD + Zod schemas for the 4-kind meta-state union.
  - path: evaluate-write-gate.js
    role: evaluator
    summary: Write-gate evaluator (Option 2). Imports gate-logic primitives only.
  # ... every core file listed once ...
```

YAML because `validator-coverage.yaml` and `field-drift-exceptions.yaml` already use YAML for core config — matches local convention.

### 3.4 Test extension sketch

```js
// Appended to fcis-invariant.test.js (or new placement-manifest.test.js)

test("core/placement.yaml enumerates every core file", () => {
  const manifest = YAML.parse(readFileSync("core/placement.yaml"));
  const actualFiles = walkJsFiles(CORE_DIR).map(f => relative(CORE_DIR, f));
  const manifestPaths = manifest.files.map(f => f.path);

  // Every actual file appears in manifest
  for (const f of actualFiles) {
    assert.ok(manifestPaths.includes(f), `${f} missing from manifest`);
  }
  // Every manifest entry exists as a file
  for (const p of manifestPaths) {
    assert.ok(existsSync(join(CORE_DIR, p)), `manifest entry ${p} does not exist`);
  }
});

test("evaluator files only import primitive + stdlib + zod", () => {
  const manifest = YAML.parse(readFileSync("core/placement.yaml"));
  const evaluators = manifest.files.filter(f => f.role === "evaluator");
  for (const e of evaluators) {
    const file = join(CORE_DIR, e.path);
    const content = readFileSync(file, "utf8");
    // Check imports: must reference only primitive files or stdlib/zod
    // (concrete check: assert no imports of facade or other evaluator files)
  }
});
```

### 3.5 What Mechanism A does NOT do

- Does not move files. The convergence addendum's 3 `evaluate-*.js` files ship separately (their own plan, per operator decision 2026-06-27 "plan later").
- Does not change core/ structure beyond adding `placement.yaml` and `entry/` (Mechanism B).
- Does not yet model relationships. That's Mechanism B.

---

## 4. Mechanism B — Entry Domain Model with Relationships

### 4.1 The factory pattern (per predict verdict — soft inversion)

**Verdict from `/ck:predict`:** Schemas stay canonical; factories wrap them; factory exposes `.schema` accessor that returns the *same* Zod object (reference equality, not copy). 9 `.shape` consumers stay untouched.

```js
// entry/rule.js
import { metaStateRuleEntrySchema } from "../meta-state.js";
import { readRegistry } from "../meta-state.js";

export function createRule(data) {
  const parsed = metaStateRuleEntrySchema.parse(data);
  return Object.freeze({
    kind: "rule",
    data: parsed,

    // Validation/source-of-truth: same Zod object (not a copy)
    schema: metaStateRuleEntrySchema,

    // Status
    isActive()           { return parsed.status === "active"; },
    isConsultChecklist() { return parsed.pattern_type === "consult-checklist"; },

    // Validation (was: applyPromotedRules's per-rule branch)
    matches(command, filePath) {
      if (parsed.enforcement !== "gate") return false;
      if (parsed.pattern_type === "regex" && command) {
        // ... regex match against splitSegments+stripped command
      }
      if (parsed.pattern_type === "glob" && filePath) {
        // ... globMatch
      }
      return false;
    },

    // Scope predicate (was: projectHasLearningLoopMcp branch in loadPromotedRules)
    appliesTo(root) {
      if (!parsed.scope_predicate || parsed.scope_predicate === "none") return true;
      if (parsed.scope_predicate === "project_has_learning_loop_mcp") {
        return projectHasLearningLoopMcp(root);
      }
      return true;
    },

    // Resolution evidence (was: checkResolutionEvidence)
    async checkResolutionEvidence(root) { /* ... */ },

    // Lineage (was: raw `supersedes` field access)
    supersedes(other) { return parsed.supersedes === other.data.id; },

    // Relationships — OUTBOUND
    outboundRefs() {
      const refs = [];
      if (parsed.origin) refs.push({ kind: "finding", id: parsed.origin, field: "origin" });
      if (parsed.supersedes) refs.push({ kind: "rule", id: parsed.supersedes, field: "supersedes" });
      if (parsed.applies_to_resolution) refs.push({ kind: "finding", id: parsed.applies_to_resolution, field: "applies_to_resolution" });
      return refs;
    },

    // Relationships — INBOUND (resolves reverse refs from registry)
    inboundRefs(root) {
      const registry = readRegistry(root);
      const inbound = [];
      for (const entry of registry) {
        if (entry.entry_kind === "finding" && entry.promoted_to_rule === parsed.id) {
          inbound.push({ kind: "finding", id: entry.id, field: "promoted_to_rule" });
        }
        if (entry.entry_kind === "rule" && entry.supersedes === parsed.id) {
          inbound.push({ kind: "rule", id: entry.id, field: "supersedes" });
        }
        if (entry.entry_kind === "finding" && entry.applies_to_resolution === parsed.id) {
          inbound.push({ kind: "finding", id: entry.id, field: "applies_to_resolution" });
        }
      }
      return inbound;
    },
  });
}
```

The same shape applies to `createFinding`, `createChangeLog`, `createLoopDesign`. Each one exposes:
- `isActive()`, `isStale()`, `isBlocking()`, etc. (status helpers)
- `outboundRefs()` (1-hop forward — what does this entry point to?)
- `inboundRefs(root)` (1-hop backward — what points to this entry?)
- Lifecycle methods (`resolve`, `supersedeBy`, `promote`, `ship`) that return NEW frozen entries — never mutate.

### 4.2 Relationship cross-cutting helpers (`entry/index.js`)

```js
// entry/index.js
export function validateCrossRefs(root) {
  const registry = readRegistry(root);
  const orphans = [];
  for (const entry of registry) {
    const factory = factoryFor(entry); // dispatches by entry_kind
    for (const ref of factory.outboundRefs()) {
      const target = registry.find(e => e.id === ref.id && e.entry_kind === ref.kind);
      if (!target) orphans.push({ from: entry.id, to: ref.id, field: ref.field });
    }
  }
  return { orphans };
}

export function findOrphans(root) {
  return validateCrossRefs(root).orphans;
}

export function outboundRefsAll(root) {
  // Used by meta_state_relationships MCP tool — replaces its current impl.
  const registry = readRegistry(root);
  const graph = new Map();
  for (const entry of registry) {
    const factory = factoryFor(entry);
    graph.set(entry.id, factory.outboundRefs());
  }
  return graph;
}
```

### 4.3 The 4 entry kinds — relationship summary

| Kind | Outbound refs | Inbound refs |
|---|---|---|
| **Finding** | `consolidated_into` (ChangeLog), `reopens` (Finding[]), `promoted_to_rule` (Rule, legacy) | `reopens` reverse (Finding[]), `promoted_to_rule` reverse (Finding→Rule), `origin` (Rule→Finding), `applies_to_resolution` (Rule→Finding) |
| **ChangeLog** | `supersedes` (ChangeLog), `consolidates` (Finding[]) | `consolidated_into` reverse (Finding→ChangeLog) |
| **Rule** | `origin` (Finding), `supersedes` (Rule), `applies_to_resolution` (Finding) | `promoted_to_rule` reverse (Finding→Rule) |
| **LoopDesign** | `proposed_design_for` (Rule[]/Schema[]/Tool[]), `addresses` (Finding[]) | (none — leaf in the graph) |

`factoryFor(entry)` dispatches by `entry_kind` to the correct factory.

### 4.4 Reimplement `meta_state_relationships` on top of factories

The current MCP tool does 1-hop traversal by reading the registry directly. After Mechanism B, it dispatches via `factoryFor(entry)` and calls `entry.outboundRefs()` / `entry.inboundRefs(root)`. Same wire behavior, cleaner source.

### 4.5 Soft-inversion rationale (from predict verdict)

The `/ck:predict` 5-persona debate concluded GO on soft inversion with 4 specific safeguards:

1. `createRule.schema === metaStateRuleEntrySchema` (reference equality, not copy) — enforced by a one-line test.
2. `core/README.md` documents: "Schema = validation source. Factory = ergonomic surface. Schema reachable via `createEntry.schema`."
3. ADR-style comment in `core/README.md`: "Soft inversion by operator decision 2026-06-27. Revisit if (a) `.shape` consumers drop below 3, OR (b) factory methods start needing cross-cutting logic that schemas can't express."
4. No code changes beyond this verdict yet — Mechanism A ships first per step-by-step.

---

## 5. Step-by-step execution plan

Per operator: *"do it step-by-step, since the mechanism A will be the guide for B."*

### Phase 1 — Mechanism A (placement tree + manifest + test)

**Files:**
- NEW: `tools/learning-loop-mastra/docs/placement.md` (≤80 lines, mirrors `schemas.md`)
- NEW: `tools/learning-loop-mastra/core/placement.yaml` (manifest, ~80 entries for existing core files)
- MODIFIED: `tools/learning-loop-mastra/__tests__/phase-e-foundation/fcis-invariant.test.js` (add 2-3 tests for manifest)

**Acceptance:**
- Every existing core file has a manifest entry.
- Every manifest entry has a matching file.
- Role layering invariants hold (evaluator imports only primitives; etc.).
- All 1189 existing tests pass.
- Manifest survives a "add a new core file" test: temporarily add a file, run test, see it fail with a clear message pointing to placement.yaml.

**Effort:** 0.5-1 day, single PR.

### Phase 2 — Mechanism B (entry domain model with relationships)

**Files:**
- NEW: `tools/learning-loop-mastra/core/entry/{finding,rule,change-log,loop-design,index}.js`
- MODIFIED: `tools/learning-loop-mastra/core/README.md` (soft-inversion contract + ADR comment)
- MODIFIED: `tools/learning-loop-mastra/tools/legacy/relationships-tool.js` (reimplement on top of factories)
- NEW: `tools/learning-loop-mastra/core/entry/__tests__/{finding,rule,change-log,loop-design,index}.test.js`

**Acceptance:**
- All 4 factories parse input via canonical Zod schemas (reference equality, no copies).
- `outboundRefs()` and `inboundRefs(root)` return correct refs for fixture data.
- `validateCrossRefs(root)` returns empty orphans for the current registry (snapshot test).
- `meta_state_relationships` MCP tool returns identical output to before (snapshot test).
- All 1189 existing tests pass + ~30 new tests.

**Effort:** 1-2 days, single PR.

### Phase 2.5 — Dead-code sweep via fallow (gating step before Phase 3)

**Motivation.** Mechanism A prevents *new* accumulation in `core/` (every file must have a manifest entry or the FCIS test fails). It does not address *existing* unreferenced modules left over from prior migrations — e.g., `core/list-probes.js` is imported only by `__tests__/legacy-mcp/list-probes.test.js`, with no production consumer. Phase 3 (evaluator refactor) adds 3 more core files; doing the sweep first means the manifest starts from a clean baseline and the placement rules have nothing to compete with.

This phase also answers the operator concern that prompted this brainstorm: *"the current way of managing core/ is kind of add more and more function file without any coherence."* The placement tree + manifest address new code; this phase retires the legacy residue.

**Sub-step 1 — Configure fallow.**

`fallow dead-code` is the right tool but ships with two warnings that hide real findings:
- `node_modules not found` → run `pnpm install` at the mastra root first.
- `No entry points detected — exports may appear unused` → without explicit entry points, every file looks orphan.

Files:
- NEW: `tools/learning-loop-mastra/.fallowrc.json` with entry points `tools/manifest.json` (parsed as JSON — every MCP tool entry is a live entry point) plus `mastra/server.js` (the loader).
- Ignore patterns: `scout/legacy/**`, `__tests__/legacy-mcp/**`, `plans/**`, `scout/fixtures/**`. These are intentionally excluded so fallow correctly flags the modules they reference as unreachable, rather than seeing them as live.

**Sub-step 2 — Baseline scan + triage.**

Run:
```bash
fallow dead-code --unused-files
fallow dead-code --unused-exports
fallow dead-code --unused-deps
```

For each finding in `core/`, classify against the **admission rule**: *a module belongs in `core/` only if a non-test, non-fixture import site uses it.*
- **Tested but no prod consumer** (e.g., `list-probes.js`): delete module + matching test in `__tests__/legacy-mcp/`. The test goes too — keeping it would carry dead code forever.
- **Doc-referenced but no consumer** (e.g., the `helper` row in `docs/placement.md` that lists `list-probes.js`): delete module + fix the doc row.
- **Pure dead** (no imports, no tests, no docs): delete.
- **Historical reference** (operator decides to keep): move to `__tests__/_archive/legacy-cli-shims/` with a one-line header pointing to the originating migration plan.

**Sub-step 3 — Wire fallow into CI.**

Add `fallow audit` to the PR diff check (fallow's built-in command for diff-aware review of changed files). The admission rule becomes a CI invariant: any new file under `core/` flagged as unused by `fallow audit` fails the PR until either `core/placement.yaml` is updated and the file is imported by a non-test site, or the file is deleted.

**Files:**
- NEW: `tools/learning-loop-mastra/.fallowrc.json`
- NEW (only if any kept): `tools/learning-loop-mastra/__tests__/_archive/legacy-cli-shims/README.md` explaining the convention
- MODIFIED: `tools/learning-loop-mastra/docs/placement.md` (drop rows for deleted modules)
- MODIFIED: CI workflow (add `fallow audit` step)
- DELETED (per triage): modules in `core/` flagged as unused; their `__tests__/legacy-mcp/*.test.js` counterparts
- POSSIBLE: `core/placement.yaml` regenerated without deleted entries

**Acceptance:**
- `fallow dead-code --unused-files --unused-exports` reports 0 findings in `core/` (or every finding is archived in `__tests__/_archive/legacy-cli-shims/` with a clear header).
- All existing tests pass — the 1189 baseline plus any tests added in Phase 1/2.
- A new core file added in Phase 3 fails `fallow audit` unless `placement.yaml` is updated and the file is imported by a non-test site.
- `fallow dead-code --unused-deps` reports 0 findings on `package.json`.

**Effort:** 0.5 day, single PR.

**Why before Phase 3 and not after.** Two reasons. First, Phase 3 adds 3 evaluators to `core/`; adding them on top of dead residue dilutes the manifest's signal and makes the layering invariant test noisier. Second, the CI guard from sub-step 3 protects Phase 3 from itself — without it, the next "list-probes.js" will reappear within a sprint.

### Phase 3 — Evaluator refactor (the original Option 2)

**Files:**
- NEW: `core/evaluate-{write-gate,bash-gate,inbound-gate}.js`
- MODIFIED: `hooks/legacy/{write-gate,bash-gate,inbound-gate}.js` (thin adapters)

**Acceptance:** Per the prior convergence addendum — unchanged.

**Effort:** 1-2 days, single PR.

**Note:** Phase 3 was originally scheduled before Phase 2. The reordering means Phase 3's evaluators can be written *as* Mechanism B-compatible factories from day 1 (e.g., `evaluateWriteGate` returns an Entry-shaped decision object). But Phase 3 is still its own PR.

---

## 6. Relationship to the prior report

The prior `brainstorm-260627-0000-phase-e-write-gate-layer-placement.md` converged on Option 2 (3 evaluators + 3 thin hook adapters). Its file moves are **unchanged** by this refactor — they ship in Phase 3 above.

What this report ADDS to the prior:
- Mechanism A: the *mechanism* that produced the prior addendum's decisions, encoded as a placement tree + manifest + test.
- Mechanism B: the *domain model* that wraps the 4 entry kinds, exposes relationship methods, and lets the `meta_state_relationships` MCP tool operate on Entry-shaped values instead of raw registry rows.
- Predict verdict on soft inversion: the source-of-truth direction is locked, with a reversion clause.
- Operator scope expansion: "core should be related to modelling relationship as well" — Mechanism B's relationship methods are the response.

What this report REMOVES from the prior:
- The ad-hoc-ness of the original move. The decision tree + manifest make the rule surviving the session.
- The implicit topology. Each file has a role; new files must declare it.

The prior report is **superseded** by this one for planning purposes. Its Option 2 design is preserved as Phase 3.

---

## 7. Open questions for the operator

1. **Manifest format:** YAML chosen (matches existing `validator-coverage.yaml` convention). Acceptable?
2. **Phase 3 ordering:** Originally Phase 3 (evaluators) was supposed to ship first. Reordered to Phase 1 (placement) → Phase 2 (entries) → Phase 3 (evaluators) per operator's "step-by-step, A guides B." Confirm.
3. **Phase 2 blast radius:** Touching `meta-state.js`'s public surface (adding factory exports) is a larger API surface than Phase 1. Do we want a deprecation path for direct field access, or just add factories alongside?
4. **`meta_state_relationships` reimplementation:** Phase 2 reuses the same MCP tool name + wire shape. The internal code path changes. Snapshot tests will lock the wire shape. Confirm acceptable.
5. **Role taxonomy evolution:** The 7-role taxonomy in §3.2 is a starting point. New roles need an ADR per the closed-taxonomy rule. Confirm.
6. **Manifest path bug surfaced during dead-code analysis:** `tools/manifest.json` references paths like `tools/gate-tool.js`, but those files actually live at `tools/legacy/gate-tool.js`. Either the manifest is broken, or the loader resolves relative to a different root. Resolving this affects Phase 2.5's `.fallowrc.json` entry-point config (does the entry-point list come from the manifest as-is, or do we patch the paths first?). See Phase 2.5 sub-step 1.

---

## 8. References

- Prior report (superseded): `plans/reports/brainstorm-260627-0000-phase-e-write-gate-layer-placement.md`
- Phase E scope report (3-layer architecture): `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md`
- 5-req interface contract: `tools/learning-loop-mastra/interface/CONTRACT.md`
- Core gate logic: `tools/learning-loop-mastra/core/gate-logic.js`
- Core meta-state (current Zod schemas): `tools/learning-loop-mastra/core/meta-state.js`
- FCIS test (extension target): `tools/learning-loop-mastra/__tests__/phase-e-foundation/fcis-invariant.test.js`
- Doc-existence test (model): `tools/learning-loop-mastra/__tests__/phase-e-foundation/schema-doc-exists.test.js`
- Existing doc (template): `tools/learning-loop-mastra/docs/schemas.md`
- Fallow docs (entry points + ignore patterns): https://docs.fallow.tools/explanations/dead-code

---

## 9. Status note for prior report

The prior `brainstorm-260627-0000-phase-e-write-gate-layer-placement.md` is **superseded by this report** for planning purposes. Its Option 2 design (3 evaluators + 3 thin hook adapters) is preserved as Phase 3 of the execution plan in §5. Operator should mark it accordingly if reading later.
