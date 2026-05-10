# Brainstorm: Capabilities Stack Migration + Glob Allowlist

Date: 2026-05-10
Scope: Relocate capability scripts under per-stack homes. Extend validator allowlist to permit capability records to cite local capability code via a glob pattern. Land before any product-build plan.

## Planner Handoff (Read First)

This report is the brainstorm output. The next step is `/ck:plan`, run in a fresh session after a context clear. This section is self-contained context for that session — read this whole report, then plan; do not need chat history.

### Your role as the planner

Produce a phase plan under `plans/<ts>-capabilities-stack-migration/` matching the **Phase plan shape** section below. Do not implement code, do not author records, do not modify the `learning-loop` skill, do not edit `docs/`. Plan only.

### Required reading order

1. This report top-to-bottom.
2. `plans/reports/brainstorm-20260510-external-skills-integration.md` — sibling brainstorm; this migration is its prerequisite.
3. `tools/validate-records/record-validation-rules.js` — current allowlist enforcement (line 50).
4. `tools/validate-records/validate-records.js` — schema loader (line 14) + negative-fixture cases.
5. `schemas/{claim,decision,experiment,risk}.schema.json` — the four current record types; capability is the fifth, lands in this plan.
6. `records/decisions/decision-20260509T192449Z-prospective-convention-application.yaml` — frozen-record convention; this plan must respect it.
7. `records/evidence/meta/capability-allowlist-deferred-axes.md` — three deferred extension axes for this allowlist; revisit triggers documented there, not in this report.
8. `product/` directory tree + `.gitignore` — current layout to migrate from.
9. `docs/{operator-guide,claim-verification,lab-model,knowledge-pack-contract,handoff}.md` — living docs that pin old paths.

### What the plan must produce

Phase files matching the structure in **Phase plan shape**, with each phase carrying:

- A title naming the phase type (loop / skill / code).
- Inputs the phase reads (specific file paths).
- Outputs the phase writes (specific file paths) + write-allowlist.
- A pre-drafted prompt block (loop = record-authoring, skill = constraint, code = direct-edit checklist).
- Approval gates (operator approval required between phases — call them out explicitly).
- Validation commands (`pnpm validate:records`, `pnpm check`).
- Phase success criteria (process steps + outcome — orthogonal axes per `docs/operator-guide.md` "Phase Success Criteria").

The plan must end with `pnpm check` passing on a tree where:
- `product/api/capabilities/vnstock-data/*.py` exists.
- `product/api/{pyproject.toml, .venv, .vnstock}` exist.
- `product/web/capabilities/README.md` exists (empty-convention placeholder, no probes yet).
- `schemas/capability.schema.json` exists.
- The validator accepts `local:product/api/capabilities/vnstock-data/capability-01-reference.py` in a capability record's `source_refs`, and rejects the same `local:` prefix in claim/experiment/decision/risk records.

### What the plan must NOT do

- Author any FastAPI source code (`product/api/src/*.py`) or TanStack code (`product/web/src/*.tsx`). That is the FastAPI-build plan, separate.
- Edit frozen historical records (`records/experiments/experiment-vnstock-capabilities-20260509T174957Z.yaml`, `records/evidence/vnstock-data/capability-runtime-output.md`, `docs/journals/260510-vnstock-capability-runtime.md`). Per `decision-20260509T192449Z-prospective-convention-application`, historical records stay frozen.
- Use bare "capability" without qualifier. Always **capability script**, **capability record**, or **Capability Runtime Experiment**.
- Use the word `user` or feature/user-story language anywhere.
- Touch the existing `knowledge-packs/vnstock-data/manifest.yaml` (stays draft placeholder).

### Stop conditions for the planning session

- If any required reading file is missing or unreadable → stop, report blocker.
- If `pnpm validate:records` fails on the current tree before this plan starts → stop; the migration must begin from a green baseline.
- If the operator has not approved layout migration before phase 02 in the plan → flag as required approval gate; do not skip.
- If the user asks for FastAPI/TanStack code during this planning session → redirect; that is the next plan after this one ships.

## Problem

Current layout pins all capabilities under `product/capabilities/<scope>/`. This worked for the mono-stack era (one Python venv, vnstock-data only). It breaks the moment the product becomes polyglot:

