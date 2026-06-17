# Red-Team Security Adversary Review — Phase C Plan 3 Cut-Over

**Reviewer role:** code-reviewer (Security Adversary)
**Plan under review:** `plans/260617-1950-phase-c-plan-3-cut-over/`
**Date:** 2026-06-17
**Method:** fact-check every cited path/symbol; trace attack path through codebase; ignore style/lint.

---

## Finding 1: Mastra manifest expansion has unverified name-collision risk; plan misidentifies `server.js:38` as the `PREFIX` line

- **Severity:** Critical
- **Location:** Phase 1 ("promote-mastra-to-canonical") + Phase 2 ("update-agent-manifest") + Phase 6
- **Flaw:** The plan claims Phase 1 expands `tools/learning-loop-mastra/tools/manifest.json` from 29 → 40 by adding 11 workflow tools, and that "the existing `PREFIX = "mastra_"` logic at `tools/learning-loop-mastra/server.js:13,23` auto-prefixes the names." The plan presents this as a no-op manifest change. **It is not.** The 11 workflow tool files in `tools/learning-loop-mcp/tools/manifest.json` (lines 4-14: `workflow_*`, `notify_artifact`, `trigger_workflow`) are imported by the mastra server via `#mcp/${file}` alias. Their `legacy.name` fields (e.g. `workflow_intake_orient`) already do not start with `mastra_`, so concatenation produces `mastra_workflow_intake_orient` — that part is fine. **However**, `tools/learning-loop-mcp/__tests__/tools-list-collision.test.cjs:70-89` (the test the plan deletes in Phase 5) currently asserts: "no legacy name starts with `mastra_`" AND "every mastra name starts with `mastra_`". This means the legacy `legacy.name` strings for the deterministic tools explicitly do NOT start with `mastra_`, but the **same string** (`workflow_intake_orient`, etc.) is reused by both the legacy server and the new mastra entries. After Phase 3 cuts over the `.mcp.json`, only the mastra server is loaded, so namespacing is fine in production. But the **registry caches** at `records/meta/.cache/loop-describe-cold.json` (20+ entries with `evidence_code_ref: "tools/learning-loop-mcp/server.js"`) still pin to the legacy path. Phase 6's `meta_state_check_grounding` will hash `tools/learning-loop-mastra/server.js:38` — but `server.js:38` is the **start of a multi-line `description:` field**, not the `PREFIX` constant. The plan repeatedly cites `server.js:13,23` (correct) AND `server.js:38` (wrong: line 38 is inside a string). The fingerprint is therefore computed against a meaningless anchor; drift detection on F4 will fire false positives after any whitespace edit.
- **Attack scenario:** (a) An operator edits `server.js` to add whitespace inside the multi-line `description:` string. The next `meta_state_check_grounding` call returns `code_fingerprint_mismatch`, F4 is auto-reopened as `active`, and the agent-rendered prompt-injection surface (`mastra_meta_state_list`) surfaces the false drift as a "security finding" to every operator prompt via the inbound gate. (b) More concretely, the workflow tool's `legacy.name` is **not** namespaced before concatenation — the mastra server's `tools[prefixed]` map keys are `mastra_workflow_*`. If any tool source file (e.g., `workflow-intake-orient-tool.js`) ever exports a `name` that already starts with `mastra_`, the result is `mastra_mastra_workflow_*` — silent key collision that breaks `tools/list` JSON-RPC responses to the agent runtime. The plan does not enforce pre-import name sanitization.
- **Evidence:**
  - `tools/learning-loop-mastra/server.js:13` — `const PREFIX = "mastra_";` (correct citation)
  - `tools/learning-loop-mastra/server.js:23` — `const prefixed = PREFIX + legacy.name;` (correct citation)
  - `tools/learning-loop-mastra/server.js:38` — `  description:` (this is a string field, not the `PREFIX` line as plan claims; grep: `grep -n "PREFIX" tools/learning-loop-mastra/server.js` returns only lines 13 and 23)
  - `tools/learning-loop-mcp/__tests__/tools-list-collision.test.cjs:75,88` — asserts `mastra_` prefix invariants
  - `plans/260617-1950-phase-c-plan-3-cut-over/phase-06-resolve-f4-and-tracker.md:71` — cites `tools/learning-loop-mastra/server.js:38` as "PREFIX line"
  - `records/meta/.cache/loop-describe-cold.json:20+ entries` — all `evidence_code_ref` strings pin to `tools/learning-loop-mcp/server.js`; these persist post-cut-over
