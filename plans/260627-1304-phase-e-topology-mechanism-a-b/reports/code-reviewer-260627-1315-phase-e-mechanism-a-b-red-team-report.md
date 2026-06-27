# Phase E Mechanism A + B — Security Adversary Plan Review

**Reviewer posture:** Hostile red-team. Plan document under review, not code.
**Lens:** Security Adversary (auth bypass, injection, exposure, privilege escalation, OWASP top 10).
**Scope:** `plans/260627-1304-phase-e-topology-mechanism-a-b/{plan.md, phase-01..05}`

---

## Finding 1: Manifest `path` field is unsanitized string input — path-traversal injection vector via YAML authoring

- **Severity:** High
- **Location:** Phase 1 (§`Architecture` — `core/placement.yaml` schema), Phase 2 (§`Implementation Steps` step 2 — layering test)
- **Flaw:** The plan defines `placement.yaml` rows as `{path, role, summary}` where `path` is an unconstrained string. The Phase 2 layering test (sub-test 3) and the manifest-enumeration test resolve these strings via filesystem walks and regex-matched imports (`from './' + path`). The plan never specifies path normalization, prefix anchoring (`core/`), or rejection of absolute paths / `..` segments. The manifest is a YAML file edited by humans and agents; an attacker (or careless operator) who authors a row with `path: ../../etc/passwd` or `path: /root/.ssh/id_rsa` causes the manifest test to perform arbitrary filesystem reads during `existsSync` checks, and any downstream tool that uses the manifest as authoritative (the plan implies "machine-consultable" semantics — future evaluators in Phase 3 will look up roles by path) inherits the same injection.
- **Failure scenario:** A malicious or compromised agent commits a placement.yaml row such as `path: /home/<user>/.mcp.json` or `path: ../product/api/.env`. The Phase 2 test on every CI run performs `existsSync(<resolved-path>)` and, worse, the layering test reads those files via `readFileSync` to scan imports — silently exfiltrating file existence (and contents, if the import regex is later extended). The plan treats the manifest as trusted internal config but writes no validation against out-of-tree paths.
- **Evidence:**
  - Plan Phase 2 architecture ("**`role-layering invariants hold`** — scan each `evaluator` and `facade` file's imports; check that...") presumes paths are in-tree. No normalization step is in the implementation steps.
  - Plan Phase 1 success criterion `[ ] Every manifest `path` resolves to an existing file` (line 98 of phase-01) lacks any "resolves within `core/`" qualifier.
  - The existing FCIS test in `tools/learning-loop-mastra/__tests__/phase-e-foundation/fcis-invariant.test.js` (line 6) hardcodes `CORE_DIR = join(import.meta.dirname, "..", "..", "core")` — but the plan's new placement-manifest test does not specify its analogous anchor.
  - Plan Phase 1 line 39 example manifest row: `path: gate-logic.js` (relative) — sets convention but no enforcement.
- **Suggested fix:** Add a schema-validation step in Phase 1's `Implementation Steps` step 3 that rejects rows where `path` (a) does not match `^[\w./-]+\.m?js$`, (b) contains `..`, (c) starts with `/` or `~/`, or (d) does not, after `path.join(CORE_DIR, path)`, begin with `CORE_DIR`. Phase 2's layering test must `resolve()` and `startsWith(CORE_DIR + path.sep)` before any `existsSync` / `readFileSync` call.

---

## Finding 2: `factoryFor(entry)` switch-throw leaks via `entry_kind` — unknown-kind DoS / info disclosure

- **Severity:** Medium
- **Location:** Phase 4 (§`Architecture` — `core/entry/index.js` `factoryFor` switch)
- **Flaw:** The plan specifies `factoryFor(entry)` throws `new Error("Unknown entry_kind: <entry_kind>")` on unknown kinds. The input `entry` originates from the MCP tool handler that reads `meta-state.jsonl` from disk (line 26 of `tools/legacy/meta-state-relationships-tool.js`: `const entries = readRegistry(root)`). The registry is append-only and trusted in this codebase, but the *reimplementation* propagates `entry.entry_kind` directly into an error message that the wire response ultimately surfaces. Combined with the snapshot test (Phase 5) that runs on user-controlled fixtures, an attacker who can write a single JSONL row with `entry_kind: "<script>"` causes the tool to return that string verbatim back through the MCP wire response (since `meta_state_relationships` returns the error from `factoryFor` indirectly via `result.outbound` / `result.inbound`).
- **Failure scenario:** A malicious or buggy agent writes a meta-state row with `entry_kind: "constructor"` (or any string that confuses downstream parsers — e.g., one containing newlines, ANSI escapes, or JSON-breaking characters). When the relationships tool is invoked against that row, the new factory path throws and — depending on Phase 4's handler implementation — may echo the attacker-controlled `entry_kind` into the response body. The current tool does not sanitize the wire output (line 30 of meta-state-relationships-tool.js returns `{ error: "entry_not_found", id }` directly), so the pattern is established. The plan's snapshot test only validates the happy path; it does not exercise unknown-kind wire responses.
- **Evidence:**
  - Plan Phase 4 architecture block (lines 39-47) shows the literal throw: `throw new Error(\`Unknown entry_kind: ${entry.entry_kind}\`)`.
  - `tools/learning-loop-mastra/tools/legacy/meta-state-relationships-tool.js` line 30: existing wire shape returns `id` verbatim in error cases (`{ error: "entry_not_found", id }`).
  - `tools/learning-loop-mastra/core/meta-state.js` `PATCH_KINDS = ["finding", "change-log", "rule", "loop-design"]` (line 281) — the closed enum is known but the new factory layer re-derives the dispatch instead of referencing the existing allowlist.
