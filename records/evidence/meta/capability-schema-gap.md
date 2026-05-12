# Capability Schema Gap

## Observation

`capabilities.yaml` has no schema, and the current template permits an empty array.

## Evidence

The vnstock pack could not be approved because install verification failed. This prevented deriving a concrete capability shape from verified behavior, but it also showed that capabilities need room to represent blocked or pending capability candidates without publishing them as runnable facts.

Source: `records/evidence/vnstock-data/experiment-install-20260508T101723Z.md`

## Proposed Improvement

Define a capability schema only after a verified pack exists. Candidate fields should include `id`, `description`, `method`, `prerequisites`, `verified_by`, `scope`, and publication status.

## Partial Supersession

Status (2026-05-12): the original `## Observation` is **stale-but-preserved** — `schemas/capability.schema.json` now exists in a minimal map-oriented form. The schema was introduced during the capabilities-stack migration; the gap MD was not updated at that time. The original text is retained above as history; the disposition table and structural-drift note below capture the current state.

### Field disposition

| Gap-proposed field   | Status in current schema (`schemas/capability.schema.json`)              | Disposition                                                       |
|----------------------|---------------------------------------------------------------------------|-------------------------------------------------------------------|
| `id`                 | present                                                                   | superseded                                                        |
| `description`        | absent                                                                    | hold for N>=3                                                     |
| `method`             | absent (structurally replaced by `maps[].source` etc.)                    | hold for N>=3; revisit whether `maps` covers it when another stack lands |
| `prerequisites`      | absent                                                                    | hold for N>=3                                                     |
| `verified_by`        | partial via `source_refs[]`                                               | partially superseded; hold explicit field for N>=3                |
| `scope`              | absent (current schema uses `stack` + `surface` instead)                  | structurally replaced by a different axis (see drift note below)  |
| publication status   | present as `status` enum (`draft | approved | rejected | superseded`)     | superseded                                                        |

### Structural drift note

The current schema took a **map-oriented** shape (`stack` + `surface` + `maps[]` of source → route_class / view_class / response_class) rather than the **predicate-oriented** shape the gap proposed (`id` / `description` / `method` / `prerequisites`). This is an axis change, not just field absence. The change happened during the capabilities-stack migration (`decision-20260510T160000Z-capabilities-stack-migration`); the gap MD was not amended at that time, leaving a false signal that the original field set was still on the to-do list.

This partial-supersession note exists to correct that signal without rewriting the original observation. Future agents should treat the gap as **resolution-pending-trigger** rather than **untouched**.

## Deferral Note

Do not change canonical docs or schemas in this session. Adoption requires a future meta claim, experiment, and decision.

## Trigger

- Event class: next-pack-creation
- Threshold: N>=3 packs verified
- Current population (2026-05-12): 1 verified install path (`experiment-install-20260509T071800Z-sandbox-1.md` for `vnstock-data`) + 2 approved capability records (`capability-fastapi-reference-rest`, `capability-tanstack-reference-render`) = **N=2 surrogate**. Threshold N>=3 **not yet met**. One more verified pack required.
- Action when triggered: draft capability schema candidate fields (`description`, `method`, `prerequisites`, explicit `verified_by`) on top of the existing map-oriented schema, then open a meta-experiment to validate against the three verified packs.
- Re-pin note: the trigger phrasing is preserved verbatim from the original block above; only the current-population line is new. The action when triggered is amended in light of the structural drift documented in `## Partial Supersession` — proposals must layer onto the existing `stack` + `surface` + `maps[]` shape rather than replace it.
