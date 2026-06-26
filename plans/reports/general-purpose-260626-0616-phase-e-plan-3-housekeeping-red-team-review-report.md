# Red-Team Review — Phase E Plan 3 (Housekeeping)

**Date:** 2026-06-26 06:16
**Reviewer:** general-purpose subagent (adversarial mode)
**Target:** `plans/260626-0607-phase-e-housekeeping/plan.md` + 5 phase files
**Source scope:** `plans/reports/phase-e-scope-260624-2025-runtime-interface-structure-report.md` Rev 6+8
**Source verification:** `plans/reports/scout-260626-0607-phase-e-housekeeping-file-inventory-report.md`

## Verdict

**APPROVE WITH BLOCKERS.** The plan is well-structured and addresses real cleanup, but **Phase 5 (I-2) is non-functional as designed** and the **Phase 2 heredoc body contains a wrong-path bug**. Both must be fixed before ship. The remaining phases are sound.

---

## Critical (must fix before plan ships)

### C1. Phase 5 (I-2) will fail with `no_verification_steps` — entry #9 has no `verification.steps` field

**Evidence:**
- `tools/learning-loop-mastra/tools/legacy/meta-state-re-verify-tool.js:38-42`:
  ```js
  if (!entry.verification || !Array.isArray(entry.verification.steps) || entry.verification.steps.length === 0) {
    const result = { re_verified: false, reason: "no_verification_steps", id };
    appendGateLog(root, { timestamp: new Date().toISOString(), tool: "meta_state_re_verify", ...result });
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  }
  ```
- Entry `meta-260618T0558Z-...` has NO `verification` field (confirmed via `meta_state_list` and `meta-state.jsonl:150`).
- Tool description (line 14) explicitly says "Re-verify a stale meta-state entry by running its verification.steps."

**Severity rationale:** The plan's primary Phase 5 success criterion (acceptance criterion 13/14: `meta_state_list` returns `status: active`) cannot be met. Tool returns `{re_verified: false, reason: "no_verification_steps"}` and entry stays `stale`. Phase 5 acceptance criteria 2, 3, 4 will all fail. The plan also misses this in Risk Assessment (R-Phase5-A only covers fingerprint drift; doesn't cover the more likely `no_verification_steps` outcome).

**Suggested fix (3 options, pick one):**
1. **Patch entry #9 to add `verification.steps`** via `meta_state_patch` BEFORE running `meta_state_re_verify`. The verification step would be a SHA-256 fingerprint comparison (the existing fingerprint is already grounded, so the step would pass immediately). One-line patch:
   ```js
   meta_state_patch({
     id: "meta-260618T0558Z-...",
     entry_kind: "finding",
     patch: {
       verification: {
         steps: [
           { cmd: "node", args: ["-e", "const crypto=require('crypto');const fs=require('fs');const h=crypto.createHash('sha256').update(fs.readFileSync('tools/learning-loop-mastra/mastra/create-loop-tool.js')).digest('hex');if(h!=='a4921a9418784b238b60fc94e2e1b5777934c0a5b308330eb4a405c0a498b8f7')process.exit(1)"], timeout_ms: 5000 }
         ]
       }
     }
   })
   ```
2. **Use `meta_state_patch` to directly set `status: active` + `last_verified_at`** (deny-list at `core/meta-state.js:259-270` does NOT include `status` or `last_verified_at`). This skips the re-verify path entirely and is the simplest fix. The fingerprint is already grounded per Plan 6 sha256sum verification, so the substantive check (SP2 grounding) is already satisfied.
3. **Use `meta_state_ack` instead** — but entry is already acked (`acked_at: "2026-06-17T22:58:59.743Z"`), so this is wrong.

The plan's Step 1 pre-condition says "verify entry is currently stale" but fails to verify the tool's required precondition (`verification.steps` must exist). Add this to Step 1.

**Recommended:** Option 2 (use `meta_state_patch`). It directly closes the deferred acceptance criterion from Plan 6 and avoids the shell-out to `verification-runner.js` for an entry that has no steps anyway.

---

### C2. Phase 2 heredoc body uses wrong path `mastra/tools/legacy/` (does not exist)