- Python capability scripts live in `product/capabilities/vnstock-data/*.py`.
- Future TypeScript probes (e.g. a TanStack route loader probe, an MSW handler probe, a TS SDK feasibility test) would need a different runtime, different test runner, different deps. They cannot share a directory tree with Python probes.
- The validator's current allowlist (`tools/validate-records/record-validation-rules.js:50`) hard-blocks `local:product/...` in `source_refs` of any record. So capability records (proposed in `brainstorm-20260510-external-skills-integration.md`) cannot machine-link to their probe code at all today.

The sibling brainstorm (`brainstorm-20260510-external-skills-integration.md`) treats this migration as a phase-01 prep step inside a FastAPI-build plan. That plan is too large to absorb the migration cleanly: layout move + validator extension + schema + fixtures + docs harmonization is itself N=1 work that earns its own ledger entry.

This brainstorm scopes that work as a standalone plan: relocate capabilities, name the per-stack subdirectory convention, design the validator widening as a glob, and harmonize docs/skill — landing before any FastAPI/TanStack code is written.

## Terminology

Two new terms must be locked before any code or doc edit.

### "Stack" — the per-runtime peer under `product/`

The directory level between `product/` and `capabilities/` needs a name. Candidates evaluated:

| Term | Pros | Cons | Verdict |
|---|---|---|---|
| **stack** (chosen) | Industry-standard ("API stack", "web stack"); captures runtime + deps + tooling triplet; clean namespace in this loop. | Slightly overloaded with deployment "stacks" (CloudFormation), but unused inside learning-loop. | **Locked.** |
| component | Generic; clashes with React component vocabulary. | Too soft. | Rejected. |
| runtime | Each does have its own runtime. | Already a verification dimension (`verification.runtime` on claims) — name collision in ledger. | Rejected. |
| surface | Loop-conceptual word. | Already used for endpoint/route surfaces inside the FastAPI-build brainstorm. Surfaces live INSIDE a stack, not above it. | Rejected. |
| subsystem | Accurate. | Bureaucratic; long. | Rejected. |
| tier | Web 3-tier connotation. | Misleading; tiers can host multiple stacks. | Rejected. |

**Locked term:** `stack`. Path convention: `product/<stack>/capabilities/<scope>/`. Field naming follow-on: rename the proposed `consumer` field on capability records (sketched in `brainstorm-20260510-external-skills-integration.md` line 250) to `stack`.

### "Stack manifest"

The single dependency manifest at the root of a stack: `pyproject.toml` for Python stacks, `package.json` for Node/TS stacks, `go.mod` for Go stacks. This term names the gate that proves a `product/<X>/` directory is a real stack and not a stray folder. Convention: every `product/<stack>/` directory MUST contain a stack manifest. Reviewers reject capability records under directories without one.

## Decisions Locked This Session

| Decision | Choice | Rationale |
|---|---|---|
| Per-stack directory term | `stack` | Industry-standard, clean namespace, pairs with `consumer → stack` field rename. |
| Path convention | `product/<stack>/capabilities/<scope>/` | Stack-bound location matches stack-bound runtime. |
| Allowlist shape | Glob `product/*/capabilities` (capability-records only) | Single rule covers all current and future stacks. No validator edits per stack. |
| Allowlist scope | Per-record-type widening, capability records only | Other record types keep current strict allowlist (`records/evidence`, `knowledge-packs`). |
| Glob safety | Realpath-resolved match; `*` matches one path segment, no traversal | Existing `validateLocalPath` already uses `realpathSync`; reuse it. |
| Stack-existence gate | Documented convention only (stack manifest required) | Validator does not enforce manifest presence — keeps validator small; reviewers catch in PR. |
| Migration boundary | Standalone plan, executed before FastAPI-build plan | Two N=1 efforts split cleanly. FastAPI-build phase 01 starts on a migrated tree. |
| Frozen-record handling | No edits to historical records or evidence MDs or journal | Per `decision-20260509T192449Z-prospective-convention-application`. |
| `product/.vnstock/` | Move to `product/api/.vnstock/` (preserve, do not delete) | Operator decision. Preserves any device-fingerprint files even if the canonical clearance is at `$HOME/.vnstock/`. |
| `product/web/capabilities/README.md` | Author empty-convention placeholder during migration | Pre-declares the convention before first frontend probe. |
| `product/.venv/` migration | Recreate at `product/api/.venv/` via `uv sync --extra vendor`, do NOT `mv` | `pyvenv.cfg` embeds creation-time absolute path; clean recreate is safer. |
| `product/README.md` | Rewrite to workspace framing in same migration commit | Removes contradiction with new layout. |

