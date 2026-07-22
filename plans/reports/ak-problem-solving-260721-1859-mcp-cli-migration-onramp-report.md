# MCP → CLI Migration Onramp — Trigger Status + Start Paths

**Scope:** advisory for finding `meta-260721T0809Z-transport-diversification-to-a-cli-is-a-deferred-decision-no` (open, severity: warning). Wiring now planned (Phase 1 in progress) — see Progress.
**Method:** evidence check of the finding's own gate (T1/T2/T3) + architecture read of the handler/core split. Inversion applied: "migration" reframed as *adding* the contract's second named transport, not swapping.

---

## Progress (plan `260721-1933-cli-transport-phase1-read-only-slice`)

**Operator decision (2026-07-21):** Option A — build the read-only CLI slice (§5 Phase 1, 7 tools) as the contract's second named transport. Finding patched v1 (T3 incident-history reading recorded on `meta-260721T0809Z`). Plan: `plans/260721-1933-cli-transport-phase1-read-only-slice/` (3 phases, `--deep --tdd`, red-teamed).

| Phase | What | Session | Status |
|-------|------|---------|--------|
| 1 | Schema-normalize seam (`normalizeInputSchema` → `core/schema-normalize.js`, Mastra-free) | **this session** | pending → in-progress |
| 2 | Read-only CLI (`bin/loop.mjs`) + parity tests (7 tools, `list`, exit 0/1/2) | **next session** | blocked on 1 |
| 3 | Docs (new "Read-only CLI transport" bullet + L27 pluralize; L25 unchanged) + bash-gate guard test + `check_runtime_agnostic` audit | after 2 | blocked on 2 |