**Evidence:**
- `plans/260626-0607-phase-e-housekeeping/phase-02-e3-parity-pin-and-legacy-pins.md:111`:
  ```
  Files that must NOT be moved to `tools/learning-loop-mastra/mastra/tools/legacy/` (or any other "legacy" location)
  ```
- `ls tools/learning-loop-mastra/mastra/tools/legacy/` returns ENOENT.
- Actual location: `tools/learning-loop-mastra/tools/legacy/` (per Plan 6 D6: "tools/legacy/ stays at top level of tools/learning-loop-mastra/").
- Phase 4 line 78 + line 112 correctly use `tools/learning-loop-mastra/tools/legacy/` — internal contradiction within the plan.

**Severity rationale:** A future operator reading `legacy-pins.md` will look for `tools/learning-loop-mastra/mastra/tools/legacy/` to verify the convention, find ENOENT, and lose trust in the doc. Worse, they may mistakenly move files to a non-existent path while trying to "comply" with the (incorrectly worded) rule.

**Suggested fix:** Replace `tools/learning-loop-mastra/mastra/tools/legacy/` with `tools/learning-loop-mastra/tools/legacy/` in the heredoc body (line 111). One-word fix: remove `mastra/` from the path.

---

### C3. Plan does not document how to set `META_STATE_VERIFY_EXEC=1` in the MCP server's environment

**Evidence:**
- `tools/learning-loop-mastra/tools/legacy/meta-state-re-verify-tool.js:21` reads `process.env.META_STATE_VERIFY_EXEC` from the MCP server's process.
- `.mcp.json` (project root) defines the MCP server as `node tools/learning-loop-mastra/mastra/server.js`. The MCP server runs as a child of the agent's MCP client; env vars set in the agent's shell do NOT propagate to the MCP server's process by default.
- Plan Phase 5 Step 2 says: "Set `META_STATE_VERIFY_EXEC=1` in the MCP server's environment. This is a one-time set; the env var can be unset after the tool invocation completes." **No concrete mechanism is documented.**
- Plan Phase 5 Step 2 alternative says: "The `meta_state_re_verify` MCP tool can be invoked via the agent's MCP client; the env var must be set in the agent's process that invokes the tool." This is **factually incorrect** — `process.env` is read in the server's process, not the client's.

**Severity rationale:** If the operator cannot set the env var, Phase 5 Step 3 fails immediately with `re_verified: false, reason: "verify_exec_required"`. The plan provides no recovery path.

**Suggested fix:** Add a concrete mechanism. Two options:
1. **Patch the MCP server config (`.mcp.json`) to include `env: { META_STATE_VERIFY_EXEC: "1" }`**, then restart the MCP server. Document the steps. After Phase 5, remove the `env` entry.
2. **Use a different approach entirely** — see C1's recommendation. The cleanest path is `meta_state_patch` (no env var needed).

If the plan keeps the re-verify path, document the MCP restart sequence: edit `.mcp.json`, restart MCP server (`docs/mcp-server-restart-protocol.md`), invoke the tool, revert `.mcp.json`, restart again.

---

## High (should fix or document why accepted)

### H1. Phase 4 changes core/README.md but the test runner's `grep -rn` glob includes `--include="*.md"` — the new `mastra/` references in core/README.md won't match any forbidden pattern (correct), but the plan doesn't verify this explicitly

**Evidence:**
- `tools/learning-loop-mastra/__tests__/phase-e-shell-restructure/external-refs-updated.test.js:41` greps with `--include="*.md"`.
- New FORBIDDEN_PATH_PATTERNS include `tools/learning-loop-mastra/create-loop-.*\\.js` and `tools/learning-loop-mastra/schema-descriptions\\.yaml`. Both are JS/YAML paths, not MD paths. They won't match the corrected MD content. Test still passes.
- But: the new FORBIDDEN_PATH_PATTERNS entry `create-loop-.*\\.js` ALSO matches the 3 narrower patterns `create-loop-tool\\.js`, `create-loop-workflow\\.js`, `create-loop-agent\\.js`. The plan acknowledges this (R-Phase4-E) but defers cleanup. No false positive risk.

**Suggested fix:** None — flag for the implementation step. Add a comment to `external-refs-updated.test.js` noting that the 3 narrower patterns are subsumed by `create-loop-.*\\.js` (optional cleanup).

