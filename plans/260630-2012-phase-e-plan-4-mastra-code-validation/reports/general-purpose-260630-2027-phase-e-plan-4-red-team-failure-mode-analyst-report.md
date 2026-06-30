# Red-Team Plan Review — Phase E Plan 4 (Mastra Code Validation)

**Reviewer:** FAILURE MODE ANALYST (hostile lens)
**Date:** 2026-06-30
**Plan:** `plans/260630-2012-phase-e-plan-4-mastra-code-validation/`
**Acceptance verdict:** **APPROVE-WITH-FIXES**

---

## Executive Summary

The plan is well-grounded: it correctly identifies the wrong current path (`.mastracode/config.json` vs `.mastracode/mcp.json` + `hooks.json`), adopts Phase 1 as a probe to de-risk Phase 2-4 decisions, and applies TDD-first discipline. However, there are **5 CRITICAL, 8 HIGH, 7 MEDIUM, 4 LOW** failure modes that need explicit handling. None block shipping if the listed fixes are applied. The most concerning failure modes are around:

1. **Cross-phase ordering guarantees** — Phase 3 amendments ship git-committed BEFORE Phase 2 config files exist on disk in any working tree; if a developer reorders or if CI captures the half-state, the contract validator returns a misleading silent false-ok.
2. **Probe semantics under failure** — the Phase 1 probe is "read-only", but Phase 4 extends it to invoke tools. The plan does not specify what happens if Phase 1's probe discovers wrong values (e.g., write tool name = `edit_file` not `Edit`) AFTER Phase 2 was already committed.
3. **JSON-file validation gap** — the `JSON.parse` step in Phase 2 does NOT validate schema or shape (e.g., that `mcpServers` is present, `PreToolUse` is an array, `matcher.tool_name` is a string). A malformed `.mastracode/hooks.json` that parses but is structurally wrong will pass Phase 2 but fail Mastra Code at startup.
4. **`mcpManager.disconnectAll()` / `harness.shutdown()`** are documented as cleanup in Phase 4 but neither is in the harness-class report's signature inventory; if they don't exist, the smoke test leaves child processes behind that break CI.
5. **Mode 1 terminology ambiguity** — the mastracode-prep report §"Mode 1" unresolved question #2 is never assigned an owner; AGENTS.md §3.9 still mentions "Mode 1 peer MCP" which Phase 3 cleanup of §11 doesn't touch.

---

## Findings (numbered, with severity + phase)

### CRITICAL

#### C1. Phase 2 ships `.mastracode/hooks.json` WITHOUT schema validation, only `JSON.parse`
- **Phase:** 2
- **Failure scenario:** The plan's `for f in .mastracode/*.json; do JSON.parse(...)` only checks parse-ability. A `hooks.json` like `{"PreToolUse": "not-an-array"}` parses fine but Mastra Code rejects it at session start. Phase 4 probe catches it (the probe runs AFTER commit), but the contract validator's `checkSettingsIntegration` only counts basenames — it doesn't assert array shape.
- **Detection:** Mastra Code logs a startup error like `hooks.json: invalid shape: PreToolUse must be array`. Probe would catch it but only at Phase 4.
- **Recovery:** Add a JSON-Schema-style structural assertion in Step 6 of Phase 2 (e.g., `Array.isArray(hooks.PreToolUse)`, `typeof hooks.PreToolUse[0].matcher.tool_name === 'string'`). Refuse to commit if schema invalid.

