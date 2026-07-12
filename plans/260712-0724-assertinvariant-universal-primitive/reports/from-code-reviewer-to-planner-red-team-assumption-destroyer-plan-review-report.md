# Code Review — Assumption Destroyer Red-Team

**Plan under review:** `plans/260712-0724-assertinvariant-universal-primitive/`
**Reviewer role:** Fact Checker (Assumption Destroyer)
**Date:** 2026-07-12
**Branch:** `main`
**Mode:** hostile

---

## Finding 1: `IMMUTABLE_PATCH_FIELDS` removal breaks `meta-state-patch-tool.js`'s own deny-list — the patch path stays un-guarded

**Severity:** Critical
**Location:** Phase 1, step 7 ("Remove `IMMUTABLE_PATCH_FIELDS` deny-list at meta-state.js:339-355") and Phase 1, step 3 ("Wrap updateEntry")
**Flaw:** The plan asserts the universal wrapper "replaces the 3-entry IMMUTABLE_PATCH_FIELDS deny-list wholesale". This is empirically false. The deny-list is imported and re-checked **at the patch-tool handler, BEFORE updateEntry is called**:

`tools/learning-loop-mastra/tools/handlers/meta-state-patch-tool.js:7` — `IMMUTABLE_PATCH_FIELDS` imported directly into the handler.
`tools/learning-loop-mastra/tools/handlers/meta-state-patch-tool.js:74-91` — handler-side deny-list check fires independently of `updateEntry`:
```js
const deniedFields = Object.keys(effectivePatch).filter((k) => IMMUTABLE_PATCH_FIELDS.has(k));
if (deniedFields.length > 0) {
  const result = { patched: false, reason: "immutable_field", id, denied_fields: deniedFields,
    immutable_fields: [...IMMUTABLE_PATCH_FIELDS], ... };
```
`tools/learning-loop-mastra/tools/handlers/meta-state-patch-tool.js:14` — re-exported for test backward compat.

The wrapper at `updateEntry` only fires AFTER `Object.assign(entry, cleanPatch)` at `meta-state.js:711` (in-memory mutation already applied). The wrapper returns `{ok:false, reason}` but does not revert the in-memory mutation, so the corruption propagates to `writeFileSync` at `meta-state.js:718`.

**Failure scenario:**
1. Caller invokes `meta_state_patch({id, entry_kind:"finding", patch:{entry_kind:"rule"}})`.
2. Plan removes `IMMUTABLE_PATCH_FIELDS = new Set([...])` — its value is now empty.
3. `deniedFields = []` at meta-state-patch-tool.js:74 — deny-list bypassed.
4. `updateEntry` called with `patch={entry_kind:"rule"}` (the wrapper captures pre `entry.entry_kind` but the value in the patch is `"rule"`).
5. Per Phase 1 step 8, line 710 `delete cleanPatch.entry_kind` is removed — patch's `entry_kind:"rule"` reaches `Object.assign(entry, cleanPatch)`.
6. Wrapper's "post" check: `entries[i].entry_kind === "rule"` ≠ pre `entry.entry_kind`. Returns `{ok:false, reason:"identity_violated"}`.
7. But the in-memory `entries[]` is already mutated and `tmpPath` is already written at meta-state.js:718-719. The rollback path only fires in `metaStateBatch` (line 822-826) — not in `updateEntry`.
8. Registry file now contains entry with `entry_kind:"rule"` and a wrapper-returned error — exactly the `meta-260712T0053Z` corruption the plan claims to close.

**Evidence:**
- `tools/learning-loop-mastra/tools/handlers/meta-state-patch-tool.js:7,14,74-91`
- `tools/learning-loop-mastra/core/meta-state.js:710-711` — `delete cleanPatch.entry_kind` then unconditional `Object.assign(entry, cleanPatch)`
- `tools/learning-loop-mastra/core/meta-state.js:716-719` — `writeFileSync + renameSync` (no rollback in `updateEntry`)

**Suggested fix:** Either (a) keep `IMMUTABLE_PATCH_FIELDS` as the deny-list for the patch-tool handler and only remove it from the batch path, OR (b) wrap `meta-state-patch-tool.js#handler` with `assertinvariant` at the handler level (not just at `updateEntry`) and add an `updateEntry` rollback path that reverts in-memory mutations on wrapper violation.