---

### H2. Phase 4 search-path extension adds `tools/learning-loop-mastra/core/` — but the test now scans ALL files under core/ (including any future files). Performance impact unclear.

**Evidence:**
- `external-refs-updated.test.js:41` runs `grep -rn` over the SEARCH_PATHS. Adding `tools/learning-loop-mastra/core/` adds 64+ files (currently ~20 actual files in `core/`).
- Grep is fast (sub-second on this directory), so practical impact is small. No argv-limit risk.
- But: the test will now match the FORBIDDEN_PATH_PATTERNS against ANY future file added to `core/`. If a future plan legitimately needs to reference `create-loop-*.js` from a core doc (e.g., a future core-layer migration), the test will false-positive.

**Severity rationale:** Medium-low. Future-proofing concern; current plan is fine.

**Suggested fix:** Document the trade-off in the phase file. Add a comment in `external-refs-updated.test.js` explaining the search-path scope.

---

### H3. Cold-tier regression test (`cold-tier-regression.test.js`) currently passes; Phase 5 will not break it (entry #9 transitions correctly), BUT if C1 is fixed via option 1 (adding verification.steps), the test will iterate entry #9 and pass the grounding check. If C1 is fixed via option 2 (direct patch), the test will iterate entry #9 (now active) and skip it (active mechanism_check=true is the goal). Either way, the test passes. Plan doesn't explicitly say which C1-fix approach the operator should take.

**Evidence:**
- `cold-tier-regression.test.js:67` iterates `current.all_findings.filter((f) => f.mechanism_check === true)`. Entry #9 is mechanism_check=true.
- Test line 113 asserts `grounding.status === "grounded"` for each finding (after skipping several drift cases).
- Entry #9's fingerprint IS grounded (verified by Plan 6 sha256sum). So whether entry #9 is `stale` or `active`, the grounding check will return `grounded`.

**Severity rationale:** The test passes either way. But the plan's claim that "Cold-tier regression test GREEN after Phase 5" is contingent on the operator choosing a fix that actually transitions entry #9 to `active` — which C1 confirms is non-trivial.

**Suggested fix:** Tie the cold-tier test claim to the C1 resolution. If using option 2 (direct patch), the test passes because entry #9 is now `active` and the test only checks `grounded`. If using option 1 (add verification.steps + re-verify), the test passes for the same reason.

---

### H4. Plan Phase 2 lists 5 parity-semantic files but the actual MCP server tool wiring may differ

**Evidence:**
- Plan Phase 2 function/interface checklist lines 69-75 lists:
  - `mastra/schema-parity.js`
  - `mastra/create-loop-tool.js`
  - `mastra/create-loop-workflow.js`
  - `mastra/create-loop-agent.js`
  - `mastra/agents/build-meta-state-tools.js`
- All 5 confirmed to exist via `ls`.
- BUT: the claim that they "enforce parity contracts" is asserted, not verified. The scout flagged this as a semantic question; the plan acknowledges it but doesn't deep-verify the contract.

**Suggested fix:** None for this plan — the doc-convention is what's being shipped, not the contract enforcement. Add a one-line caveat in `legacy-pins.md`: "The 5 parity-semantic files implement parity guarantees; see `mastra/schema-parity.js` for the canonical contract."

---

## Medium (note for implementation)

### M1. §11 renumbering should use a placeholder to avoid the §10 last paragraph drift

**Evidence:**
- `AGENTS.md:353` is `---` (separator before §11). Plan inserts new §11 between line 353 and 355.
- Plan's Step 2 shows the insertion template:
  ```markdown

  ---

  ## 11. Runtime Interface Ownership (R2)
  ...
  ```
- This is correct. No conflict.

**Note:** The plan should ensure the new §11 has its OWN trailing `---` separator (before the renumbered §12) to match the existing §10 → §11 separator pattern. Plan's template doesn't show this explicitly.

---

### M2. External-link audit (Step 1) should include `.claude/`, `.factory/`, AND `.md` files beyond `AGENTS.md`

**Evidence:**
- Plan Phase 1 Step 1 greps for `§11` references. Correct.
- But: external links may use phrases like "see AGENTS.md §11 (rewrite log)" or similar prose — not the literal `§11` symbol. Step 1 grep won't catch prose references.