#### C2. Phase 4 smoke test assumes `harness.shutdown()` exists; not in harness-class report signature inventory
- **Phase:** 4
- **Failure scenario:** Phase 4 step calls `await harness.shutdown()` in cleanup. The harness-class report's `HarnessConfig` table lists `threadLock.acquire/release` and `pubsub` but no `shutdown()` method. Mastra Code may use `mcpManager.disconnectAll()` only. If `harness.shutdown` is undefined, the smoke test throws after the tool round-trip succeeds, exit code != 0, **and** the smoke test is reported as failed even though the real assertion passed.
- **Detection:** `TypeError: harness.shutdown is not a function` after the round-trip.
- **Recovery:** Plan must require Phase 1 to also probe `typeof harness.shutdown === 'function'` AND `typeof mcpManager.disconnectAll === 'function'`. If absent, use a fallback cleanup (signal `process.exit(0)` after JSON dump) or document the leak. **Do not silently let the exit code mask a tool round-trip success.**

#### C3. Q6 (tool namespacing) is "TBD at smoke test" but Phase 3 contract needs the actual format
- **Phase:** cross (Phase 3 + Phase 4)
- **Failure scenario:** Phase 3's `checkHookShimSet` alternative may need to parse `mcpManagers` to verify the namespaced tool exists. The plan defers Q6 to Phase 4. But the contract validator runs at merge time — if the validator references `learning-loop_loop_describe` (per docs) and the actual format is `mcp__learning-loop__loop_describe` or `loop_describe` (programmatic), validation silently returns misleading errors.
- **Detection:** Final `pnpm test` of `interface/__tests__/contract.test.js` — the `mastracode-mcp-config-points-at-server-js` test might pass (it only checks the file shape) while `mastracode-skill-spec-reuses-claude-skills-discovery` tests against an MCP tool name format that doesn't match runtime reality.
- **Recovery:** Phase 3's contract amendment must NOT hardcode the namespaced tool format. Either: (a) Phase 3 only validates config-file presence + parse, NOT namespace resolution; (b) Phase 1 probe explicitly writes `namespacing_format` to the JSON output and Phase 3 reads it. Plan currently does (b) implicitly but Step 7 of Phase 1 says "no-op" if probe "reveals Q6 issues that change Phase 2/3 design" — this means Phase 3 might ship ahead of namespacing evidence.

#### C4. Probe script "read-only" claim is misleading; Phase 4 extends it to invoke tools
- **Phase:** 1 + 4
- **Failure scenario:** Phase 1 commits `scripts/probe-mastracode.cjs` described as "read-only — does not invoke any tool, just lists the runtime's configured hooks and MCP servers." Phase 4 modifies the same script to call `harness.callTool('loop_describe', { tier: 'warm' })`. The two scopes overlap: Phase 1 may inadvertently subscribe to `harness.subscribe('tool_start')` (it does, per the architecture diagram) which fires on any tool call. If a CI run executes the Phase 1 commit-style probe under a mastracode that already has connected MCP servers, the probe inherits state.
- **Detection:** Probe JSON output includes unexpected `tool_start` events from inherited MCP server state. Phase 4 may misinterpret them as evidence about loop_describe.
- **Recovery:** Phase 1 should be STRICTLY read-only (`hookManager.listHooks()`, `mcpManager.listTools()`, no subscribe). Phase 4 is a SEPARATE script or a separately-flagged section (`--smoke` arg distinguishes). Plan must split files or add an explicit mode switch.

#### C5. `.mastracode/data/` lock conflict not detected by probe design
- **Phase:** 1
- **Failure scenario:** Plan R3 says "Probe in Phase 1 — confirm default DB location; either configure `.mastracode/database.json` to a sibling path OR confirm no conflict." Phase 1 probe architecture does not include any DB-write step. If Mastra Code defaults to `~/.mastracode/data/mastra.db` AND our loop uses `tools/learning-loop-mastra/data/mastra-memory.db`, the probe runs in memory-only, returns no-conflict, Phase 4 invokes a tool that triggers OM (Observational Memory), which writes to `~/.mastracode/data/mastra.db`, which locks — and **our loop also tries to write to its own LibSQL DB during a parallel session** — collision only happens at scale.
- **Detection:** No collision in CI (CI runs single-process, no parallel loops). Production reveals it.
- **Recovery:** Phase 1 must explicitly write+read a small row to BOTH DB paths simultaneously via the `storage` field passed to `createMastraCode()` to prove locks coexist. If probe can't simulate the conflict, file a finding and defer R3 fix to Plan 5; current plan treats it as a Phase 1 deliverable.