## Approach Evaluation

### Allowlist shape

#### Approach A — Glob pattern `product/*/capabilities` (chosen)
Single rule. Adding a new stack (e.g. `product/mobile/capabilities/`) requires zero validator edits.

Pros: YAGNI/DRY; minimal validator surface; convention captured in pattern.
Cons: Must implement single-segment match safely. Adds ~15 lines to validator.

#### Approach B — Literal alternation `product/{api,web}/capabilities`
Hard-code current stack list.

Pros: Most explicit; reviewers see the active stack list in code.
Cons: Validator edit on every new stack. Couples test/code/docs to a list that lives in three places. Repeats the brainstorm's own `n-equals-one-gap-class` anti-pattern (locking convention before friction).

Deferred. Revisit trigger documented in `records/evidence/meta/capability-allowlist-deferred-axes.md` Axis 2.

#### Approach C — Manifest-based detection
Validator checks `product/<X>/{pyproject.toml,package.json,go.mod,...}` exists before allowing capability paths under it.

Pros: Rejects orphan directories automatically.
Cons: Validator now does manifest detection across ecosystems. Heavy. YAGNI for N=1.

Deferred. Revisit trigger documented in `records/evidence/meta/capability-allowlist-deferred-axes.md` Axis 3.

### Migration timing

#### Timing 1 — Standalone plan, before FastAPI-build (chosen)
This brainstorm produces a plan; that plan ships; then FastAPI-build begins.

Pros: Two clean N=1 efforts; each earns its own ledger entry; FastAPI-build starts on a migrated tree (no phase-01 prep work).
Cons: One extra hop before product code lands.

#### Timing 2 — Inline as FastAPI-build phase 01 prep
Original plan in sibling brainstorm.

Pros: Single plan.
Cons: Phase 01 carries layout migration + validator extension + schema + fixtures + first capability records simultaneously. Too much surface area for one phase.

User has already chosen Timing 1.

### `product/web/capabilities/` first probe

#### W1 — Empty-with-README at migration time (chosen)
Author `product/web/capabilities/README.md` declaring the convention, no probes yet.

Pros: Convention is declared before first probe lands; reviewers have a target.
Cons: Slight YAGNI risk (might never get probes).

#### W2 — Lazy creation when first probe arrives
Skip `product/web/capabilities/` entirely until a TS probe is needed.

Pros: Pure YAGNI.
Cons: First probe author has to invent the convention from scratch; reviewers have no reference.

User has already chosen W1.

## Final Solution

### New layout

```
product/
├── README.md                            (rewritten to workspace framing)
├── api/
│   ├── pyproject.toml                   (moved from product/)
│   ├── .venv/                           (recreated via uv sync; gitignored)
│   ├── .vnstock/                        (moved from product/; gitignored)
│   └── capabilities/
│       └── vnstock-data/                (moved from product/capabilities/)
│           ├── capability-00-discovery.py
│           ├── capability-01-reference.py
│           ├── capability-02-market.py
│           ├── capability-03-fundamental.py
│           ├── capability-04-insights-macro.py
│           └── README.md
└── web/
    └── capabilities/
        └── README.md                    (new, empty-convention placeholder)
```

`product/` retains `README.md` only — no manifest, no venv. It is a workspace marker.

### Validator changes (`tools/validate-records/`)

**File: `record-validation-rules.js`**

Replace flat allowlist (line 50) and `validateLocalRef` (lines 108–117):

```js
const recordLocalRoots = {
  default: ["records/evidence", "knowledge-packs"],
  capability: ["records/evidence", "knowledge-packs", "product/*/capabilities"],
};

function expandAllowedRoots(patterns, root) {
  const result = [];
  for (const pattern of patterns) {
    if (!pattern.includes("*")) {
      result.push({ kind: "exact", path: realPathFor(root, pattern) });
      continue;
    }
    result.push({ kind: "glob", segments: pattern.split("/") });
  }
  return result;
}

function matchAllowedRoot(realRelativeSegs, allowedRoot) {
  if (allowedRoot.kind === "exact") {
    return isInside(realRelativeSegs.join("/"), allowedRoot.path);
  }
  // glob: pattern is a prefix of segments; * matches exactly one segment
  if (realRelativeSegs.length < allowedRoot.segments.length) return false;
  for (let i = 0; i < allowedRoot.segments.length; i++) {
    const p = allowedRoot.segments[i];
    const s = realRelativeSegs[i];
    if (p === "*") {
      if (!s || s === "." || s === "..") return false;
      continue;
    }
    if (p !== s) return false;
  }
  return true;
}

export function validateLocalRef(record, ref, root, errors) {
  const allowed = recordLocalRoots[record.type] || recordLocalRoots.default;
  const description = allowed.join(", ");
  validateAllowedLocalPath(record.__file, ref.slice("local:".length), root, allowed, description, errors);
}
```