---

## Finding 2: `metaStateBatch`'s `case "write"` and `case "delete"` ops have no pre-state to snapshot — wrapper can't enforce the planned invariant

**Severity:** Critical
**Location:** Phase 1, step 6 ("Wire into `core/meta-state.js#metaStateBatch` (line 798) — replace the `IMMUTABLE_PATCH_FIELDS` deny-list with the wrapper's before/after identity comparison per op")
**Flaw:** The plan says "The wrapper captures each entry's `entry_kind`, `status`, `operation_envelope` pre-batch and asserts them post-batch." This is meaningless for the op-types that mutate the registry in non-comparable ways:

- `case "write"` (`meta-state.js:831-846`): `entries.push(validation.data)` — the entry is NEW. There is no pre-state entry_kind/status/operation_envelope; the caller provides them. A "before/after comparison" would compare the same object to itself.
- `case "delete"` (`meta-state.js:873-878`): `entries.splice(idx, 1)` — the entry is gone post-op. There is no post-state to compare against.
- `case "archive"` (`meta-state.js:879-889`): `status:"archived"` is the legitimate mutation — the plan's own §4 says "the assertion is scoped to `entry_kind` only" for archive, but the architecture code doesn't show this exception.

**Failure scenario:**
1. `case "write"`: wrapper calls `accept.snapshot()` → empty for new id → `accept(empty) === true`. No-op for the planned invariant. The forge vector the `case "write"` reject at `meta-state.js:840-844` defends against (caller-supplied `operation_envelope`) is re-opened the moment Phase 1 step 9 removes that reject.
2. `case "delete"`: wrapper compares pre `{entry_kind, status}` to post `undefined`. Either it treats undefined as a violation (rejecting all deletes) or as a passthrough (no protection).

**Evidence:** `tools/learning-loop-mastra/core/meta-state.js:831-878` — op-type logic. Plan § Architecture (phase-01:62-80) shows `const pre = await accept.snapshot?.() ?? null;` with no per-op-type branching.

**Suggested fix:** The wrapper cannot be the universal answer if half the ops have no pre-state. Either narrow the wrapper to ops with pre-state (`update`, `archive` only) and keep distinct guards for `write`/`delete`, or accept that "before/after identity" is the wrong shape for `metaStateBatch` and gate `operation_envelope` only on `write` via a separate predicate (`accept: () => op.op !== "write" || op.entry.operation_envelope === undefined`).

---

## Finding 3: Cross-process race — snapshot taken before `withRegistryLock` is acquired

**Severity:** Critical
**Location:** Phase 1, Architecture block (phase-01:34-81) and Phase 1, steps 3-6 (wire `updateEntry`/`archiveEntry`/`deleteEntry`/`metaStateBatch`)
**Flaw:** The wrapper's snapshot pattern (`accept.snapshot?.()` then `await operation()`) is positioned at the boundary the plan describes, but the architecture block wraps operation at a layer OUTSIDE `withRegistryLock`. Two concurrent MCP server processes can race:

- Process A: enters `enqueue`, wrapper snapshots pre-entry entry_kind = `"finding"`, hands control to `withRegistryLock`.
- Process B: holds `withRegistryLock`, writes `entry_kind:"rule"`, releases.
- Process A: enters `withRegistryLock` (second acquire), sees its old snapshot, detects the divergence, returns identity-violation — but Process B's write already persisted.

The snapshot must happen INSIDE `withRegistryLock` for the comparison to be meaningful across processes. The plan's "Risk Assessment" (§ Phase 1, "Wrapper adds ~1ms latency per call due to pre-state snapshot + post-state comparison") talks about latency but never addresses cross-process atomicity.

**Failure scenario:** Two parallel PR-merge agents each call `meta_state_batch({ops:[{op:"update",id:"X",status:"open"}]})`. Process A snapshots `X.entry_kind === "finding"`, then waits on the lock. Process B (also waiting) gains the lock, writes its update, releases. Process A acquires lock, post-state is Process B's mutation, comparison detects "no change in entry_kind" (false negative because Process B didn't change entry_kind), and Process A's mutation ALSO lands — both succeed but cross-process ordering is undefined.