---

### HIGH

#### H1. Phase 3 atomic commit may land on top of Phase 2 in either order; no gating
- **Phase:** 3 (cross)
- **Failure scenario:** Plan says "1 atomic commit for all contract amendments + test additions." Phase 2 separately says "1 atomic commit: 4 files created + 1 `.gitignore` line." Two commits can be ordered either way. If Phase 3 lands FIRST, `node interface/contract.js mastra-code` runs against existing-trees without `.mastracode/` — returns `{ok: false, missing: ['hook-shim-set',...]}`. Reviewers running the new tests on the Phase 3 commit see RED. Plan does not specify merge order or CI sequence.
- **Detection:** CI on Phase 3 commit before Phase 2 lands = red. Or worse, Phase 3 lands + Phase 2 lands in same PR — `pnpm test` against working tree passes, but a fresh checkout building only Phase 2 then Phase 3 fails.
- **Recovery:** Use a single PR with 2 commits in fixed order (Phase 2 config first, Phase 3 amendment second). Or keep them in ONE atomic commit. Plan currently has them as separate commits — must be in the same PR with documented ordering, OR squash.

#### H2. `harness.callTool()` signature differs from docs — probe has no fallback
- **Phase:** 4
- **Failure scenario:** Phase 4 calls `await harness.callTool('loop_describe', { tier: 'warm' })`. The harness-class report does not list `callTool` in the documented public API surface (it mentions `subscribe`, `resolveModelApproval`, etc.). If the actual method is `harness.executeTool()` or requires async iterator or returns a stream, the probe fails.
- **Detection:** `TypeError: harness.callTool is not a function`.
- **Recovery:** Phase 1 probe must include a `for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(harness)))` dump to record ALL callable names; Phase 4 reads from this dump to pick the right method. Plan currently treats the signature as known.

#### H3. Phase 1 fallback ("pnpm view") after install block leaves Phase 4 without a runtime
- **Phase:** 1 + 4
- **Failure scenario:** Phase 1 step 1: if `mastra_gate_check` returns "blocked" (vendor API install constraint), fallback is `pnpm view mastracode` (read-only). Plan says "If blocked, fallback..." but does not say what happens to Phase 4. Phase 4 depends on `node_modules/mastracode`. If install is blocked, Phase 4 cannot run.
- **Detection:** Phase 4 runs `require('mastracode')` → `MODULE_NOT_FOUND` → exit 1.
- **Recovery:** Plan needs an explicit branch: if install blocked, file `meta_state_report(category='mcp-tool-missing')` AND either (a) abort the plan, (b) proceed with smoke against `node_modules/.pnpm/mastracode@*/node_modules/mastracode` if a workaround exists, or (c) ship config + contract changes with the smoke test marked as DEFERRED to Plan 5 and a follow-up plan. Currently the plan has no deadman switch — fallback is silent.

#### H4. Tool factory import path speculation in Phase 4
- **Phase:** 4
- **Failure scenario:** Phase 4 step 1 imports `tools/learning-loop-mastra/mastra/tools/legacy/loop-describe-tool.js`. The plan says "or whatever the actual entry path is — discover via `tools/learning-loop-mastra/tools/manifest.json`." But if the actual file is `tools/learning-loop-mastra/mastra/tools/loop-describe-tool.js` (no `legacy/` prefix), the path is wrong. Worse, if `manifest.json` doesn't exist yet (Plan 6's shell restructure may have moved it), the discovery fails.
- **Detection:** `Cannot find module .../loop-describe-tool.js`.
- **Recovery:** Add a Phase 1 sub-step that inventories ALL tool factory files (glob `mastra/tools/**/*.js`), records paths, and Phase 4 reads the inventory. **Alternatively:** invoke the MCP server (via the mcpManager) rather than importing factories directly — `mcpManager.callTool('learning-loop', 'loop_describe', { tier: 'warm' })` is the path documented for client consumption.