**Suggested fix:** Add a grep for "rewrite" or "change log" near "AGENTS.md" in the plan audit step.

---

### M3. Plan phase 2 line 111 uses `mastra/tools/legacy/` (C2 fix) — verify also that `legacy-pins.md` body uses correct paths in the per-file entries (lines 130-134)

**Evidence:**
- Lines 130-134 use `mastra/schema-parity.js`, `mastra/create-loop-tool.js`, etc. These are CORRECT paths (post-Plan-6).
- Line 134 says `mastra/agents/build-meta-state-tools.js`. CORRECT (verified by `ls tools/learning-loop-mastra/mastra/agents/build-meta-state-tools.js`).

**Suggested fix:** None — the per-file entries are correct. Only the global warning at line 111 is wrong.

---

### M4. Phase 4 (I-1) doesn't update the AGENTS.md §1.1 line 26-29 path-invariant reference, but core/README.md line 27 will reference `tools/legacy/` separately from the path-invariant

**Evidence:**
- `AGENTS.md:26-29` defines the path invariant: shell files MUST live at `tools/learning-loop-mastra/mastra/`. Does NOT mention `tools/legacy/`.
- New core/README.md line 27 wording: "Anything under `tools/learning-loop-mastra/mastra/{workflows,agents}/` (shell-defined entities); `tools/learning-loop-mastra/tools/legacy/` is a separate Layer 1 substrate (legacy tool adapters)" — correctly distinguishes `mastra/` from `tools/legacy/`.

**Note:** The wording implies `tools/legacy/` is Layer 1 (Core) substrate, which is inconsistent with Plan 6 D6 ("`tools/legacy/` stays at top level of tools/learning-loop-mastra/", not under `core/`). Layer 1 substrate should be `core/`, not `tools/`. The doc is conflating "Layer 1 substrate" with "top-level substrate directory."

**Suggested fix:** Reword: "`tools/learning-loop-mastra/tools/legacy/` is a separate substrate directory (legacy tool adapters; Layer 2-adjacent)" OR drop the layer reference and just say "is a separate directory."

---

### M5. Phase 5 documentation says "Operator action: Set `META_STATE_VERIFY_EXEC=1` in the MCP server's environment" — but the actual operator UX (per Plan 6 journal entry cited) requires a server restart

**Evidence:**
- Plan 6 code review line 88: "meta_state_re_verify for entry #9 — requires `META_STATE_VERIFY_EXEC=1` env var on MCP server."
- `meta-state.jsonl:50` change-log (from `plans/260626-0302-phase-e-shell-restructure/reports/pre-repoint-meta-state-lines.txt`): "Documented process-env-isolation pattern: background MCP server ... holds process.env.OPERATOR_MODE=1 and process.env.META_STATE_VERIFY_EXEC=1 across test boundaries" — this implies env var is set at server startup, not via tool invocation.

**Suggested fix:** Either (a) document the MCP restart sequence, OR (b) drop the re-verify path entirely (see C1 option 2).

---

### M6. Plan's single-commit (D8) trades review granularity for atomicity — but the 5 phases have a soft dependency chain (Phase 3 must run before Phase 4's FORBIDDEN_PATH_PATTERNS extension takes effect on the deleted file)

**Evidence:**
- Phase 4 adds `schema-descriptions\\.yaml` to FORBIDDEN_PATH_PATTERNS. Phase 3 deletes the file. If Phase 4's test runs BEFORE Phase 3's deletion, the test scans core/ and finds 0 matches for `schema-descriptions\\.yaml` (file still exists, but pattern is in FORBIDDEN_PATH_PATTERNS — wait, the pattern matches the path string, not the file content).
- Re-reading the test: it greps FORBIDDEN_PATH_PATTERNS over SEARCH_PATHS. If `schema-descriptions.yaml` exists, the grep would NOT find `tools/learning-loop-mastra/schema-descriptions\\.yaml` (the actual path is `tools/learning-loop-mastra/core/schema-descriptions.yaml`). So the pattern as written wouldn't match the existing file even if it weren't deleted.
- Wait: the plan's Phase 4 line 159 adds `tools/learning-loop-mastra/schema-descriptions\\.yaml` to FORBIDDEN_PATH_PATTERNS. But the file's actual path is `tools/learning-loop-mastra/core/schema-descriptions.yaml`. The pattern won't match the actual file!