**Evidence:**
- `tools/learning-loop-mastra/core/registry-lock.js:34-46` — `withRegistryLock` is the ONLY cross-process serialization.
- `tools/learning-loop-mastra/core/meta-state.js:660-723` — `updateEntry` wraps body in `withRegistryLock` after `enqueue`.
- Plan Phase 1 step 3 example: `assertinvariant(() => /* the operation */, {...})` — no indication of whether the operation includes the lock acquisition.

**Suggested fix:** Mandate that any wrapper invocation MUST be inside `withRegistryLock`. Phase 1 architecture must explicitly nest: `enqueue` → `withRegistryLock` → `assertinvariant` → mutate → `accept.compare` (inside the lock, before release).

---

## Finding 4: Plan fabricates files that do not exist

**Severity:** High
**Location:** Phase 2, step 3 ("Wrap `hooks/universal/pre-commit` consistency check stderr summary"); Phase 2, step 5 ("Add `tools rm` consult-gate wrapper")
**Flaw:** Both file paths referenced by the plan do not exist in the codebase:

- `tools/learning-loop-mastra/hooks/universal/pre-commit` — does NOT exist. The `hooks/universal/` directory contains only: `bash-gate.js`, `inbound-gate.js`, `write-gate.js`, `lib/`, `recurrence-check-on-start.js`, `session-start-inject-discoverability.cjs`. There is no pre-commit hook script in the project.
- `tools/learning-loop-mastra/tools/gates/tools-rm-consult-gate.js` — does NOT exist. The `tools/gates/` directory does not exist (verified `ls` returned ENOENT).

**Failure scenario:** Phase 2 step 3 implementation begins; the implementer discovers there is no pre-commit hook to wrap. They either (a) fabricate a brand-new hook file with no spec, or (b) discover the pre-commit auto-edit logic lives elsewhere (probably in `meta-state.js` directly or in `core/consistency-check.js` which is "no I/O, no subprocess, no resolveRoot" — a pure function). Either way, Phase 2 step 3 silently expands scope to "design a pre-commit surface from scratch" with no acceptance criteria.

Phase 2 step 5 similar: no `tools rm` consult-gate exists, and the phase also requires a brand-new `core/stranded-importers.js` helper. Both are net-new artifacts with no spec — the plan describes them as if they exist.

**Evidence:**
- `tools/learning-loop-mastra/hooks/universal/` (directory listing shows no pre-commit file)
- `find /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra -name 'tools-rm*'` returned no results.
- `ls /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/tools/gates/` returned ENOENT.
- Pre-commit logic shown to live in core (likely `core/consistency-check.js`).

**Suggested fix:** Locate where the pre-commit auto-edit + change-log actually happens (grep for `git commit`, `pre-commit`, `console.warn` near meta-state mutations), or split Phase 2 into two sub-steps: (a) investigate and document the pre-commit surface, (b) wrap it. The "tools rm" gate is similarly speculative — either file a separate plan to design it or remove step 5 from this one.

---

## Finding 5: Plan cites `meta-state-report-tool.js:89-98` as "auto-generated id" — but no caller-id overwrite exists at those lines

**Severity:** High
**Location:** Phase 2, step 2 ("Wrap `tools/handlers/meta-state-report-tool.js` id honoring — replaces silent auto-slugification ... `assertinvariant` that asserts `result.id === generated_id` after writeEntry") and plan frontmatter line citation `meta-state-report-tool.js:89-98`.
**Flaw:** The current handler (post-Implementation 1 fix per the closeout in the source report) does NOT accept a caller-supplied `id`:

- `tools/learning-loop-mastra/tools/handlers/meta-state-report-tool.js:14-26` — handler destructures a fixed list of parameters; `id` is NOT among them.
- `tools/learning-loop-mastra/tools/handlers/meta-state-report-tool.js:28` — auto-id generation happens here.
- `tools/learning-loop-mastra/tools/handlers/meta-state-report-tool.js:89` — is `await writeEntry(root, entry);` — the entry has the auto-generated id.
- `tools/learning-loop-mastra/tools/handlers/meta-state-report-tool.js:91-98` — `appendGateLog(...)` — no id manipulation.

