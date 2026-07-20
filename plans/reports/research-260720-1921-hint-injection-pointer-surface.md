# Research: hint-injection pointer surface (SessionStart steering)

Date: 2026-07-20. Read-only scout. Root: worktree `learning-loop-template-meta-260719T2120Z-sessionstart-steering-injection-is-push-dependent-and-silent`.

Headline correction to assignment framing: registry holds **16 discoverability + 10 process = 26 rows** (not "16 process hints"). Every entry already carries `slug` + `suggestion` (one-liner) — pointer builders need no registry schema change.

---

## 1. core/loop-introspect.js — existing hint builders

File: `tools/learning-loop-mastra/core/loop-introspect.js` (867 lines, ESM).

- **`buildDiscoverabilityHints()` — line 121-123.** Zero args, pure, returns `Object.freeze(listHints({kind:"discoverability"}).map(e => e.text))` — frozen array of 16 full-prose strings (no slug/suggestion in output).
- **`buildProcessHints({ rulesById } = {})` — line 148-169.** NOT pure: without `rulesById` it lazy-reads promoted rules from `process.cwd()` via `loadPromotedRules` (line 150-156, kept for the .claude hooks whose cwd = project root). Iterates `listHints({kind:"process"})` in registry order, resolves each via shared `resolveHintText(entry, ruleMap)` (imported from hint-registry.js, line 19), pushes truthy text.
- **Rule-derived skip semantics** (documented lines 132-141 + inline 158-166): `resolveHintText` returns `null` for a rule-derived entry whose rule is missing / inactive / scope-filtered / has no `hint_text`; the entry is **DROPPED** from the returned array. Consumers must never positionally index the shrunk array with registry positions — `loop_get_instruction` anchors to fixed registry order instead (code-review C2 of plan 260717-1826).
- **Tiered reads for loop_describe:** tiers live in the tool handler, not here. This module supplies the pieces: `listAllTools` (41), `listAllRecordTypes` (91), `listAllGatePatterns`, `listPromotedRules` (505), `listActiveFindings`, `listAntiPatterns`, `listLoopDesigns` (528), `readAllEntriesForLineage` (539), `buildRegistrySummary` (691), `buildInverseIndexes` (574), `buildColdTierCache` (549, private). Cache I/O in `core/loop-introspect-cache.js` (`readColdTierCache`/`writeColdTierCache`, imported line 6).
- **Where new pointer builders go:** immediately after `buildProcessHints` (after line 169). They can be pure projections over `listHints` + `resolveHintText` — pattern: same skip semantics, emit `` `${slug} — ${suggestion}` `` per surviving entry. Note rule-derived rows have empty inline `text` but real `suggestion` strings, so pointer output is stable even when rules are inactive IF you choose to keep skipped rows dropped (recommended: mirror buildProcessHints semantics — drop on null text — so pointers never advertise an inactive rule).

## 2. core/hint-registry.js — entry shape

File: `tools/learning-loop-mastra/core/hint-registry.js` (316 lines).

- `HINT_REGISTRY` (line 29-274): frozen array, schema documented lines 15-26: `{ slug, kind: "discoverability"|"process", text, suggestion, derived_from_rule?: string|null }`.
- **CONFIRMED: `slug` and one-line `suggestion` exist on all 26 entries.** 16 discoverability rows (slugs `internalization-rule` … `runtime-agnostic-features`, lines 35-182); 10 process rows (lines 189-273): 8 rule-derived (`text: ""`, resolve from `rule.hint_text`) + 2 standalone (`pnpm-test-discipline` line 189, `file-edit-drift-and-fingerprints` line 257). Suggestions are substantive (registry test enforces `suggestion.length > 20`).
- Helpers: `listHints({kind})` line 280, `findHintBySlug(slug)` line 289, `resolveHintText(entry, rulesById)` line 309.
- Order is load-bearing (line 25-26): registry order = injection order = numeric-index back-compat for loop_get_instruction.

## 3. The two SessionStart hooks — canonical vs shim layout

Canonical sources (ONLY copies in repo — not shimmed):
- `tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs` (323 lines, CJS)
- `tools/learning-loop-mastra/hooks/universal/session-start-inject-process-hints.cjs` (39 lines, CJS)

