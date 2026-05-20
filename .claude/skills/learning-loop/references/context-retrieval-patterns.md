# Context Retrieval Patterns

Use these blueprints when an agent needs to trace a dependency chain from a capability record to the underlying product code, runtime probes, and index entries. These patterns enforce ground-truth reading over name-based inference.

---

## Tier 2 Verification Lookup Pattern

Use when an agent reads a capability record and needs to verify what product code implements it, or when tracing dependencies backward from a capability to experiments and evidence.

Capability records (Tier 2) are runtime-derived and contain no verification state. All verification lives in index entries (Tier 1). Agents must trace the full chain; skipping steps is a reasoning error.

### 7-Step Lookup Chain

```text
Trace dependency for capability [capability-id].

Work context: [absolute path to this repo]

Step 1 — Read the capability record:
- records/capabilities/[capability-id].yaml
- Note: stack, surface, maps[].source only. No verification state here.

Step 2 — List runtime probes for the stack:
- pnpm list:probes --stack [stack] (or node tools/list-probes/list-probes.js --stack [stack])
- Match probe path to capability domain by directory name.

Step 3 — Read the matched runtime probe:
- product/[stack]/capabilities/[domain]/[probe-file].py
- This is ground-truth product code. Do not skip.

Step 4 — Search index entries by capability:
- pnpm search:index --capability [capability-id] (or node tools/search-index/search-index.js --capability [capability-id])
- Index entries carry verification state (Tier 1), not the capability record.

Step 5 — Read matching index entries:
- records/index/[index-entry-id].yaml
- Check verification.<dimension>.status for each dimension.

Step 6 — Read evidence cited by index entries:
- Follow source_refs in index entries to evidence files.
- Confirm evidence validation_status matches index entry status.

Step 7 — Read experiments proving the dimension:
- records/experiments/[experiment-id].yaml (from index entry experiment_refs or evidence)
- Confirm experiment result supports the claimed dimension status.

STOP guards:
- NEVER infer a dependency from a capability filename alone.
- NEVER treat a capability record as verified because it exists.
- NEVER skip Step 3 (reading product code) — runtime probes are ground truth.
- NEVER skip Step 4-5 (index entries) — capability records carry no verification state.
- If any step returns no data, report "verification chain broken at step [N]" and stop.
```

### Verification State Ownership

| Tier | Artifact | Carries verification state? | Authority |
|---|---|---|---|
| Tier 1 | Index entries (`records/index/`) | Yes — `verification.<dimension>.status` | Machine-derived from evidence |
| Tier 2 | Capability records (`records/capabilities/`) | No — structural description only | Runtime-generated from product surfaces |
| Tier 3 | Product code (`product/*/`) | No — implementation ground truth | Read directly, never inferred |

### CLI Helpers

| Command | Purpose |
|---|---|
| `pnpm list:probes --stack api` | List runtime probe files for a stack |
| `pnpm list:probes --stack api --json` | Machine-readable probe list |
| `pnpm search:index --capability <id>` | Find index entries referencing a capability |
| `pnpm search:index --capability <id> --dimension runtime --status active` | Filter by dimension and status |
| `pnpm search:index --capability <id> --json` | Machine-readable index metadata |

---

## Agent Intake Verification Prompt

Use at the start of any session where the agent will act on capability or product code knowledge.

```text
Before proposing changes to product code or inferring dependencies:

1. Run `pnpm generate:capabilities --dry-run`. If drift is detected, stop and tell the operator.
2. For each capability you plan to reference, run the Tier 2 Verification Lookup Pattern (7 steps above).
3. Do not proceed on unverified assumptions. Ground every claim in a read file, not a filename pattern.
```
