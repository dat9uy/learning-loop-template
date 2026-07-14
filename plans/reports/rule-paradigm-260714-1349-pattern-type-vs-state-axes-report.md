# Rule paradigm: pattern_type vs the state axes (L1/L2 status report)

Triggered by finding `meta-260714T1334Z-the-test-result-parsing-procedure-is-not-surfaced-to-the-age`.
Scope: advisory analysis of how the `rule` record's `pattern_type` + `enforcement` fields
relate to the L1 concept of *rule* (`docs/loop-engine.md`) and the L2 State 1/2/3 model
(`docs/philosophy.md`). No code changed.

## Part 1 — Current status (implementation)

### 1.1 The rule record has two orthogonal axes

`metaStateRuleEntrySchema` (`core/meta-state.js:276-309`):

- `pattern_type ∈ {regex, glob, resolution-evidence-required, consult-checklist}` — "Pattern language"
- `enforcement ∈ {gate, agent}` — "Where the rule is enforced"
- plus `scope_predicate`, `applies_to_resolution`, `applies_to`, `supersedes`, binary `status`.

### 1.2 Live registry: 11 rules, bucketed

| pattern_type | # | rule ids | enforcement |
|---|---|---|---|
| `regex` | 3 | `rule-no-new-artifact-types` | gate |
| | | `rule-import-chain-analysis-after-tool-deletion` | agent |
| | | `rule-assertinvariant-at-boundary` | agent |
| `glob` | 2 | `rule-project-skill-boundary` | gate |
| | | `rule-short-slug-for-risk-records` | agent |
| `resolution-evidence-required` | 2 | `rule-cold-session-test-must-pass-before-resolution` | gate |
| | | `rule-no-orphaned-evidence` | **agent** |
| `consult-checklist` | 4 | `rule-runtime-agnostic-features`, `rule-pr-body-registry-deltas`, `rule-tool-integration-same-commit-dep`, `rule-fallow-brief-on-gate-failure` | all agent |

### 1.3 pattern_type → consumption surface (what the code actually does)

- `regex` → matched in `applyPromotedRules` (`gate-logic.js:774`) against **command segments**.
  Called only from the **bash gate** (`evaluate-bash-gate.js:103` passes `command`, `filePath=null`).
  ReDoS-guarded. Write gate passes `command=null` → regex never matches there.
- `glob` → matched in `applyPromotedRules` (`gate-logic.js:787`) against **filePath**.
  Called only from the **write gate** (`evaluate-write-gate.js:198` passes `command=null`, `relPath`).
  Path-traversal whitelisted. Bash gate passes `filePath=null` → glob never matches there.
- `resolution-evidence-required` → **explicitly skipped** in bash/write gates
  (`gate-logic.js:767-773`; `rule.js:17` returns false). Consumed only in `meta_state_resolve`
  (`meta-state-resolve-tool.js:84-118`) → `checkResolutionEvidence` (`gate-logic.js:652`).
  Two branches: global orphan/fingerprint scan (`rule-no-orphaned-evidence`) and per-finding
  `subtype+session_id` match.
- `consult-checklist` → **explicitly skipped** in all gates (`gate-logic.js:750-755`).
  `pattern` holds a JSON checklist body. Reaches the agent only via:
  1. H6 ordering gate (`loop-describe-tool.js:94-106`) — requires a PROCESS_HINTS row citing the rule id;
  2. PROCESS_HINTS (`loop-introspect.js:122`) emitted in `loop_describe` warm tier;
  3. LOCAL_PROCESS_HINTS (`.factory/hooks/loop-surface-inject.cjs:35`) — byte-mirror for cold-session inject.

### 1.4 The two inconsistencies (this is the crux)

**Inconsistency A — `enforcement` is ignored for `resolution-evidence-required`.**
`meta_state_resolve` filters by `pattern_type` only, never by `enforcement`
(`meta-state-resolve-tool.js:89,100`). So `rule-no-orphaned-evidence` is labelled
`enforcement=agent` yet **hard-blocks** resolve (`{ resolved:false, reason:"resolution_evidence_required" }`,
line 92-95). An "agent (consult)" rule deterministically blocks. This contradicts `AGENTS.md:65`
("Two enforcement classes: `gate` (hard-block) and `agent` (consult)").

**Inconsistency B — `agent + regex/glob` rules carry dead match specs.**
`applyPromotedRules` skips non-`gate` rules (`gate-logic.js:757`). So
`rule-assertinvariant-at-boundary` (regex `^export (async )?function…`), `rule-import-chain-analysis-after-tool-deletion`
(regex), and `rule-short-slug-for-risk-records` (glob) are **never matched**. Their `pattern` is
vestigial prose. A regex matching `^export function` is a *code-review checklist item*, not a
command match — these are `consult-checklist` rules mis-typed as `regex`/`glob`.

