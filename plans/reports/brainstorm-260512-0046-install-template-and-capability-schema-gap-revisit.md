# Brainstorm — Install Template Gap + Capability Schema Gap Revisit

- Date: 2026-05-12 00:46 (Asia/Saigon)
- Trigger: review of `decision-20260510T172056Z-yaml-parser-library-swap` and the two meta-evidence files cited
- Framing chosen by operator: treat the YAML parser swap as independent; resolve the two gaps on their own merits

## Problem Statement

Operator asked whether `records/decisions/decision-20260510T172056Z-yaml-parser-library-swap.yaml` (parser-swap, draft) could resolve:

1. `records/evidence/meta/install-experiment-template-gap.md`
2. `records/evidence/meta/capability-schema-gap.md`

Brutal answer up front: **no**. The parser swap is a grammar-layer concern (`simple-yaml-parser.js` → `eemeli/yaml`). Neither gap is about YAML grammar; both are about record envelope/shape. The only indirect link is the deferred bundled-ajv alternative inside the parser-swap draft, which the draft itself defers to a separate brainstorm. So the gaps must be assessed independently.

## Current State Verified (as of 2026-05-12)

### Gap 1 - install-experiment-template-gap.md
- Trigger threshold: `N=2 install experiments`.
- Population today: **4 install experiments** under `records/evidence/vnstock-data/`:
  - `experiment-install-20260508T101723Z.md` (sandbox local, does-not-support, flag-disproof case)
  - `experiment-install-20260508T171112Z.md` (sandbox local, does-not-support, device-limit case)
  - `experiment-install-20260509T071800Z-sandbox-1.md` (docker fresh, supports-with-warning)
  - `experiment-install-20260509T071900Z-sandbox-2.md` (docker fresh, does-not-support, device-limit case)
- Result: **threshold exceeded**. Action when triggered = "compare envelope shapes. If repeated fields appear, draft template candidate." Ripe for resolution.

### Gap 2 - capability-schema-gap.md
- Trigger threshold: `N>=3 packs verified`.
- Population today:
  - `schemas/capability.schema.json` **exists** (minimal shape; predates the canonical gap-resolution event).
  - Approved capability records: `capability-fastapi-reference-rest.yaml`, `capability-tanstack-reference-render.yaml` → **N=2**.
  - Install passes: only sandbox-1 (`vnstock-data`) → 1 verified-install path.
- Result: original observation ("capabilities.yaml has no schema, current template permits an empty array") **partially superseded** by the existing JSON schema; the structural field set diverges from the gap's proposal. Trigger N>=3 still **not** met for full enrichment.

## Cross-Envelope Comparison (Gap 1)

Common fields/sections across all 4 install evidence MDs (after normalizing 101723Z which predates the frontmatter convention):

| Section / field | T101723Z | T171112Z | T071800Z-s1 | T071900Z-s2 | Convergence |
|---|---|---|---|---|---|
| YAML frontmatter (record_type, capability, dimension, scope, validation_status, claim_support, secret_injection_class, installer_url_class, static_dimension_consistency, created, substrate) | absent (legacy envelope-as-body) | present | present | present | 3/4 — stabilized after T171112Z |
| Summary | implied via "Result" | present | present | present | 4/4 |
| Substrate detail (temp root, runner venv, installer venv path, installer SHA, cleanup) | partial (temp_root, cleanup_status) | present (full) | present (full) | present (full) | 4/4 (full in 3/4) |
| Steps Executed (numbered) | absent | present | present | present | 3/4 |
| Observations (bulleted) | absent | present | present | present | 3/4 |
| Sanitized installer output (fenced code block) | absent | present | present | present | 3/4 |
| Disproof / Confirmation Notes | "Result" prose | present | present | present | 4/4 |
| Source (operator, plan, phase) | absent | present | present | present | 3/4 |
| Allowed Outputs Captured + Blocked Outputs | present | absorbed into experiment YAML approval block | absorbed | absorbed | 1/4 then migrated |
| Static Dimension Consistency | absent | present | absent | absent | 1/4 — case-specific |
| Process-Side Findings | absent | present | absent | absent | 1/4 — case-specific |
| Cleanup Confirmation (separate section) | present | folded into Substrate | folded | folded | 1/4 then migrated |
| Supersedes | absent | present (case-specific) | absent | absent | 1/4 — case-specific |