`validateAllowedLocalPath` updated to accept the structured allowed-roots and call `matchAllowedRoot`. `validateSourceRefs` (line 60) signature updated to pass `record` instead of `record.__file`.

The `*` segment matches exactly one path segment with no `.` or `..` (safe traversal). `realpathSync` is already called by `validateLocalPath`, so symlink escapes are caught.

**File: `validate-records.js`**

Add `"capability"` to the schema-loading array at line 14:

```js
["claim", "experiment", "decision", "risk", "capability"]
```

Extend negative-fixture cases array (line 21) with three new entries:

```js
["capability-source-outside-allowlist", "local source must stay under records/evidence, knowledge-packs, product/*/capabilities"],
["non-capability-source-in-product", "local source must stay under records/evidence or knowledge-packs"],
["capability-source-glob-traversal", "local source must stay under records/evidence, knowledge-packs, product/*/capabilities"],
```

### Schema (`schemas/capability.schema.json`)

New file. Field shape (locks the brainstorm sketch with `consumer → stack` rename):

```json
{
  "type": "object",
  "required": ["id", "schema_version", "type", "status", "created_at", "updated_at", "source_refs", "stack", "surface", "maps"],
  "properties": {
    "id": { "type": "string" },
    "schema_version": { "type": "string" },
    "type": { "const": "capability" },
    "status": { "enum": ["draft", "approved", "rejected", "superseded"] },
    "created_at": { "type": "string" },
    "updated_at": { "type": "string" },
    "source_refs": { "type": "array", "items": { "type": "string" } },
    "stack": { "type": "string" },
    "surface": { "type": "string" },
    "maps": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["source"],
        "properties": {
          "source": { "type": "string" },
          "route_class": { "type": "string" },
          "view_class": { "type": "string" },
          "response_class": { "type": "string" }
        }
      }
    },
    "supersedes": { "type": "array", "items": { "type": "string" } }
  }
}
```

`stack` field is open-string (matches future `mobile`, `desktop`); reviewers gate against the convention. `surface` is open-string (e.g. `HTTP/REST`, `TanStack Start route`).

### Fixture additions (`fixtures/`)

Three new directories under `fixtures/negative/`:

- `capability-source-outside-allowlist/capabilities/<file>.yaml` — capability record citing `local:product/api/src/main.py` (not `capabilities/`). Expected error: allowlist violation.
- `non-capability-source-in-product/claims/<file>.yaml` — claim record citing `local:product/api/capabilities/x.py`. Expected error: claim allowlist still strict.
- `capability-source-glob-traversal/capabilities/<file>.yaml` — capability record citing `local:product/../etc/capabilities`. Expected error: realpath resolution rejects.

Plus one positive fixture under `fixtures/` (or inline in real records during phase 03 — see plan): a capability record citing `local:product/api/capabilities/vnstock-data/capability-01-reference.py` that passes.

### Doc updates

Living docs only. Frozen records and journals untouched.

| File | Change |
|---|---|
| `docs/operator-guide.md` line 27–29 | Add capability-record-only `local:product/<stack>/capabilities/...` exception to the source_refs section. |
| `docs/operator-guide.md` line 152, 157 | Replace `product/capabilities/<scope>/` and the environment-model paragraph with `product/<stack>/capabilities/<scope>/` + per-stack environment model. |
| `docs/claim-verification.md` line 83 | Update capability-script path. |
| `docs/lab-model.md` line 34 | Update path in pipeline diagram. |
| `docs/knowledge-pack-contract.md` line 54 | Update path. |
| `docs/handoff.md` line 26, 38 | Update path; add migration date pointer for readers consulting frozen records. |
| `product/README.md` | Rewrite from "shared environment" framing to "workspace + per-stack environments" framing. |

The doc layer also adds **one new section in `docs/operator-guide.md`** titled "Stacks and Capability Locations" containing the locked terminology table and the capability-record-only allowlist rule.