**Plan deltas vs this report's §5/§6 (from red-team + scouts):**
- **Bash-gate allowlisting (report's "Real cost #1") dissolved.** Gate is default-allow; promoted rules are *blockers*, not allowlisters (`core/gate-logic.js:1008-1016`). Read-only `node bin/loop.mjs …` writes no protected path, matches no blocking regex → `decision: "ok"`. No rule promoted. Phase 3 adds a guard test locking this.
- **Parity is normalized, not byte-equal.** `meta_state_check_grounding`/`meta_state_derive_status` emit `checked_at`+`duration_ms`; `loop_describe` warm/cold emit `timing.*`/`built_at` → strip on both sides. `loop_describe` uses the summary tier (no timing, no cache write).
- **Independent tmpdirs per side.** `check_grounding` auto-records the fingerprint on the first call only → `fingerprint_was_recorded` flips across run order in a shared root; plus `appendGateLog` cross-contamination. Both sides get a freshly-seeded tmpdir; `fingerprint_was_recorded` stays IN the assertion.
- **`MISSING_LOOP_SURFACE` → exit 2** (caller-configuration precondition, per `validate-registry-refs.js:240-274`), not exit 1.
- **`findProjectRoot()` resolves to the loop's own repo root regardless of cwd** (not "invoke from repo root"); wrong-root is silent — documented in the CLI header.
- **Read-only CLI = a NEW transport category** (tool surface + no write path ≠ shell-hook-only ≠ write-capable CLI). `runtime-contract.md` L25's write-capable-CLI clause is left UNCHANGED; a new bullet is added and L27 pluralizes read-only transports.

**Next session starts at Phase 2** (Phase 1 lands first). Phase 2 is the core phase; Phase 3 closes the wiring.

### Next step (post Phase 1-3): per-runtime MCP read-opt-out → CLI

Phase 1-3 only *adds* the CLI as a second transport; both channels coexist, so the **context-size win is not yet realized**. The win materializes only when a runtime *opts out of MCP reads and reads via CLI instead* — manifest bytes then leave the model context (the whole point for non-syn profiles). This is tracked here as the next plan, not folded into the read-only-slice plan (which is scoped to wiring the transport, not to any opt-out).

**Next plan — runtime MCP read-opt-out (reads via CLI):**
- Mechanism: a per-runtime config that tells a runtime to use `bin/loop.mjs <tool>` for the 7 read tools instead of the `mastra_<tool>` MCP tools. MCP stays wired for writes (Capability 3) — the opt-out is read-only.
- Gating: **T2 ergonomics evidence from Phase 1 usage** (this report §6: "Hold Phase 2 until Phase 1 produces T2 ergonomics evidence"). The opt-out must not strand a runtime on an unvalidated transport; Phase 1-3 must ship and accrue real `loop.mjs` usage first.
- Contract touch: `docs/runtime-contract.md` "A runtime picks one transport" (L27) — currently every wired runtime picks MCP+hooks. The opt-out makes the pick *configurable per runtime*, which is new behavior the contract should name (likely a sentence in the read-only-CLI bullet added in Phase 3).
- Out of this next plan: write-capable CLI (report §5 Phase 2) — a *full* MCP opt-out (reads + writes via CLI) depends on it. Sequence: read-opt-out (this next plan) → write-capable CLI → full opt-out.

**Open question (next plan):** read-only opt-out only (MCP retained for writes) vs full opt-out (needs the write-capable CLI). The read-only opt-out is achievable immediately after Phase 1-3 + T2 evidence; the full opt-out is further out. Recommend read-only opt-out first — it captures the context-size win (reads dominate the manifest-byte cost) without waiting on write-ergonomics validation.

---

## 1. Verdict (revised after operator debate)

**T3 fires — under the incident-history reading, which is the correct one.** T3's evidence is not the classifier rows; it is `meta-260719T2120Z` itself: a measured silent-undelivery incident (session `b96b96c3`: ~101KB recorded attachments, 9,322-token first call, zero hint visibility, no error signal, found only by manual forensics), whose closure on the incident profile is explicitly unverified ("syn-profile forensics recorded as documented-degradation (transcript absent)"), in a failure mode that recurs across loci (260704T0959Z, 260715T2300Z). The 11/11 `full` rows measure the fix holding on the profiles sampled — they say nothing about the incident's home turf, because the classifier has no profile tagging.

T1: not firing (no recurrence in registry). T2: operator judgment, never exercised.

Consequence: the gate condition "at least one trigger fires with evidence" is **satisfied today** if the operator adopts the incident-history reading. The finding's original text framed T3 as measurable only via classifier rows ("until then T3 is opinion"); the operator debate established that the incident predates the measurement — the classifier made it *visible*, it did not create it. Revising the evidence definition is the operator's call (it reverses the finding's own framing); this report treats it as adopted per the 2026-07-21 debate.

## 2. Trigger status (evidence)

| Trigger | Definition (finding) | Evidence today | Firing? |
|---|---|---|---|
| **T1** chronic lifecycle pain | stale-PID kills must be chronic, not the one-off 22h server | Registry search: no stale-PID/stale-server finding since 2026-07-11. Count of recorded occurrences: 0 in 10 days | **No** (sparse; "chronic" threshold undefined) |
| **T2** ergonomics loss acceptable | agent tolerates Bash-as-tool-channel | No data — never exercised. Pure opinion, same shape T3 was before plan 260720-1955 | **Unknown** (operator judgment; unmeasurable without a harness) |
| **T3** chronic silent-undelivery of push-steering | delivery-classifier rows in `runtime-state.jsonl` — **but the evidence base is the incident history, not the rows** | (a) Measured incident `b96b96c3`: ~101KB attachments recorded, 9,322-token first call, zero hint visibility, silent (260719T2120Z). (b) Incident-profile closure unverified: "documented-degradation (transcript absent)". (c) Classifier is profile-blind (rows carry `model`, no `profile`). (d) 11 rows all `full` — measures the fix holding on sampled profiles only. (e) Same failure mode recurs across loci: 260704T0959Z, 260715T2300Z (open) | **Yes** (incident-history reading, per operator debate 2026-07-21) |

T3 caveats (what remains honestly open):
1. **Recurrence on the measured channel post-fix is unproven both ways** — 11/11 `full` covers glm-5.2:cloud / MiniMax-M3 / k3 rows, none profile-tagged; the syn/lean path that produced the incident has no post-fix sample.
2. **Classifier scope** — it measures first-call token floors for the SessionStart channel only. Other push legs (process-hints push, inbound-gate context) are outside its floors.
3. **No cadence** — `delivery-classify.mjs` is not wired into any hook, cron, or package script. Needed now for a different reason than originally framed: not to *detect* T3, but to *attest the fix keeps holding* — and to catch the first syn-profile session classifying `lean`.

## 3. Residual gaps in the finding's measurement apparatus

~~"chronic" is undefined~~ — superseded for T3 by the incident-history reading (the measured incident + unverified closure *is* the chronicity evidence). What remains:

- **T1 threshold still undefined.** Proposed: ≥2 stale-PID / manual-kill events in a rolling 30 days, each recorded as a gate-log or meta-state finding (currently kill events leave no loop-visible trace — a measurement gap of its own).
- **Profile tagging missing.** The classifier cannot see profile-conditional undelivery (`model` ≠ `profile`). The 260719T2120Z remediation direction named per-profile delivery attestation + session tagging; the delivered resolution did not include it. Until rows carry `profile`, the syn/lean path stays unmonitored — the exact blind spot the incident exploited.
- **Classifier cadence absent** — needed as fix-attestation, not T3-detection (see §2 caveat 3).

## 4. The reframe that lowers the cost

`docs/runtime-contract.md:19-27` (the finding's own `evidence_code_ref`, :25) is **many-to-many**: transports are additive; runtimes pick one. The contract already names the CLI: *"a write-capable non-MCP channel — a CLI exposing the loop's tools as commands — would be the smallest transport that does exercise Capability 3."*

So "MCP → CLI migration" is misframed as a swap. The real work is **wiring a second named transport**; MCP keeps serving the 3 wired runtimes. This kills the 260711 report's highest-cost line ("re-wire 3 runtimes") — nothing is re-wired; a runtime opts in when its trigger fires.

## 5. Technical shape of the slice (ready-to-execute design)

The handler/core split makes the CLI thin. Per handler module in `tools/learning-loop-mastra/tools/handlers/` (42 handlers), the export is `{ name, description, schema (zod), handler }`. The MCP-only layer is ~3 files.

**Transfers free (import, don't rebuild):**
- zod arg validation + wire-format coercion — `normalizeInputSchema` + envelope strippers (`mastra/create-loop-tool.js:18-28`, `mastra/handler-adapter.js`)
- R2 write authorization — `withR2Gate` is a pure execute-wrapper (`mastra/with-r2-gate.js`, applied at `create-loop-tool.js:78`); `core/identity-pin.js`, `core/path-containment.js`
- cross-process file locks — already in `core/` (transport-correct by construction, per 260711 R7)
- manifest loading — same JSONC shim + `resolveToolImportUrl` (`mastra/server.js:31-34,45-50`)

**CLI skeleton** (`tools/learning-loop-mastra/bin/loop.mjs`, ~80 LOC):
```
loop.mjs <tool-name> '<json-args>'
  1. pinRuntimeIdAtBoot()
  2. load tools/manifest.json (JSONC strip, same as server.js)
  3. resolveToolImportUrl → import handler
  4. normalizeInputSchema(schema).parse(JSON.parse(argv[3]))
  5. withR2Gate({ id, execute: adaptLegacyHandler(legacy), pathFields })
  6. stdout: JSON.stringify(result); errors → stderr, exit 1
```

**Phasing:**
- **Phase 1 (read-only, 7 tools):** `loop_describe`, `loop_get_instruction`, `meta_state_list`, `meta_state_relationships`, `meta_state_derive_status`, `meta_state_check_grounding`, `runtime_state_read`. No write path → exercises Capabilities 1+4, not 3. Equivalent in spirit to the contract's read-only participation; smallest possible blast radius.
- **Phase 2 (write, gated on T2 acceptance):** `meta_state_report`, `meta_state_resolve`, `meta_state_batch`, `runtime_state_record`, `gate_mark_preflight`, `meta_state_promote_rule`. This is the contract's "smallest Capability-3 transport."
- **Excluded initially:** `run_workflow_*` (Mastra-bound registry), `workflow_storage_*` (needs `initStorage`, server-bound), `update_r2_allowlist` (logic is inline in `server.js:77-107`, not a handler module — extract only if needed).

**Real costs (T2 made concrete):**
1. **Bash-gate allowlisting** — the loop's own bash gate will flag `node .../bin/loop.mjs` invocations; needs a promoted rule allowlisting it. Self-referential but mechanical.
2. **Steering surface** — session-start hints name `mastra_*` MCP tools; a CLI runtime needs the hint renderer (`core/hint-renderer.js`) to emit command forms. Pointer-projection architecture already separates builder from rendering, so this is a renderer variant, not new content.
3. **Agent ergonomics** — stdout JSON parse vs native tool call; no `tools/list` discovery (mitigated: `loop.mjs list` prints the manifest).

## 6. Three start options (operator decision) — re-scoped post-debate

With T3 firing, the finding's gate condition ("at least one trigger fires with evidence") is met. Wiring is no longer deferred; what remains is choosing scope and sequencing. T2 (ergonomics) is still unexercised — it now decides *how far* Phase 2 goes, not *whether* to start.

**Option A — Phase 1 now (recommended).** Build the read-only CLI slice (§5 Phase 1: 7 tools) as a wired second transport. Gate is satisfied via T3; no interpretation needed. Immediately generates real T2 ergonomics evidence on the read path. Cost: ~1–2 days.

**Option B — Phase 1 + profile-tagging + cadence first.** Close the measurement blind spot (tag delivery rows with active profile; wire classifier cadence) *before* the CLI, so the syn/lean path is attested before a second transport depends on steering delivery. Cost: ~2–3 days. Choose this if the unverified syn-profile closure feels like the sharper risk.

**Option C — Phase 1+2 (write-capable).** The contract's "smallest Capability-3 transport" in one go. Premature: T2 is still opinion, and Phase 2 is exactly where ergonomics bites (bash-gate allowlisting, stdout parsing on the write path). Wait for Phase 1's T2 evidence.

**Recommended sequence:** A (or B if the operator weights the syn-profile blind spot higher), then re-evaluate T2 with real usage before committing Phase 2.

## 7. Immediate next actions if approved

1. Record the T3 evidence-definition revision on the finding: `meta_state_patch` the deferred-decision finding's description to state T3 fired via incident-history evidence (`reopens`-style cross-ref to 260719T2120Z), so the gate status is loop-visible, not just session-visible.
2. Implement `bin/loop.mjs` Phase 1 (§5) + parity test against MCP responses for the 7 read-only tools.
3. (Option B) Tag delivery rows with active profile; wire `delivery-classify.mjs` cadence as fix-attestation; record stale-PID kills as findings (T1 measurability).
4. Hold Phase 2 until Phase 1 produces T2 ergonomics evidence.

## Unresolved questions

1. Does the operator formally adopt the incident-history reading of T3 (revising the finding's "T3 is opinion until classifier rows exist" framing)? This report treats it as adopted per the 2026-07-21 debate; the finding itself still carries the old framing until patched.
2. Option A vs B: is the unverified syn-profile closure ("documented-degradation, transcript absent") a blocker for a second transport, or acceptable residual risk?
3. Should stale-PID kill events get their own ledger row (like `delivery-*`) so T1 becomes measurable the same way T3 did?
