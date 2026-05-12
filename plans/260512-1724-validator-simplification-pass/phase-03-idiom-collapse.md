---
phase: 3
title: "Idiom Collapse"
status: complete
priority: P3
effort: "20m"
dependencies: [2]
---

# Phase 3: Idiom Collapse

## Overview

Replace two local inventions with stdlib idioms. Covers Cascades 3 and 4 from the scout report. Strictly mechanical; same observable behavior.

## Requirements

- Functional: `recordLocalRoots` carries its own description string; `allowedDescriptionFor()` deleted; `dimensionEntries()` collapsed to one line. Behavior unchanged.
- Non-functional: deleted symbols not referenced elsewhere (Phase 1 confirmed module-private).

## Architecture

### Cascade 3: `recordLocalRoots` config + `allowedDescriptionFor` removal

Current (`tools/validate-records/record-validation-rules.js:63-66`):
```js
const recordLocalRoots = {
  default: ["records/evidence", "knowledge-packs"],
  capability: ["records/evidence", "knowledge-packs", "product/*/capabilities"],
};
```

Plus `allowedDescriptionFor()` at lines 143-148:
```js
function allowedDescriptionFor(allowedRoots) {
  if (allowedRoots.length === 2 && allowedRoots[0] === "records/evidence" && allowedRoots[1] === "knowledge-packs") {
    return "records/evidence or knowledge-packs";
  }
  return allowedRoots.join(", ");
}
```

Target shape:
```js
const recordLocalRoots = {
  default: {
    roots: ["records/evidence", "knowledge-packs"],
    description: "records/evidence or knowledge-packs",
  },
  capability: {
    roots: ["records/evidence", "knowledge-packs", "product/*/capabilities"],
    description: "records/evidence, knowledge-packs, product/*/capabilities",
  },
};
```

`validateLocalRef` (lines 150-160) updated:
```js
export function validateLocalRef(record, ref, root, errors) {
  const config = recordLocalRoots[record.type] || recordLocalRoots.default;
  validateAllowedLocalPath(
    record.__file,
    ref.slice("local:".length),
    root,
    config.roots,
    config.description,
    errors,
  );
}
```

`allowedDescriptionFor()` deleted entirely.

### Cascade 4: `dimensionEntries` one-liner

Current (`tools/validate-records/claim-verification-rules.js:122-127`):
```js
function dimensionEntries(claim) {
  const verification = claim.verification || {};
  return [...verificationDimensions]
    .filter((dimension) => verification[dimension] !== undefined)
    .map((dimension) => [dimension, verification[dimension]]);
}
```

Target:
```js
function dimensionEntries(claim) {
  return Object.entries(claim.verification || {}).filter(([key]) => verificationDimensions.has(key));
}
```

Semantics preserved:
- Same `[dimension, config]` shape returned.
- `verificationDimensions` Set membership filter naturally excludes `blocked_actions` and any future non-dimension keys.
- Iteration order shifts from Set-insertion (static, install, runtime, product) to YAML-key order. Affects only the order of error messages emitted from `validateClaimDimensions`; does not change exit code or which errors are emitted.

## Related Code Files

- Modify:
  - `tools/validate-records/record-validation-rules.js` — restructure `recordLocalRoots`, delete `allowedDescriptionFor`, update `validateLocalRef`
  - `tools/validate-records/claim-verification-rules.js` — collapse `dimensionEntries`

## Implementation Steps

1. Edit `record-validation-rules.js`:
   1. Replace `recordLocalRoots` object literal with `{ roots, description }` shape (both keys).
   2. Delete `allowedDescriptionFor` function (lines 143-148).
   3. Update `validateLocalRef` to read `config.roots` and `config.description`.
2. Edit `claim-verification-rules.js`:
   1. Replace 5-line `dimensionEntries` body with single `return Object.entries(...).filter(([key]) => verificationDimensions.has(key));` line.
3. Run `pnpm validate:records`. Expect exit 0 + same record count as baseline.
4. Run `pnpm test`. Expect exit 0.
5. Spot-check a negative fixture that exercises `local:` source paths: `tools/validate-records/validate-records.js` runs `disallowed-local-source` and `capability-source-outside-allowlist` cases. Confirm the expected error messages still match the substrings in `validate-records.js:22-50` runNegativeFixtures cases.

## Success Criteria

- [x] `recordLocalRoots` values are `{ roots, description }` objects
- [x] `allowedDescriptionFor` function removed from `record-validation-rules.js`
- [x] `validateLocalRef` reads description from config (not via removed helper)
- [x] `dimensionEntries` is one line returning `Object.entries(...).filter(...)`
- [x] `pnpm validate:records` exit 0; record count matches baseline
- [x] `pnpm test` exit 0
- [x] Negative-fixture assertions for `disallowed-local-source` and `capability-source-outside-allowlist` still pass (their expected substrings are unchanged)

## Risk Assessment

- **Risk:** the literal description string in `recordLocalRoots` drifts from the substring asserted in `runNegativeFixtures` cases (e.g. `"records/evidence or knowledge-packs"` and `"records/evidence, knowledge-packs, product/*/capabilities"`).
  - **Mitigation:** copy the description strings verbatim from the existing `allowedDescriptionFor` output. The negative-fixture runner asserts substring match, so exact reproduction is sufficient.
- **Risk:** `dimensionEntries` iteration order causes a negative fixture to emit errors in an order the test doesn't expect.
  - **Mitigation:** `runNegativeFixtures` uses `result.some((error) => error.includes(expected))` — order-agnostic substring match. No risk.
- **Risk:** a Set-member-not-in-Object.entries case (verification has dimension X but X isn't in `verificationDimensions`).
  - **Analysis:** old code iterated `verificationDimensions` and checked `verification[X] !== undefined`. New code iterates `verification` keys and filters by `verificationDimensions.has`. Both yield the same `[dim, config]` pairs for any dim in both the Set and the object — exact intersection. Equivalent.
