---
capability: meta
dimension: static
scope: meta-tooling
validation_status: passed
---

# Evidence Findings Convention

## Findings

- [findings-syntax] Evidence markdown files may include a `## Findings` section for machine extraction into `records/index/`.
- [topic-tag-format] Each top-level bullet starts with `[topic-tag]` followed by an atomic assertion. Topic tags are kebab-case, unique within the file.
- [context-prefix] Nested bullets prefixed `Context:` populate the index entry `context` field.
- [caveat-prefix] Nested bullets prefixed `Caveat:` populate the index entry `caveats` array.
- [frontmatter-required] Evidence files must include frontmatter with `capability`, `dimension`, `scope`, and `validation_status` for extraction to be attempted.
- [silent-skip] Files without a `## Findings` section or with no `[topic-tag]` bullets are silently skipped, not errored.
- [meta-evidence-format] Meta evidence files use `## Findings` with `[topic-tag]` bullets for machine extraction, plus narrative sections (`## Observation`, `## Evidence`, `## Trigger`, `## Deferral`) as supplementary context.

## Observation

The extraction tool (`pnpm extract:index` / `gate_extract_index_entries`) reads all `records/evidence/**/*.md` files, extracts top-level bullets under `## Findings`, and writes `records/index/assertion-<capability>-<dimension>-<topic-tag>.yaml` entries.

## Trigger

- Event class: evidence-file-creation
- Threshold: N=1
- Action when triggered: verify `## Findings` section follows convention before running extraction.