- **Suggested fix:** Phase 4 should import `PATCH_KINDS` (or `META_STATE_ENTRY_KIND_UNION`) from `core/meta-state.js` and validate against that set *before* dispatch, instead of using a switch with a stringly-typed throw. The MCP tool handler must wrap the throw in a try/catch and return a sanitized error (`{ error: "internal_error" }`) — never echo user-controlled strings.

---

## Finding 3: Factory `inboundRefs(root)` performs registry-reads on user-controlled `root` — caller can be coerced to read arbitrary paths

- **Severity:** High
- **Location:** Phase 3 (§`Architecture` — `factory.inboundRefs(root)`), Phase 4 (§`Architecture` — `validateCrossRefs(root)`, `outboundRefsAll(root)`)
- **Flaw:** The plan specifies `inboundRefs(root)` "reads registry" via `readRegistry(root)`. The MCP tool handler (Phase 4) resolves `root` via `resolveRoot()` — which is a filesystem-root resolution. However, the factory's `inboundRefs(root)` is also described as a public API on the frozen factory instance, meaning any caller (test, evaluator in a future Phase 3 PR, agent code) that holds a factory object can call `factory.inboundRefs(anyPath)` and trigger a registry read at that path. There is no allowlist, no path-canonicalization requirement, and no guarantee the caller is the shell or core. `readRegistry` (line 368 of `core/meta-state.js`) walks `meta-state.jsonl` under `root` — but if `root` is a symlink or attacker-controlled string, the registry read can be steered at any JSONL file.
- **Failure scenario:** A future evaluator (Phase 3, currently out of scope but architecturally anticipated in plan line 28) imports `createRule` and calls `rule.inboundRefs("/tmp/attacker-controlled")`. If `/tmp/attacker-controlled/meta-state.jsonl` exists (or the path resolves through symlinks to a sensitive location), the call returns relationship data derived from that file — including orphan detection, supersede chains, and rule origins. The plan's soft-inversion invariant ("schemas stay canonical") provides no defense because the read happens in `core/entry/*.js`, which is *part of* core, so the FCIS test passes. The snapshot test in Phase 5 only validates happy-path fixtures; it does not exercise `inboundRefs` with adversarial `root` values.
- **Evidence:**
  - `core/meta-state.js` line 368: `export function readRegistry(root)` (no path validation in the function signature).
  - Plan Phase 3 architecture block line 59: `inboundRefs(root) { /* reads registry */ }` — exposed on the factory instance, callable by any importer.
  - Plan Phase 4 `validateCrossRefs` (line 50) and `outboundRefsAll` (line 71) both invoke `readRegistry(root)` without any guard.
  - `gate-logic.js` `projectHasLearningLoopMcp(root)` (line 578) reads `join(root, ".mcp.json")` — sets a precedent of accepting arbitrary `root` paths.
- **Suggested fix:** Phase 3/4 must validate `root` at the boundary: (a) `resolve()` then `startsWith(process.cwd())` OR (b) restrict `inboundRefs` to callers within a known allowlist (e.g., only call from `meta_state_relationships` handler which already has `resolveRoot()` semantics). Document in `core/entry/README.md` that `inboundRefs` is a shell-side API, not a core-side API, and have the factory throw on un-canonicalized paths.

---

## Finding 4: Re-implementation of `meta_state_relationships` silently drops dual-field `promoted_to_rule` migration logic — wire-shape divergence risk with safety implications