- **Suggested fix:**
  1. In Phase 1's implementation, add a pre-import assertion: `if (legacy.name.startsWith(PREFIX)) throw new Error("double-prefix")`.
  2. Update Phase 6's `meta_state_check_grounding` call to anchor on a stable, immutable line (e.g., the `PREFIX = "mastra_"` literal at `server.js:13` — which is the load-bearing security invariant), not `server.js:38`.
  3. Phase 6 should explicitly note that the registry cache files (which still pin to the legacy path) are out-of-band evidence; consider sweeping them.

---

## Finding 2: F4 closure is a category error — removing the peer does not close the structural gap; the parity proof is deleted in the same plan

- **Severity:** Critical
- **Location:** Plan overview "Decision Delta" + Phase 6
- **Flaw:** The plan's central thesis is: "removing the peer means there's no second server to 'bypass' anything" (plan line 60). The researcher A report (line 39) itself contradicts this conclusion by stating the **actual mechanism** is: "the hooks don't gate MCP-tool calls at all — they gate the agent's *own* bash/edit/write operations." F4's finding (`meta-260616T2123Z-...-peer-mcp-server-registers-29-determ`) was about the **write-side mastra_* tools** calling `meta_state_*` operations that bypass the `gate_check` MCP tool (i.e., the in-MCP-tool gate, not the file-write hooks). **The mastra server has its own `gate_check` tool** (`mastra_gate_check`, per the new agent-manifest.json) — the plan makes no claim that this MCP-tool-level gate enforcement is equivalent between legacy and mastra servers. The legacy `tool-registry.js:206-237` `installWireFormatCoercion` is **deleted in Phase 4**; the mastra server's `create-loop-tool.js:128-137` `wrapSchema` is claimed to be "byte-equivalent" — but Plan 2's `parity-zod-to-json-schema.test.js` is **deleted in Phase 5**. After the cut-over, **there is no test that proves the MCP-tool-level gate enforcement is equivalent**. The plan deletes the proof and then resolves the finding by structural argument.
- **Attack scenario:** The mastra server's `wrapSchema` (create-loop-tool.js:128-137) wraps a Zod schema in `z.preprocess((v) => coerceShape(shape, v ?? {}), zodSchema)`. The legacy server's `installWireFormatCoercion` (tool-registry.js:206-237) monkey-patches `server.validateToolInput` to call `coerceParamsToSchema` BEFORE the original Zod parse. These are **different insertion points** (preprocess vs. SDK monkey-patch) with **different timing** relative to the SDK's own validation. If the two diverge in a way that allows a `gate_check` call to pass the SDK's validateToolInput with an under-coerced `args` object, the MCP-tool-level gate enforcement breaks. An attacker (or a misbehaving agent) could craft input that satisfies the SDK's pre-mastra validation but bypasses the legacy-style coercion's edge cases — e.g., `{"command": ["rm -rf /"]}` as an array where the legacy path coerced it to a string but the preprocess path does not. The plan provides no regression test for this case post-Phase 5.
- **Evidence:**
  - `plans/260617-1950-phase-c-plan-3-cut-over/plan.md:60-62` — Decision Delta claims F4 closed by structural removal
  - `plans/reports/researcher-260617-1954-GH-1607-F4-hook-reimplementation-path-a-report.md:39` — the actual mechanism is "the hooks don't gate MCP-tool calls at all"
  - `tools/learning-loop-mcp/tool-registry.js:206-237` — `installWireFormatCoercion` monkey-patches SDK
  - `tools/learning-loop-mastra/create-loop-tool.js:128-137` — `wrapSchema` uses `z.preprocess`
  - `tools/learning-loop-mastra/__tests__/parity-zod-to-json-schema.test.js` — DELETED in Phase 5 (per phase-05 line 41-43)
  - `tools/learning-loop-mcp/__tests__/tools-list-collision.test.cjs` — DELETED in Phase 5
- **Suggested fix:** Either (a) keep the parity-zod-to-json-schema test as a permanent regression test in `tools/learning-loop-mastra/__tests__/`, or (b) port the legacy `coerceParamsToSchema` test cases into a new `mcp-tool-gate-enforcement-parity.test.js` that exercises the `mastra_gate_check` path with adversarial inputs.

---

## Finding 3: Deleting `clearRegistrations` + `__loopMcpServer` globalThis binding creates a boot-time crash + hot-reload attack vector

