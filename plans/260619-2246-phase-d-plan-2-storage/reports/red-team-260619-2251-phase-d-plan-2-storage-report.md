# Red-Team Review — Phase D Plan 2 (Mastra LibSQL Storage)

**Type:** red-team (adversarial review)
**Date:** 2026-06-19
**Scope:** `plans/260619-2246-phase-d-plan-2-storage/`
**Reviewer:** code-reviewer (red-team mode)
**Plan status at time of review:** pre-validation draft (post-write, pre-consistency-sweep)
**Verdict:** REJECT-WITH-REVISIONS

---

## Verdict

**REJECT-WITH-REVISIONS.** The plan is architecturally sound (Storage/Memory/Meta-state boundary locked, `mkdirSync` + `connection_limit=1` + `:memory:` fallback, Q1.A verification step, 2 new workflows for the integration test, 6-test mixed-mode parity harness). The issues are **factual wiring errors against the installed Mastra version** (Pattern A1 doesn't work; the constructor doesn't accept `mastra`), **arithmetic inconsistencies** (test count math + namespace count + `pnpm test` glob don't match across phases), and **cold-session test compatibility** (the plan doesn't account for how `cold-session-discoverability.test.cjs:67-77` reads the legacy `tools/learning-loop-mcp/tools/manifest.json`, not the mastra one). All addressable in 1-2 hours of plan editing without changing architecture.

**Approval requires:**
- **BLOCKER #1:** Pattern A1 wiring (Phase 4 step 3 Edit C) is **factually wrong** — `MCPServerConfig` does NOT accept `mastra`. The plan's `verify` step (`grep -n "mastra" node_modules/@mastra/mcp/dist/server/server.d.ts`) returns zero matches. Fix the wiring pattern to use `mastra.__registerMastra(server)` or pass storage into the server via `Mastra.mcpServers` and let the Mastra instance own it. Document the verified wiring at Phase 4 step 3.
- **BLOCKER #2:** Test count math is internally inconsistent. Plan claims +6 tests / 11 namespaces total, but Phase 3's 5 direct unit tests live in `storage-workflow-direct.test.js` (a new file / new namespace). Net is +11 tests / 12 namespaces, not +6 / 11. Reconcile.
- **BLOCKER #3:** `pnpm test` glob (`package.json:17`) only matches `*.test.js` under `tools/learning-loop-mastra/__tests__/`. The new `storage-parity.test.cjs` (and the existing `workflow-parity.test.cjs`) are **not picked up by `pnpm test`** today. Plan 5 step 7 claims this is fixed but the diff in that step adds a new glob entry for `*.test.cjs` — confirm the existing `workflow-parity.test.cjs` is in the new glob (it should be). Verify before approving.
- **BLOCKER #4:** Cold-session test reads legacy `tools/learning-loop-mcp/tools/manifest.json`, NOT the mastra manifest. Plan 6 step 3's claim that "the 2 new `run_workflow_storage_*` tools appear automatically (manifest-driven registration in `server.js`)" — the cold-session test (line 68) reads the legacy file, not the mastra server's `tools/list`. Plan 1's red team (BLOCKER #2) closed this by updating the legacy manifest in Phase 1. Plan 2 doesn't account for the cold-session test at all in its file list.

After these 4 BLOCKERs are fixed, the plan moves to APPROVE-WITH-MINORS.

---

## BLOCKER Summary