### `.gitignore` updates

Replace `product/.cache/`, `product/.local/`, `product/.vnstock/` with `product/*/.cache/`, `product/*/.local/`, `product/*/.vnstock/`. The global `.venv/` rule remains.

### Skill updates (`.claude/skills/learning-loop/`)

| File | Change |
|---|---|
| `SKILL.md` | Update any "capability" mentions to qualified terms (per `brainstorm-20260510-external-skills-integration.md` Terminology). Path references updated to `product/<stack>/capabilities/`. Add `product-build` task class entry. |
| `references/learning-loop-rules.md` | Same qualified-term harmonization. |
| `references/prompt-blueprints.md` | Update path references. |
| `references/prompt-blueprints-product-build.md` | **New file.** Three blueprint skeletons per the sibling FastAPI-build brainstorm "learning-loop skill extension" section: pre-build record-authoring, skill-phase constraint, post-build verification. Authored in this plan rather than deferred to FastAPI-build because the blueprint locks the capability-record source-ref pattern (`local:product/<stack>/capabilities/<scope>/<file>`) — that pattern is established in this plan and must land in the same commit as the validator widening so prompts and validator stay in sync. |

### Records authored

This is a CODE/CONFIG migration plan, not a product-build plan. Loop records authored:

- `claim-loop-capabilities-stack-allowlist.yaml` — claim that the glob allowlist correctly admits `product/*/capabilities` for capability records and rejects others. Verification dimensions: `static` (schema lints), `runtime` (validator passes against fixtures).
- `experiment-loop-capabilities-stack-allowlist-<ts>.yaml` — experiment proving the validator enforces the new rule via the three new negative fixtures + at least one positive case.
- `decision-<ts>-capabilities-stack-migration.yaml` — operator decision approving the directory move + field rename (`consumer` → `stack`) + validator widening.
- `risk-loop-capability-allowlist-overreach.yaml` — risk that future record types accidentally inherit the widened allowlist (mitigation: per-type table, default-deny).
- Evidence MD: `records/evidence/loop/capabilities-stack-migration.md` capturing pre-migration tree, post-migration tree, validator fixture pass/fail summary, `pnpm check` output redacted.

No update to the existing `claim-vnstock-install-sandbox` claim — it stays approved at `verification.product = claimed`. The product flip happens in the FastAPI-build plan.

### Decision Draft

Phase 01 authors the following decision in `draft` status. Phase 06 flips it to `approved` and adds the evidence MD ref to `source_refs` after `pnpm check` passes against the migrated tree. The planner transcribes this content verbatim into `records/decisions/decision-<ts>-capabilities-stack-migration.yaml`. Timestamp is generated at phase 01 execution, not now.

Source-ref hygiene: `source_refs` lists only paths that exist at phase 01 author time (the meta-evidence MD already exists; the loop-evidence MD does not yet). Plan/brainstorm paths go in `notes` as text, not in `source_refs`, because the validator's strict allowlist for non-capability record types admits only `records/evidence/` and `knowledge-packs/`.

