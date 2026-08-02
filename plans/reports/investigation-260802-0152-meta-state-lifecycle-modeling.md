# Meta-state lifecycle modeling — tightening the status & relationship vocabulary

**Spawned by:** the `recurrence-trigger-window` plan's validation gate (`plans/260802-0135-recurrence-trigger-window/`, cancelled). The owner rejected the `reopens`-mapping options and redirected: the lifecycle modeling itself is "not tight enough"; resolve the lifecycle questions **before** wiring the recurrence trigger's `reopens` linkage.
**Scope:** the meta-state registry's lifecycle model — the 4 entry kinds, their status vocabularies, and the cross-ref (relationship) vocabulary. Resolves four questions the owner named: **reopens**, **rule↔finding**, **superseded (do we need it?)**, and **accepted value**.
**Out of scope:** the recurrence trigger's window/redaction/grace-window fix (P1–P3+P5 of the cancelled plan) — those are settled and independent of this; they revive once the lifecycle model is tightened.

## 1. The current model (scouted)

### 1.1 Four entry kinds, three status vocabularies

| kind | status enum | closure path | notes |
|------|-------------|--------------|-------|
| `finding` | `open, resolved, superseded, archived` (+ legacy `active`/`reported`/`stale` tolerated by `isOpen`) | `resolve`→resolved; `supersede`→superseded; `archive`→archived | two distinct *closed* states (`resolved`, `superseded`) |
| `rule` | `active, inactive, archived` | `deleteEntry`→archived tombstone; `inactive` = not enforced | one *closed* state (`inactive`) |
| `loop-design` | `active, inactive, archived` | `ship_loop_design`→inactive (`shipped_in_plan`+`shipped_at`) | one *closed* state (`inactive`); same enum as rule |
| `change-log` | `active` (always) | none — immutable audit | never closes |

**Registry census** (`meta-state.jsonl`): finding 119 open / 76 resolved / 7 superseded / 20 archived / 1 None; rule 38 active / 16 inactive / 2 archived; loop-design 11 active / 16 inactive; change-log 49 active.

The concept mapping is tight underneath the words:

| concept | finding | rule / loop-design |
|---|---|---|
| live | `open` | `active` |
| closed (fixed / retired / shipped) | `resolved` **or** `superseded` | `inactive` |
| tombstone | `archived` | `archived` |

So there are really **two vocabularies**: finding uses `open/resolved/superseded/archived`; rule and loop-design use `active/inactive/archived`. The concepts align (live / closed / tombstone) but (a) the words differ and (b) finding has **two** closed states where rule/loop-design have **one**. That gap is the first "not tight enough."

### 1.2 The relationship vocabulary is already centralized

`core/entry/relationship-graph.js` `CROSS_REFS` is the single source of truth for cross-record edges:

| field | from → to | multi | flags |
|---|---|---|---|
| `consolidated_into` | finding → change-log | no | superseded finding's canonical home |
| `reopens` | finding → finding | yes | "new evidence re-surfaces an old finding" |
| `promoted_to_rule` | finding → rule | no | **`legacy: true`** — `rule.origin` is canonical |
| `consolidates` | change-log → finding | yes | inverse of `consolidated_into` |
| `supersedes` | change-log → change-log / rule → rule | no | prior-record refinement |
| `origin` | rule → finding | no | **`canonicalPromotion: true`** |
| `applies_to_resolution` | rule → finding | no | **`forwardOnly, riExempt`** — gating hint, NOT a lifecycle edge |
| `proposed_design_for` | loop-design → any | yes | forward refs (rules/schemas/tools) |
| `addresses` | loop-design → finding | yes | motivating findings |

This is **tighter than it looks**: canonical vs derived refs are explicit (`origin` canonical, `promoted_to_rule` legacy/inverse), and lifecycle edges are distinguished from gating hints (`applies_to_resolution` is `forwardOnly, riExempt`). The relationship model is NOT the loose part. The loose parts are (§2) the status vocabularies and the accepted-limitation modeling.

### 1.3 Versioned-append, last-wins-by-max-version

