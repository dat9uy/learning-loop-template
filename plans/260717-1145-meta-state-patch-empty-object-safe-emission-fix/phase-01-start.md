---
phase: 1
title: "Context, root cause & rejected alternatives"
status: todo
priority: P1
effort: "0.5h"
dependencies: []
---

# Phase 1: Context, root cause & rejected alternatives

## Overview

Grounding phase — no code. Locks the verified root cause, the parity-seam injection point, the
rejected split-tools alternative, and the scope so Phases 2-4 execute against a fixed design. A
reviewer reading only this phase should be able to trace the bug and agree with the approach.

## Requirements

- Functional: none (no implementation).
- Non-functional: every claim is backed by a verified file:line or a transcript reference.

## Architecture

### The empty-`{}` safe-emission mechanism (verified)

`meta-state-patch-tool.js:24` declares `patch` as
`z.preprocess(deepStripEnvelope, z.union(PATCH_KINDS.map(buildPatchSchemaFor)))`. Each branch is
`…Schema.omit({…}).partial().strict()` (`core/meta-state.js:616-621`) — **all fields optional** in
every branch. The model-visible JSON schema is an `anyOf` of four all-optional objects, so `{}` is the
unique value valid against **all** branches — the zero-risk emission. Verified empirically:

| `patch` value | Zod parse (runtime) | Notes |
|---|---|---|
| `{}` | **OK** | satisfies all 4 branches |
| `{description:"<≥20 chars>"}` | OK | valid; only if sub-constraints pass |
| `{description:"<15 chars>"}` | FAIL `"Invalid input"` `path=[]` | opaque — no field named |
| `{totally_unknown_key:"x"}` | FAIL `"Invalid input"` `path=[]` | opaque strict violation |

### Why runtime rejection cannot steer the model

The model-visible schema is produced via the **parity seam**: `create-loop-tool.js#attachParityJSONSchema`
sets `schema._zod.toJSONSchema = () => parityJSONSchema` (a draft-7 JSON schema from
`buildParitySchema` → `z.toJSONSchema`). **`.refine`/`.superRefine` are dropped by `toJSONSchema`** —
they are not JSON-Schema-expressible. So `metaStateEntryPatchSchema.refine` (`core/meta-state.js:641`)
and the handler `empty_patch` check (`meta-state-patch-tool.js:110`) fire only at **runtime**, after the
model emitted `{}`. Transcript `e10944c4-…` proves this is insufficient: five consecutive `patch:{}`
calls, one immediately after a written diagnosis. The override is **generation-only** — `.parse()`
uses the real Zod schema, so the runtime path is independent and stays as defense-in-depth.

### The injection point (why the fix is implementable)

Because the parity seam fully controls the model-visible JSON schema, we can inject a standard
draft-7 `minProperties: 1` on `patch`. That makes `{}` schema-invalid **pre-invocation**, steering the
model's constrained decoding away from `{}` before it ever emits the broken call. There is an existing
e2e parity test (`__tests__/mcp-tools-list-parity.test.js`) to extend.

## Related Code Files

- Read: `tools/learning-loop-mastra/tools/handlers/meta-state-patch-tool.js` (lines 24, 110)
- Read: `tools/learning-loop-mastra/mastra/create-loop-tool.js` (`attachParityJSONSchema`)
- Read: `tools/learning-loop-mastra/mastra/schema-parity.js` (`buildParitySchema`)
- Read: `tools/learning-loop-mastra/core/meta-state.js` (lines 616-643)
- Read: `tools/learning-loop-mastra/__tests__/mcp-tools-list-parity.test.js`
- Reference: transcript `~/.claude/projects/-home-datguy-codingProjects-learning-loop-template/e10944c4-17e8-4234-b845-ad6c8817df01.jsonl`
- Reference: finding `meta-260717T1026Z-…empty-patch` (status `superseded`) — captured only the silent-success symptom

## Implementation Steps

1. None — grounding only. (Confirm the file:line references above still match HEAD before Phase 2;
   line numbers are load-bearing for the tests' documentation.)

## Success Criteria

- [ ] Reviewer can trace: union-of-partials → `{}` safe → `.refine` dropped → parity seam is the fix.
- [ ] Reviewer agrees the split-tools alternative is rejected on evidence (`.partial()` accepts `{}` in every branch).

## Risk Assessment

**Risk:** a reader assumes "just try harder" was the cause (the agent's own [94] diagnosis in the
transcript said exactly that). **Mitigation:** this phase's table and the parity-seam explanation make
the structural cause explicit — willpower cannot overcome a schema that makes `{}` the safest emission.
