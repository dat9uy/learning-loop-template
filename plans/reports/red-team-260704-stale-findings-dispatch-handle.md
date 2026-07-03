# Red-Team Review: Stale-Findings Dispatch-Handle Plan

**Plan under review:** `plans/260704-0301-stale-findings-dispatch-handle/`
**Reviewers:** 2 adversarial passes (concurrency/merge + L1/docs/disclosure)
**Date:** 2026-07-04
**Status:** DONE_WITH_CONCERNS (1 CRITICAL, 3 HIGH, 5 MEDIUM, 4 LOW)

---

## Headline: User's Specific Concern IS Real

> "Could this plan solve the problem that pre-commit run the test -> auto update reported to stale which confused the agent?"

**Answer: The user's observation is mechanically true. The plan PARTIALLY addresses it (Phase 1 stops the `stale-ref` follow-up emission) but does NOT address the root cause: a test in the suite calls `meta_state_sweep({apply:true})` against the LIVE registry.**

### B1 · CRITICAL · `pnpm test` mutates the live `meta-state.jsonl`

**Smoking gun:** `tools/learning-loop-mastra/__tests__/legacy-mcp/meta-state-sweep-summary.test.js`

```js
// L9
const root = resolveRoot();               // live project root, no GATE_ROOT override
// L15-18
process.env.OPERATOR_MODE = "1";          // bypasses sweep's operator gate
const result = await metaStateSweepTool.handler({ apply: true });  // LIVE MUTATION
```

**The chain that fires on every `pnpm test` run (which is the pre-commit hook):**

1. `package.json:40-42` — `simple-git-hooks.pre-commit: "pnpm test && pnpm fallow:gate"`
2. `pnpm test` → `node tools/scripts/run-pnpm-test-namespaced.mjs`
3. The `mcp-tests` glob runs `tools/learning-loop-mastra/__tests__/legacy-mcp/*.test.js` (per `run-pnpm-test-namespaced.mjs:31`)
4. **One of those tests** — `meta-state-sweep-summary.test.js` — does NOT isolate `GATE_ROOT`. It calls `resolveRoot()` which returns the live project root (`tools/lib/resolve-root.js:12-14`), then sets `OPERATOR_MODE=1` and calls `metaStateSweepTool.handler({apply:true})`.
5. `metaStateSweepTool.handler` at `meta-state-sweep-tool.js:44-77` runs `checkExpiry` + `checkStaleness` against the live entries. For each past-TTL `reported` entry, `updateEntry` writes back `status:"stale"` to the live `meta-state.jsonl` (via `writeFileSync` at `core/meta-state.js:605-608`).
6. Then for each newly-stale entry, the sweep emits a `stale-ref` follow-up report (lines 94-108). **Until Phase 1 ships, this also pollutes the registry with a `stale-ref` follow-up for every transition.**

**Live state today** (verified by grep against `/home/datguy/codingProjects/learning-loop-template/meta-state.jsonl`):
- 30 `stale-ref` entries: 16 stale + 14 reported
- 14 reported total (all 14 reported entries are `stale-ref`)
- 28 stale total (16 stale-ref + 12 real underlying issues)
- The 14 reported entries have `expires_at` within 24h of now (none past expiry YET, but every `pnpm test` run is a ticking bomb)