All kinds use versioned-append (`core/meta-state.js:204–212`): new entries start at `version: 0`; patches bump to `N+1`; reads project `max_by(version)` per id. "Latest version of each finding" is that projection. Lifecycle tools (`resolve`/`supersede`/`archive`/`ship`/`unarchive`) true-append a new version with the status stamp; `unarchive` restores by appending past a tombstone. This is sound and is not in question.

## 2. Diagnosis of the four questions

### 2.1 rule↔finding — already tight; the recurrence report's premise was wrong

**Finding:** findings are **rule-agnostic**. `metaStateFindingEntrySchema` has no `rule_id` field — only `promoted_to_rule` (legacy inverse), `consolidated_into`, `reopens`, `recurrence_key`. The rule→finding link is `rule.origin` (canonical); the finding→rule link is `finding.promoted_to_rule` (legacy, being retired in favor of `rule.origin`). So the coupling is **one canonical forward edge** (`rule.origin`), and findings carry no rule pointer at all.

The recurrence report's "match the recurring finding's `rule_id` to B" was a category error: neither the recurring finding nor B carries a `rule_id` field. The `rule_id` in that context is a **decision-log field** (which gate rule fired), embedded in the recurring finding's `recurrence_key` (`rule_id::hash(prefix)`), not a finding field.

**Verdict:** the rule↔finding relationship is already tight (one canonical edge, findings rule-agnostic, the legacy inverse is explicitly being retired). **No decoupling work needed here** — the owner's instinct ("findings shouldn't carry rule_id") is already the state of the schema. The only follow-up is to finish retiring `promoted_to_rule` (it is `legacy: true`; confirm zero live writers and drop it, or leave as a read-only derived inverse).

### 2.2 superseded — the *semantics* are needed; the *separate status* is the question

**Finding:** `superseded` (7 findings) is a **distinct closure path** from `resolved`:
- `resolved` = "closed because fixed/addressed" (`resolve` tool: `resolved_at` + `resolved_by` + `resolution`; no change-log link).
- `superseded` = "closed because consolidated into a change-log as a durable decision" (`supersede` tool: `superseded_at` + `superseded_by` + `consolidated_into` → a change-log id).

The 7 superseded findings are design-tension / lineage findings folded into a change-log (e.g. `meta-260704T1006Z-…keep-dispatch-and-ack-orthogonal…` → `meta-260717T1057Z-meta-state-lifecycle-status-enum`). These were not "fixed"; they were **recorded as design decisions** in a change-log. That is a real, distinct closure semantics — a finding whose resolution *is* a durable recorded decision, not a fix.

**Do we need it as a separate status?** Two views:
- **Keep (distinct status):** `superseded` says "this finding is closed *by consolidation*, not by fix" — a queryable distinction. A `resolved` finding with `consolidated_into` would be ambiguous (was it fixed *and* recorded, or just recorded?).
- **Collapse (status + field):** one closed status (`resolved`) + an optional `consolidated_into` link. `supersede` becomes "resolve with a change-log consolidation." This aligns finding with rule/loop-design (one closed state), removes a status, and lets `consolidated_into` ride on `resolved`. The distinction "fixed vs recorded" moves from the status to the *presence* of `consolidated_into` + the `resolution` text.