```yaml
id: decision-<ts>-capabilities-stack-migration
schema_version: "1.0"
type: decision
status: draft
created_at: "<ts-date>"
updated_at: "<ts-date>"
source_refs:
  - local:records/evidence/meta/capability-allowlist-deferred-axes.md
  - record:claim-loop-capabilities-stack-allowlist
  - record:experiment-loop-capabilities-stack-allowlist-<ts>
  - record:risk-loop-capability-allowlist-overreach
  - record:decision-20260509T192449Z-prospective-convention-application
notes: |
  Loop architecture decision. Locks per-stack capability layout, glob allowlist, and the new capability
  record type. Scoped by plans/reports/brainstorm-20260510-capabilities-stack-migration.md and the
  sibling brainstorm at plans/reports/brainstorm-20260510-external-skills-integration.md. Frozen-record
  convention from prospective-convention-application applies to historical artifacts. Phase 06 adds
  local:records/evidence/loop/capabilities-stack-migration.md to source_refs once the evidence MD lands.
question: How should capability scripts and capability records be located and validated to support a polyglot product (Python `api`, TypeScript `web`, future stacks) without per-stack validator edits?
decision: |
  Capability scripts live under `product/<stack>/capabilities/<scope>/`. Capability records live under
  `records/capabilities/`. The validator allowlist for `local:` source_refs is widened — capability records
  only — to admit the glob `product/*/capabilities`. Other record types retain the existing strict allowlist
  (`records/evidence`, `knowledge-packs`).

  The directory level between `product/` and `capabilities/` is named `stack`. The capability record schema
  uses an open-string `stack` field. Stack legitimacy is gated by the convention that every `product/<stack>/`
  contains a stack manifest (`pyproject.toml`, `package.json`, `go.mod`, ...). Reviewers enforce this in PR;
  the validator does not.
rationale: |
  Capability scripts are stack-bound: they execute in one runtime with one dependency manifest. Stack-bound
  artifacts must live with their stack. The previous mono-stack layout (`product/capabilities/`) worked only
  while the product was Python-only; it would block the first frontend probe.

  The glob allowlist (`product/*/capabilities`) is the minimum admission rule that supports today's two stacks
  and any future stack added under the same convention, without validator edits per stack. Per-record-type
  widening keeps the security perimeter tight: only capability records gain the extension; default-deny for
  every other type.

  Three further extension axes (multi-segment globs, `stack` enum, validator-level manifest enforcement) were
  considered and explicitly deferred. Revisit triggers documented in
  `records/evidence/meta/capability-allowlist-deferred-axes.md`.
alternatives:
  - Keep `product/capabilities/<scope>/` and add language tags inside scope (e.g. `vnstock-data-py`, `tanstack-ts`). Rejected: scope is conceptual, not stack-bound; mixing stack and scope in one segment overloads the directory name.
  - Hard-code the stack list in the validator (literal alternation `product/{api,web}/capabilities`). Deferred per `records/evidence/meta/capability-allowlist-deferred-axes.md` Axis 2.
  - Enforce stack-manifest presence in the validator. Deferred per `records/evidence/meta/capability-allowlist-deferred-axes.md` Axis 3.
  - Defer the migration entirely; absorb it into the FastAPI-build phase 01. Rejected: too much surface area for one phase; layout migration earns its own ledger entry.
tradeoffs:
  - The glob admits any directory under `product/*/capabilities` — orphan stack directories without a manifest pass the validator. Mitigated by PR review; cost is one bad PR worth of cleanup if reviewers miss it.
  - The `consumer → stack` rename in the proposed capability schema (sketched in `brainstorm-20260510-external-skills-integration.md` line 250) is permanent; future readers must know the rename happened. Migration brainstorm and decision both name the rename explicitly.
  - Recreating `product/api/.venv` (rather than `mv`-ing the existing `.venv`) requires running `uv sync` against PyPI. The vnstock_data wheel is on PyPI (`INSTALLER: uv` per current dist-info), so this works without re-triggering the Makeself installer or vendor device-clearance flow.
  - Frozen historical records reference `product/capabilities/...` paths that no longer resolve post-migration. Per `decision-20260509T192449Z-prospective-convention-application`, historical records are not edited. Living docs explain the convention transition; reviewers consulting frozen records read them as accurate-as-of-authoring.
supersedes: []
decision_effect:
  action: approve
  scope: schema-improvement
  affected_refs:
    - local:tools/validate-records/record-validation-rules.js
    - local:tools/validate-records/validate-records.js
    - local:schemas/capability.schema.json
    - local:product/api/capabilities
    - local:product/web/capabilities
    - local:docs/operator-guide.md
    - local:docs/claim-verification.md
    - local:docs/lab-model.md
    - local:docs/knowledge-pack-contract.md
    - local:docs/handoff.md
    - local:product/README.md
    - local:.gitignore
    - local:.claude/skills/learning-loop/SKILL.md
    - local:.claude/skills/learning-loop/references/prompt-blueprints.md
    - local:.claude/skills/learning-loop/references/prompt-blueprints-product-build.md
  boundaries:
    allowed_actions:
      - Author capability records under `records/capabilities/` citing `local:product/<stack>/capabilities/<scope>/<file>` in source_refs.
      - Add new stacks by creating `product/<new-stack>/` with a stack manifest and `capabilities/` subdirectory; no validator change required.
      - Reference capability scripts from non-capability records via free-text observations (existing pattern; the widened allowlist does not retroactively widen claim/experiment/decision/risk source_refs).
    blocked_actions:
      - Citing `local:product/...` paths outside `product/*/capabilities` from any record type.
      - Citing `local:product/<stack>/capabilities/...` paths from non-capability record types in source_refs.
      - Editing frozen historical records (`records/experiments/experiment-vnstock-capabilities-20260509T174957Z.yaml`, `records/evidence/vnstock-data/capability-runtime-output.md`, `docs/journals/260510-vnstock-capability-runtime.md`) to update stale paths.
      - Adding multi-segment globs (`**`) or character classes to the validator allowlist without first satisfying the revisit triggers in `records/evidence/meta/capability-allowlist-deferred-axes.md`.
    required_gates:
      - pnpm validate:records
      - pnpm check
      - capability-00-discovery.py runs successfully against product/api/.venv post-migration
```