Runtime wiring:
- `.claude/settings.json` SessionStart block invokes the universal hooks **directly by path** (`node tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs` + `...-process-hints.cjs`) — no `.claude/hooks/` dir exists; no shims for these two.
- `.factory/hooks.json` SessionStart runs `.factory/hooks/loop-surface-inject.cjs` (a separate droid hook that dynamically imports the same core builders — see below). `.factory/settings.json` SessionStart only runs the recurrence shim.
- `.mastracode/hooks.json` SessionStart runs only `recurrence-check-on-start.js` — **no hint injection on .mastracode** (pull-only by design, per hint-renderer.js header).

**Discoverability hook** (the sidecar writer):
- `loadCoreHints()` line 39-62: requires core builders via `require("../../core/loop-introspect.js")` (line 44), returns `{discoverability_hints, discoverability_hints_source, process_hints, process_hints_source}` (+ `_error` on fallback). `SESSION_START_FORCE_HINTS_FAIL=1` test trigger line 41.
- `writeContext(root, payload)` line 177-182: mkdir + write `.claude/session-context.json`.
- `buildContextPayload(...)` line 238-252: sidecar shape (see §4).
- `emitAdditionalContext(hints, source, label)` line 202-208: stdout JSON `{ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } }`; body = numbered list `` `${i+1}. ${h}` `` joined by `\n`, header `Loop ${label} hints (injected at session start; full set also in .claude/session-context.json):`. Called at line 279 with `core.discoverability_hints`. Degraded path emits `unavailable — ${label} loader degraded (source=${source})...` marker. Fatal catch (line 296-323) re-emits marker + writes fatal sidecar.
- Header comment lines 192-196: additionalContext capped at 10k chars by harness; combined sets ~11.8k → the two-hook split rationale (pointer projection invalidates this rationale — single-hook re-merge becomes possible but is out of scope).
- Exports for tests (line 294): `computeDegradedSources`, `formatSessionSummary`, `buildContextPayload`, `loadStaleDispatchHints`.
- **Flip point:** line 279's `emitAdditionalContext(core.discoverability_hints, ...)` — swap the first arg to the pointer array; sidecar path (line 274) untouched. Degraded/fatal paths already emit non-hint markers (unchanged).