**Verdict (decided): collapse.** `superseded` → `resolved` + a citation to the change-log. The two-closed-states split is the main reason finding's vocabulary diverges from rule/loop-design; one canonical closure state (`resolved`) aligns it with rule/loop-design's `inactive`. The `consolidated_into` *field* is itself retired — it migrates to the untyped citation mechanism (§3.1). Migration: 7 findings `superseded`→`resolved`, each carrying an untyped citation `{source: finding, target: change-log, rationale: "consolidated into …"}`. `supersede` becomes a flavor of `resolve`. Semantic choice resolved; the open question is now the citation *storage* (§4 open #1), not the status.

### 2.3 accepted value — the genuine smell

**Finding:** "accepted limitations" are modeled as **`open` findings** with a `-accepted` subtype suffix, never meant to be resolved. Census: 4 `strip-bypass-accepted` (incl. B = `meta-260615T1920Z-…`, 6 versions, open since 2026-06-15) + 2 `design-tradeoff`. B's `rule_id: None`, `recurrence_key: None`, `status: open`.

The conflation: `open` means both (a) "a problem to fix" and (b) "a standing accepted trade-off." The cost is real and is what the owner reacted to:
- `isOpen(B)` is true → B counts in "open problems" tallies and the stale-view flags it as aged (48 days), nudging the operator to "resolve" something that was *accepted*. Resolving it would be wrong.
- The `-accepted` subtype suffix mitigates (machine-readable) but does not fix the status lie.

**Viable models, by cost:**

| model | change | `reopens` applies? | cost |
|---|---|---|---|
| **A. `accepted` finding status** | add `accepted` to the finding enum; `isOpen` excludes it; migrate 4+2 findings | yes (still a finding) | small: enum + `isOpen`/`isStaleView`/`derive-status` + migration |
| **B. model as `loop-design`** | accepted trade-off is a *design decision* → `loop-design` (active), `addresses` the motivating finding/rule | **no** (`reopens` is finding-only; use `addresses`) | medium: B changes *kind* (6 versions migrate), `reopens` linkage changes primitive |
| **C. new `accepted-limitation` kind** | dedicated kind + lifecycle + tools | n/a | heavy; YAGNI for ~6 entries |

**Verdict (decided 260802-0230 via `ak:predict`, verdict GO): model A (`accepted` status).** It is the smallest change that fixes the status lie and aligns with the §2.2 collapse (finding would become `open / accepted / resolved / archived` — one canonical closure state, plus `accepted` for standing trade-offs). Model B (remodel as `loop-design`) was rejected on two grounds grounded in the code:

- **loop-design has no acknowledgment state.** Verified `meta-state.js:608-624`: loop-design status is *"Binary. Flips to inactive when the proposed work ships"*; `shipLoopDesign` (`meta-state.js:1690`) is the *sole* closure path, stamping `shipped_in_plan`+`shipped_at`. An accepted limitation is neither "proposed work to ship" nor "shipped" — under B it sits **perpetually `active`**, re-creating the exact status-lie A fixes (`active` then conflates "design in progress" with "accepted trade-off"). The owner's instinct ("loop-design don't give the temporary-trade-off vibe") is confirmed by the schema, not just intuition.
- **The accepted-vs-open distinction is state-3, so it earns a status, not a kind.** `isOpen` (`constants.js:70`, `!TERMINAL_STATUSES.has(status)`) is a *deterministic branch* on the value — so is `isStaleView`'s early-return and `deriveStatus`'s `no_action` path. Per the L1 adopted this session ("Schema Constraints Are State-3 Artifacts," `docs/philosophy.md`), a distinction code branches on earns a strict field, not prose or a kind-remodel. B (and the do-nothing `-accepted` suffix) bury a branched-on distinction in kind/prose — violating the L1 just adopted.

B's old downside ("breaks `reopens`") dissolved when §2.4 dropped `reopens` entirely; with relationships emergent via file-index, the recurrence linkage is neutral between A and B. B's only remaining virtue was compactness; its semantic cost (perpetual `active`; `proposed_design_for` semantically inapplicable to an acknowledgment; `active` loop-design list polluted with non-designs) is now uncompensated. The recurrence trigger's P4 stays dissolved under A (file-index co-citation, no `reopens`), unchanged.

### 2.4 reopens — right primitive, wrong framing for accepted-limitations

**Finding:** `reopens` (finding→finding, 17 precedents) is a **lifecycle edge** in `CROSS_REFS`: "new evidence re-surfaces an old finding's conclusion." The flow is `reopens` (record the link on the new finding) + `meta_state_resolve({ id, cascade_from })` (close the stale parent). It is already tight: it is centralized, typed, and distinct from consolidation (`consolidated_into`) and promotion (`origin`).

The recurrence report's use of `reopens` against B is **misframed** because B is an *accepted limitation*, not a *stale finding to be closed*. `reopens` + cascade-resolve **closes** the parent — but an accepted limitation is not "stale evidence to close"; it is a standing acknowledgment. Reopening-and-closing B says "the accepted trade-off is now resolved" — which is the opposite of the owner's intent (the trade-off stands; the new evidence is that it is *actively recurring in vivo*, which is information *about* the accepted limitation, not a refutation of it).

So the right primitive for "in-vivo recurrence evidence relates to an accepted limitation" is **not `reopens`** (which closes a stale finding). It is one of:
- **`addresses`** (loop-design→finding) — if accepted-limitations become loop-designs (§2.3 model B), the recurring finding is a *motivating finding* that the design `addresses`. But `addresses` is loop-design→finding (design points at findings), the wrong direction for "finding cites design."
- **a new finding→design edge** ("informs" / "evidence-for") — a finding that provides in-vivo evidence *about* a design/accepted-limitation, without closing it.
- **just file independently** — the recurring finding stands on its own; the operator draws the link at triage (the existing manual pattern for `reopens`).

**Verdict (revised): drop `reopens` entirely.** The earlier lean ("keep `reopens` for stale findings") is reversed. In an append-only system, resolved is **terminal / read-only** — new evidence does not re-open and cascade-close the old finding; it appends a *new* finding, and file-index co-citation relates the two (both cite the same code). `reopens` + cascade-resolve is the one operation that un-closes a record as a side-effect of opening another — the mutation smell inside the "append-only" model; dropping it makes the invariant honest. The 17 existing `reopens` edges go inert (stop writing the field); the link survives via file-index, no active migration. This also dissolves the recurrence trigger's P4: the trigger files the recurring finding with `evidence_code_ref` to the gate code; file-index connects it to B (and everything else citing that code) for free — no `reopens`, no `informs`/`evidence-for` edge, no cascade. The proposed non-closing evidence edge from the original synthesis is dropped as redundant with file-index.

## 3. Proposed tighter model (synthesis, revised 260802-0218)

Two principles now drive the model, both owner-confirmed in discussion:

- **Append-only terminality:** resolved is read-only. New evidence appends a new finding; it does not re-open or cascade-close an old one. Relationships between findings are *emergent* (file-index co-citation, discovered at read time), not declared at write time.
- **Schema constraints are state-3 artifacts** (new L1, `docs/philosophy.md` § "Schema Constraints Are State-3 Artifacts"): a strict enum/field earns its keep only when deterministic code branches on the value. If the agent reads the records + rationale and interprets (agentic consumption), the distinction belongs in prose, not a validated field.

The finding lifecycle becomes:

```
finding:  open  →  accepted   (standing trade-off; not "to fix"; isOpen excludes)
          open  →  resolved   (terminal / read-only; fixed OR consolidated —
                                distinguished by an optional citation + resolution text)
          any   →  archived   (tombstone)
```

This:
- **Removes `superseded`** (folded into `resolved` + a citation to the change-log). One canonical closure state, aligning finding with rule/loop-design's `inactive`.
- **Adds `accepted`** so accepted-limitations stop lying as `open` (model A from §2.3).
- **Drops `reopens` and `cascade_from`** (resolved is terminal; new evidence → new finding; file-index relates them). 17 existing `reopens` edges go inert; link survives via file-index.
- **Drops the proposed `informs`/`evidence-for` edge** — redundant with file-index. The recurrence trigger files a finding with `evidence_code_ref`; file-index connects it to B and co-citing records. No new relationship primitive.
- **Leaves rule↔finding as-is** (already tight; optionally finish retiring `promoted_to_rule`).

### 3.1 Record↔record citations — one untyped mechanism

The owner accepted that *curated* record↔record citations should exist (low-volume, high-intent: you cite a record you're holding, not one you scanned for), but rejected the current bespoke fields (`consolidated_into`, `origin`, `supersedes`) as three special cases of one thing — the "growing special cases" smell. They collapse into **one untyped citation**:

```
{ source: <record-id>, target: <record-id>, rationale: "…", recorded_at, recorded_by }
```

Direction via `source`/`target`; the verb (`resolves-to` / `derived-from` / `refines`) lives in the `rationale` as prose, not a validated enum. **Untyped is decided** by the state-3 L1: no runtime branch consumes the verb (closure logic doesn't branch on `consolidated_into`; rule enforcement ignores `origin`; lineage traversal follows `target` regardless of type), so the distinction is agentic-consumed → prose, not a strict field. `rationale` is *required* (it is the semantic carrier once the type is gone).

Agent-management cost is not a scan: curated citations use an id already in context (you cite what you're holding — that's why it's curated); emergent relationships use file-index server-side. Discovery of an unknown target id is a targeted indexed query (`ref_by` / `query_drift` / `id:[...]` / `session_id`), never `meta_state_list` (reserved for batch audit). The citation mechanism inherits the existing targeted-query surface; it does not add a scan.

The relationship layers are now symmetric and both external to the records:
- **Derived / emergent** → file-index (rebuilt from `evidence_code_ref` co-citation). Covers finding↔finding, finding↔code.
- **Asserted / curated** → untyped citation. Covers record↔record cross-kind + same-kind lineage.

Records carry **content + status only** — never relationship fields. Storage is decided in §3.3.

### 3.2 Reading resolved findings

Resolved findings stay in the registry (append-only audit demands it — a decision cannot be deleted), but the *primary access path* shifts from "list resolved findings" to "file-index neighborhood at this line, time-ordered" — the resolved ones appear in context as that line's decision history. You stop querying "resolved" as a class; you query "this code" and get its full finding lineage, closed ones included.

The status vocabularies still differ in *words* (finding `open/accepted/resolved` vs rule/loop-design `active/inactive`). A cosmetic unification pass is flagged as a non-goal (see Unresolved questions — cosmetic vocabulary).

### 3.3 Storage decision — separate append-only citation layer (decided 260802-0226)

A 5-persona pre-analysis (`ak:predict`) settled open #1: **separate append-only citation layer** — a new `citation` kind in its own file, mirroring `change-log.jsonl` — not an on-record `cites` field. Verdict CAUTION (both viable; no STOP). Grounding from scouting the code:

- **Kind-per-file is production-native.** Verified: `meta-state.jsonl` holds finding/loop-design/rule (290 entries); `change-log.jsonl` holds all 282 change-log entries. A `citations.jsonl` is the same pattern. Cross-file citation ids need no new namespacing — change-log ids already share the `meta-` prefix and `kindForId` resolves them.
- **Zero derive-time join cost.** Verified: `deriveStatus` reads only `evidence_code_ref`/`evidence_test`/`status`/file-index; `isOpen` reads only `status` (`TERMINAL_STATUSES = {resolved, superseded, archived}`); `isStaleView` uses file-index + age. None reads `consolidated_into`/`origin`/`supersedes`. Moving relationships out costs these paths nothing — the earlier "join cost" fear is dead.
- **Inverse queries get faster, not slower.** Today `inverseRefs`/`buildInverseIndexes` scan all entries O(N) to build the 6 named inverse maps. A citation log with a target index is O(edges) — the same derived-index pattern, simpler source. Immaterial at 338 entries; a future-scale tiebreaker, **not** a decision driver.
- **Removes real entanglement.** `consolidated_into` is on the immutable patch deny-list (supersede-only) — a relationship coupled to a lifecycle tool. `diffChangedRefs` exists *because* editing a finding with a stale `reopens` must not re-validate it — version-chain muddiness from relationships riding on record versions. The separate layer removes both: findings are never patched to record a link.

**Write-gating design (must hold in the follow-up plan):**
- **No free `meta_state_cite` tool.** The existing lifecycle tools (`resolve`/`supersede`/`promote`) emit citation-log rows internally. This keeps the write surface *narrower* than today's mixed gating (deny-listed `consolidated_into` vs freely-writable `reopens`) and dissolves the security concern (an agent can't assert a bogus `resolves-to` to make a finding look "resolved-by-decision-X").
- **Target-existence RI on every emission** (reuse `resolveStructuralRI`).

**Migration phasing (seed for the follow-up plan):**
1. Land citation storage + re-source `buildInverseIndexes`/`orphans`/`dangling_refs` from it.
2. Migrate field-writers tool-by-tool: `consolidated_into`→citation (7 findings), `origin`→citation (rules), `supersedes`→citation (change-logs/rules). Each flip independently testable.
3. Drop `reopens`/`cascade_from` writers (17 existing edges go inert; link survives via file-index).

**Cost note:** the cost is a one-time migration, not a runtime cost — runtime/agent-management is nil for both options (ids in context + targeted queries; no scan). The on-record `cites` field was the smaller refactor but kept the version-chain entanglement; the separate layer is the coherence fit for the append-only thesis held throughout this investigation.

## 4. What this unblocks / defers

- **Unblocks:** the recurrence trigger's P4 — **dissolved, not re-scoped.** It needs no relationship primitive at all: file the recurring finding with `evidence_code_ref` to the gate code; file-index connects it to B and co-citing records. P1–P3+P5 (window, redaction, grace window, regression) revive unchanged from the cancelled plan.
- **Defers to a follow-up plan:** the lifecycle migration — add `accepted` status; collapse `superseded`→`resolved`+citation (7 findings); migrate the 4+2 accepted-limitation findings to `accepted`; replace `consolidated_into`/`origin`/`supersedes` with the untyped citation mechanism (and migrate their existing edges); drop `reopens`/`cascade_from` writers (existing 17 edges go inert); update `isOpen`/`TERMINAL_STATUSES` to add `accepted`; re-source `buildInverseIndexes`/`orphans`/`dangling_refs` from the citation log; rewrite the lifecycle tools (`resolve`/`supersede`/`promote`) to emit citations instead of setting fields (`deriveStatus`/`isStaleView` need no change — verified, they do not read relationship fields); finish retiring `promoted_to_rule`. Registry-wide lifecycle refactor with its own migration + tests; its own plan, not folded into the recurrence trigger.

## Unresolved questions (owner decisions)

**Resolved in discussion (260802-0218):**
- `superseded` → collapse into `resolved` + citation (§2.2). Decided.
- `reopens` / `cascade_from` → drop entirely; resolved is terminal/read-only; new evidence appends a new finding; file-index relates them (§2.4). Decided — reverses the earlier "keep `reopens`" lean.
- The recurrence trigger's evidence edge → dropped; file-index replaces it; P4 dissolves (§2.4, §3). Decided.
- Citation typing → **untyped** (verb in prose `rationale`), per the state-3 L1: no runtime branch consumes the verb (§3.1). Decided.
- New L1 documented: `docs/philosophy.md` § "Schema Constraints Are State-3 Artifacts."
- Citation storage → **separate append-only citation layer** (new `citation` kind/file, mirroring `change-log.jsonl`); no free `meta_state_cite` (lifecycle tools emit); target-existence RI; phased migration (§3.3). Decided 260802-0226 via `ak:predict` (verdict CAUTION).
- Accepted-limitation model → **model A (`accepted` finding status)**; model B (remodel as `loop-design`) rejected — loop-design has no acknowledgment state (sole closure is `ship`→`inactive`), and the accepted-vs-open distinction is state-3 (branched on by `isOpen`/`isStaleView`/`deriveStatus`), so it earns a status, not a kind (§2.3). Decided 260802-0230 via `ak:predict` (verdict GO).

**Still open:**
1. **`promoted_to_rule` retirement** — finish dropping the legacy inverse (confirm zero live writers), or leave as read-only derived? §2.1. Low priority.
2. **Cosmetic vocabulary unification** (open/accepted/resolved vs active/inactive) — worth a second pass, or leave the words kind-specific? Low value; flagged as a likely non-goal.

## Scouting resolutions (260802-0152)

- **Findings are rule-agnostic** — confirmed against `metaStateFindingEntrySchema` (no `rule_id`; `promoted_to_rule` is `legacy: true`, `rule.origin` canonical). The recurrence report's rule_id-matching premise was a category error.
- **`superseded` semantics** — confirmed via `meta_state_supersede` tool: stamps `status:superseded` + `consolidated_into` (change-log). 7 findings, all design-tension/lineage, consolidated into change-logs. Distinct from `resolve` (no change-log link).
- **Status vocabularies** — confirmed 3 enums (finding `open/resolved/superseded/archived`; rule+loop-design `active/inactive/archived`; change-log `active`). Concept alignment documented in §1.1.
- **`reopens`** — confirmed a lifecycle edge in `CROSS_REFS` (finding→finding, multi), 17 precedents, paired with cascade-resolve (closes the parent). Wrong fit for accepted-limitations (which should not be closed).
- **Accepted-limitation census** — 4 `strip-bypass-accepted` + 2 `design-tradeoff`, all `open`. B confirmed `rule_id: None`, `recurrence_key: None`, `status: open`, 6 versions.