# YAML Parser Library Swap

Date: 2026-05-12

## Summary

We stopped pretending the repo should own YAML grammar. `tools/validate-records/simple-yaml-parser.js` was replaced with `yaml@^2.8.4` across the loader, validators, docs generation, and claim verification paths, then deleted after the regression stayed green.

## Changes

- Added runtime dependency `yaml@^2.8.4` in `package.json` and lockfile.
- Swapped six parser call sites to `import { parse as ... } from "yaml"`.
- Fixed one real record issue the new parser exposed: a plain scalar starting with a backtick needed quoting.
- Updated the invalid plain-scalar negative fixture expectation to match library parse failure instead of the old hand-rolled error text.
- Promoted `decision-20260510T172056Z-yaml-parser-library-swap` to approved and attached the meta evidence for parser friction and AJV deferral.
- Marked the plan phases complete after the regression run confirmed 34 records still parse.

## Validation

- `pnpm validate:records` passes.
- `pnpm check` passes.
- Baseline vs regression validator output diff was empty before scratch artifacts were removed.
- Baseline vs regression parsed record-shape diff was empty.
- Pipe-block-scalar smoke passed, which was the point of the swap and the original failure mode.
- `verify-claim` scalar smoke passed for plain text accepted and YAML-special values rejected.
- Live validated count stayed at 34 records before and after the swap, so this was a parser replacement, not a schema rewrite.

## Review Notes

Code review found a parse-error leak in `verify-claim`: `yaml.parse` could throw upstream wording through `assertWritablePlainString`, which would have made CLI behavior depend on library phrasing. Fixed by catching parser exceptions there and rethrowing project-owned validation errors instead. That was the right call; the alternative was to let dependency text bleed into the CLI and make future failures noisier and less stable.

Impact was narrow but real: authors can now use readable YAML features like block scalars where it helps, while the project still owns record rules, source allowlists, and verification semantics. The cost is one runtime dependency and a little more trust in upstream parsing behavior, which is cheaper than continuing to maintain broken grammar support locally.

Docs impact: none. Operator-facing commands and policy unchanged.

## Resolution

- `plans/260512-1501-yaml-parser-wording-decoupling/` resolves both follow-ups: negative YAML fixtures now match project-owned parse error kinds, and `verify-claim` scalar rules have a committed regression test.