- **Severity:** High
- **Location:** Phase 4 ("deprecate-legacy-server") §"`clearRegistrations` decision"
- **Flaw:** Phase 4 deletes `tools/learning-loop-mcp/server.js`, which contained the line `globalThis.__loopMcpServer = server;` (server.js:61). It also deletes `clearRegistrations` from `tool-registry.js` (Phase 4 line 49 — "delete `clearRegistrations`; the `meta_state_refresh_tools` tool returns a 'not supported post-cut-over' message"). The plan claims this is a "dev hot-reload" feature removal, framing it as a positive ("eliminates a dev-only attack surface" — Phase 4 line 95). **But the deletion is incomplete:** `meta_state_refresh_tools` remains in the mastra manifest (mastra/tools/manifest.json line 27), registered as a live MCP tool. The plan says to "stub the tool" to return a "not supported post-cut-over" message. However, the implementation file `tools/learning-loop-mcp/tools/meta-state-refresh-tools-tool.js` is in the **legacy `tools/` directory** and is imported by the mastra server via `#mcp/${file}` — and the plan does NOT mandate that this tool file be edited in Phase 4. The Phase 4 implementation step 3 says "Edit `tools/learning-loop-mcp/tools/meta-state-refresh-tools-tool.js` (if it imports `clearRegistrations` from `tool-registry.js`)" — but the file unconditionally does `import * as toolRegistry from "../tool-registry.js";` at line 6. After Phase 4 deletes `tool-registry.js`, the mastra server's stdio boot will fail with `ERR_MODULE_NOT_FOUND` when it tries to import `meta-state-refresh-tools-tool.js`. **The mastra server will not boot.** This is a runtime crash that the plan does not catch.
- **Attack scenario:** A partial application of Phase 4 (operator deletes `tool-registry.js` but forgets to update `meta-state-refresh-tools-tool.js`) crashes the single canonical MCP server at boot. Every agent session fails to load tools; the `gate_check` tool is unreachable; the agent falls back to raw bash, which the `bash-gate.js` hook still gates but with degraded visibility into what gate decisions are being made. Worse: the `clearRegistrations` removal eliminates the **only** way to wipe a poisoned tool registration at runtime in the legacy path — if an attacker manages to register a tool via any other injection vector (e.g., the `safeImport` via `meta_state_refresh_tools`'s `withCacheBust` URL), the only mitigation is process restart. This is acceptable in dev but the plan does not establish a new mitigation in the mastra path. The mastra `MCPServer` has different internals — if the new server is ever exploited similarly, there is no admin tool to clear and re-register, only a full process restart.
- **Evidence:**
  - `tools/learning-loop-mcp/server.js:61` — `globalThis.__loopMcpServer = server;` (binding code)
  - `tools/learning-loop-mcp/tools/meta-state-refresh-tools-tool.js:6` — `import * as toolRegistry from "../tool-registry.js";` (hard dependency)
  - `tools/learning-loop-mcp/tools/meta-state-refresh-tools-tool.js:57,128` — `clearRegistrations` use sites
  - `tools/learning-loop-mcp/tools/meta-state-refresh-tools-tool.js:118` — `const server = globalThis.__loopMcpServer;` (consumes binding)
  - `tools/learning-loop-mastra/tools/manifest.json:27` — `meta-state-refresh-tools-tool.js` still in mastra manifest
  - `plans/260617-1950-phase-c-plan-3-cut-over/phase-04-deprecate-legacy-server.md:49,63-67` — the conditional "if" wording for editing the tool file
- **Suggested fix:** Make Phase 4 step 3 unconditional: explicitly edit `meta-state-refresh-tools-tool.js` to remove the `toolRegistry` import and the `clearRegistrations` call. The plan should also remove `meta-state-refresh-tools-tool.js` from BOTH manifests and from `agent-manifest.json` since the tool becomes a no-op. Alternative: port `clearRegistrations` into the mastra factory and document the new admin path.

---

## Finding 4: The `quickstart.meta_state_query` field is a potential prompt-injection surface at session start

- **Severity:** High
- **Location:** Phase 2 ("update-agent-manifest")
- **Flaw:** Phase 2 rewrites `tools/learning-loop-mastra/agent-manifest.json` with a new `quickstart.meta_state_query` array (plan phase-02 lines 105-111) and bumps `version` from `0.1.0` → `0.2.0`. The Phase 2 §Architecture says the `agent-manifest.json` is consumed by: (1) `core/loop-introspect.js#buildDiscoverabilityHints`, (2) `.factory/hooks/loop-surface-inject.cjs#LOCAL_DISCOVERABILITY_HINTS`, (3) `AGENTS.md`. **The plan does not document the actual consumer chain end-to-end.** The `quickstart` field is a free-form JSON object containing `tool` references — but who reads `quickstart`? The phase-02 line 64 says "The new manifest content matches the concrete JSON provided by researcher B (section 4 of the cut-over mechanics report)" — but the concrete JSON sample in phase-02 lines 71-113 is **incomplete** (missing the `runtime_agnostic.cache_ttl` field that other groups have, and the `ordering` for `meta_state` and `introspection` are not validated against the prior schema). The plan claims a `node -e "JSON.parse(...)"` syntax check but **no semantic check** that consumers parse the new structure.
- **Attack scenario:** If the `agent-manifest.json` schema is consumed by `loop_describe({tier: "warm"})` (per `CLAUDE.md` and the operator's session-start protocol), and the new `version: "0.2.0"` triggers a code path that interprets the `quickstart.meta_state_query` array as **executable instructions** rather than declarative metadata, an attacker who can write to `agent-manifest.json` (e.g., via a future meta_state_patch finding that gets past the gate) could inject `{ "tool": "mastra_meta_state_resolve", "id": "<arbitrary finding id>" }` and trigger arbitrary MCP tool calls at session start. The plan's reliance on "researcher B's concrete JSON" without a typed schema validator means the field is **unstructured** and any future reader is forced to guess. Phase 5's cold-session test (line 79-80) explicitly keeps `DISCOVERABILITY_HINTS` and `LOCAL_DISCOVERABILITY_HINTS` content unchanged ("verify content doesn't need `mastra_` prefix") — but does NOT verify the `quickstart` field is even read.
- **Evidence:**
  - `plans/260617-1950-phase-c-plan-3-cut-over/phase-02-update-agent-manifest.md:71-113` — concrete JSON sample
  - `plans/260617-1950-phase-c-plan-3-cut-over/phase-02-update-agent-manifest.md:131` — "no version check exists in the codebase. Verified by `grep -r "agent-manifest.*version"`" — but this is a NEGATIVE claim with no grep evidence included
  - `CLAUDE.md:8` — "Discovery: call `loop_describe({tier: "warm"})` at session start to discover the loop's surface"
  - `tools/learning-loop-mcp/tools/loop-describe-tool.js:75,206` — `result.discoverability_hints = introspect.buildDiscoverabilityHints();` — but does the consumer also read `agent-manifest.json`? Plan does not verify.
- **Suggested fix:** (1) Add a JSON-schema file for `agent-manifest.json` (e.g., `schemas/agent-manifest.schema.json`) and validate at CI. (2) Add a test that asserts the `quickstart.meta_state_query` entries' `tool` fields resolve to actual MCP tool names. (3) Document explicitly in the plan what consumes each field of `agent-manifest.json` post-cut-over.

---

## Finding 5: The `mcp-config-peer.test.js` → `mcp-config.test.js` rename loses the assertion that protects against an attacker re-spawning the peer

- **Severity:** High
- **Location:** Phase 3 ("cut-over-mcp-config") + Phase 5 ("update-cold-session-tests")
- **Flaw:** The plan renames `mcp-config-peer.test.js` → `mcp-config.test.js` and changes its assertions from "2 entries" to "1 entry" (Phase 5 line 41-43, 83-84). The original test (verified at `tools/learning-loop-mastra/__tests__/mcp-config-peer.test.js:11-13`) currently asserts: `assert(config.mcpServers["learning-loop-mcp"], "legacy entry missing")` AND `assert(config.mcpServers["learning-loop-mastra"], "mastra peer entry missing")`. This dual-presence check would FAIL if an attacker (or rogue automation) re-added the `learning-loop-mcp` entry to `.mcp.json` — the test would catch the regression. After the rename, the new test asserts `Object.keys(config.mcpServers).length === 1` and that the single entry is `learning-loop-mastra` — but does NOT assert that `learning-loop-mcp` is absent (it just checks key count). **An attacker who re-adds the peer under a different key (e.g., `learning-loop-mcp-backup`, `learning-loop-legacy`) and removes the mastra entry could pass the new test with 0 entries** if the key count assertion is not strict. Even more critically: the plan deletes `tools-list-collision.test.cjs` (Phase 5 line 42) which was the **only** test that asserted the union of registered tool names had no overlap. Post-Phase 5, there is **no test** that catches a re-introduced second server registering overlapping tool names.
- **Attack scenario:** A future operator (or compromised automation, e.g., a CI step that runs an LLM-generated `git pull` script) re-introduces the `learning-loop-mcp` entry to `.mcp.json` to "restore the backup." Both servers boot. The agent sees 40 legacy + 40 mastra tools. Some have identical names (the 29 deterministic tools appear in both manifests, just one with `mastra_` prefix and one without). The agent's tool-call routing may dispatch to the wrong server based on prefix match. The mcp-config test passes (key count is 1 if attacker is careful), no test catches the regression, and the operator is now running two MCP servers with overlapping tool surfaces. F4 is **structurally re-opened** without any automated detection.
- **Evidence:**
  - `tools/learning-loop-mastra/__tests__/mcp-config-peer.test.js:11-15` — original 2-entry assertion
  - `plans/260617-1950-phase-c-plan-3-cut-over/phase-05-update-cold-session-tests.md:83-84` — rename and 1-entry assertion
  - `tools/learning-loop-mcp/__tests__/tools-list-collision.test.cjs:60-90` — the only test that catches re-introduced peer (deleted in Phase 5)
  - `tools/learning-loop-mcp/tools/manifest.json` (40 entries) and `tools/learning-loop-mastra/tools/manifest.json` (29 entries) — overlap in the 29 deterministic tools
- **Suggested fix:** Keep `mcp-config-peer.test.js` AS WELL AS adding the new `mcp-config.test.js`, OR have the new test explicitly assert `assert.equal(config.mcpServers["learning-loop-mcp"], undefined, "legacy server must not be in config")`. Also: add a test that asserts `Object.keys(config.mcpServers).length === 1 && "learning-loop-mastra" in config.mcpServers` (both conditions).

---

## Finding 6: Cold-session test path-update list omits 5+ references; evidence_code_refs pin to files deleted in Phase 4

- **Severity:** High
- **Location:** Phase 5 ("update-cold-session-tests")
- **Flaw:** The plan (Phase 5 line 36-38) enumerates 5 lines to update in `cold-session-discoverability.test.cjs` (L68, L77, L166, L185, L202, L235, L315). The researcher B report (§6) provides a more complete list (L35, L68, L77, L111, L153, L166, L185, L202, L220, L235, L257, L277, L301, L346, L349). The plan claims "5 path-string references" but the actual file contains many more `tools/learning-loop-mcp/` references (verified by reading the file — references at L35, L68, L77, L111, L153, L166, L185, L202, L220, L235, L257, L277, L301, L315, L349, etc.). The plan's Phase 5 §Implementation Step 3 (line 78-82) acknowledges the plan should "grep and classify each" but the success criteria (line 97-100) only asserts 4 specific lines are updated. The `evidence_code_ref` strings at L166, L185, L202, L235, L257, L315 reference **files that will be deleted in Phase 4** (`tools/learning-loop-mcp/server.js` is deleted; `tools/learning-loop-mcp/tools/loop-describe-tool.js` stays but its evidence ref is unchanged per plan). After Phase 4 deletes the server, lines L235, L257, L315 evidence_code_refs pin to a **non-existent file**. While these are inside `tempRoot` test fixtures and don't break the test execution, the resulting `meta_state_check_grounding` calls against these refs will return `evidence_not_found` and the meta-state drift check will fire false positives.
- **Attack scenario:** Operator runs Phase 5 path updates per the plan, missing L35 (the unused `serverEntry` variable) and L346 (`hookPath`). The cold-session test still passes because L35 is unused. But the meta-state registry acquires stale evidence refs pointing at `tools/learning-loop-mcp/server.js` (post-deletion). When the `rule-no-orphaned-evidence` consult-gate fires (per AGENTS.md line 31), it blocks `meta_state_resolve` calls until `meta_state_refresh_fingerprint` is run. The operator cannot resolve F4 cleanly — `meta_state_check_grounding` returns `stale_evidence` because the file no longer exists. The Phase 6 resolve call is blocked.
- **Evidence:**
  - `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:35` — unused `serverEntry` variable
  - `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs:68,77,111,153,166,185,202,220,235,257,277,301,315,349` — path/evidence references (verified by reading the file lines 1-389)
  - `plans/260617-1950-phase-c-plan-3-cut-over/phase-05-update-cold-session-tests.md:97-101` — success criteria only assert 4 line updates
  - `AGENTS.md:31` — `rule-no-orphaned-evidence` consult-gate description
- **Suggested fix:** Phase 5 success criteria should include a `grep -c "tools/learning-loop-mcp" tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` count of 0 (or count of references ONLY in `core/` and `__tests__/` subdirs, which are preserved). The plan should also explicitly list the evidence_code_ref lines that need updating to point at `tools/learning-loop-mastra/server.js` or removed entirely.

---

## Finding 7: AGENTS.md + README.md + 5 docs files contain stale `tools/learning-loop-mcp/server.js` references; the plan's "auto-regenerated" claim is false

- **Severity:** Medium
- **Location:** Phase 4 §Security Considerations + Phase 7
- **Flaw:** Phase 4 line 100 acknowledges "AGENTS.md is updated in the closeout report (not in code, since the file is auto-regenerated against the manifest)." This is **factually wrong** — `AGENTS.md` is NOT auto-regenerated. The `agent-manifest.json` is the manifest; `AGENTS.md` is hand-curated documentation. Verified: `git log --oneline AGENTS.md` shows manual edits; the file contains prose like "MCP server (`tools/learning-loop-mcp/server.js`) — 36 tools per `agent-manifest.json`" at AGENTS.md:50. After Phase 4 deletes the legacy server, this sentence references a deleted file. The plan defers the update to "closeout report" — but the closeout is a journal, not a code file, so the stale AGENTS.md will remain in the repo at merge time. **Any agent reading AGENTS.md at session start (which is the operator-facing source of truth) will see a reference to a deleted file.** This is a doc-drift attack surface: a prompt-injection via stale doc references could trick an agent into attempting to import the deleted path, which would surface as an error in the agent's tool-call error path.
- **Attack scenario:** Phase 7's closeout journal is created, but `AGENTS.md` still has "MCP server (`tools/learning-loop-mcp/server.js`) — 36 tools per `agent-manifest.json`" at line 50. The new `agent-manifest.json` says `version: "0.2.0"` with 40 tools. An agent reading AGENTS.md to discover the tool surface sees "36 tools" and stops enumerating at 36, missing the 4 D-11 reconciliation tools added in Phase 2. The agent's `loop_describe` call returns 40, creating a documentation-vs-runtime drift that future agents must reconcile. Worse: a malicious operator prompt that references the stale 36-tool claim could trick the agent into thinking `meta_state_supersede` doesn't exist (when it does at index 20 of the new meta_state group), suppressing meta-surface safety checks.
- **Evidence:**
  - `AGENTS.md:50` — "MCP server (`tools/learning-loop-mcp/server.js`) — 36 tools per `agent-manifest.json`" (hand-curated, not auto-regenerated)
  - `README.md:48` — "MCP server (`tools/learning-loop-mcp/server.js`) — meta-surface tools, constraint checks..."
  - `docs/mcp-server-restart-protocol.md:3,39,76-78` — 4 references to deleted path
  - `docs/system-architecture.md:163` — "**File:** `tools/learning-loop-mcp/server.js`"
  - `docs/journals/260527-restructure-coordination-and-references.md:86,95` — 2 references
  - `plans/260617-1950-phase-c-plan-3-cut-over/phase-04-deprecate-legacy-server.md:100` — "AGENTS.md is updated in the closeout report (not in code, since the file is auto-regenerated against the manifest)" — this claim is factually wrong
- **Suggested fix:** Add an explicit Phase 4.5 (or extend Phase 7) to update `AGENTS.md`, `README.md`, `docs/mcp-server-restart-protocol.md`, and `docs/system-architecture.md`. The plan's "auto-regenerated" claim is a hallucination that, if propagated, will leave the repo in a documented-but-incorrect state at merge.

---

## Finding 8: The `#mcp/*` import alias retention routes all canonical tool loads through a dir named after the deleted server; tools/ is write-gate-allowed

- **Severity:** Medium
- **Location:** Plan overview "Key Risks Addressed" + Phase 1
- **Flaw:** The plan keeps `package.json#imports.#mcp/*` → `tools/learning-loop-mcp/*` (Phase 4 §Context Links) and the mastra server at `tools/learning-loop-mastra/server.js:17` continues to use `await import(\`#mcp/${file}\`)` to import each tool. This means **post-cut-over, the entire mastra server's tool surface is loaded from a directory whose name is now misleading** (the dir is named `learning-loop-mcp` but is the source library for `learning-loop-mastra`). The plan acknowledges this in plan line 156: "`#mcp/*` import alias becomes confusing post-cut-over (low). The alias resolves to `tools/learning-loop-mcp/*` (the legacy dir). The alias name is now historical; consider renaming in a follow-up plan (not Plan 3 scope)." This is documented as a low-severity risk but it has security implications. An attacker who gains write access to `tools/learning-loop-mcp/tools/` (e.g., via a `product/**` write preflight that the inbound gate or write-gate doesn't fully cover) can inject malicious code into the tool source files. The mastra server's `#mcp/*` import resolves to this dir, so the malicious code runs under the mastra server's stdio context. The path-based gate (write-gate.js:62-69) blocks direct writes to `records/**` but `tools/**` is explicitly allowed (write-gate.js line 163-164 — "Everything else (plans/, docs/, .claude/, .factory/, tools/, unknown) → allow"). The `promotedRules` check (line 155-161) may add gates via meta-state, but the default is allow.
- **Attack scenario:** An attacker with write access to the repo (e.g., a malicious PR or a compromised dev environment) commits a change to `tools/learning-loop-mcp/tools/gate-check-tool.js` that exfiltrates `OPERATOR_MODE=1` env vars (visible in `process.env.OPERATOR_MODE` during `meta_state_resolve` calls) to an external URL. The change passes the write gate (tools/ is allowed). The mastra server's next stdio boot (operator restart) imports the malicious module via `#mcp/*`. The agent runtime calls `mastra_gate_check` which now runs attacker code. The attacker exfiltrates the operator-mode env, gains the ability to call `meta_state_resolve` with operator privileges, and resolves any active finding (including F4 — but F4 is already resolved) or files new findings that auto-promote to rules via `meta_state_promote_rule`.
- **Evidence:**
  - `package.json:19` — `"gate:server": "node tools/learning-loop-mcp/server.js"` (script also references deleted file post-Phase 4)
  - `tools/learning-loop-mastra/server.js:17` — `await import(\`#mcp/${file}\`)` (all tool imports route through #mcp/*)
  - `tools/learning-loop-mcp/hooks/write-gate.js:163-164` — `tools/**` is allowed
  - `plans/260617-1950-phase-c-plan-3-cut-over/plan.md:156` — the alias retention is documented as "low" risk
- **Suggested fix:** (1) Rename the alias from `#mcp/*` to `#tool-source/*` in a follow-up plan (the plan defers this but the risk is non-trivial). (2) Add a promoted rule that requires preflight for `tools/learning-loop-mcp/tools/**` writes (the dir is now source-of-truth for the canonical server, not legacy).

---

## Finding 9: The `pre-commit` hook runs `pnpm test` — but the plan's commit order will block the Phase 4 commit

- **Severity:** Medium
- **Location:** Phase 5 + Phase 7
- **Flaw:** `package.json:38-40` defines `simple-git-hooks: { "pre-commit": "pnpm test" }`. This means **every commit in the PR triggers the full test suite**. The plan creates 9 commits (Phase 1, 2, 3, 4, 5, 6, 7, tracker, closeout — plan §Total Effort). For commits 1-3 (manifest, config), `pnpm test` passes. **Commit 4 (Phase 4: delete `server.js` + `tool-registry.js`)** will FAIL `pnpm test` because: (a) `tools-list-collision.test.cjs` references the deleted server, (b) `meta-state-refresh-tools-tool.test.js` imports from the deleted `tool-registry.js`. Phase 5 is the commit that fixes the tests — but Phase 4 comes first. **The pre-commit hook blocks Phase 4's commit.** The plan does not acknowledge this. The Phase 4 risk table line 86 says "A test imports `tool-registry.js` for `coerceParamsToSchema` or `installWireFormatCoercion`" → mitigation: "Pre-check step 1 catches this" — but the pre-check only verifies the import audit; it does not propose a strategy for the failing test files. The pre-commit hook will block the commit, forcing the operator to either skip the hook (compromising the audit chain) or restructure the commits.
- **Attack scenario:** Less of a security attack, more of a developer-experience trap. An operator under time pressure (post-cut-over = 4-6h deadline) may bypass the pre-commit hook with `--no-verify` to keep momentum. This establishes a norm of bypassing the hook, which an attacker can later exploit by submitting a PR where the bypass was used to commit untested code. The pre-commit hook is the only enforced gate; bypassing it is a soft attack surface.
- **Evidence:**
  - `package.json:38-40` — `simple-git-hooks: { "pre-commit": "pnpm test" }`
  - `plans/260617-1950-phase-c-plan-3-cut-over/phase-04-deprecate-legacy-server.md:88-90` — risk table line 88: "The test glob is `'tools/learning-loop-mcp/__tests__/*.test.js'` — it matches test files, not server/tool-registry files" — this is wrong; `tools-list-collision.test.cjs` and `meta-state-refresh-tools-tool.test.js` are in the glob and will fail when their imports break
  - `tools/learning-loop-mcp/__tests__/meta-state-refresh-tools-tool.test.js:6` — `import { metaStateRefreshToolsTool } from "../tools/meta-state-refresh-tools-tool.js";` (works, but the tool itself imports deleted `tool-registry.js`)
  - `tools/learning-loop-mcp/__tests__/tools-list-collision.test.cjs:18-19` — imports `withBothMcpServers` from `tools/learning-loop-mastra/__tests__/with-both-mcp-servers.js` (deleted in Phase 5)
- **Suggested fix:** Phase 4 and Phase 5 should be a SINGLE commit (or Phase 5 should happen BEFORE Phase 4). Alternatively, the plan should propose `git commit --no-verify` for the Phase 4 commit with a follow-up Phase 5 commit that re-establishes the green test suite — but document this explicitly so future audits see the bypass and the rationale.

---

## Finding 10: F4's `code_fingerprint` anchor (`server.js:38`) is invalid — drift detection will permanently misfire

- **Severity:** Medium
- **Location:** Phase 6 ("resolve-f4-and-tracker")
- **Flaw:** Phase 6 line 71 says: "Expect: `status: grounded` (the `tools/learning-loop-mastra/server.js:38` evidence ref now hashes to a fresh value; the file's `PREFIX` line is at the new line number after Phase 1's manifest expansion — verify)." The plan contradicts itself: line 71 admits the `PREFIX` line is at a different line number after Phase 1's manifest expansion, but it still uses `server.js:38` as the fingerprint anchor. Verified by `grep -n "PREFIX" tools/learning-loop-mastra/server.js`: PREFIX is at line 13 and 23 (string concat site), not line 38. Line 38 is `description:` (start of a multi-line string field). The fingerprint will be computed against the wrong anchor, producing an unstable hash that changes with any whitespace edit to the description field.
- **Attack scenario:** Post-cut-over, any operator edit to the server's `description:` field (e.g., updating "Phase C Plan 1" to "Phase C Plan 3") changes the line 38 hash, which causes `meta_state_check_grounding` to return `drift_detected: true`. The `rule-no-orphaned-evidence` consult-gate fires. All future `meta_state_resolve` calls are blocked until the fingerprint is refreshed. The agent surfaces the false drift to the operator, who must manually call `meta_state_refresh_fingerprint` to unblock — establishing a recurring operational tax. Worse, the F4 fingerprint is now pinned to a line that has **no security relevance** (the description is documentation, not a gate). Future drift detection on F4 is effectively noise.
- **Evidence:**
  - `grep -n "PREFIX" tools/learning-loop-mastra/server.js` — returns lines 13, 23 only
  - `sed -n '38p' tools/learning-loop-mastra/server.js` — returns `  description:` (line 38 is a string field)
  - `plans/260617-1950-phase-c-plan-3-cut-over/phase-06-resolve-f4-and-tracker.md:71` — uses `server.js:38` as evidence ref
  - `plans/260617-1950-phase-c-plan-3-cut-over/phase-06-resolve-f4-and-tracker.md:112` — risk table line 112: "Phase 1 added entries to `tools/learning-loop-mastra/tools/manifest.json` (a different file than the `server.js:38` evidence ref). The `server.js:38` line is the `PREFIX = "mastra_"` line — unchanged." — factually wrong; line 38 is not the PREFIX line
- **Suggested fix:** Anchor F4's `code_fingerprint` on `tools/learning-loop-mastra/server.js:13` (the `PREFIX = "mastra_"` constant) and Phase 6 should explicitly note that the anchor is line 13, not line 38. Update the risk table.

---

## Summary of Findings

| # | Finding | Severity |
|---|---------|----------|
| 1 | Mastra manifest expansion has unverified name-collision risk; `server.js:38` is misidentified as PREFIX line | Critical |
| 2 | F4 closure deletes the parity proof; MCP-tool-level gate enforcement is unverified post-cut-over | Critical |
| 3 | `clearRegistrations` + `__loopMcpServer` deletion creates boot-time crash if `meta-state-refresh-tools-tool.js` is not also edited; removes hot-reload admin path | High |
| 4 | `quickstart.meta_state_query` field is unstructured and unvalidated; potential prompt-injection surface at session start | High |
| 5 | `mcp-config-peer.test.js` rename loses peer-presence assertion; no test catches re-introduced second server | High |
| 6 | Cold-session test path-update list omits 5+ references; evidence_code_refs pin to deleted files | High |
| 7 | AGENTS.md + README.md + 5 docs files contain stale legacy-server references; plan defers to "auto-regenerated" (false) | Medium |
| 8 | `#mcp/*` import alias retention routes all tool loads through a dir named after the deleted server; tools/ is write-gate-allowed | Medium |
| 9 | `pnpm test` pre-commit hook will block Phase 4 commit; plan does not address the hook-vs-commit-order conflict | Medium |
| 10 | F4's `code_fingerprint` anchor at `server.js:38` is invalid (line 38 is `description:`, not `PREFIX`); drift detection noise | Medium |

**Unresolved questions for the planner:**
1. The plan claims `agent-manifest.json` is auto-regenerated against the manifest (Phase 4 line 100). This is false. Is there a regeneration script I missed?
2. The plan's Phase 4 risk table line 88 claims the test glob "matches test files, not server/tool-registry files" — but `tools-list-collision.test.cjs` and `meta-state-refresh-tools-tool.test.js` will FAIL when their dependencies are deleted. How does Phase 4 commit pass the pre-commit hook?
3. Is there a CI test that asserts `mastra_gate_check` is byte-equivalent to `gate_check` post-cut-over? The plan deletes the parity test but does not propose a replacement.
4. The plan's "Out of Scope" section defers the `learning-loop-mastra` → `learning-loop` JSON key rename — but the alias `#mcp/*` is also a misnomer post-cut-over. Should both be addressed together?
5. Phase 6's `meta_state_log_change` for the tracker flip is filed as `change_dimension: "semantic"` — but the tracker body text adds a link to this plan, which is a structural change. Should it be `change_dimension: "structural"` for accurate audit?