**Why the agent gets confused (the user's reported symptom):**
- Agent reports a finding → entry is `status:"reported"`, `expires_at: <now+24h>`
- Agent runs `pnpm test` (manual or via pre-commit)
- The summary test fires sweep on the live registry → reported entry ages to `stale`
- (Plus the follow-up emission adds another `stale-ref` entry — compounding the confusion)
- Agent next session sees: "my finding I just reported is now stale + a new stale-ref follow-up appeared"

### Does the plan solve B1?

**Partially.** Phase 1 step 2 removes the `stale-ref` follow-up emission block (`meta-state-sweep-tool.js:94-108`), which stops the follow-up pollution. **But the reported→stale transition itself is untouched.** Every `pnpm test` run will continue to silently transition past-TTL reported entries to stale on the live registry.

**Required plan addition (advisory):** Phase 1 must also fix the root cause — `meta-state-sweep-summary.test.js` must use `GATE_ROOT=tempDir` like `meta-state-sweep.test.js` does. Either:
- (a) Move the test to use tempDir isolation (best; preserves the "registry-summary.md is NOT written" assertion against the live path is itself dubious — that file would only matter on the live root, but moving to tempDir keeps the assertion meaningful)
- (b) Delete the test (the registry-summary.md assertion is already covered by structural invariants in `cold-tier-regression.test.js`)
- (c) Set `process.env.GATE_ROOT = mkdtempSync(...)` before the sweep call (minimum delta)

This is the load-bearing fix for the user's complaint. Without it, the agent's confusion recurs on every pre-commit run.

---

## Additional Findings (from both reviewers)

### F1 · HIGH · 4th schema site missed
The plan claims `stale-ref` lives at THREE sites: `core/meta-state.js:63`, `:77`, `docs/schemas.md:35`. A FOURTH site exists at `schemas/meta-state.schema.json:21` — the JSON Schema enum is `"[\"gate-logic-bug\", \"record-repair-gap\", \"schema-drift\", \"stale-ref\", \"mcp-tool-missing\", \"budget-check\", \"loop-anti-pattern\"]"`. The plan's grep check ("`grep stale-ref in tools/ + docs/`") misses `schemas/`. The parity contract (`tools/learning-loop-mastra/mastra/schema-parity.js`) is built on Zod parity with this JSON Schema; removing the Zod enum without updating the JSON Schema produces a parity drift that schema-fingerprint tests (`__tests__/schema-fingerprint.test.cjs`) will catch. **Mitigation:** Add `schemas/meta-state.schema.json:21` to Phase 1's modify list; update step 13's grep to include `schemas/`.

### F2 · HIGH · Rec 11 misidentification (closeout will be wrong)
Phase 4 step 7 says "Mark **Rec 11** (re-tighten cap-test threshold) `[DONE]`". The source report's actual Rec 11 is "Operator/agent symmetry (Q11)" — a half-solved CONCEPT question, NOT the cap-test threshold (`plans/reports/from-ck-predict-to-operator-260704-0105-direction-gaps-legacy-cleanup-two-surfaces-reframe-report.md:198`). The plan conflates source-report rec numbers with internal plan numbers. Rec 10 also doesn't appear in the source report's numbering (jumps 8→9→11→12). **Mitigation:** Re-map Rec 10 and Rec 11 to the source report's actual numbering before closeout; or close out only Rec 8 (Rec 10/11 cannot be claimed without re-numbering).

### F3 · HIGH · 2 additional test pins break
Phase 1's "Tests to retarget" list (L33-36) names only `meta-state-sweep-stale-transition.test.js:168`. Two more assertions in the same file will FAIL when the producer is removed:
- L257: `assert.strictEqual(sweepText.stale_reports.length, 3)` — F3 case asserts 3 follow-ups emitted
- L317: `assert.strictEqual(followUps.length, 1, "exactly one follow-up report")` — F4 case asserts 1 follow-up

After Phase 1's `meta-state-sweep-tool.js:94-108` block is removed, `stale_reports` becomes empty and `followUps` length becomes 0. **Mitigation:** Rewrite F3 (L225-269) and F4 (L271-321) to assert "no follow-up emitted" instead of "exactly N follow-ups".

### F4 · MEDIUM · Snapshot fixture leak
`tools/learning-loop-mastra/__tests__/phase-e-foundation/fixtures/meta-state-fixtures.js:22` contains `LEGACY_FINDING_FIXTURE.category: "stale-ref"`. The fixture is consumed by `meta-state-relationships-snapshot.test.js:22` which writes the raw JSON to `meta-state.jsonl` bypassing Zod validation. The test passes today and after Phase 1, but the plan's intent (retarget the fixture) leaves no test of the actual on-disk data. **Mitigation:** Make the retarget explicit (L22 category = `gate-logic-bug` or `loop-anti-pattern`); add the relationships-snapshot test to Phase 1's modify list as a regression-green verification.

### F5 · MEDIUM · Phase 4 dependency is partially artificial
Phase 4 declares `dependencies: [1, 2, 3]` but the doc edits (Phase 4 steps 2-3: deferred-decision statement + explicit-exits set) are implementation-agnostic and could ship after Phase 1 alone. Only step 6 (cross-check exits against shipped tools → `meta_state_dispatch_finding`) and step 7 (Rec 8/10/11 closeout markers) require Phases 2 and 3. **Mitigation:** Split into Phase 4a (doc edits, dependency [1]) and Phase 4b (closeout + cross-check, dependency [1, 2, 3]).

### F6 · MEDIUM · preflight vs OPERATOR_MODE gate divergence
Phase 2's dispatch commit extracts `appendLedgerEvent` from `runtime-state-record-tool.js:59-76`. The extraction drops the preflight marker check at `:50-57`. The two gates are different enforcement surfaces: `runtime_state_record` is preflight-gated (30-min `.loop-preflight-*` marker per surface); the dispatch commit is `OPERATOR_MODE`-gated (env-var). A preflight-installed non-operator agent could bypass the `OPERATOR_MODE` check IF the dispatch tool fell back to `runtime_state_record`'s public tool path. **Mitigation:** Add a test asserting that an agent WITH preflight but WITHOUT `OPERATOR_MODE=1` is refused. Explicitly document the orthogonal gates in Phase 2.

### F7 · MEDIUM · "concurrent-race" test is sequential
Phase 2 step 8 calls two commits "in sequence" — not `Promise.all([commit(), commit()])`. Under true concurrency, both would scan → both see no row → both append → two ledger rows. The runtime-state.jsonl has no write-time uniqueness (`appendFileSync` at `runtime-state-record-tool.js:76`). The CAS on `ledger_ref` patch protects only the finding side; the ledger side can duplicate. **Mitigation:** Either rename the test "idempotent-retry test" to match scope, or add a true-concurrency test with `Promise.all` and assert append-time atomicity at the sidecar (OS-level `O_EXCL` lock or row-level uniqueness hash).

### F8 · MEDIUM · Public-repo disclosure is procedural-only
Phase 2 acknowledges `evidence_code_ref` ships "repo-relative, already as public as the tree" — the entire local code path appears in the issue body. No env-var default constrains `coord_repo`; no allowlist; tool returns `coord_repo_hint: "<private coordination repo>"` as advisory text only. The bash gate does not check the `--repo` argument. If an operator names a public repo, full file paths + `local:meta-state:<id>` pointers + descriptions leak. **Mitigation:** Add a default `coord_repo` to `meta_state_dispatch_finding` (read from `LOOP_DISPATCH_REPO` env); or add a description-rejection check on prepare that flags obviously-public repo names.

### F9 · LOW · 24h TTL race window in migration
Phase 1 step 10 calls `meta_state_supersede` 30 times. The 14 `reported` entries have `expires_at` within 24h. The plan acknowledges "non-atomic" (L77) but specifies no hard precondition. **Mitigation:** Add a hard precondition to step 10: capture the entry list + `expires_at` distribution; assert the earliest `expires_at` is ≥1h from now before starting the 30-call loop.

### F10 · LOW · Citation asymmetry
Phase 2 claims the issue body cites `local:meta-state:<id>`. The dispatch ledger event's `source_ref` is `local:meta-state:<id>` (regex enforced at `runtime-state-record-tool.js:39`), but the FINDING has no inverse back-pointer to the issue body. The body text is invisible to non-loop readers (just text inside a GitHub Issue for humans). **Mitigation:** Document the asymmetry clearly: "the local:meta-state:<id> citation in the issue body is a loop-citable pointer for agents; the issue URL is human-citable. The two are not symmetric."

### F11 · LOW · L1 mechanism drift
Phase 4 plans to add `dispatch` and `supersede` to the explicit-exits set in `docs/loop-engine.md`. The current doc stresses (L5) "implementation-agnostic: it names roles, not mechanisms." The proposed addition names MECHANISMS (tool names like `meta_state_promote_rule`). **Mitigation:** Split: (a) role statement at L1 ("every finding has explicit exits — promote, resolve, re-verify, supersede, dispatch"); (b) tool cross-reference at L2 (`docs/meta-state-lifecycle.md`). Honors the two-surface split.

### F12 · LOW · Vacuous TTL test (c)
Phase 3 TTL test (c) is documented as "vacuously true (no auto-resolve branch)". The dead code at `meta-state-sweep-tool.js:73-76`'s `if (!isStaleTransition)` block is unreachable today (`checkExpiry`/`checkStaleness` only return `"stale"`). The test passes regardless. **Mitigation:** Either accept as "regression-pin: auto-resolve must skip ledger_ref-set entries", or harden with a stub that temporarily patches the sweep tool to write a synthetic `auto-resolved` and asserts the gate catches it.

---

## Positive claims verified by reviewers

- **Phase 4 / `docs/meta-state-lifecycle.md` grep clean for `stale-ref`**: confirmed (covers statuses only, not categories).
- **Status enum is 6-state, no `dispatch`**: confirmed at `core/meta-state.js:88`.
- **`gh` not blocked by `core/patterns.json`**: confirmed; `stripMessageFlags` handles quoted/unquoted bodies.
- **`buildDiscoverabilityHints` exists; no existing `buildStaleDispatchHints`**: confirmed; no duplicate-hint risk.
- **`session-start-inject-discoverability.cjs` writes ONLY `.claude/session-context.json`**: confirmed (L33-39, L43-52 catch path).
- **Pre-flight finding count (30 stale-ref = 16 stale + 14 reported)**: confirmed.
- **All 14 reported entries are stale-ref**: confirmed (`expires_at` within 24h).
- **Sweep tool's dead `if (!isStaleTransition)` branch**: confirmed unreachable in v1.
- **`legacy-handler-adapter.js:12-26` correctly unwraps `{content:[{type:"text", text:JSON.stringify(result)}]}`**: confirmed.

---

## Required Plan Edits (Prioritized)

### P0 — Must address before Phase 1 ships

1. **Fix `meta-state-sweep-summary.test.js`** to use tempDir isolation. The test currently sweeps the LIVE registry on every `pnpm test` run. This is the root cause of the user's reported confusion. The fix is small (5-10 lines), the blast radius is large (every pre-commit run), and the user explicitly flagged this.

2. **Add `schemas/meta-state.schema.json:21` to Phase 1's modify list** (F1). Without this, the parity contract drift will fire on the first CI run after Phase 1 ships.

### P1 — Must address before Phase 4 ships

3. **Re-map Rec 10/11 closeout targets** (F2). Currently the plan writes incorrect `[DONE]` markers against the source report.

4. **Add F3/F4 retarget** to Phase 1's test-pin list (F3). Two additional assertions will fail on first CI run after Phase 1.

### P2 — Should address before considering the plan complete

5. **Split Phase 4 into 4a (docs) and 4b (closeout + cross-check)** (F5). Parallelism improvement; closure phase smaller.
6. **Phase 2: explicit orthogonal-gate documentation + test** (F6). Preflight vs OPERATOR_MODE confusion is a design choice worth surfacing.
7. **Phase 2: rename "concurrent-race" test or make it actually concurrent** (F7).
8. **Phase 2: default `coord_repo` env or content-gate on prepare** (F8).

### P3 — Nice-to-have

9. **Phase 1: hard precondition on `expires_at` distribution** (F9).
10. **Phase 2: document citation asymmetry** (F10).
11. **Phase 4: split L1 role statement from L2 mechanism cross-ref** (F11).
12. **Phase 3: rename test (c) "regression-pin"** (F12).

---

## Verdict on the user's specific question

> "Could this plan solve the problem that pre-commit run the test -> auto update reported to stale which confused the agent?"

**As written, NO.** The plan addresses the symptom (the `stale-ref` follow-up emission) but not the cause (the `meta-state-sweep-summary.test.js` test that calls `metaStateSweepTool.handler({apply:true})` on the live registry during every `pnpm test` run). The user's observation is mechanically accurate — `pnpm test` does auto-update reported entries to stale on the live registry, AND emits `stale-ref` follow-up pollution that compounds the confusion.

**With P0 fix #1 added, YES.** The fix is small, mechanical, and well-scoped. The agent's confusion will be resolved at the source rather than masked downstream.

**Recommend:** Add P0 fix #1 to Phase 1's implementation steps as an explicit step (e.g., "Step 0: Move `meta-state-sweep-summary.test.js` to use tempDir isolation, OR delete the test"). This is a one-line change with high value and should ship with the plan.

Status: DONE_WITH_CONCERNS
Summary: 1 CRITICAL (B1: test mutates live registry), 3 HIGH (schema parity, Rec numbering, additional test pins), 5 MEDIUM, 4 LOW. The user's pre-commit concern is real and not fully addressed by the plan; P0 fix needed.
Concerns/Blockers: P0 fix #1 is a precondition for the plan to actually solve the user-reported confusion.