The plan's "auto-generated id — wrapped in Phase 2" citation of lines 89-98 points to `writeEntry` and the gate-log append; the actual id generation is at line 28. The wrapper `assertinvariant(() => writeEntry(...), { accept: (pre) => result.id === generated_id })` is incoherent: `generated_id` is local to the handler closure, the wrapper is at the top level of `assertinvariant`, and there is no caller-id-overwrite vector to guard against in the current code (the finding `meta-260619T2237Z` describes the OLD bug, now closed by the schema accepting only the handler's destructured params).

**Failure scenario:**
1. Phase 2 step 2 begins; implementer wraps lines 89-98 with `assertinvariant`.
2. The wrapper fires on every report, sees `result.id === generated_id` (trivially true), returns `{ok:true}` — zero protective value.
3. Implementation 1's schema-stripping is the actual fix; the plan's "wrap" is a phantom test that pads the test count without testing behavior.

**Evidence:**
- `tools/learning-loop-mastra/tools/handlers/meta-state-report-tool.js:14-26` (handler destructure — no `id`)
- `tools/learning-loop-mastra/tools/handlers/meta-state-report-tool.js:28` (where `id` is actually generated)
- `tools/learning-loop-mastra/tools/handlers/meta-state-report-tool.js:89,91-98` (what was cited — incorrect)
- Finding `meta-260619T2237Z-the-meta-state-report-mcp-tool-silently-overwrites-an-operat` description (notes "[closeout 2026-07-10] KEEP-OPEN (LIVE)"; closeout text references old handler at lines 14-25 — also stale; current code at lines 14-26 has no `id` in destructure)

**Suggested fix:** Drop Phase 2 step 2 entirely; the bug it aims to close (`meta-260619T2237Z`) requires a different fix (honor caller-supplied id or reject it with a clear error), not a wrapper. If the operator wants the wrapper, properly cite the line range and explain what invariant it guards in the current code.

---

## Finding 6: Plan's `accept` signature is incoherent — snapshot-based predicate and pre-only predicate cannot share one signature

**Severity:** High
**Location:** Phase 1, Architecture block (phase-01:55-83)
**Flaw:** The architecture block declares:

```js
@param {(pre: any) => boolean | Promise<boolean>} context.accept - predicate
  evaluated on the pre-state snapshot; returns false on violation
```

But the implementation code at phase-01:62-66 does:

```js
const pre = await accept.snapshot?.() ?? null;
const result = await operation();
const violated = !(await accept(pre));
```

This treats `accept` as an OBJECT with `.snapshot` method, not as a function. Then calls `accept(pre)` with `pre=null`. The signature annotations (`(pre: any) => boolean | Promise<boolean>`) don't match the runtime shape (object with `.snapshot()` and callable). The plan text (§ Architecture) tries to gloss this with "The wrapper's `accept` predicate is composable: a snapshot-based predicate captures pre-state (`accept.snapshot`) and compares pre/post; a pre-only predicate enforces pre-conditions before the operation runs." — but a single signature cannot do both.

**Failure scenario:**
1. Phase 1 step 3 wire `updateEntry`: implementer passes `accept: (pre) => pre.entry_kind === pre.entry_kind` (intending a snapshot-based predicate). The wrapper checks `accept.snapshot?.()`. `accept` is a function, has no `.snapshot`, so `pre = null`. Then `accept(null)` runs — comparing `null.entry_kind` — throws TypeError, throws an unhandled exception, operation aborts without applying or rolling back.
2. Phase 1 step 5 wire `deleteEntry`: plan specifies pre-only predicate "this is a deleteable entry before the operation runs". Implementer passes `accept: (entry) => entry.entry_kind !== "protected"`. Same `.snapshot` issue — `pre=null`, then `accept(null)` checks `null.entry_kind` — throws.