### 1.5 Documentation gaps

| Aspect | Code | `docs/` (excl. journals/archive) |
|---|---|---|
| 4 `pattern_type` values + semantics | defined, enforced | **0 mentions** |
| pattern_type → consumption-surface map | implicit in `gate-logic.js` | undocumented |
| `enforcement` × `pattern_type` matrix | inconsistent (A, B) | `AGENTS.md:65` defines gate/agent; contradicted by A |
| `scope_predicate`, `applies_to_resolution` | implemented | undocumented |
| consult-checklist ↔ PROCESS_HINTS ↔ H6 contract | enforced by H6 | `core/README.md` documents it for **one** rule only |
| `gate_override` scope | regex/glob only | `architecture.md:210` says "bash gate" (glob fires in write gate; incomplete) |

## Part 2 — L1: what `rule` means conceptually

From `docs/loop-engine.md` (the concept surface):

- **rule** = "a promoted record that enforces an invariant. A rule is what a recurring agentic
  deferral becomes once it is encoded." (`loop-engine.md:41`)
- The engine invariant: every step is `deterministic` (rule-enforced, registry-driven, no model
  judgment) or `agentic` (deferred to a model). Telos: **grow the deterministic surface; shrink
  the agentic surface.** Promotion is the lift (`agentic deferral → finding/change-log → rule`).
- The many-to-many table (`loop-engine.md:60`): `rule` = "a promoted finding, enforced by **gate
  or agent**", realizable by "a consult-gate; **a checklist**."
- Two-surface discipline (`loop-engine.md:48-51`): concept vocabulary (deterministic-step,
  agentic-step, record, rule, promotion) must not share vocabulary with implementation vocabulary.

**L1 verdict:** the concept role `rule` deliberately spans two enforcement modes — *gate*
(deterministic) and *agent* (consult) — and two mechanisms — *consult-gate* and *checklist*.
So a rule that is consulted (not hard-blocked) is still a rule at L1. The L1 is sound and already
admits our state-2 case. **There is no missing L1 paradigm; the concept is correct.**

## Part 3 — L2: how rules map to the State 1/2/3 requirement

`docs/philosophy.md:35-45` defines the two-axis state model (injection × consumption):

| State | Injection | Consumption | Home |
|---|---|---|---|
| 1 escape-hatch | agentic | agentic | unwired instruction |
| 2 wired | **deterministic** | **agentic** | permanent home for content needing judgment |
| 3 encoded (terminus) | deterministic | **deterministic** | rule/gate fires w/o model judgment |

`philosophy.md:96`: state-3 is realized by the `deterministic-step` role. `philosophy.md:43`:
state-2 is **not** a waystation — content needing judgment stays there permanently.

### 3.1 Mapping each pattern_type to a state

Injection is **deterministic for all 4 pattern_types** (gate lifecycle / resolve tool / SessionStart
hook all fire without model discretion). So the state is set by **consumption** = the `enforcement`
field's intended meaning:

| pattern_type | Consumption | State | Injection mechanism |
|---|---|---|---|
| `regex` (gate) | deterministic regex match → escalate | **3** | bash gate, every Bash call |
| `glob` (gate) | deterministic path match → escalate | **3** | write gate, every Write |
| `resolution-evidence-required` | deterministic registry+hash scan → block | **3** | resolve consult-gate |
| `consult-checklist` | **agentic** — model reads hint, interprets checklist | **2** | H6 + PROCESS_HINTS + LOCAL_PROCESS_HINTS |

**Key L2 finding:** `consult-checklist` is **state-2 by design**, not a deficient state-3. It is
the canonical "deterministic injection + agentic consumption" artifact `philosophy.md:43` describes
— the loop's permanent home for content that genuinely needs judgment. The H6 gate guarantees the
*deterministic injection* (a PROCESS_HINTS row exists); *consumption* stays agentic because a
checklist is interpreted. This is correct, not a gap.

### 3.2 The vocabulary collision (the real L1/L2 defect)

The concept surface uses **"consult" for two opposite consumption axes**:

- `consult-gate` (`philosophy.md:41,96`; `loop-engine.md:60`) = a gate that **blocks
  deterministically** → state-3. Realized by `resolution-evidence-required`
  (`rule-no-orphaned-evidence` blocks resolve).