**Convergence is real**: 3 of 4 cases converge on a 7-section envelope (frontmatter, Summary, Substrate, Steps Executed, Observations, Sanitized Output, Disproof/Confirmation, Source). The legacy 101723Z is the outlier and predates the convention. The remaining sections (Static Dimension Consistency, Process-Side Findings, Supersedes) are clearly case-specific add-ons, not template-required.

## Recommended Resolution

### Gap 1 - Draft install experiment template candidate (selected: "Draft template candidate now")

Candidate template (markdown) for `records/evidence/<domain>/experiment-install-<TIMESTAMP>.md`:

```markdown
---
record_type: evidence
capability: <domain-slug>
dimension: install
scope: <sandbox|production>
validation_status: <passed|passed-with-warning|failed>
claim_support: <supports|does-not-support|inconclusive>
secret_injection_class: <e.g. api-key-via-shell-env-var|none>
installer_url_class: <e.g. vendor-official-download|local-artifact>
static_dimension_consistency: <evaluated|not-evaluable>
created: "<ISO-8601 UTC>"
substrate: <substrate-class-slug>
---

# Install Experiment - <capability> - <TIMESTAMP> [- <case-label>]

## Summary
One-paragraph result.

## Substrate
- temp root class
- temp root path class
- runner venv (purpose + what was installed in it)
- installer-created venv path class
- installer SHA-256
- cleanup status
- temp root deleted

## Steps Executed
Numbered list. Every external command class. No secrets, no raw outputs.

## Observations
Bulleted. Each observation is a single fact class with a verdict.

## Sanitized Installer Output
Fenced code block. Redact tokens, kernels, device IDs, API keys, file paths
that leak host identity. Only sanitized status lines.

## Disproof / Confirmation Notes
Bullets. Each bullet ties an observation to the claim under test
(confirms / refines / disproves / does-not-support).

## Source
- Operator
- Plan
- Phase
```

Optional sections (include only when case requires):
- `## Static Dimension Consistency` — when a reference snapshot exists and the runtime artifact is inspectable
- `## Process-Side Findings` — when the installer touches host state outside its declared boundary (e.g. writes config files even when env-var driven)
- `## Supersedes` — when the experiment empirically replaces a prior note

### Gap 2 - Acknowledge partial supersession, hold rest (selected: "Acknowledge partial supersession, hold rest")

Mapping of gap-proposed fields to current `schemas/capability.schema.json`:

| Gap-proposed field | Status in current schema | Disposition |
|---|---|---|
| id | present | superseded |
| description | absent | hold for N>=3 |
| method | absent (structurally replaced by `maps[].source` etc.) | hold for N>=3; revisit whether `maps` covers it once another stack lands |
| prerequisites | absent | hold for N>=3 |
| verified_by | partially present via `source_refs[]` | partially superseded; hold explicit field for N>=3 |
| scope | absent (current schema uses `stack` + `surface` instead) | partially superseded by `stack`/`surface`; gap field name is the wrong axis given the new structure |
| publication status | present as `status` enum (`draft|approved|rejected|superseded`) | superseded |

### Capability Schema Drift Note

The current schema took a *map-oriented* shape (`stack` + `surface` + `maps[]` of source→route/view/response) rather than the *predicate-oriented* shape the gap proposed (id/description/method/prerequisites). This is a meaningful axis change, not just field absence. The drift happened during capabilities-stack-migration (`decision-20260510T160000Z`) and the gap file was not updated. **The gap MD should be amended to reflect this drift, otherwise future agents will misread it as a clean to-do.**

### Authoring Step (resolution path per meta-evidence-self-improvement.md)

Per `.claude/skills/learning-loop/references/meta-evidence-self-improvement.md` Gap Classification by Sample Count:

- Gap 1: N>=2 class. Threshold met. **Open a meta-experiment** to validate the template candidate against the 4 cases, then a **meta-decision** to pin it.
- Gap 2: N>=2 class. Threshold not met (only 1 verified install path, 2 capability records, 3rd verified pack still required for full enrichment). **No new meta-experiment**; update the existing meta-evidence MD to reflect partial supersession and re-pin the revisit trigger.

## Evaluated Approaches (recap)

### Framing
- **Independent (chosen)**: parser swap and gaps assessed on their own merits.
- Bundleable: would have bundled parser swap + ajv + capability schema enrichment. Rejected because (a) parser-swap draft itself explicitly defers ajv, (b) Gap 2's trigger N>=3 is not yet met so bundling forces premature schema choices, (c) blast-radius of a 3-axis change is much harder to roll back.
- Resolve gaps first, parser later: workable, but Gap 2 is not actually resolvable now, only partially so. No benefit over independent.