### Phase plan shape

```
plans/<ts>-capabilities-stack-migration/
  plan.md
  phase-01-pre-migration-records.md       (loop)
  phase-02-validator-and-schema.md        (code)
  phase-03-fixture-tests.md               (code)
  phase-04-filesystem-migration.md        (code + skill: shell ops)
  phase-05-doc-and-skill-harmonize.md     (loop + code)
  phase-06-post-migration-records.md      (loop)
```

- **Phase 01 (loop):** author claim + risk + draft experiment + draft decision. No code yet.
- **Phase 02 (code):** add `schemas/capability.schema.json`, extend `tools/validate-records/{validate-records,record-validation-rules}.js`. Tests in phase 03 verify. **Approval gate before this phase.** Operator confirms the schema field shape (open-string `stack`) and per-record-type allowlist table before any validator code lands. Validator changes are reversible but the schema is the load-bearing contract for every future capability record; locking it down with explicit operator sign-off prevents schema churn during phase 06 promotion.
- **Phase 03 (code):** author fixtures (positive + 3 negatives). Run `pnpm validate:records --allow-disallowed-fixtures` to confirm new cases pass. Then run unmodified `pnpm validate:records` to confirm baseline still green.
- **Phase 04 (code + shell):** `git mv` capabilities + pyproject.toml; `cp -r product/.vnstock product/api/.vnstock` (preserve as locked); `uv venv product/api/.venv && cd product/api && uv sync --extra vendor`; run `python capabilities/vnstock-data/capability-00-discovery.py` to verify env+import; delete old `product/{.venv,.cache,.local,.vnstock}` after step succeeds. **Approval gate before this phase.**
- **Phase 05 (loop + code):** edit living docs, skill files, `.gitignore`, `product/README.md`. Add new section to `operator-guide.md`. Author `references/prompt-blueprints-product-build.md` per the sibling FastAPI-build brainstorm's "learning-loop skill extension" section.
- **Phase 06 (loop):** flip experiment status to approved, write evidence MD, flip claim's `verification.runtime` to `verified` with proof_refs. Run `pnpm validate:records` and `pnpm check` final.

Loop phases hold record-authoring prompts. Code phases hold direct-edit checklists naming exact files and line ranges. No external-skill phases in this plan.

## Success Criteria

After phase 06 ships:

- `pnpm validate:records` passes against the live tree.
- `pnpm check` passes.
- New capability fixture (positive case) validates green.
- Three new negative fixtures fail with the expected error strings.
- `product/api/capabilities/vnstock-data/capability-00-discovery.py` runs successfully against `product/api/.venv` and prints the same metadata-only output shape as `records/evidence/vnstock-data/capability-runtime-output.md`.
- `git ls-files product/` shows no entries under the old `product/capabilities/` path; all moved.
- `claim-loop-capabilities-stack-allowlist.verification.runtime` flipped to `verified` with proof_refs to the experiment.
- `decision-<ts>-capabilities-stack-migration` approved.
- All living docs reference `product/<stack>/capabilities/`. No living doc references `product/capabilities/`.
- Frozen records and journal untouched (verify via `git diff` shows zero changes to `records/experiments/experiment-vnstock-capabilities-20260509T174957Z.yaml`, `records/evidence/vnstock-data/capability-runtime-output.md`, `docs/journals/260510-vnstock-capability-runtime.md`).

Failure signal:

- Glob match implementation has any case where `..` traversal sneaks through realpath. Test with the `capability-source-glob-traversal` negative fixture.
- Recreated venv fails to import `vnstock_data`. Implies device-fingerprint or vendor-config drift; investigate `product/api/.vnstock/` vs `$HOME/.vnstock/` before assuming the migration is the cause.
- Doc updates miss a `product/capabilities/` reference. Catch via grep audit in phase 05.

## Risks