#### H5. Hook matcher `tool_name` wrong because probe is synchronous but names might differ across versions
- **Phase:** 2 (cross 1→2)
- **Failure scenario:** Phase 1 probe discovers write-tool name = `edit_file` (hypothetical). Phase 2 hardcodes `"tool_name": "edit_file"` in `hooks.json`. A week later, Mastra Code ships a new version (the plan doesn't pin a version) and renames `edit_file` → `apply_edit`. The matcher stops firing; `pnpm test` still passes (validator only counts `path_map` presence); write-gate doesn't fire in production.
- **Detection:** Runtime use shows hook isn't firing. CI doesn't catch this.
- **Recovery:** Pin `@mastra/core` + `@mastra/mcp` + `mastracode` versions. Add a CI step that re-runs Phase 1 probe and diffs the `tool_name` values against `hooks.json`; fail CI if drift.

#### H6. `meta_state_log_change` requires `OPERATOR_MODE=1` but plan doesn't verify env at run time
- **Phase:** 5
- **Failure scenario:** Phase 5 step 6: "File audit-trail entries via MCP." Both `meta_state_log_change` calls require operator mode per the tool spec. If a non-operator session runs Phase 5, MCP returns an error. Plan assumes operator mode is on.
- **Detection:** MCP tool call returns `OPERATOR_MODE_REQUIRED` error.
- **Recovery:** Add Step 0 to Phase 5: assert `OPERATOR_MODE=1` is set; if not, exit with explicit error and instructions to enable it. Don't silently swallow.

#### H7. Phase 1 probe order violates meta-state first read
- **Phase:** 1
- **Failure scenario:** AGENTS.md §"Inbound State Gate" says read `meta-state.jsonl` BEFORE any bash command. The probe script invokes `node scripts/probe-mastracode.cjs` which is a side-effect-importer (`require('mastracode')`). The inbound gate (UserPromptSubmit) doesn't see the probe — only `pnpm add -D mastracode` and the probe invocation are caught. If the user prompt that triggered Plan 4 work didn't go through inbound-gate (e.g., resumed session without UserPromptSubmit), Phase 1 starts blind.
- **Detection:** Probe returns unexpected findings because meta-state isn't loaded into the agent context.
- **Recovery:** Add an explicit Step 0 to Phase 1: call `loop_describe({tier: 'warm'})` first to load active rules + findings; record findings context before proceeding. Plan currently has no such step.

#### H8. Concurrent MCP servers — `learning-loop` namespace collision
- **Phase:** 2 + 4
- **Failure scenario:** `.mastracode/mcp.json` declares `mcpServers.learning-loop`. If a developer (or another process) installs another MCP server (e.g., `mcpServers.learning-loop-analytics`) with the same prefix, Mastra Code's auto-namespacing `serverName_toolName` collides. Or: our own MCP server (`tools/learning-loop-mastra/mastra/server.js`) inside the loop registers itself recursively under another name in MCP stdio self-call.
- **Detection:** `harness.listTools()` returns two `learning-loop_*` prefixes; the loop_describe call goes to the wrong server.
- **Recovery:** Phase 1 probe must record the EXACT tool names from `harness.listTools()` (the full list, not just grep for `loop_describe`); if duplicates exist, file a finding. Add a uniqueness assertion.

---

### MEDIUM

#### M1. Phase 2 `.mastracode/settings.json` schema speculation
- **Phase:** 2
- **Failure scenario:** Plan sets `"omScope": "project"` based on mastracode-prep §6 ("documented fields; full schema not exhaustive in the docs"). If `omScope` is actually `"workspace-scoped"` or requires a different value, Mastra Code falls back to default or warns.
- **Detection:** Mastra Code logs a startup warning about unknown settings fields.
- **Recovery:** Phase 1 probe must enumerate the parsed settings keys (`hookManager.getSettings().keys()` or similar) and confirm `omScope` is read. Plan currently treats the field shape as known.

#### M2. Plan reuses Plan 2's `.claude/skills/learning-loop/SKILL.md` but Phase 3 doesn't assert discovery
- **Phase:** 3
- **Failure scenario:** Plan 2 shipped `.claude/skills/learning-loop/SKILL.md` for Claude Code. Phase 3 Step 4's `checkSkillSpec` for Mastra Code: "discover `.claude/skills/learning-loop/SKILL.md` OR `.mastracode/skills/learning-loop/SKILL.md` (Mastra Code's discovery path includes `.claude/skills/` per mastracode-prep §3)". The test `mastracode-skill-spec-reuses-claude-skills-discovery` would pass on filesystem alone without runtime confirmation. If Mastra Code's `.claude/skills/` discovery is broken in the installed version, Phase 4 smoke test won't see the skill either.
- **Detection:** `harness.listSkills()` doesn't include `learning-loop`.
- **Recovery:** Phase 4 must call `harness.listSkills()` and assert `learning-loop` is present; if absent, file finding + create `.mastracode/skills/learning-loop/SKILL.md` as fallback (Plan 2's note explicitly defers this).

#### M3. Master tracker concurrent-edit race in Phase 5
- **Phase:** 5
- **Failure scenario:** Step 4 modifies `productization-260612-1530-master-tracker.md`. If a parallel agent (CI bot, another session) edits the same file between read and write, the commit fails with merge conflict or the change is lost.
- **Detection:** `git commit --amend` fails or silently overwrites.
- **Recovery:** Step 4.5 (new): re-read the file before write; if diff from baseline, re-apply edits to current content. Plan has no such guard.

#### M4. Scope report Rev 12 numbering conflicts with "Rev 11" cited in research reports
- **Phase:** 5
- **Failure scenario:** Phase 5 step 5 flips Plan 4 row + adds "Rev 12 revision note." But research report `research-260626-2314-phase-e-plan-4-mastracode-prep-report.md` line 56 cites "Phase E scope report (Rev 11)." After Phase 5 ships, that citation points to Rev 12 content. The citation itself is still "Rev 11" — readers following the link get a now-current doc, but new edits will silently increment to Rev 13+ without notice in research reports.
- **Detection:** Audit diff reveals two reports citing different revisions.
- **Recovery:** Phase 5 step 5.5 (new): also update the mastracode-prep report's §References line to "Rev 12."

#### M5. `--list` flag in contract.js not updated for Mastra Code paths
- **Phase:** 3
- **Failure scenario:** Phase 3 amends `RUNTIMES["mastra-code"].mcp_config` and `.settings`. Contract's `--list` flag may print path_map based on these. If `--list` adds a path that uses the OLD `.mastracode/config.json` (e.g., for backward-compat lookups), reviewers reading the output see inconsistent info.
- **Detection:** `node interface/contract.js --list` shows old path.
- **Recovery:** Phase 3 Step 4 must grep for ANY remaining `.mastracode/config.json` references in the codebase (not just contract.js) and update them. Plan currently says "fix `RUNTIMES[mastra-code]`" — too narrow.

#### M6. JSON parse validation step doesn't catch duplicate keys or trailing commas
- **Phase:** 2
- **Failure scenario:** `node -e "JSON.parse(...)"` succeeds on `{"mcpServers": {"learning-loop": {"command": "node",,"args": [...]}}}` (double comma). Wait, standard JSON.parse rejects trailing commas. But: `{"mcpServers": {"learning-loop": {...}, "learning-loop": {...}}}` (duplicate key) parses fine — last one wins. Phase 2 doesn't catch duplicate MCP server entries.
- **Detection:** Mastra Code uses the last-declared entry; gate scripts may not fire correctly.
- **Recovery:** Phase 2 Step 6 must also assert single-occurrence of each key in `mcpServers`.

#### M7. Phase 4 doesn't run the smoke test in CI by default
- **Phase:** 4
- **Failure scenario:** Phase 4 step 4 adds `mastracode-smoke.test.js` as a test wrapper, but it spawns the probe as a child process. If the probe crashes mid-run (e.g., OOM from the OM config), CI may time out rather than fail-fast. Plan doesn't specify a timeout on the child process spawn.
- **Detection:** CI hangs on `mastracode-smoke.test.js` until the 30-minute GitHub Actions default.
- **Recovery:** Plan must specify `child_process.execFileSync(..., { timeout: 60000 })` for the test wrapper, with explicit `jest.setTimeout(90000)`.

---

### LOW

#### L1. Empty project handling — `loop_describe` with no `meta-state.jsonl`
- **Phase:** cross (Phase 4 references the loop_describe tool)
- **Failure scenario:** A fresh checkout (no `meta-state.jsonl`) runs Phase 4's `harness.callTool('loop_describe', { tier: 'warm' })`. If the tool's implementation requires `meta-state.jsonl` to exist, throws.
- **Detection:** Tool returns `{ok: false, error: 'meta-state.jsonl not found'}`.
- **Recovery:** This is a tool-implementation concern, not a plan-concern; defer.

#### L2. Windows path separators in `hooks.json` matcher
- **Phase:** 2
- **Failure scenario:** `matcher.tool_name` is a string field, not a path — paths in `command` are forward-slash strings. Windows may resolve `node tools/learning-loop-mastra/hooks/legacy/bash-gate.js` only if working dir is set. Likely no issue if CWD is project root.
- **Detection:** Windows-specific failures (none planned, none tested).
- **Recovery:** Out-of-scope; document a known limit or note "macOS/Linux only" if CI proves it.

#### L3. Network failure during `pnpm add -D mastracode`
- **Phase:** 1
- **Failure scenario:** A network blip during Phase 1 install leaves `node_modules/mastracode/` partial. Plan doesn't verify install integrity.
- **Detection:** `require('mastracode')` fails on missing peer deps.
- **Recovery:** Phase 1 Step 2 must include `pnpm install --frozen-lockfile` (or `pnpm install` followed by `node -e "require('mastracode')"` smoke) before proceeding.

#### L4. Network provider unavailable during smoke test
- **Phase:** 4
- **Failure scenario:** Mastra Code's default Anthropic/OpenAI provider is rate-limited or unavailable during CI. `harness.callTool` hangs.
- **Detection:** Test times out.
- **Recovery:** Phase 4 must pass a mock `resolveModel` to `createMastraCode` to skip network entirely. Plan doesn't mention this.

---

## Edge Cases MISSED (not covered in any phase)

1. **Empty `meta-state.jsonl`** — Phase 4 may try to log findings against an empty registry. No plan step handles this.
2. **`mastracode` version pinned in `package.json` vs unlocked** — Plan installs but doesn't pin. CI drift possible.
3. **`@mastra/core` peer-dep mismatch** — If `mastracode` requires `@mastra/core@^1.43.0` and we have `@mastra/core@1.42.0`, install or runtime explodes. Plan does not cross-check peer deps.
4. **Mastra Code running on Windows** — Universal hooks are `bash` scripts in some places; Mastra Code uses Node — plan doesn't surface Windows-tested path.
5. **Re-running Phase 4 with stale `~/.mastracode/data/mastra.db`** — Database may have a session id from a prior smoke; `resourceId` mismatch → OM config error.
6. **Concurrent CI runs** — Two concurrent CI jobs both running `pnpm smoke:mastracode` against the same repo state can race on `tools/learning-loop-mastra/data/`.

---

## Recovery Actions MISSING (the plan should specify but doesn't)

1. **What to do if Phase 1 probe can't discover write/edit tool names.** Currently vague "TBD_FROM_PROBE." Need: fallback to ALL-cap-named matcher (`matcher: {tool_name: {any: ["Edit","edit_file","apply_edit",...]}}` if Mastra Code supports regex; or file a finding + skip).
2. **What to do if Phase 4 smoke test fails after Phase 3 amendments are committed.** Currently plan implies "fix and rerun." Need explicit rollback protocol: revert Phase 3 commit, partial revert, or follow-up patch.
3. **What to do if Phase 1 install blocked AND Phase 2/3 are partially shipped.** Currently no path.
4. **What to do if `pnpm test` reveals new Mastra Code namespace regressions in existing test files.** Plan says regression tests are added in Phase 3 first — if existing test files fail anyway, plan doesn't say whether to amend those tests or mark them expected-fail.
5. **What to do if Phase 2's `database.json` configures a sibling DB path that creates a parallel DB.** Loop's `tools/learning-loop-mastra/data/mastra-memory.db` and Mastra Code's `.mastracode/data/mastra.db` are now divergent — new findings have two homes. No consolidation plan.

---

## Cross-Phase Failure Mode Summary

| Cross-flow | Risk |
|---|---|
| Phase 1 → Phase 2 ordering | Probe may run after some `.mastracode/` files exist from previous (unfinished) attempts; partial discovery. |
| Phase 2 → Phase 3 ordering | Phase 3 amendments (contract.js) may merge before Phase 2 files exist (see H1). |
| Phase 3 → Phase 4 ordering | Phase 4 smoke test depends on Phase 3's contracts being effective AND Phase 2 files existing. If Phase 4 commits ahead of one, smoke looks flaky. |
| Phase 4 → Phase 5 ordering | Phase 5 docs reference probe output. If Phase 5 commits and probe output is later invalidated by version bump, docs are wrong. |
| Probe script version divergence | Tools/manifest.json may move between Phase 1 commit and Phase 4 commit; probe references broken paths. |

---

## Acceptance Verdict Detail

**APPROVE-WITH-FIXES** — Plan is structurally sound and aligns with project rules (TDD-first, YAGNI, DRY, scope-respect). The 5 CRITICAL findings are addressable with concrete plan additions (mostly additional validation steps). The 8 HIGH findings expose real cross-phase integration risks that the plan currently handwaves over.

**Required before APPROVE:**
- Address C1, C2, C4, C5 in plan text (add explicit validation/recovery steps).
- Add a deadman switch for H3 (install-blocked).
- Add an ordering guarantee for H1 (Phase 2 and Phase 3 must be in the same PR, in that order).
- Add `OPERATOR_MODE` assertion at start of Phase 5 for H6.
- Add a `meta-state-first` step at top of Phase 1 for H7.

**Recommended (HIGH but addressable mid-implementation):**
- Add peer-dep cross-check (H2, H4).
- Pin mastracode version (H5).
- Add namespace uniqueness assertion (H8).

---

## Status

**Status:** DONE_WITH_CONCERNS
**Summary:** Plan reviewed end-to-end through failure-mode lens; identified 5 CRITICAL, 8 HIGH, 7 MEDIUM, 4 LOW failure modes plus missed edge cases and missing recovery actions. Verdict APPROVE-WITH-FIXES.
**Concerns/Blockers:** All CRITICAL findings are addressable with plan-text additions; none are showstoppers that require redesign. Most concerning are C1 (no schema validation, only JSON.parse), C2 (`harness.shutdown()` not in docs), C4 (probe "read-only" claim violated by Phase 4 extension), and H1 (Phase 2 vs Phase 3 commit ordering) — together these can produce silent false-ok validation in CI.