### Gap 1
- **Draft template candidate now (chosen)**: 4 cases is enough; 3-of-4 converge on a clear 7-section envelope.
- Close as superseded: rejected because the gap explicitly calls for an artifact (template), not just evidence corpus.
- Defer further (require N>=3 distinct install domains): rejected because the loop policy specifies install-experiments not install-domains; vnstock alone has produced 4 cases under 2 substrate classes (sandbox-local + docker), enough structural variance to abstract.

### Gap 2
- **Acknowledge partial supersession, hold rest (chosen)**: schema exists but minimal and structurally different; gap MD needs an update note, not a schema patch.
- Draft enriched schema now: rejected. N>=3 trigger not met. Forcing description/method/prerequisites onto a schema that took a maps-oriented shape would re-litigate a settled choice without data.
- Strict deferral, no change: rejected because the gap's "observation" line (no schema, empty array allowed) is factually stale and will mislead future agents if left as-is.

## Implementation Considerations & Risks

1. **Template freezes the convention prematurely**. Mitigation: ship template as a *candidate* in a meta-experiment (`status: draft`), promote to canonical only after the next install experiment (different domain) lands without forcing template edits.
2. **Template covers only the markdown evidence file**, not the paired experiment YAML under `records/experiments/`. The experiment-YAML envelope is governed by `schemas/experiment.schema.json`; do not touch in this scope.
3. **Gap 2 MD edit must not invent new schema fields**. Per meta-evidence rule "Do not add schemas or validators unless explicitly approved." Only update Observation + Trigger sections; cite the existing schema as partial supersession source.
4. **Risk of misclassification**: Gap 1 cases are 4 in count but all from the vnstock domain. If a future install-experiment in a non-vnstock domain reveals a different envelope (e.g. no Makeself archive, no device-limit class), the template will need a revision. Encode this in the meta-experiment's success-metric criteria.
5. **Authoring order**: meta-experiment must be drafted *before* the install template is referenced from anywhere in docs. Avoid the trap of canonizing-by-reference.

## Success Metrics & Validation

- Meta-experiment record exists at `records/experiments/experiment-meta-install-template-candidate-<TIMESTAMP>.yaml` with `status: draft`.
- Template MD candidate exists at `docs/templates/install-experiment-template.md` OR inline in the meta-experiment's `source_refs` text — operator's call (template policy not yet pinned).
- Gap 1 MD updated with a `## Resolution` section linking to the meta-experiment; `## Trigger` retained but reframed as "review after next non-vnstock install experiment lands".
- Gap 2 MD updated with a `## Partial Supersession` section listing field-by-field disposition (see table above); `## Trigger` re-pinned to N>=3 verified packs with explicit note "1 verified install + 2 approved capability records = N=2 surrogate; one more verified pack needed".
- `pnpm validate:records` passes after edits.
- `pnpm check` passes after edits.

## Next Steps & Dependencies

1. Operator decides whether to spawn `/ck:plan` for the meta-experiment + gap-MD edits, or to land the gap-MD edits directly and defer the meta-experiment.
2. If `/ck:plan`: plan should be small — one phase for Gap 1 meta-experiment + template draft, one phase for Gap 2 MD update, one phase for validation gates.
3. No dependency on the parser-swap decision. Parser swap can land in any order.
4. Parser-swap draft (`decision-20260510T172056Z`) remains separate and **should not** absorb either gap into its scope.

## Unresolved Questions

1. Where should the install template candidate physically live? `docs/templates/` does not yet exist; alternatives are `records/evidence/meta/install-experiment-template-candidate.md` or inline-in-meta-experiment. Operator's call.
2. Should the meta-experiment also re-classify the legacy `T101723Z` evidence as out-of-template (still valid evidence, just predates the convention), or leave it untouched? Re-classifying is cleaner but touches a frozen record.
3. Gap 2 MD currently lists "scope" as a proposed field — given the schema went with `stack` + `surface` instead, should the MD be edited to replace `scope` with `stack`/`surface` for clarity, or to flag the original `scope` as a deferred-and-now-replaced-axis? Either preserves history differently.
4. The two existing approved capability records (`capability-fastapi-reference-rest`, `capability-tanstack-reference-render`) were approved under the current minimal schema. If the schema enriches later (post N>=3), do they get migrated, supersession-chained, or grandfathered? Out of scope for this brainstorm but flagged.