**Process-hints hook** (stdout only, no sidecar write):
- Line 25: `require("../../core/loop-introspect.js")` → `buildProcessHints`.
- Line 32-33: `const hints = buildProcessHints(); text = "Loop process hints (...):\n" + hints.map((h,i)=>`${i+1}. ${h}`).join("\n")`.
- Line 34-37 degraded marker: `Loop process hints unavailable: ${err.message}. Inspect .claude/session-context.json process_hints_source.` (`SESSION_START_FORCE_PROCESS_HINTS_FAIL=1` trigger line 29).
- Line 39: same stdout JSON shape.
- **Flip point:** lines 32-33 — call `buildProcessPointers()` instead (needs the same `{ rulesById }`-less cwd semantics; it inherits buildProcessHints' lazy rule read if implemented as a wrapper).

**Third consumer to decide on:** `.factory/hooks/loop-surface-inject.cjs` line 134/143 calls the same two builders and prints full text in `formatBlock` (lines 236-270, sections `--- discoverability_hints ---` / `--- process_hints ---`). Plan scope says "two SessionStart hooks"; if the goal is killing long-paragraph push repo-wide, this droid hook is the same anti-pattern and its tests assert full text (see §7). Flag for plan author: in-scope or explicitly deferred.

## 4. Sidecar `.claude/session-context.json`

- **Writer:** ONLY the discoverability hook — `writeContext` (line 177-182) happy path via line 274; fatal-catch mirror at lines 305-319 (BOTH-write-sites invariant: same key set, `*_source: "fatal"`).
- **Shape** (`buildContextPayload`, lines 238-252): `discoverability_hints` (string[]), `discoverability_hints_source` ("core"|"fallback"|"fatal"), `discoverability_hints_error` (string|null), same trio for `process_hints`, `registry_source`, `registry_error`, `stale_dispatch_hints` ({fixable_candidates, orphan_findings, dispatch_protocol_prompt}), `change_log_gap_hints` ({gap_candidates, gap_protocol_prompt}), `injected_at` (ISO).
- **`*_source` degrade flags semantics:** "core" = loader succeeded; "fallback" = that loader threw and returned empty defaults (silent-degrade made visible, plan 260715-1100); "fatal" = top-level crash, every source flagged fatal to distinguish from per-loader fallback. Stderr summary via `computeDegradedSources` (line 216-222) + `formatSessionSummary` (line 228-230).
- **No in-repo reader** of the sidecar besides tests + the hooks' own marker text pointing at it. Keeping payload unchanged = zero downstream risk.

## 5. loop_get_instruction resolution

File: `tools/learning-loop-mastra/tools/handlers/loop-get-instruction-tool.js`.
- Slug path: `findHintBySlug(key)` against fixed registry (line 51). Numeric path: index into kind-filtered fixed registry arrays (lines 52-58; discoverability 0-15, process 16-25).
- Resolution: `resolveHintText(entry, rulesById)` (line 62); rule unavailable → explicit `{ unavailable }` error (lines 63-70), never shifted content.
- Returns `{ key, index, hint, suggestion, source }` (lines 95-106).
- **CONFIRMED: pointer-projection slugs resolve unchanged** — they ARE the registry slugs. No tool change needed.

## 6. loop_describe cold tier — slot for a field glossary

File: `tools/learning-loop-mastra/tools/handlers/loop-describe-tool.js`.
- Tier branches: summary (69), hot (76), warm (84-136), cold (137-259).
- Cold-tier sections today: `tools`, `record_types`, `gate_patterns`, `substrates`, `rules`, `active_findings`, `all_findings`, `anti_patterns`, `loop_designs`, `superseded_lineage`, `orphans?`, `inverse_indexes`, `findings_with_evidence_code_ref`, `change_logs_with_evidence_code_ref`, `description_mode`, hint blocks via `buildHintBlocks` (line 257), `cache_hit`, `built_at`, `timing`.
- **Natural slot mechanism: YES.** Cold tier is assembled ad hoc (`result.<name> = ...` lines 137-259); adding `result.field_glossary = ...` is a one-line addition in the cold branch. Caution 1: `description_mode === "summary"` remap (lines 248-253) only summarizes the five named arrays — a new array section is NOT auto-summarized (fine if glossary is static text). Caution 2: the sidecar cold cache (`buildColdTierCache`, loop-introspect.js:549-558) caches only `all_entries`/`registry_summary`/`inverse_indexes` — a static glossary needs no cache entry.
- `buildHintBlocks(promotedRules)` lines 29-36 feeds warm (line 134) AND cold (line 257) with FULL text via the two builders. Plan only flips the two hooks — warm/cold `discoverability_hints`/`process_hints` blocks stay full-text unless the plan explicitly extends scope here. Note the warm-tier "16-string invariant" comment at line 127-133 (compaction hook kept separate to preserve it).

## 7. Test inventory — text-asserting (break-risk) vs structural

Hint builders / registry:
- `tools/learning-loop-mastra/__tests__/hint-registry.test.cjs` (8 tests) — registry shape, slug lists, builder order/counts (16/10/26). **Break-risk: LOW** if builders are additive (new pointer builders don't change existing outputs). Asserts `buildDiscoverabilityHints()` returns exactly 16 frozen, `buildProcessHints` 10 (lines 120-128).
- `tools/learning-loop-mastra/__tests__/rule-derived-process-hints.test.cjs` (7 tests) — hint_text schema, renderer≡builder consistency, skip semantics. LOW risk for additive change.
- `tools/learning-loop-mastra/__tests__/hint-renderer.test.cjs` (12 tests) — renderer channels (inspection-only, not on injection path). Asserts full-text markers inside partitions (lines 69-72, 106-110, 180). LOW risk — renderer untouched.
- `tools/learning-loop-mastra/core/loop-introspect.test.js` (6 tests) — inverse indexes only. NO risk.

Hook tests (HIGH break-risk — assert emitted stdout TEXT):
- `tools/learning-loop-mastra/__tests__/legacy-mcp/session-start-inject-discoverability.test.cjs` (14 tests):
  - line 189 test "emits discoverability hints via stdout additionalContext": asserts ≤10k chars, header `Loop discoverability hints`, **full-text marker `meta_state_report`**, **numbering `/^1\. /m` … `/^16\. /m`** (lines 209-215). BREAKS under pointer projection unless updated to pointer format assertions (e.g. slug presence). The 10k assertion and header assertion survive if header text kept.
  - line 221 degraded-marker test: survives (markers unchanged).
  - Sidecar tests (lines 12, 51, 84, 128, 158): structural — arrays non-empty, `*_source` flags, fatal path. SURVIVE if sidecar payload unchanged.
  - 4 `loadStaleDispatchHints` tests (253-371): unrelated. Survive.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/session-start-inject-process-hints.test.cjs` (4 tests, file shows 2 test() blocks):
  - line 12 test: asserts ≤10k, header `Loop process hints`, **full-text markers `pnpm test:iter`, `Do NOT grep raw vitest stdout`, `vitest-failures.sh`**, **numbering `/^1\. /m` … `/^10\. /m`** (lines 30-43). BREAKS — markers live only in full `text`, not in `suggestion` (check: `pnpm-test-discipline` suggestion is "Long-running pnpm test discipline: per-namespace log files, read-loop stop conditions." — contains NONE of the three markers). Test must be rewritten for pointer assertions.
  - degraded-marker test: survives.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/session-start-inject-degraded-sources.test.cjs` (8 tests) — pure-function payload/format tests. SURVIVE if payload unchanged.

loop_describe / loop_get_instruction tests (survive IF warm/cold tiers keep full text):
- `tools/learning-loop-mastra/__tests__/legacy-mcp/loop-describe-warm-tier.test.js` (10 tests) — asserts warm/cold `discoverability_hints.length === 16` and **dozens of full-text substrings** (lines 32-106). Survives only if `buildHintBlocks` keeps calling the full-text builders (plan's stated scope). If plan flips warm tier too, this file needs wholesale rewrite.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/loop-get-instruction.test.js` (12 tests) — slug/index resolution, hint text substrings via tool. Survives (tool unchanged).
- `tools/learning-loop-mastra/__tests__/legacy-mcp/loop-describe-get-instruction-wire-format.test.js` (8 tests) — schema wire format only. Survives.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/cold-session-discoverability.test.cjs` (6 tests) — `buildDiscoverabilityHints()` well-formed: ≥10 hints, string structure, content anchors in joined full text, **<5KB total bytes** (lines 94-127). Survives if full-text builder unchanged.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/consult-checklist-process-hints-coverage.test.js` (1 test) — rule↔registry coverage. Survives.
- `tools/learning-loop-mastra/__tests__/legacy-mcp/mcp-protocol-e2e.test.cjs` + `__tests__/mcp-protocol-e2e.test.cjs` — assert response mentions `discoverability_hints` key only. Survive.
- `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs` — warm tier hint contains `evidence_code_ref`. Survives if warm unchanged.

Factory hook tests (break-risk ONLY if factory hook flips):
- `.factory/hooks/__tests__/loop-surface-inject-format-block.test.cjs` (3 tests) — asserts full-text markers: `To cite a thing, point at the code`, `When you pass \`evidence_code_ref\``, `Test discipline (deterministic parse)`, `PR-body registry deltas` (lines 46-51).
- `.factory/hooks/__tests__/loop-surface-inject.test.cjs` (9 tests) — mostly structural; hint sections presence.
- `tools/learning-loop-mastra/__tests__/factory-hook-single-source.test.cjs` (5 tests) — asserts hook renders canonical hints (line 68-94 compares against builders). If pointer builders replace builder output IN the factory hook, this needs matching updates.

**Summary of must-update tests under stated plan scope (flip 2 .claude hooks only):** the two stdout-TEXT assertions — `session-start-inject-discoverability.test.cjs` line 189 test, `session-start-inject-process-hints.test.cjs` line 12 test. Everything else survives. New tests needed: pointer builder unit tests (slug — suggestion format, skip semantics, count 16/10), hook stdout pointer-format tests.

## 8. Universal-hook sync (shims-in-sync)

- **The two SessionStart hint hooks are NOT part of the shim system.** Shim dirs: `.claude/coordination/hooks/` + `.factory/coordination/hooks/` + `.mastracode/coordination/hooks/` each contain only 4 byte-identical shims (`bash-coordination-gate.cjs`, `inbound-state-gate.cjs`, `recurrence-check-on-start.cjs`, `write-coordination-gate.cjs`) that delegate to `hooks/universal/{bash,inbound}-gate.js` etc.
- Enforcement: `shims-in-sync` checklist item in `tools/learning-loop-mastra/core/runtime-agnostic-checklist.js` (~line 190-225): builds per-surface shim maps from `SHIM_DIRS` (derived from `SURFACES` in `core/surfaces.js` line 16: `[".claude", ".factory", ".mastracode"]`), flags missing shims + sha256 mismatches. Regression tests: `tools/learning-loop-mastra/__tests__/legacy-mcp/runtime-agnostic.test.js` lines 154-191 ("shims-in-sync passes against the real repo (all 3 surfaces, byte-identical)"). Mirror-by-hand convention (checklist description: "mirror by hand, no helper").
- **Plan impact: NONE for the two .claude hooks** — editing them in place in `hooks/universal/` touches no shim and needs no sync. If the plan adds a NEW hook file, shims-in-sync does not auto-require a shim (it only compares what exists), but the `rule-runtime-agnostic-features` agent-checklist + `.claude/settings.json` registration convention should be followed.

---

## Acceptance-criteria answers

- **Add pointer builders:** `tools/learning-loop-mastra/core/loop-introspect.js`, new exports after line 169. Registry already supplies slug+suggestion (no registry edit). Use `resolveHintText`-consistent skip semantics for process pointers.
- **Flip hooks:** `tools/learning-loop-mastra/hooks/universal/session-start-inject-discoverability.cjs` line 279 (emit call only; sidecar line 274 untouched); `tools/learning-loop-mastra/hooks/universal/session-start-inject-process-hints.cjs` lines 32-33. Degraded-marker paths (discoverability 202-208/321; process 34-37) unchanged.
- **Sidecar unchanged:** payload built at discoverability-hook lines 238-252 from `loadCoreHints` (lines 39-62) — leave both alone.
- **Canonical vs shim:** both hint hooks = canonical-only (no shims/copies); wired directly from `.claude/settings.json`. `.factory/hooks/loop-surface-inject.cjs` is a separate canonical droid hook consuming the same core builders (decision needed: flip/defer). `.mastracode` has no hint injection.
- **Test break list (plan scope):** exactly 2 tests assert emitted hint text: `session-start-inject-discoverability.test.cjs:189` and `session-start-inject-process-hints.test.cjs:12`. All other ~70 hint-adjacent tests are structural or target unchanged surfaces (warm/cold tiers, registry, renderer, loop_get_instruction, sidecar).
- **slug+suggestion confirmation:** CONFIRMED present on all 26 registry entries (`hint-registry.js` schema lines 15-26; test-enforced `suggestion.length > 20`). Pointer projection requires zero registry schema work.
- **loop_get_instruction compat:** CONFIRMED — slugs resolve via `findHintBySlug` against fixed registry order; full text stays pullable.

Status: DONE
Summary: The pointer projection is a small, well-bounded change: two new builders in core/loop-introspect.js (registry already carries slug+suggestion for all 26 hints), a one-line flip in each of the two canonical-only universal SessionStart hooks, zero sidecar/loop_get_instruction/shim-sync impact; only 2 tests assert emitted hint text and must be rewritten.
Concerns/Blockers: (1) The droid hook `.factory/hooks/loop-surface-inject.cjs` pushes the same full paragraphs at SessionStart and its tests assert full text — plan must explicitly include or defer it. (2) loop_describe warm/cold tiers also emit full hint text via `buildHintBlocks` (loop-describe-tool.js:29-36) with text-asserting tests in loop-describe-warm-tier.test.js — fine under stated scope, but flag if the plan later extends. (3) Assignment said "16 process hints"; actual count is 16 discoverability + 10 process.