- `consult-checklist` (pattern_type) / `agent (consult)` (`AGENTS.md:65`) = the agent **interprets
  agenticly** → state-2. Realized by the 4 consult-checklist rules via PROCESS_HINTS.

Same root, opposite states. `loop-engine.md:48` warns the two surfaces must never share vocabulary;
here one surface overloads one word across two states. This is the actual paradigm defect behind
the user's "we need a better L1 paradigm for rule" instinct: not a missing concept, but a
**naming collision** that makes the state-2/state-3 boundary ambiguous, which then leaks into the
`enforcement` field's inconsistent application (Inconsistency A) and mis-typing (Inconsistency B).

### 3.3 L2 verdict

The L2 model is coherent: rules realize **state-3** when deterministically consumed (regex/glob/
resolution-evidence gates) and **state-2** when agenticly consumed (consult-checklist via hints).
The defect is that the implementation does not cleanly encode this mapping:

- `enforcement` *should* equal the consumption axis (gate=state-3, agent=state-2) and injection is
  uniform-deterministic — that is the clean L2 reading `AGENTS.md:65` gestures at. But
  `rule-no-orphaned-evidence` breaks it (state-3 behavior, `agent` label), and three rules break
  it the other way (state-2 intent, `regex`/`glob` labels with dead match specs).

## Part 4 — Diagnosis and recommended direction

The L1 concept and L2 state model are **correct and sufficient**. The gap is in (a) L3 encoding
alignment and (b) L2 documentation + vocabulary disambiguation. No new L1 concept needed.

**Recommended L3 alignment (small, mechanical):**
1. Reclassify `rule-no-orphaned-evidence` `enforcement: agent → gate`. It already hard-blocks
   resolve; the label is the only wrong thing. (Alternatively, make the resolve gate honor
   `enforcement`, but that disables a load-bearing consult-gate — worse.)
2. Retype the three `agent + regex/glob` rules to `consult-checklist` (they are checklists) and
   give each a PROCESS_HINTS row (H6 will then be satisfied). Their regex/glob patterns become
   checklist body, not match specs. This removes all dead match specs in one move.

**Recommended L2 documentation (`docs/meta-state-lifecycle.md` rule section):**
3. Add the pattern_type → state table (§3.1 above) and the consumption-surface table (§1.3).
4. State the `enforcement` = consumption-axis invariant explicitly: `gate`↔state-3,
   `agent`↔state-2; injection is deterministic for all rules.
5. Document the **consult-checklist ↔ PROCESS_HINTS ↔ H6** trinity as *the* state-2 injection
   mechanism (not a per-rule anecdote). This is the generalization that would have prevented
   `meta-260714T1334Z`: the agent didn't add a consult-checklist rule + PROCESS_HINTS row because
   the injection contract was taught as an instance, not a pattern.

**Recommended vocabulary disambiguation (concept surface):**
6. Rename one "consult" root. Keep `consult-gate` = state-3 deterministic block (matches
   `philosophy.md`). Rename the state-2 class from "agent (consult)" / `consult-checklist` to
   something consumption-axis-explicit, e.g. `agent-checklist` or `interpreted-checklist`, so the
   state-2/state-3 boundary is lexical, not contextual. (This is a docs+schema-label edit, not a
   behavior change; the `pattern_type` enum value can stay if `consult-` is reserved for the gate.)

**Decoupled, smaller fix (independent of the above):**
7. The `meta-260714T1334Z` fix — add a consult-checklist rule + PROCESS_HINTS row + LOCAL_PROCESS_HINTS
   mirror for the vitest JSON parse procedure, and refresh stale PROCESS_HINTS row #1 — proceeds
   unchanged under either the current or the realigned paradigm. It can ship first.

## Unresolved questions

1. Reclassify direction for `rule-no-orphaned-evidence`: relabel `enforcement: gate` (recommended,
   no behavior change) vs. make the resolve gate honor `enforcement` (disables a load-bearing
   gate)? Operator decision.
2. Retype the three `agent + regex/glob` rules to `consult-checklist`, or keep them as `agent`
   advisory rules under a future `pattern_type: "none"` (advisory, no match spec)? The former
   removes dead specs and satisfies H6; the latter adds a 5th pattern_type.
3. Vocabulary: rename `consult-checklist` → `agent-checklist` (or similar) to break the
   `consult-gate`/`consult-checklist` collision, or keep the enum value and disambiguate in prose
   only? Schema-rename touches the persisted registry; prose-only is cheaper.
4. Scope of this work: full L3+L2+vocabulary realignment (a plan under `plans/`), or just the
   decoupled `meta-260714T1334Z` fix now + a deferred design note for the realignment?