| Risk | Mitigation |
|---|---|
| Glob `*` allows traversal via `..` segments | Realpath resolution before match; explicit reject of `.` and `..` in segment match. Negative fixture `capability-source-glob-traversal` enforces. |
| Capability records under non-stack dirs (e.g. `product/scratch/capabilities`) get implicit privilege | Documented convention (every `product/<stack>/` has a stack manifest); reviewers gate in PR. Defer code enforcement until orphans appear. |
| Per-record-type allowlist regresses non-capability records (capability widening leaks) | Default-deny: `recordLocalRoots[record.type]` falls back to `default` for any non-capability type. Fixture `non-capability-source-in-product` enforces. |
| Recreated venv loses vendor device clearance | Clearance lives at `$HOME/.vnstock/` (canonical), not in repo; re-running `uv sync` does not re-trigger device limits because the wheel is on PyPI (`INSTALLER: uv` per dist-info). Confirm via phase 04 capability-00 run before declaring success. |
| Frozen historical records' stale paths confuse readers | `docs/handoff.md` gets a one-line migration-date pointer; living docs explain the convention transition. |
| Doc-grep misses a `product/capabilities/` reference | Phase 05 includes explicit grep audit: `grep -rn "product/capabilities" docs/ .claude/ product/README.md` must return zero matches before phase 06 begins. |
| `product/.vnstock` move loses files vendor reads from CWD | Operator chose preserve, not delete. Phase 04 uses `cp -r` then deletes only after capability-00 verification passes. |

## Implementation Considerations

- The glob match function operates on path SEGMENTS post-realpath. Do not regex-match the raw string — `realpathSync` resolves symlinks but not multi-step `../` patterns inside the relative ref unless the joined path is realpath'd as a whole. `validateLocalPath` already does this; reuse the same `realPath` for the glob match.
- The `recordLocalRoots` table is the canonical place to widen allowlists for future record types. Any new type defaults to strict `records/evidence` + `knowledge-packs` unless the table opts it in.
- The `consumer → stack` rename applies only to the proposed capability schema (sketched in the sibling brainstorm). No live record uses `consumer` today; no migration of existing data needed.
- `product/web/capabilities/README.md` content: 5–10 lines naming the stack (TanStack Start / TypeScript), listing what kinds of probes belong (frontend integration, route loader feasibility, etc.), and pointing to `docs/operator-guide.md` "Stacks and Capability Locations" section.
- Validator extension is ~30 lines added; no new npm dependencies.
- Phase 04 `cp -r product/.vnstock product/api/.vnstock` preserves files. Old `product/.vnstock` deleted only after capability-00 imports cleanly.
- Approval gate before phase 04 (filesystem migration) — operator must confirm before any `git mv` or venv recreate runs.

## Next Steps

1. Hand off to `/ck:plan` with this report as input. Output: phase plan under `plans/<ts>-capabilities-stack-migration/`.
2. After this plan ships: the FastAPI-build brainstorm (`brainstorm-20260510-external-skills-integration.md`) needs three small edits before its plan is generated:
   - Decisions Locked → "Repo layout" row: replace migration step text with "see capabilities-stack-migration plan, prerequisite".
   - Implementation Considerations → drop the `product/.venv → product/api/.venv` migration paragraph (now resolved upstream).
   - Risks → drop row "Repo layout migration breaks capability scripts" (resolved upstream).
3. After both plans ship: schedule a journal entry on whether the per-record-type allowlist table earned its keep or whether a single allowlist would have served (post-N=1 review).

## Unresolved Questions

- **`product/api/.vnstock` runtime semantics:** does `vnstock_data` actually read CWD-relative `.vnstock/` or only `$HOME/.vnstock/`? Phase 04 capability-00 verification answers this empirically. If CWD-relative, the `cp -r` preserves correct behavior. If HOME-only, `product/api/.vnstock/` is harmless dead weight — defer cleanup to a separate session.
- **`product/README.md` content scope:** workspace overview only, or include the locked stack convention table inline? Inline avoids one indirection but duplicates `docs/operator-guide.md`. Recommend: workspace overview + one-paragraph pointer to operator-guide. Lock during phase 05.

Three additional extension axes (glob `**`, `stack` enum, validator-level manifest enforcement) were considered, deferred, and documented as meta evidence in `records/evidence/meta/capability-allowlist-deferred-axes.md`. Each carries an explicit revisit trigger; do not re-litigate during planning.