| # | Issue | Fix |
|---|-------|-----|
| **1** | Phase 4 Pattern A1 wiring (`new LoopMCPServer({ ..., mastra })`) does NOT match installed Mastra. `MCPServerConfig` lacks `mastra`. | Read `node_modules/@mastra/core/dist/mcp/types.d.ts:220-285` and `index.d.ts:42`. Either (a) construct `Mastra({ storage, mcpServers: { 'learning-loop-mastra': new LoopMCPServer(...) } })` and let `Mastra.__registerMastra(server)` wire it post-hoc; or (b) drop `mastra` from the `LoopMCPServer` constructor arg and call `server.__registerMastra(mastra)` after construction. Document the verified wiring at Phase 4 step 3. |
| **2** | Test count math: +6 / 11 namespaces vs. actual +11 / 12 namespaces. | Either (a) merge Phase 3's 5 direct tests into `storage-parity.test.cjs` as Tests 7-11 (consolidating into 11 tests / 1 new namespace); or (b) keep the 5 tests in a separate file but update count math to "+11 tests / 12 namespaces" consistently across plan.md, Phase 5, Phase 6, and the PR body. Phase 3's `storage-workflow-direct.test.js` is named explicitly in Phase 3 step 1; the Whole-Plan Consistency Sweep claims a resolution that doesn't match the file structure. |
| **3** | `pnpm test` glob doesn't pick up `.test.cjs` under `tools/learning-loop-mastra/__tests__/`. | Verify the new glob entry Phase 5 step 7 adds (`'tools/learning-loop-mastra/__tests__/*.test.cjs'`) covers both `storage-parity.test.cjs` AND the existing `workflow-parity.test.cjs`. Add a verification command (grep for the existing file in the glob expansion). |
| **4** | Cold-session test reads legacy manifest, not mastra `tools/list`. Plan 6 doesn't address this. | Either (a) confirm Plan 1's Phase 1 closure of this gap (legacy manifest updated to 31 entries) is still in place; (b) verify the cold-session test now reads from the mastra server (per Plan 1 closeout); or (c) add a Phase 4 step that confirms `cold-session-discoverability.test.cjs:67-77` resolves against the post-Plan-2 surface. Plan 2 doesn't make this explicit. |

---

## Dimension 1 — Q1 Conflict Resolution

**Status: ACCEPTABLE WITH CAVEAT.**

**Q1.A — `storage.set/get` vs `storage.stores.<table>.save/get`:** correctly resolved as a Phase 2 verification step (read `node_modules/@mastra/libsql/dist/storage/index.d.ts` at author time). The 5 direct unit tests + 6 parity tests cover both API shapes via integration; the API surface decision is exercised in code, not in plan prose. **Good.**

**Q1.B — In-memory fallback wording:** correctly updated from brainstorm's `file::memory:?` to `url: ':memory:'` per Mastra docs. Phase 2 step 4 builds the URL from `MASTRA_STORAGE_DRIVER`. **Good.**

**Caveat — Q1.A fallback under `memory` driver.** Phase 5 Test 3 skips on `memory` driver. Phase 5 Test 4 (cross-process MCP integration) does NOT skip on `memory` — but Test 4's contract is "data persists across server restart," which is impossible under `:memory:` (each process has its own db). Plan 6 step 2 acknowledges this and proposes adding a skip in Test 4's `before` (paragraph "Risk Assessment" in Phase 6), but Phase 5 step 4 (the actual test code) does NOT add that skip. The skip appears in Phase 6's risk paragraph, not in Phase 5's test code. **MINOR #1:** Phase 5 step 4 must include the `memory`-driver skip in Test 4's `before`, matching the resolution paragraph in Phase 6.

**MINOR #2:** Phase 1 step 7 sets `MASTRA_STORAGE_DRIVER` in the shell for downstream phases; Phase 5 Test 3 reads it via `process.env.MASTRA_STORAGE_DRIVER`. But Phase 5's Test 4 + Test 6 share `connectMcpServer` which spawns the server with `env: { ...process.env, GATE_ROOT: tempRoot }` — so `MASTRA_STORAGE_DRIVER` propagates correctly. The plan doesn't verify this propagation explicitly. **Add:** in Phase 5 step 4, document that the env var propagates to the server process via `process.env` spread in `connectMcpServer` (`with-mcp-server.js:64`).

---

## Dimension 2 — File Modify / Move Blast Radius

**Status: PARTIAL VERIFICATION.** Plan finds the major file surface (`package.json`, `.gitignore`, `server.js`, `workflows-manifest.json`, `workflow-parity.test.cjs`, new factory + workflows + test files). Plan misses several:

### BLOCKER #4 (above) — cold-session test not addressed

`tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:67-77` reads the **legacy** `tools/learning-loop-mcp/tools/manifest.json` (line 68: `const manifestPath = join(projectRoot, "tools/learning-loop-mcp/tools/manifest.json")`). The plan's success criteria for cold-session (Phase 6 step 3: "the cold-session test enumerates `tools/list` and asserts that all entries in the legacy + mastra manifests register with name/description/schema") describe a test that exists in neither shape — the cold-session test as written enumerates only the **legacy** manifest. Plan 1's red team BLOCKER #2 closed this by updating the legacy manifest. **Plan 2 does not call out this dependency or the verification that Plan 1's closure still holds.**

**MINOR #3:** `tools/learning-loop-mcp/agent-manifest.json` (line 14-23 has `workflow` group with 3 entries: `workflow_generate_prompt`, `workflow_notify_artifact`, `workflow_trigger`). Plan 2's 2 new `run_workflow_storage_*` tools are NOT added to this manifest's workflow group. Per Plan 1 red team MINOR #12 + Phase 4 step 4a (corrected by validation), the workflow group arithmetic must include all 8 migrated workflows + 3 stay-as-createTool + the 2 new storage workflows (after Plan 2). Plan 2 doesn't enumerate this. **Verify** the legacy `agent-manifest.json` workflow group remains at 3 entries after Plan 2 (per Plan 1's "remove 8 in-scope workflow names from legacy" decision) — Plan 2 doesn't add 2 storage workflows here either way. Document the decision.

**MINOR #4:** Plan 4 step 3 adds try/catch to the workflow registration loop:
```js
for (const { file, export: exportName } of WORKFLOW_MANIFEST) {
  let mod;
  try { mod = await import(`./${file}`); } catch (err) { ... continue; }
  ...
}
```
The current `server.js:38-47` does NOT catch import errors (only `if (!wf)` after the import). The 2 new storage workflows import `../storage.js` which imports `@mastra/libsql`. If `@mastra/libsql` install fails (despite Phase 1 verification) or if the data dir is read-only on the CI sandbox, ALL 2 storage workflows fail to import — and the server should still come up with the 8 existing workflows + 31 tools. The try/catch is correct. **Confirm** at author time that the try/catch wraps the `await import(...)` line, not just the export-lookup.

**MINOR #5:** Plan 1 step 7 of Phase 4 says "Smoke test the server via a temp spawn (`timeout 3 node ... server.js 2>&1 | head -5`)." This is a smoke test, not a real test. Plan 1's red team MINOR #10 flagged this pattern; Plan 2 repeats it. **Replace** with a proper test in the parity harness (or remove). The smoke test catches `module-not-found` and constructor errors, but a 3-second timeout is fragile (Mastra cold-start takes ~50-100ms on the smoke test path; if it takes longer, the smoke test gives a false negative).

**MINOR #6:** Plan 5 step 7 adds a glob entry `'tools/learning-loop-mastra/__tests__/*.test.cjs'` to `package.json:17`. This glob change ALSO picks up `workflow-parity.test.cjs` (existing, currently NOT in `pnpm test` per the current glob). **Verify:** confirm that `workflow-parity.test.cjs` runs under `pnpm test` after the glob change. If it was previously run via a separate command, the count math in Plan 6 (1083 → 1089 pass) may be wrong — `workflow-parity.test.cjs` already contributes 9 tests today, and those tests need to be in the 1083 baseline. (Likely true: the baseline 1083 includes `workflow-parity.test.cjs` via some other mechanism; if so, document it. If false, the count math is wrong by 9 tests.)

**MINOR #7:** Phase 1 step 6 creates `.env.example` via `cat >> ... <<'EOF'`. The current project has no `.env.example`. After Phase 1, the file will contain only the storage comment block. **Acceptable** for a fresh file, but consider whether `.env.example` should document other env vars too (or whether storage's comment is sufficient for now). Plan acknowledges "create the file if absent" — YAGNI-correct to leave it storage-only.

---

## Dimension 3 — Factory Shape

**Status: SOUND WITH ONE FACTUAL CORRECTION.**

The factory shape (`storage.js` with `storage`, `getMastraStorage`, `initStorage`, `mkdirSync` at module load, `import.meta.url` for absolute path) is correct and well-documented. The 4 invariant tests cover the right invariants (singleton, id, mkdirSync ran, non-null).

**MINOR #8:** Phase 2 step 1 Test 4 (line 90-97):
```js
test("storage factory: DATA_DIR exists after module load (mkdirSync ran)", () => {
  // Resolve DATA_DIR the same way storage.js does
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const dataDir = join(__dirname, "..", "data");
  assert.ok(existsSync(dataDir), ...);
});
```
`await import(...)` inside a synchronous `test()` callback — this will fail. Either make the test `async () =>` or move the imports to the top of the file. The other tests in the same file use top-level `import`. **Fix:** `test("...", async () => { const { dirname, join } = await import("node:path"); ... })`.

**MINOR #9:** Phase 2 step 3 (Q1.A verification) reads `node_modules/@mastra/libsql/dist/storage/index.d.ts`. If Phase 1 install has not completed yet (out-of-order execution), the file doesn't exist. **Add a precondition:** Phase 2 step 3 first asserts `existsSync("./node_modules/@mastra/libsql/dist/storage/index.d.ts")` and bails with a clear error if not.

**MINOR #10:** Phase 2 step 4 imports `LibSQLStore` from `@mastra/libsql` at module load. If `@mastra/libsql` install fails between Phase 1 and Phase 2 (e.g., a CI re-run with `pnpm install --frozen-lockfile` and a registry hiccup), the import throws and `server.js` cannot start. **Document** the dependency: Phase 1 must complete (commit + lockfile update) before Phase 2.

---

## Dimension 4 — Parity Harness Design

**Status: STRONG WITH TWO ISSUES.**

The 6-test design is correct (4 substrate + 2 MCP, mixed mode, shared `before`, `:memory:` skip for Test 3). The JSONL sidecar boundary is well-documented in the test file header comment. The 2-workflow integration seam is the right pattern (researcher B §4.2).

### BLOCKER #2 (above) — count math vs file structure

The Whole-Plan Consistency Sweep says "Phase 5's file absorbs the 5 direct unit tests" — but Phase 3 step 1 explicitly creates a separate file (`storage-workflow-direct.test.js`) with 5 tests. These cannot both be true. If Phase 3 creates a separate file, the count is +11 tests / 12 namespaces. If Phase 5 absorbs them, Phase 3's "Create: tools/learning-loop-mastra/__tests__/storage-workflow-direct.test.js (5 direct unit tests, no MCP)" line is wrong. **Pick one:**

- **Option A:** Keep the separate file. Update count math: +11 tests (6 parity + 5 direct), +1 namespace (12 total post-Plan 2; was 11). The plan's "all 11 test namespaces pass" sentence becomes "all 12 test namespaces pass." Update Plan 6 step 1's "Expected: 11 namespaces pass" → "Expected: 12 namespaces pass" and the test counts accordingly.
- **Option B:** Absorb into Phase 5. Delete Phase 3's `storage-workflow-direct.test.js` creation line. Add Tests 7-11 to `storage-parity.test.cjs` (substrate-direct unit tests for the 2 workflows, in the same file as the parity tests). Count math stays at +6 / 11 namespaces as currently claimed.

Researcher B §3.1 notes Plan 1's `workflow-parity.test.cjs` "combines direct + MCP" — Plan 1 absorbs everything into one file. Plan 2 should follow the same pattern for consistency. **Recommendation: Option B.** Update Phase 3 step 1 to remove the separate file creation; update Phase 5 step 1 to include Tests 7-11 (5 workflow-direct tests) for a total of 11 tests in `storage-parity.test.cjs`. (Or rename the file: `storage-parity.test.cjs` is fine for both substrate + workflow + MCP layers.)

### Test 4 cross-process integration — does it actually prove what it claims?

**PARTIAL.** Test 4 calls `run_workflow_storage_round_trip` then `run_workflow_storage_read` across server restart. **Critical assumption:** the storage file path is shared across server processes. The plan correctly notes that `DATA_DIR` is `tools/learning-loop-mastra/data` (absolute via `import.meta.url`), NOT keyed off `GATE_ROOT` / `tempRoot`. **Verified at server.js:11** (`__dirname = dirname(fileURLToPath(import.meta.url))` — absolute path resolves correctly regardless of spawn CWD). The test WILL work because both sessions against the same machine share the same `mastra-memory.db`.

**But:** Test 4's cleanup uses `handles.callTool("run_workflow_storage_round_trip", ...)` with `payload: { source: "cleanup" }` (overwrite-with-cleanup-marker). This is **not a delete** — the record persists across test runs. If the test runs twice in CI without manual db cleanup, the second run overwrites with the same id and asserts `payload.source === "session-1"` — the test passes because both writes were in session-1. But Test 4's cleanup at the END overwrites with `source: "cleanup"` — if the next CI run executes Test 4 in a fresh server-1 session, `session-1` writes `source: "session-1"` over `source: "cleanup"`, and session-2 reads back `session-1`. The test passes; but the persistent db accumulates `rec-mcp-001` records. **MINOR #11:** Document that the storage file is gitignored and grows over time; or add a `run_workflow_storage_delete` workflow (YAGNI per Phase 3 risk note — accept the noise).

**MINOR #12:** Phase 5 step 3 Test 4 reuses `tempRoot` across both sessions (good — same `GATE_ROOT` for meta-state isolation), but the storage file is shared across ALL `tools/learning-loop-mastra/data/mastra-memory.db` instances regardless of `GATE_ROOT`. Two parallel CI runs (both writing to `rec-mcp-001`) race on the storage file. **Plan correctly notes** the `connection_limit=1` mutex serializes writes; the race is benign (last writer wins). **Document** in the test header.

---

## Dimension 5 — Server Wiring (CRITICAL)

### BLOCKER #1 (above) — Pattern A1 is factually wrong

Verified against installed Mastra source:

`node_modules/@mastra/core/dist/mcp/types.d.ts:220-285`:
```ts
export interface MCPServerConfig<TId extends string = string> {
    name: string;
    version: string;
    tools: ToolsInput;
    agents?: Record<string, Agent>;
    workflows?: Record<string, Workflow>;
    id?: TId;
    description?: string;
    // ... fga, repository, releaseDate, isLatest, packageCanonical, packages, remotes
    // NO mastra field
    // NO storage field
}
```

`node_modules/@mastra/core/dist/mcp/index.d.ts:42`:
```ts
mastra: Mastra | undefined;
```
Set post-construction via `__registerMastra(mastra)` at line 81.

**Plan Phase 4 step 3 Edit C** (line 105-117):
```js
const server = new LoopMCPServer({
  id: "learning-loop-mastra",
  // ...
  mastra,  // NEW ← NOT IN MCPServerConfig
});
```
**This will fail with `MCPServerConfig does not expect mastra`** if Mastra's runtime validates the constructor. If it doesn't validate (silently ignores unknown fields), the `mastra` is dropped and storage wiring fails downstream.

**Plan Phase 4 step 3 verification command** (line 132-136):
```bash
grep -n "mastra" /home/datguy/codingProjects/learning-loop-template/node_modules/@mastra/mcp/dist/server/server.d.ts | head -20
```
**Result: zero matches.** (Verified during this review.) The grep returns nothing, which means the verification command itself signals "Pattern A1 doesn't work" — but the plan treats that outcome as Pattern A2 fallback (post-hoc `setStorage`), which is ALSO factually wrong against `MCPServerBase`. There is no `setStorage` method.

**Correct wiring (the two options):**

**Option 1 (Mastra owns storage, MCP server is hosted by Mastra):**
```js
import { Mastra } from "@mastra/core";
import { storage, initStorage } from "./storage.js";

await initStorage();

const server = new LoopMCPServer({ id, name, version, description, tools, workflows });
const mastra = new Mastra({
  storage,
  mcpServers: { "learning-loop-mastra": server },
});
// server.__registerMastra(mastra) is called implicitly by Mastra constructor
```

**Option 2 (standalone server, register post-hoc):**
```js
await initStorage();

const mastra = new Mastra({ storage });
const server = new LoopMCPServer({ id, name, version, description, tools, workflows });
server.__registerMastra(mastra);
// OR: mastra.__registerMCP("learning-loop-mastra", server) (if such method exists — verify)
```

Either way, **Pattern A1 as written is broken.** Fix this BEFORE approval. The wiring change is small (~5 lines), but the plan's prose and verification step both need updating.

**MINOR #13:** Plan Phase 4 step 3 has the correct *intent* — Mastra owns storage, MCPServer reads via `mastra.getStorage()`. The mechanism (constructor vs post-hoc) is the issue. **Document the verified wiring pattern in the plan** with the actual installed types as evidence.

---

## Dimension 6 — Test Count Math + Closeout (CRITICAL)

### BLOCKER #2 (above) — count math vs file structure

The Whole-Plan Consistency Sweep says:
> "**Test count math:** Plan 2 adds 6 tests (Phase 5) + 5 direct unit tests (Phase 3). The 5 Phase 3 tests live in a new file (`storage-workflow-direct.test.js`) which is a 12th namespace, OR they fold into `storage-parity.test.cjs` (the existing plan was 11 namespaces total). **Resolution: Phase 5's file absorbs the 5 direct unit tests** ... Net: **+6 tests, 11 namespaces total.**"

But Phase 3 step 1 (line 99) creates a separate file:
> "**Create:** `tools/learning-loop-mastra/__tests__/storage-workflow-direct.test.js` (5 direct unit tests, no MCP)"

And Phase 3 step 1's code block (lines 105-200) writes a full 5-test file with `before`, `import` of the 2 workflows, and 5 test cases. This file is NOT deleted by the plan; it's expected to live.

**Net:** if the file lives, count math is +11 tests / 12 namespaces, not +6 / 11. If the file doesn't live (Phase 5 absorbs), Phase 3's "Create" line is wrong.

The plan picks "Option B" (absorb) but doesn't update Phase 3 to match. **Pick one and update all 7 files consistently.** Recommendation: Option B (absorb into `storage-parity.test.cjs`), then delete Phase 3's `storage-workflow-direct.test.js` creation line.

### BLOCKER #3 (above) — `pnpm test` glob doesn't pick up `.test.cjs`

`package.json:17`:
```json
"test": "node --test 'tools/learning-loop-mcp/__tests__/*.test.js' 'tools/learning-loop-mcp/core/__tests__/*.test.js' ... 'tools/learning-loop-mastra/__tests__/*.test.js' '.claude/coordination/__tests__/*.test.cjs' '.factory/hooks/__tests__/*.test.cjs'"
```

The `tools/learning-loop-mastra/__tests__/*.test.js` glob does NOT match `.test.cjs` files. Currently `workflow-parity.test.cjs` (Plan 1) and the planned `storage-parity.test.cjs` (Plan 2) are NOT picked up by `pnpm test`.

Plan 5 step 7 adds `'tools/learning-loop-mastra/__tests__/*.test.cjs'` to fix this for `storage-parity.test.cjs`. But the existing `workflow-parity.test.cjs` ALSO needs to be in the glob. After Phase 5 step 7's glob update, both files are picked up.

**However:** this implies the existing baseline (1083 pass) does NOT include `workflow-parity.test.cjs`'s 9 tests. If so, the baseline is wrong by -9. If the baseline DOES include those 9 tests (via some other mechanism), the plan must explain how.

**Most likely:** the baseline 1083 pass does NOT include `workflow-parity.test.cjs`. After Plan 2's glob fix, the suite gains 9 (workflow-parity) + 6 (storage-parity) = 15 tests. The plan's "+6 tests" claim is then off by 9.

**Verification command:** run `pnpm test` today and count the actual baseline tests. The plan's 1083 may be stale (closed in Plan 1 but the glob wasn't updated then either).

### BLOCKER #4 (above) — cold-session test compatibility

`tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:67-77` reads the legacy manifest, NOT the mastra server's `tools/list`. Plan 6 step 3 claims the cold-session test enumerates `tools/list` from the mastra server — that is **factually wrong against the current test file**.

Per Plan 1's red team BLOCKER #2, Plan 1 closed this by updating the legacy manifest. **Plan 2 must verify that closure still holds** (or risk re-opening it). The plan doesn't address this.

### Other count consistency issues

**MINOR #14:** Plan 6 PR body count matrix shows `Tests skipped | 1 | 2 (+1 conditional on memory driver)`. But Phase 6 step 1 (native driver run) says "1089 pass / 0 fail / 1 skipped" (because native driver doesn't trigger the memory skip). Phase 6 step 2 (memory driver run) says "1088 pass / 0 fail / 2 skipped" (one extra skip because Test 3 skips). **The +1 conditional skip is only present under `MASTRA_STORAGE_DRIVER=memory`.** The PR body line should be: "Tests skipped | 1 (native) / 2 (memory)" or note the conditional explicitly.

**MINOR #15:** Plan Phase 5 step 5 says "Expected: 6/6 pass (or 5/6 + 1 skipped if MASTRA_STORAGE_DRIVER=memory)". But Phase 6 Risk Assessment says "Test 4 ... will FAIL on `memory` driver ... Resolution: Test 4's `before` block checks the env var and skips if `memory` ... Net: 4/6 pass + 2 skip on memory." **Two contradictory resolutions for the memory driver:** Phase 5 says "5/6 + 1 skip"; Phase 6 says "4/6 + 2 skips." Pick one. (Test 4 SHOULD skip on memory because cross-process persistence requires file-backed storage. Resolution: 4/6 + 2 skips on memory driver.)

**MINOR #16:** Plan 6 step 1 says "Expected: 11 namespaces pass." But Plan 2's count is +1 namespace (`storage-parity.test.cjs`); if Phase 3 keeps the separate file, +2 namespaces. **The "11 namespaces" claim is repeated in Plan 6 PR body acceptance sentence and tracker language.** Verify against BLOCKER #2's resolution.

---

## Positive Observations

1. **Storage/Memory/Meta-state boundary is correctly locked.** Plan correctly defers meta-state migration; storage is exclusively Mastra runtime substrate.
2. **`mkdirSync` prerequisite discovery** (Phase 2 step 4) is the right mitigation for `SQLITE_CANTOPEN` errno 14.
3. **`connection_limit=1`** is correct for single-writer MCP server.
4. **Q1.A verification step** is the right escape hatch — verify against installed `.d.ts` at author time rather than guess.
5. **`MASTRA_STORAGE_DRIVER=memory` skip on Test 3** is the right CI safety net; the stderr log message is good CI hygiene.
6. **JSONL sidecar header comment** explicitly disambiguates the sidecar from meta-state migration. Excellent.
7. **2 new storage workflows for the integration test** (researcher B §4.2) is the right minimum viable end-to-end proof; the alternative of skipping Test 4 would leave the wire unproven.
8. **`@mastra/libsql@1.13.0` exact pin** (not `^1.13.0`) is correct — researcher A §1.1 verified `1.14.0` requires `@mastra/core >= 1.42.1`.
9. **Per-plan `meta_state_log_change`** discipline continues (carried forward from Plan 1 process pattern #5).
10. **Count matrix in PR body** is good — the operator can verify the surface change at a glance.

---

## Resolution Tracking

| ID | Severity | Plan file / line | Fix |
|----|----------|------------------|-----|
| **BLOCKER #1** | Critical | `phase-04-4-server-wiring-manifest.md` lines 105-117 (Edit C) and 122-136 (verification) | Replace Pattern A1 with verified wiring (`new Mastra({ storage, mcpServers: {...} })` OR `server.__registerMastra(mastra)` post-hoc). Verify against `node_modules/@mastra/core/dist/mcp/types.d.ts:220-285`. |
| **BLOCKER #2** | Critical | `plan.md` lines 55-66, 145-147; `phase-05` lines 14-19, 96-308; `phase-06` lines 28-29, 65, 73, 129-148 | Either (a) delete Phase 3's `storage-workflow-direct.test.js` creation; or (b) update count math to "+11 tests / 12 namespaces" across all 7 files. Recommendation: (a). |
| **BLOCKER #3** | Critical | `phase-05-5-storage-parity-harness.md` step 7 (lines 366-372); `package.json:17` | Verify the new glob entry covers both `storage-parity.test.cjs` AND `workflow-parity.test.cjs`. Run `pnpm test` post-fix; confirm baseline count. |
| **BLOCKER #4** | Critical | `phase-06-6-acceptance-gate-closeout.md` step 3 (lines 76-81) | Plan 2 doesn't account for `cold-session-discoverability.test.cjs:67-77` reading legacy manifest. Verify Plan 1's closure (legacy manifest updated to 31 entries) is still in place; OR add Phase 4 step that explicitly runs `pnpm test:cold-session` as a Phase 4 gate. |
| MINOR #1 | Minor | `phase-05` Test 4 `before` block | Add `MASTRA_STORAGE_DRIVER=memory` skip in Test 4's `before` (currently only in Test 3's skip). |
| MINOR #2 | Minor | `phase-05` step 4 | Document that `MASTRA_STORAGE_DRIVER` propagates via `connectMcpServer` env spread. |
| MINOR #3 | Minor | `phase-04` step list | Enumerate the `agent-manifest.json` workflow-group decision (stay at 3 entries; new storage workflows are in the mastra server, not the legacy agent manifest). |
| MINOR #4 | Minor | `phase-04` step 3 (try/catch addition) | Confirm the try/catch wraps `await import(...)`, not just the export-lookup. |
| MINOR #5 | Minor | `phase-04` step 7 (smoke test) | Replace 3-second `timeout 3 node ... server.js` smoke with a real test in `storage-parity.test.cjs`, or remove (the cold-session test + workflow-parity test already cover server boot). |
| MINOR #6 | Minor | `phase-05` step 7 (glob update) | Confirm `workflow-parity.test.cjs` is also picked up by the new glob; document baseline count difference. |
| MINOR #7 | Minor | `phase-01` step 6 (`.env.example` creation) | Acceptable; document that the fresh file is storage-only. |
| MINOR #8 | Minor | `phase-02` step 1 Test 4 (line 90-97) | Fix `await import(...)` inside non-async test callback (use `async () => { ... }`). |
| MINOR #9 | Minor | `phase-02` step 3 (Q1.A verification) | Add `existsSync` precondition for `node_modules/@mastra/libsql/dist/storage/index.d.ts`. |
| MINOR #10 | Minor | `phase-02` step 4 (factory import) | Document Phase 1 → Phase 2 ordering dependency. |
| MINOR #11 | Minor | `phase-05` Test 4 cleanup | Document that `rec-mcp-001` accumulates in `mastra-memory.db` across CI runs (gitignored; benign). |
| MINOR #12 | Minor | `phase-05` Test 4 parallel-run race | Document `connection_limit=1` mutex as the benign race resolution. |
| MINOR #13 | Minor | `phase-04` step 3 verification command | Document the verified wiring pattern with installed types as evidence. |
| MINOR #14 | Minor | `phase-06` PR body count matrix | Distinguish native vs memory skipped counts. |
| MINOR #15 | Minor | `phase-05` step 5 vs `phase-06` Risk Assessment | Reconcile the memory-driver skip count (4/6 + 2 skips, not 5/6 + 1 skip). |
| MINOR #16 | Minor | All 7 files | Verify "11 namespaces" claim against BLOCKER #2's resolution. |

**Final state at end of this red-team review:**
- 4 BLOCKERs (1 factual wiring error; 3 count/coverage inconsistencies)
- 16 MINORs (4 in Dimension 4; 6 in Dimensions 2/3/5; 3 in Dimension 6; 3 cross-cutting)
- 0 unresolved contradictions in architecture (Storage/Memory/Meta-state boundary, factory shape, parity harness design, JSONL sidecar boundary)
- Plan is ready for `/ck:cook` AFTER the 4 BLOCKER fixes

---

**Status:** DONE_WITH_CONCERNS
**Summary:** 4 BLOCKERs and 16 MINORs identified across 6 dimensions. BLOCKER #1 (Pattern A1 wiring factually wrong against installed `MCPServerConfig`) is the most critical — the plan's "verification command" returns zero matches, signaling the wiring will not work as written. BLOCKERs #2 and #3 (count math + glob) are addressable in plan editing without changing architecture. BLOCKER #4 (cold-session test compatibility) is the same risk Plan 1 closed; Plan 2 doesn't acknowledge the dependency. Architecture is sound; count/coverage/wiring precision need tightening.
**Concerns/Blockers:** 4 BLOCKERs must be fixed before approval. None require design changes — all are factual corrections against the installed codebase.