- **Severity:** Critical
- **Location:** Phase 4 (§`Architecture` — reimplemented `meta-state-relationships-tool.js`)
- **Flaw:** The current `meta-state-relationships-tool.js` (lines 43-53) implements dual-field handling for `promoted_to_rule`: if `entry.promoted_to_rule` is absent on a finding, it falls back to `inverse.origin_inverse.get(id)` and uses the first rule found. The Phase 4 reimplementation shown in the plan (lines 114-119) dispatches via `factoryFor(entry).outboundRefs()` and walks `data.promoted_to_rule` directly — **it has no equivalent fallback**. The plan's snapshot test (Phase 5) is meant to catch this, but the snapshot is captured "BEFORE Phase 4 reimplementation" — meaning the *current* dual-field output becomes the ground truth. However, the plan's R5 in Phase 4 acknowledges: "the current tool has dual-field handling for `promoted_to_rule` (legacy + new). Mitigation: the snapshot test covers the happy path; a separate test case for a finding with legacy `promoted_to_rule` should be added in Phase 5 (snapshot only, not exhaustive)." This explicitly admits the snapshot will not exercise the legacy path. The result: a silent wire-shape regression for findings that lack `promoted_to_rule` but have origin rules — these are precisely the entries that the migration left in an inconsistent state. The new tool returns `outbound.promoted_to_rule = null` where the old tool returned the origin-derived rule id.
- **Failure scenario:** Operator queries `meta_state_relationships({ id: "meta-legacy-finding", direction: "both" })` expecting to find the rule this finding promoted to. Old tool returns `{outbound: {promoted_to_rule: "rule-the-fix"}}`. New tool returns `{outbound: null}` (because `data.promoted_to_rule` is undefined on legacy entries and `factory.outboundRefs()` only walks declared fields). The downstream gate-decision log entry (`appendGateLog` at line 84) records `tool: "meta_state_relationships", id, direction` but not the outcome, so audit trails become incoherent. Critically, this is a **silent failure** — the JSON wire shape is structurally valid, so the snapshot test for happy-path fixtures passes, and the regression only surfaces for legacy entries. Promotion lineage (the operator's "core should be related to modelling relationship" concern from brainstorm §4) is broken for migrated findings.
- **Evidence:**
  - `tools/legacy/meta-state-relationships-tool.js` lines 43-53: explicit dual-field unification for `promoted_to_rule`.
  - Plan Phase 4 architecture (line 114-119 of plan): `outbound = factory.outboundRefs()` walks `data.promoted_to_rule` with no fallback.
  - Plan Phase 4 R5: "the snapshot test covers the happy path; a separate test case for a finding with legacy `promoted_to_rule` should be added in Phase 5 (snapshot only, not exhaustive)" — admits incomplete coverage.
  - `core/meta-state.js` line 253 comment: `* - `promoted_to_rule` removed from deny-list — the field is no longer written` — confirms the migration actually removed the field on findings, leaving only the origin-side reverse lookup as the recovery mechanism.
  - `core/loop-introspect.js` line 296: `buildInverseIndexes` is what makes the legacy fallback possible — and the plan removes the dependency on it for the relationships tool.
- **Suggested fix:** Phase 4's `factory.outboundRefs()` for Finding must replicate the dual-field logic. Concretely: when `data.promoted_to_rule` is absent and `entry_kind === "finding"`, fall back to `inverse.origin_inverse.get(data.id)?.[0]` and emit `{field: "promoted_to_rule", id: <rule-id>, kind: "rule"}`. The factory must either receive `inverse` as an argument or build it from `readRegistry(root)` — whichever preserves the invariant. Phase 5's snapshot test MUST include a legacy-finding fixture (no `promoted_to_rule`, has `origin_inverse` entry) — the plan's deferral to "snapshot only, not exhaustive" is unacceptable.

---

## Finding 5: `factoryFor` dispatches by `entry_kind` before schema validation — type confusion / schema-bypass vector

- **Severity:** High
- **Location:** Phase 3 (§`Architecture` — `entry/finding.js`, `entry/rule.js`, etc.), Phase 4 (`factoryFor`)
- **Flaw:** The plan specifies each factory does `metaStateRuleEntrySchema.parse(data)` and then `Object.freeze({kind, data, schema, ...})`. But `factoryFor(entry)` in Phase 4 calls `createFinding(entry)` *directly on the raw entry* (Phase 4 architecture line 41: `case "finding": return createFinding(entry)`). If `entry` is a JSONL row that has been corrupted in transit (partial write, encoding mismatch, agent typo), `metaStateFindingEntrySchema.parse(entry)` throws a Zod error — but `factoryFor` does not catch it. Worse, `factoryFor` accepts an `entry` whose `entry_kind` field is a string that may not match its actual shape (e.g., a `change-log` row with `entry_kind: "finding"`). The canonical schema's union (line 232 of `meta-state.js`: `metaStateEntrySchema = z.preprocess(...)` with `discriminator` on `entry_kind`) catches this for direct users, but the new factory path bypasses it because each factory's `parse` operates on the *inner* schema (`metaStateFindingEntrySchema`), not the union.
- **Failure scenario:** A meta-state registry row is created with `{ entry_kind: "finding", category: "this-is-not-a-valid-category", ... }` due to an agent bug. The Zod union `metaStateEntrySchema` rejects this on registry write (line 232). But once in the registry, an older tool may have written it pre-validation (the registry is append-only JSONL; `readRegistry` does NOT re-validate on read — line 368 of `meta-state.js` returns raw parsed JSONL). When `meta_state_relationships` is invoked on this row, the new `factoryFor` path calls `createFinding(entry)`, which calls `metaStateFindingEntrySchema.parse(entry)`. If `entry_kind` was correctly `finding`, parsing may succeed (or fail on the category enum). If parsing fails, the error propagates uncaught. If parsing succeeds (because the category enum check is on a different field), the factory returns a frozen object whose `data.category` is invalid — and this invalid state is now what `outboundRefs()` / `inboundRefs(root)` walk, producing orphan reports based on bogus data. The plan's soft-inversion "schema === canonical schema" reference-equality test does NOT exercise this — it only checks identity, not that the factory *uses* the schema to validate.
- **Evidence:**
  - `core/meta-state.js` line 368: `export function readRegistry(root)` — no validation in read path.
  - `core/meta-state.js` line 232: `metaStateEntrySchema = z.preprocess(...)` — the union validator is NOT used by `readRegistry`.
  - Plan Phase 3 line 32-33: each factory calls `<kind>Schema.parse(data)` — but only on the inner schema, not on the union.
  - Plan Phase 4 line 40: `switch (entry.entry_kind)` dispatches before any schema validation; no try/catch around `create*(entry)` calls.
- **Suggested fix:** Phase 4's `factoryFor` must (a) wrap `create*(entry)` in try/catch and convert Zod errors to a structured wire response, (b) validate `entry.entry_kind` against the closed enum (`PATCH_KINDS`) BEFORE dispatch, and (c) cross-check that `entry_kind` matches the schema used (e.g., a `finding` row must parse with `metaStateFindingEntrySchema`, not silently with the union). Phase 3 factory tests should include a "registry-row with corrupted inner field" fixture and assert a typed error.

---

## Finding 6: `placement-manifest.test.js` 5th sub-test writes a real file under `core/` — pre-commit hook will recursively trigger itself

- **Severity:** Medium
- **Location:** Phase 2 (§`Implementation Steps` step 4 — "5th sub-test")
- **Flaw:** The plan's step 4 says: "Programmatically: write a temp file in `core/` (e.g., `core/__test-fixture.js`), run the manifest enumeration, assert it shows up as missing, then `unlinkSync` the file." The repo has a `pre-commit` hook at `package.json` line 36: `"pre-commit": "pnpm test"`. If a developer commits while the test is mid-flight (impossible during a CI run but possible during local development with watch-mode), the manifest test's own write would cause `pnpm test` to re-trigger, which runs the manifest test, which writes another file — recursive test invocation. Worse, if the test crashes between `writeFileSync` and `unlinkSync` (the plan's R3 acknowledges this), the leftover file `core/__test-fixture.js` will be picked up by subsequent test runs and the layering test will attempt to scan it for imports. A future agent running `core/audit` would see this temp file in the manifest enumeration as a real `core/` file.
- **Failure scenario:** During local development, `node --test --watch` re-runs the test on each save. The 5th sub-test writes `core/__test-fixture.js`, the layering test (sub-test 3) sees a new file with `@mastra/*` import (worst case if the fixture is a deliberate violation), reports a layering violation, and `unlinkSync` runs. If the watch-mode file-watcher fires between write and unlink, the test runner sees a transient state where the fixture has an `@mastra/*` import, the FCIS test fires, the developer's terminal lights up red, and the test self-destructs. Additionally, if `git status` shows `core/__test-fixture.js` (untracked but on disk), a careless `git add .` commits it; the next CI run fails because the manifest doesn't include `__test-fixture.js`.
- **Evidence:**
  - `package.json` line 36: `"pre-commit": "pnpm test"`.
  - Plan Phase 2 R3 (line 102 of phase-02): explicit acknowledgment of the unlink race; mitigation is "name with clear prefix and document manual cleanup" — inadequate for a recursive trigger scenario.
  - Plan Phase 2 Implementation Steps step 4 (line 76): "write a temp file in `core/` (e.g., `core/__test-fixture.js`)" — the `__` prefix does not exclude the file from the FCIS test's walk (line 14 of fcis-invariant.test.js only skips `__tests__` and `node_modules`).
- **Suggested fix:** Write the temp file to `os.tmpdir()` (e.g., `path.join(os.tmpdir(), 'placement-fixture-*.js')`) and pass that path into the manifest enumeration function with an override. Alternatively, exclude the fixture path from the layering/FCIS scans via an env-var-driven skip list. Do NOT write inside `core/` during test execution.

---

## Finding 7: `findOrphans` is a one-line alias for `validateCrossRefs(root).orphans` — redundant indirection amplifies blast radius

- **Severity:** Low
- **Location:** Phase 4 (§`Architecture` — `findOrphans(root)` line 67-69)
- **Flaw:** The plan defines `findOrphans(root) { return validateCrossRefs(root).orphans; }`. This is a pure alias with no value-add. The KISS principle is violated: a future agent reading the codebase sees two function names that do the same thing and must choose. Worse, from a security review posture: alias functions create an illusion of semantic difference. The plan's R5 in Phase 2 notes "factories duplicate logic from `meta-state.js`" — but here we are duplicating at the *export* level, not the logic level. If `validateCrossRefs` later changes its return shape (e.g., adds `{orphans, warnings}`), `findOrphans` silently continues returning the orphans array only, and any caller that destructured `{orphans, warnings}` from `findOrphans` will break.
- **Failure scenario:** Future agent adds a `warnings` field to `validateCrossRefs` for staging warnings. `findOrphans` continues to return `{orphans}` only. A caller using `findOrphans(root).warnings` (logical expectation) crashes at runtime with "Cannot read property 'warnings' of undefined" (because the function returns the array directly, not an object). Test coverage for `findOrphans` only checks the alias; the breakage surfaces in production.
- **Evidence:**
  - Plan Phase 4 architecture lines 67-69: literal alias, no logic.
  - Plan Phase 4 success criterion line 206: "`findOrphans(root)` is an alias for `validateCrossRefs(root).orphans`" — the plan itself calls it an alias.
  - `core/loop-introspect.js` already exports `buildInverseIndexes` and `summarize` — separate concerns, not aliases.
- **Suggested fix:** Remove `findOrphans` from the public API. Callers who want orphans call `validateCrossRefs(root).orphans` directly. If the alias is genuinely needed for ergonomics, document the semantic difference explicitly and add a test that asserts future return-shape changes preserve the alias contract.

---

## Finding 8: `core/placement.yaml` author-controlled YAML parsed without `safeLoad` / schema-bounds — prototype pollution / YAML-deserialization risk

- **Severity:** Medium
- **Location:** Phase 1 (§`Architecture` — `core/placement.yaml`), Phase 2 (test that parses the manifest)
- **Flaw:** The plan parses YAML via `import yaml from 'yaml'; yaml.parse(readFileSync(...))` (Phase 1 step 3 line 78). The codebase already uses the `yaml` package (`gate-logic.js` line 19, `mastra/workflows/workflow-intake-orient.js` line 4). YAML 2.x does not have prototype-pollution by default, but the parsed object has no schema bounds: a manifest row may declare `role: !!js/function 'function () { return process.env; }'` (yaml package rejects `!!js/function` by default in safe mode, but the plan does not specify `yaml.parse` vs `yaml.parseDocument` with schema). More concretely, the manifest schema is implicit — the test only checks `role ∈ {primitive, evaluator, facade, verification, validator, cache, helper}` (Phase 2 sub-test 2). An attacker authoring `role: {value: "primitive", prototype_pollution_attempt: "__proto__"}` could (depending on downstream consumer) inject keys that get spread into a config object.
- **Failure scenario:** Manifest row declares `summary: "foo\nrole: primitive\n- __proto__:\n  polluted: true"`. YAML parses the multi-line summary into a nested structure if anchors are used. The Phase 2 test only validates `role` and `path`; `summary` is opaque. If a future agent writes code like `Object.assign(config, parsedManifest.files[i].summary)` (or any spread operation on a row), prototype pollution occurs. Even without that, a row like `path: "*.js"` with a glob pattern could collide with `globMatch` in the layering test (Phase 2 sub-test 3) if path-matching is glob-based rather than exact-string. The plan does not specify whether `path` matching is exact or glob.
- **Evidence:**
  - Plan Phase 1 line 78: `yaml.parse(readFileSync(...))` — no schema, no strict mode specified.
  - `package.json` line 29: `"yaml": "^2.8.4"` — YAML 2.x with default parsing.
  - Plan Phase 2 sub-test 2 (line 35-36): only validates `role` values; `path` and `summary` are unchecked.
  - `tools/learning-loop-mastra/core/field-drift-exceptions.yaml` and `validator-coverage.yaml` exist as precedent — but neither is parsed by tests; both are author-controlled.
- **Suggested fix:** Phase 1 must define a Zod schema for manifest rows (`{path: z.string().regex(/^[\w./-]+\.m?js$/), role: z.enum([...]), summary: z.string().max(80)}`) and validate via `safeParse`. Reject unknown keys (`z.strict()`). Use `yaml.parse` with the `merge` option disabled (default in `yaml` 2.x).

---

## Finding 9: Plan silently removes the dependency on `buildInverseIndexes` from the relationships tool, but `loop-introspect.js` retains it — long-term drift risk + unvetted dependency surface

- **Severity:** Medium
- **Location:** Phase 4 (§`Architecture` — reimplemented tool), §`Risk Assessment` R3
- **Flaw:** The plan's R3 in Phase 4 acknowledges: "`buildInverseIndexes` is still imported elsewhere." A grep confirms at least 6 call-sites: `meta-state-relationships-tool.js`, `meta-state-sweep-tool.js`, `loop-describe-tool.js`, `loop-get-instruction-tool.js`, plus tests. The reimplementation removes the relationship tool's dependency on `buildInverseIndexes` but leaves the function intact. The plan states: "Add a comment in `loop-introspect.js` noting that the relationship tool no longer uses it (other call-sites may)." This is a soft-deprecation with no enforcement. Over time, the inverse-index builder will accumulate features for the remaining callers (loop-describe, sweep, get-instruction), and the new factory-based `inboundRefs` will diverge. Eventually the two code paths will produce different inverse-index structures for the same input — and there will be no test asserting parity because the snapshot test only validates the wire shape, not the inverse-index contents.
- **Failure scenario:** Two years from now, `buildInverseIndexes` adds a new field to its output (say, `supersedes_inverse` was renamed to `supersedes_by` in some refactor). The relationship tool (now factory-based) does not know about this rename. Loop-describe (still calling `buildInverseIndexes`) starts returning the new field. The two tools return inconsistent lineage information for the same entry. An agent using `meta_state_relationships` to confirm lineage before promoting a rule will miss the rename; an agent using `loop_describe` will see it. The plan does not specify any periodic-consistency check.
- **Evidence:**
  - `tools/learning-loop-mastra/tools/legacy/meta-state-relationships-tool.js` line 3: imports `buildInverseIndexes`.
  - `tools/learning-loop-mastra/tools/legacy/meta-state-sweep-tool.js` line 3: imports `buildRegistrySummary` (different function but same module).
  - `tools/learning-loop-mastra/tools/legacy/loop-describe-tool.js` line 3: `import * as introspect from "../../core/loop-introspect.js"`.
  - `tools/learning-loop-mastra/tools/legacy/loop-get-instruction-tool.js` line 2: imports `buildDiscoverabilityHints, buildProcessHints`.
  - `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-stale-flag.test.js` line 12: imports `summarize` from the same module.
  - Plan Phase 4 R3 acknowledges this drift but proposes only a code comment as mitigation.
- **Suggested fix:** Add a parity test that, for a fixture registry, asserts `factoryFor(entry).inboundRefs(root)` returns the same inverse-map subset as `buildInverseIndexes(readRegistry(root))[<field>_inverse].get(entry.id)` for every entry-kind/field combination. Or, have the factory's `inboundRefs` *delegate* to `buildInverseIndexes` for the inverse-map phase (read once, slice per entry) so there is a single source of truth for the inverse graph.

---

## Finding 10: Phase 3 factory `appliesTo(root)` claims to call `projectHasLearningLoopMcp` — but the function is NOT exported

- **Severity:** Critical (compilation failure masquerading as design)
- **Location:** Phase 3 (§`Architecture` — `entry/rule.js` `appliesTo`), §`Implementation Steps` step 3
- **Flaw:** The plan's Phase 3 implementation step 3 (line 133 of phase-03) says: "`appliesTo(root)` — branching on `scope_predicate`: ... `project_has_learning_loop_mcp` → check if `<root>/tools/learning-loop-mcp/` exists (the existing `projectHasLearningLoopMcp` helper in `gate-logic.js` or similar)." The referenced function is `function projectHasLearningLoopMcp(root)` at `gate-logic.js` line 578 — declared with **no `export` keyword**. The factory cannot import it. The plan parenthetical "or similar" suggests the author was unsure; the parenthetical also suggests the implementation will likely either (a) inline a copy of the function into `entry/rule.js` (logic duplication), or (b) modify `gate-logic.js` to export it (an out-of-scope change), or (c) call `loadPromotedRules(root)` and trust that helper's internal call to `projectHasLearningLoopMcp` (couples factory to a non-obvious side effect).
- **Failure scenario:** Implementation starts, factory author tries `import { projectHasLearningLoopMcp } from "../gate-logic.js"` — fails at module load with `SyntaxError: The requested module '../gate-logic.js' does not provide an export named 'projectHasLearningLoopMcp'`. Three recovery paths, all bad:
  - **Inline copy** of the function into `entry/rule.js`: now two copies of the helper exist; future fix to one (e.g., add a third MCP server name) silently diverges.
  - **Export from gate-logic.js**: violates "Phase 3 modifies only `core/entry/` files" stated in plan line 105; expands Phase 3 blast radius without an ADR.
  - **Call `loadPromotedRules(root)`**: triggers a registry read and a cache write as a side effect of `appliesTo` — semantically wrong, performance cliff at scale.
- **Evidence:**
  - `tools/learning-loop-mastra/core/gate-logic.js` line 578: `function projectHasLearningLoopMcp(root) {` — no `export` keyword.
  - Lines 47, 92, 168, 225, 248, 265, 281, 300, 334, 373, 388, 400, 415, 491, 573, 596, 680, 691, 752 in same file — every other helper that needs cross-module use has `export function`; `projectHasLearningLoopMcp` is the only `function` declaration at module scope (along with internal helpers like `expandBraces`, `extractFrontmatter`, `pathMatchesObservation`).
  - Plan Phase 3 line 133: "the existing `projectHasLearningLoopMcp` helper in `gate-logic.js` or similar" — the "or similar" is the tell that the author did not verify export visibility.
- **Suggested fix:** Decide explicitly: (a) export `projectHasLearningLoopMcp` from `gate-logic.js` (one-line change, add to Phase 3 implementation steps), or (b) move it into `entry/rule.js` (deprecate the in-`gate-logic.js` copy), or (c) move it into a new `core/util.js` shared module. Whichever, document the decision in the PR description and update the plan's Phase 3 implementation step 3 with the verified symbol.

---

## Finding 11: Plan claims "core/entry/__tests__/" test directory — but `core/` has `__tests__/` already, and the FCIS test walks it; nested `__tests__/` inside `core/entry/__tests__/` is invisible to FCIS

- **Severity:** Low (architectural confusion, not security)
- **Location:** Phase 3 (§`Architecture` directory tree), Phase 5 (`Related Code Files`)
- **Flaw:** The plan creates `core/entry/__tests__/` — a nested tests directory under `core/`. The FCIS test (`fcis-invariant.test.js` line 14) walks `core/` and **skips** `__tests__` subdirectories. A nested `core/entry/__tests__/` would also be skipped — correct. But the existing test discovery in `package.json` line 16 (`"test": "node tools/scripts/run-pnpm-test-namespaced.mjs"`) is unknown — the plan does not verify whether the test runner recurses into `core/entry/__tests__/`. If `run-pnpm-test-namespaced.mjs` uses a non-recursive glob like `core/__tests__/**/*.test.js`, the new test files in `core/entry/__tests__/` will not run. The plan's R3 in Phase 5 acknowledges "core/entry/ accidentally imports a shell file" but does not check whether the test runner actually finds the new tests.
- **Failure scenario:** Phase 5 ships, the four factory tests and the snapshot test never run in CI. The 25-35 new tests claimed by the plan are phantom tests — they execute (locally) but never block a merge. The snapshot test, which is the load-bearing wire-shape invariant, becomes optional. A future regression in `meta_state_relationships` wire shape is caught only when an operator manually runs `node --test core/entry/__tests__/`.
- **Evidence:**
  - `package.json` line 16: `"test": "node tools/scripts/run-pnpm-test-namespaced.mjs"` — the contents of this script are not verified by the plan.
  - `tools/learning-loop-mastra/__tests__/phase-e-foundation/fcis-invariant.test.js` line 14: skips `__tests__` and `node_modules`.
  - Plan Phase 5 line 165: `core/entry/__tests__/index.test.js` listed as a new test file — runner inclusion not verified.
- **Suggested fix:** Phase 1 implementation steps should add a step that runs `node tools/scripts/run-pnpm-test-namespaced.mjs --dry-run` or equivalent to verify the runner discovers `core/entry/__tests__/*.test.js`. If the runner is not recursive, either fix the runner or place the entry tests under `tools/learning-loop-mastra/__tests__/phase-e-entry/` (alongside the phase-e-foundation tests).

---

## Finding 12: Plan Phase 4 schema variable names for `createChangeLog` and `createLoopDesign` do not match canonical exports

- **Severity:** Medium (acceptance-criteria mismatch)
- **Location:** Plan.md §`Acceptance Criteria` line 110-111, Phase 3 §`Architecture` (line 86-88 of phase-03)
- **Flaw:** The plan's acceptance criteria state: "`createChangeLog.schema === metaStateChangeEntrySchema`" and "`createLoopDesign.schema === metaStateLoopDesignSchema`". The canonical exports are:
  - `metaStateFindingEntrySchema` (line 56 of meta-state.js) — matches `createFinding.schema`.
  - `metaStateChangeEntrySchema` (line 117) — matches `createChangeLog.schema`.
  - `metaStateRuleEntrySchema` (line 164) — matches `createRule.schema`.
  - `metaStateLoopDesignSchema` (line 203) — matches `createLoopDesign.schema`.

  The names match. However, the plan's Phase 5 test stub (line 88 of phase-05) shows:
  ```js
  assert.strictEqual(createFinding.schema, undefined);  // factory itself has no schema; instance has one
  ```
  The plan author appears confused about whether `schema` lives on the factory *function* or on the factory *instance*. The acceptance criterion says "factory.schema" but the test asserts `createFinding.schema === undefined`. These contradict. The intent (per soft-inversion contract) is that `rule.schema` (instance) === `metaStateRuleEntrySchema`, not `createRule.schema` (factory function).
- **Failure scenario:** Phase 5 tests are written against the confused spec. Either (a) `createRule.schema` (the function) is set to the canonical schema, and the test passes for the wrong reason (every caller of `createRule.schema` gets the schema, but a `new createRule(data)` instance does not have `.schema` because the factory function shadows it), or (b) the test is corrected to `instance.schema`, but the soft-inversion "Schema reachable via `factory.schema`" ADR comment in `core/README.md` is then wrong. The plan's Phase 4 ADR comment (line 151 of phase-04) says: "**Schema reachable via `factory.schema`.**" — this is ambiguous between function and instance.
- **Evidence:**
  - Plan Phase 3 architecture line 39: `return Object.freeze({kind, data, schema: metaStateRuleEntrySchema, ...})` — instance has `.schema`.
  - Plan Phase 5 line 88: `assert.strictEqual(createFinding.schema, undefined)` — factory *function* has no `.schema`.
  - Plan Phase 4 ADR comment (line 151 of phase-04): "Schema reachable via `factory.schema`" — ambiguous.
- **Suggested fix:** Standardize on `instance.schema` everywhere. Update Phase 4 ADR comment to read "Schema reachable via `factoryInstance.schema`". Update Phase 5 tests to assert `createFinding(data).schema === metaStateFindingEntrySchema`. Reject any future implementation that puts the schema on the factory function.

---

## Summary

| # | Severity | Phase | Issue |
|---|----------|-------|-------|
| 1 | High | 1, 2 | Manifest `path` field — path-traversal injection vector |
| 2 | Medium | 4 | `factoryFor` switch-throw echoes user-controlled `entry_kind` |
| 3 | High | 3, 4 | `inboundRefs(root)` reads registry on caller-supplied `root` |
| 4 | Critical | 4 | Reimplemented tool drops dual-field `promoted_to_rule` migration |
| 5 | High | 3, 4 | `factoryFor` dispatches before schema validation — type confusion |
| 6 | Medium | 2 | 5th sub-test writes real file under `core/` — recursive trigger risk |
| 7 | Low | 4 | `findOrphans` is one-line alias — redundant indirection |
| 8 | Medium | 1, 2 | YAML manifest parsed without schema bounds — prototype pollution risk |
| 9 | Medium | 4 | `buildInverseIndexes` retained but no parity test vs new path |
| 10 | Critical | 3 | Plan cites `projectHasLearningLoopMcp` which is NOT exported from `gate-logic.js` |
| 11 | Low | 3, 5 | Test runner inclusion of nested `core/entry/__tests__/` not verified |
| 12 | Medium | 3, 4, 5 | Schema location ambiguity — `factory.schema` vs `instance.schema` |

**Critical blockers (must address before plan ships):** Findings 4 and 10. Both are factually wrong claims about the codebase that will cause silent failures (4) or compilation errors (10) on first implementation.

**Factual discrepancies verified against codebase:**
- Plan claims "~28 files" — actual is **27** (4 of which are `.test.js` files in `core/`, which the plan excludes from counting but does not state).
- Plan claims `projectHasLearningLoopMcp` is callable from outside `gate-logic.js` — actual is **not exported** (line 578, `function` not `export function`).
- Plan's relationship table omits the dual-field `promoted_to_rule` fallback that the current `meta-state-relationships-tool.js` lines 43-53 implement — this is the wire-shape divergence of Finding 4.
- Plan claims `pnpm yaml-tools lint` "if the repo has one" — repo has no such command.
- Plan's claim of "1189+ tests" — unverified but consistent with project size; test runner inclusion of new directories is the actual risk (Finding 11).

**Recommended actions (priority order):**
1. Resolve Finding 10 by either exporting `projectHasLearningLoopMcp` or relocating it. Update Phase 3 implementation steps with the verified symbol.
2. Resolve Finding 4 by either porting the dual-field `promoted_to_rule` logic into `factory.outboundRefs()` or accepting the wire-shape regression explicitly (with operator sign-off) and documenting the legacy-finding query failure mode.
3. Add path-canonicalization to Phase 1/Phase 2 manifest parsing per Finding 1.
4. Add a "registry-row with corrupted inner field" fixture and a legacy-finding fixture to the Phase 5 test suite (Finding 5, Finding 4).
5. Verify the test runner includes nested `__tests__/` directories before Phase 3 ships (Finding 11).