**Evidence:** Plan phase-01:55-83 (architecture block, signature + code don't agree).

**Suggested fix:** Split into two distinct signatures: `assertinvariant(operation, { snapshot, compare, returnOnFail, logTo })` for snapshot-based invariants, and `assertprecondition(operation, { predicate, returnOnFail, logTo })` for pre-only invariants. Pick one and document the contract.

---

## Finding 7: Plan underestimates test-file blast radius for `IMMUTABLE_PATCH_FIELDS` removal

**Severity:** High
**Location:** Phase 1, "Modify" lists and Phase 1, Success Criteria
**Flaw:** Plan claims only `__tests__/legacy-mcp/meta-state-batch-tool.test.js` and `__tests__/legacy-mcp/meta-state-patch-entry-kind-invariant.test.js` are affected test files. Actual grep finds FOUR test files plus two handlers:

- `tools/learning-loop-mastra/tools/handlers/meta-state-patch-tool.js:7,14,74-91` — handler-side deny-list usage (Finding 1).
- `tools/learning-loop-mastra/tools/handlers/meta-state-supersede-tool.js:10` — comment references deny-list (informational only, but should be updated).
- `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-immutable-fields.test.js:33,45-50` — explicitly asserts `parsed.immutable_fields` matches `[...IMMUTABLE_PATCH_FIELDS]` exactly. This test will fail the moment the set is modified.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/change-log-operation-envelope.test.js:272,301,343,365` — uses `immutable_field` rejection assertions across multiple test bodies.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-batch-tool.test.js` (multiple).
- `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-patch-entry-kind-invariant.test.js` (mentioned).

The plan § Phase 1, success criteria says "Pre-existing `meta-state-batch-tool.test.js` and `meta-state-patch-entry-kind-invariant.test.js` still pass" — but does not mention `meta-state-patch-immutable-fields.test.js` or `change-log-operation-envelope.test.js`. The latter two tests will fail with `expected reason: 'immutable_field'` assertions if the deny-list reject path is removed.

**Failure scenario:**
1. Plan removes `IMMUTABLE_PATCH_FIELDS` deny-list at `meta-state.js:339-352` and the `case "write"` envelope reject at `meta-state.js:840-844`.
2. `meta-state-patch-immutable-fields.test.js:50` asserts `[...parsed.immutable_fields].sort() === [...IMMUTABLE_PATCH_FIELDS].sort()` — but the deny-list no longer exists at meta-state-patch-tool.js:81 and the imported `IMMUTABLE_PATCH_FIELDS` is empty/undefined.
3. `change-log-operation-envelope.test.js:301,343` asserts `result.reason === "immutable_field"` — but batch now returns a wrapper failure shape `{ok:false, reason:"identity_violated"}`, not `{applied:0, failed_at:N, reason:"immutable_field"}`.
4. Tests fail loudly; the plan has no rewrite strategy for these specific tests.

**Evidence:** grep results for `IMMUTABLE_PATCH_FIELDS` and `immutable_field` across the handlers and tests directories.

**Suggested fix:** Enumerate every test that asserts `immutable_field` rejection or `[...IMMUTABLE_PATCH_FIELDS]` equality; rewrite each to assert the wrapper's exact failure shape (or keep the deny-list for those codepaths and remove only on the batch path).

---

## Finding 8: `case "write"` envelope reject removal + wrapper for `operation_envelope` — design gap

**Severity:** High
**Location:** Phase 1, step 9 ("Remove the `case "write"` reject for caller-supplied envelopes at `core/meta-state.js:840-844`")
**Flaw:** Phase 1 step 9 removes the `case "write"` reject at `meta-state.js:840-844` because "the wrapper's before/after `operation_envelope` check (the wrapper rejects any change to the field, regardless of caller-supplied vs auto-emit)". But:

- For `case "write"`, the entry is NEW (no pre-state `operation_envelope`), so "before/after comparison" can't reject a caller-supplied envelope on a write op. The wrapper is a no-op for the write forge vector.
- The `case "write"` reject was added specifically to close red-team finding 6 from Implementation 2: a forge vector where `meta_state_batch({operations:[{op:"write", entry:{entry_kind:"change-log", operation_envelope:{...}}}]})` injects a fake envelope.
- Step 9 removes this protection assuming step 6's wrapper covers it. Step 6's wrapper cannot cover it.

**Failure scenario:**
1. Plan removes `case "write"` reject at `meta-state.js:840-844`.
2. Attacker calls `meta_state_batch({ops:[{op:"write", entry:{id:"x", entry_kind:"change-log", operation_envelope:{kind:"migration", target:"...", post_count:..., content_hash:"sha256:..."}}}]})`.
3. `metaStateBatch` enters `case "write"` branch (line 830-846). No pre-state to snapshot. Wrapper is a no-op. Entry is pushed with caller-supplied operation_envelope.
4. Registry now contains a forged change-log with a fake envelope. Tests asserting `auto-emitted` vs `caller-supplied` cannot distinguish.

**Evidence:** `tools/learning-loop-mastra/core/meta-state.js:840-844` (the reject being removed); red-team finding context in source report § Implementation 2 closeout.

**Suggested fix:** Either keep `case "write"` reject (do not remove), or extend the wrapper to take a per-op predicate that catches caller-supplied envelopes on writes: `accept: ({op}) => !(op.op === "write" && op.entry?.entry_kind === "change-log" && op.entry.operation_envelope !== undefined)`.

---

## Finding 9: `rule-assertinvariant-at-boundary` regex false-positives on test mocks and unrelated `export function` declarations

**Severity:** Medium
**Location:** Phase 3, step 1 ("Promote `rule-assertinvariant-at-boundary`")
**Flaw:** The regex at phase-03:30-32 is:

```
^export\s+(async\s+)?function\s+(writeEntry|updateEntry|archiveEntry|deleteEntry|metaStateBatch|assertinvariant)\s*\(
```

This matches ANY file in the project with `export function updateEntry(...)` etc. — including test mocks, demo scripts, and unrelated utility files. The plan § Phase 3 Risk Assessment acknowledges "False positives are acceptable" but doesn't estimate the false-positive volume:

- `__tests__/` directory likely contains fixtures that stub the same function names.
- Test files importing from core and re-exporting for mocking.
- The `__mocks__/` directories (if any) generate literal copies.

Plan acknowledges false positives but the consult-side hint fires on each "did you wrap?" — in a project with ~1800-2000 tests and many test files, every `git commit` may trigger 5-10 false positives.

**Failure scenario:**
1. Maintainer adds `export function listOpenFindings()` to `core/query-drift.js` — out of scope; consult hint fires (false positive). Maintainer ignores.
2. Test fixture `__tests__/fixtures/mock-update-entry.js` exports `function updateEntry(...)` — consult hint fires on every commit that touches the test file (every test edit = noise).
3. Over time, consult hints accumulate. Agent learns to ignore the lint — universal-scope coverage degrades precisely when the wrapper should be loudest.

**Evidence:** Plan phase-03:30-32 regex. No `applies_to.tools` constraint in the rule spec.

**Suggested fix:** Constrain the rule's `applies_to.tools` or `applies_to.surfaces` to `core/meta-state.js` + `core/operation-invariant.js` (the only files the wrapper should be invoked in). Use `pattern_type:"glob"` with `core/meta-state.js` + `core/operation-invariant.js` as paths. False positives drop to zero.

---

## Finding 10: Plan cite for `core/file-readers.js#L10` contradicts the cite for `:47-48` — different lines

**Severity:** Medium
**Location:** Phase 2, step 1 ("Wrap `core/file-readers.js#L10` lookup") and plan frontmatter (`core/file-readers.js:47-48 (silent `continue`)`)
**Flaw:** Two different line citations refer to the same surface:

- `core/file-readers.js:10` — `const AFFECTED_SYSTEM_TO_CONSTRAINTS = { vnstock: [...] }` (the map declaration).
- `core/file-readers.js:47-48` — the actual silent `continue` (`if (!constraints) continue;` at line 48).

Phase 2 step 1 says "wraps `core/file-readers.js#L10` lookup" — there is no "lookup at line 10". The lookup is at lines 33-66 (`readRuntimeObservations`), specifically line 47 (`AFFECTED_SYSTEM_TO_CONSTRAINTS[entry.affected_system]`) and 48 (`if (!constraints) continue`).

**Failure scenario:** Implementer reads step 1, opens file at line 10, finds the map declaration — wraps the map (which is a constant; wrapping a constant is nonsensical). Or wraps the wrong surface entirely.

**Evidence:** `tools/learning-loop-mastra/core/file-readers.js:10-12` (map); `:46-48` (lookup + continue).

**Suggested fix:** Standardize the cite. The lookup is `:47-48`. The map is `:10-12`. Pick one and update both the step text and the frontmatter.

---

## Finding 11: Plan duplicates Phase-1 wrapper coverage at `meta-state-log-change-tool.js` without analyzing interaction with `assertWriteVisible` and Zod `.strict()`

**Severity:** Medium
**Location:** Phase 1, step 10 ("Wire into `tools/handlers/meta-state-log-change-tool.js` — assert `entry.operation_envelope` is unchanged after `writeEntry`")
**Flaw:** The handler already has THREE guards before/after the planned wrapper invocation:

- `meta-state-log-change-tool.js:36` — `metaStateChangeEntrySchema.pick(MIGRATED_FIELDS).strict()` — Zod rejects unknown fields. Caller-supplied garbage fails before any write.
- `meta-state-log-change-tool.js:76` — `await writeEntry(root, entry)` — core writeEntry validates against full schema (line 636).
- `meta-state-log-change-tool.js:82-99` — `assertWriteVisible(root, id, ...)` — re-reads after write; surfaces silent-persistence-fail.

The plan adds a FOURTH guard (`assertinvariant` wrapping `writeEntry` asserting `entry.operation_envelope` is unchanged). This is "defense in depth" but the four guards have overlapping failure shapes:
- Zod `.strict()` failure → zod error (thrown)
- writeEntry validation failure → `InvalidEntryError` (thrown)
- assertWriteVisible failure → `WriteNotVisibleError` (thrown) caught, returned as `{logged:false, ok:false, reason:"write_not_visible"}`
- assertinvariant failure → returned as `{ok:false, reason:"identity_violated"}` (NOT thrown)

The handler's existing catch block (line 84-99) only handles `WriteNotVisibleError`. The wrapper's `{ok:false, ...}` return value is ignored — handler proceeds to `appendGateLog` and returns `{logged:true}` with the corruption un-flagged.

**Failure scenario:**
1. Wrapper is added to log-change-tool.js per Phase 1 step 10.
2. Call enters log-change handler.
3. `await assertinvariant(() => writeEntry(root, entry), { accept: pre => pre.operation_envelope === post?.operation_envelope })` — wrapper returns `{ok:false}` because some upstream mutation rotated the envelope.
4. Handler ignores the `{ok:false}` return (only catches `WriteNotVisibleError`).
5. Handler returns `{logged:true, id, entry_kind:"change-log", ...}` — silently masks the violation.

**Evidence:** `tools/learning-loop-mastra/tools/handlers/meta-state-log-change-tool.js:36,76,82-99` (three existing guards + incomplete catch).

**Suggested fix:** Either (a) drop Phase 1 step 10 (the three existing guards already cover the forge vector; this is redundant work), OR (b) extend the catch block to handle the wrapper's failure shape — but then the handler's wire shape diverges from sibling tools.

---

## Summary

| # | Severity | Confidence | Fix complexity |
|---|----------|------------|----------------|
| 1 | Critical | High | High |
| 2 | Critical | High | Medium |
| 3 | Critical | High | Medium |
| 4 | High | High | Medium |
| 5 | High | High | Low |
| 6 | High | High | Medium |
| 7 | High | Medium | Medium |
| 8 | High | High | Low |
| 9 | Medium | Medium | Low |
| 10 | Medium | Low | Low |
| 11 | Medium | High | Low |

**Top 3 blockers (must address before PR):**
1. Finding 1 (`IMMUTABLE_PATCH_FIELDS` removal + patch-tool deny-list uncoupling).
2. Finding 2 (`case "write"`/`case "delete"` have no pre-state).
3. Finding 3 (snapshot-vs-lock ordering race).

**Plan compliance problems (factual citation errors):**
- Finding 5 (line 89-98 wrong cite)
- Finding 10 (line L10 vs :47-48 inconsistent)
- Finding 4 (fabricated files)

**Architectural incoherences (would create rework in code review):**
- Finding 6 (`accept` signature mismatch)
- Finding 9 (rule regex fan-out)
- Finding 11 (overlapping guards)

**Plan completeness gaps:**
- Finding 7 (test-file blast radius under-estimated)
- Finding 8 (`case "write"` reject removal without substitute)

**Status:** Implementation should NOT proceed as written. Critical findings (1, 2, 3) require structural rewrite of the wrapper contract and a separate decision on how `meta_state_patch` interacts with `updateEntry`'s wrapper.