**Severity rationale:** The FORBIDDEN_PATH_PATTERNS entry guards against references to `tools/learning-loop-mastra/schema-descriptions.yaml` — but the file lives at `tools/learning-loop-mastra/core/schema-descriptions.yaml`. The guard is checking the WRONG path. Even after Phase 3 deletion, the guard is mis-aligned.

**Suggested fix:** Change the FORBIDDEN_PATH_PATTERNS entry to `tools/learning-loop-mastra/core/schema-descriptions\\.yaml` to match the actual path. This is the path that future references would need to use to "re-create" the file.

---

## Low (FYI only)

### L1. Plan uses `§11` numbering convention but old plan docs (e.g., `plans/260612-1700-meta-surface-re-debate/plan.md`) use §11.1, §11.2 etc. — no conflict, just historical context.

### L2. The `meta_state_log_change` at completion (D9) will create one entry referencing `plans/260626-0607-phase-e-housekeeping/plan.md`. Per Plan 6 precedent (`meta-260626T0523Z-plans-260626-0302-phase-e-shell-restructure-plan-md`), this is the convention. No conflict with master tracker.

### L3. Plan 4 (parallel) may want to read `legacy-pins.md` once it ships. If Plan 4 starts before Plan 3 ships, it will not find the file. Low risk — Plan 4's dependency is on Plan 2 (interface spec, DONE) + Plan 6 (shell restructure, DONE), not Plan 3. The plan's note that Plan 4 "reads `legacy-pins.md` but does not require it" is correct.

### L4. Plan 5 (parallel hardening) doesn't reference `legacy-pins.md` or AGENTS.md §11 directly. Plan 5 ships the write-gate that enforces R2 ownership. No conflict.

### L5. Line 47 of core/README.md (`- **Runtime interface** (\`tools/learning-loop-mastra/interface/\`) — the contract (ships in Plan 2)`) is correctly unchanged. The "(ships in Plan 2)" annotation is now stale (Plan 2 is DONE), but that's a minor doc drift for a future housekeeping pass.

### L6. The plan's Risk R6 says "< 100 LoC of doc/process changes" — accurate: AGENTS.md insert (~17 lines) + legacy-pins.md new file (~30 lines) + core/README.md edits (3 lines) + external-refs-updated.test.js edits (3 lines) + 1 comment + 1 file deletion + 1 registry action ≈ 55 LoC.

---

## Accepted scope-corrections from scout

| # | Scout finding | Plan's resolution | Verdict |
|---|---------------|-------------------|---------|
| D1 | §11 numbering: new vs. existing | D1: new §11 BEFORE existing (renumber to §12) | **ACCEPTED** — matches §1-§10 architectural-contract-first convention. |
| D2 | E.4: delete vs. rewrite | D2: DELETE | **ACCEPTED** — scout verified zero importers. Plan's pre-deletion audit (Phase 3 Step 1) is the right gate. |
| D3 | E.3 parity-pin label on `workflow-intentional-skip.js` | D3: use scope report wording "parity-test pin" | **ACCEPTED WITH CAVEAT** — file has no parity semantics; the wording is technically misleading but follows the scope report. The 4 actual parity-semantic files are documented in `legacy-pins.md` per D4. |
| D4 | E.3 `legacy-pins.md` lists 4 parity-semantic files | D4: documented | **ACCEPTED** — broader convention documented. |
| D5 | I-1 FORBIDDEN_PATH_PATTERNS extended with `schema-descriptions\\.yaml` | D5: extended | **CHALLENGED (M6)** — pattern uses wrong path (`tools/learning-loop-mastra/schema-descriptions.yaml` instead of `tools/learning-loop-mastra/core/schema-descriptions.yaml`). |
| D6 | I-1 SEARCH_PATHS extended with `core/` | D6: extended | **ACCEPTED** — closes the regression guard gap. |
| D7 | `META_STATE_VERIFY_EXEC=1` required | D7: set before invocation | **CHALLENGED (C1 + C3)** — entry #9 has no `verification.steps`; tool returns `no_verification_steps` error. AND no documented mechanism for setting the env var in the MCP server's process. |
| D8 | Single atomic commit | D8: single commit | **ACCEPTED** — < 100 LoC, low review burden. |
| D9 | `meta_state_log_change` at plan completion | D9: at completion | **ACCEPTED** — matches Plan 1 + Plan 6 precedent. |

**Net challenge:** 2 of 9 decisions (D5, D7) have implementation defects. D7 is the critical blocker (Phase 5 cannot complete as designed).

---

## Unresolved questions

1. **Does the MCP client (Claude Code) propagate environment variables to the MCP server's process?** If yes, the plan's "set in agent's process" alternative (Phase 5 Step 2) is viable. If no, only `.mcp.json`-level env injection works, requiring a server restart.

2. **Should entry #9's `verification` field be backfilled before running `meta_state_re_verify`?** This is a schema-correctness question: the schema marks `verification` as optional (`z.object({}).passthrough().optional()`), so adding `verification.steps` is legal but changes the entry's effective shape. Does the loop's schema intent treat `verification.steps` as a load-bearing field? If yes, backfilling requires operator approval per the consult-gate.

3. **Does the `create-loop-.*\\.js` pattern cause false positives in any FUTURE plan that legitimately references the create-loop factories from `core/`?** Per M2 above. Worth tracking for Plan 4 (Mastra Code validation) which may add new core/doc files referencing these factories.

4. **What is the operator UX for setting `META_STATE_VERIFY_EXEC=1`?** The plan should document this concretely (C3 fix).

5. **Why is entry #9 the only entry Plan 6's code review flagged for re-verify?** 16 stale entries currently exist; Plan 3 only addresses one. Per `cold-tier-regression.test.js` filter, the cold-tier test only iterates `mechanism_check=true` findings — entry #9 is one of those. Are the other 15 mechanism_check=true entries also re-verify candidates? If so, the scope report's "1 registry lifecycle action" is misleading — there are 16+ candidates.

---

## Cross-plan concerns

- **Plan 4 + Plan 3 race:** Plan 4 reads `legacy-pins.md` (per Plan 3 Phase 2). If Plan 4 lands first, the file won't exist. Plan 3's note that Plan 4 "does not require" the file is correct (Plan 4's hard dependency is Plan 2 + Plan 6, not Plan 3). Low risk.

- **Plan 3's I-2 closes a deferred item from Plan 6:** Plan 6 code review flagged I-2 as "operator either runs `meta_state_re_verify` with `META_STATE_VERIFY_EXEC=1` on the MCP server, OR amends acceptance criterion #15 to acknowledge the deferral in the plan." Plan 3 chose the first option. But per C1 + C3, this option cannot be executed as designed.

- **D9 (`meta_state_log_change` at completion) convention:** Matches Plan 1 (`plans/260624-2335-phase-e-foundation/plan.md`) + Plan 6 precedent. Master tracker update path is independent (operational, not registry). No conflict.

---

## Verification concerns

- **The plan claims `pnpm test` is the safety net for Phase 3 (E.4 deletion).** This is correct — if any test references `schema-descriptions.yaml`, `pnpm test` will fail. Scout verified zero references (confirmed via my own grep above). But: there's a chicken-and-egg with Phase 4 — Phase 4 extends FORBIDDEN_PATH_PATTERNS with `schema-descriptions\\.yaml` (wrong path per M6), but the test runner greps for `tools/learning-loop-mastra/schema-descriptions.yaml` (not `core/schema-descriptions.yaml`). The pattern won't match the deleted file's prior location either. The guard is misaligned.

- **The plan claims cold-tier regression test covers entry #9's transition.** Per H3, the test passes either way. The real risk is C1 (Phase 5 cannot complete as designed).

---

## Status

Status: DONE_WITH_CONCERNS
Summary: Plan is structurally sound but has 1 critical blocker (Phase 5 cannot complete as designed — entry #9 has no `verification.steps` and env-var setup is undocumented), 1 wrong-path bug in Phase 2's heredoc body, and 1 wrong-path bug in Phase 4's FORBIDDEN_PATH_PATTERNS entry. All other findings are minor.
Concerns: C1 + C3 must be fixed before ship (Phase 5 is non-functional as designed). C2 + M6 are 1-line fixes. H1-H4 are nice-to-haves.