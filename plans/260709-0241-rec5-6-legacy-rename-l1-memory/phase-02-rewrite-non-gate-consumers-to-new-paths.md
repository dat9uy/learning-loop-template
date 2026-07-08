---
phase: 2
title: "Rewrite non-gate consumers to new paths"
status: pending
priority: P2
dependencies: [1]
---

# Phase 2: Rewrite non-gate consumers to new paths

## Overview

Rewrite every non-gate consumer path string to the new canonical names via a **repo-wide
scripted `sed`** — the pre-cook enumeration (validation 2026-07-09) found **126 live consumer
files** (324 path refs), so per-file Edits are impractical. The 4 substitution patterns are
path-specific and safe to apply globally (verified by substring analysis — they do not match
`adaptLegacyHandler`, the `legacy-mcp` dir name, or conceptual "legacy" status-history comments).
The 12 coordination wrappers + 2 direct-wire configs are **excluded** here (deferred to the
Phase-3 atomic command); baselines + `file-index.jsonl` are excluded (regenerated/refreshed
in Phase 4); a short manual special-case list handles the rest. After Phase 2 the tree is
intentionally inconsistent — **do not run tests** (the `mcp-tools` namespace would also
vacuous-pass now). Tests run in Phase 6.

## Requirements

- Functional: every non-gate, non-baseline, non-file-index consumer references the new paths.
- Non-functional: edits are path-string-only; conceptual "legacy" untouched; the `adaptLegacyHandler`
  symbol and `__tests__/legacy-mcp/` dir name preserved.

## Architecture

The authoritative edit set is the pre-cook enumeration:
- `reports/pre-cook-consumer-enumeration-126-files-report.md` — method + special cases.
- `reports/consumer-enumeration-full-grep.txt` — 324 lines, `file:line:content` for every live ref.
- `reports/consumer-file-list.txt` — the 126-file list.

A repo-wide `git grep -l | xargs sed -i` with the 4 patterns rewrites all 126 files in one pass.
The sed excludes the 12 wrappers + 2 direct-wire configs (Phase 3 atomic) and the baselines +
`file-index.jsonl` (Phase 4). Writes go through the write-gate, which still resolves
`hooks/legacy/write-gate.js` (unchanged coordination gate) — so write-gate keeps working. No bash
commands depending on the moved dirs are issued.

## Related Code Files

- Modify (via sed): the 126 files in `reports/consumer-file-list.txt`, MINUS the 12 wrappers, 2
  direct-wire configs, 2 baselines, and `file-index.jsonl`.
- Manual: `core/loop-introspect.js:113` (stale `core/legacy/**` removal — sed rewrites the
  `tools/legacy`+`hooks/legacy` parts but leaves `core/legacy/**`).
- Do NOT edit (Phase 3/4): 12 wrappers, `.claude/settings.json`, `.mastracode/hooks.json`,
  `baselines/fallow/*.json`, `file-index.jsonl`.

## Implementation Steps

Path-string substitution map (the 4 sed expressions):

| Old segment | New segment |
|---|---|
| `tools/legacy/` | `tools/handlers/` |
| `hooks/legacy/` | `hooks/universal/` |
| `scout/legacy/` | `scout/pipeline/` |
| `legacy-handler-adapter` | `handler-adapter` (file name + import strings; `adaptLegacyHandler` symbol NOT matched) |

1. **Repo-wide sed over the 126-file set, excluding wrappers + direct-wire configs + baselines + file-index.** The exclusion set (Phase 3/4 handles these):
   ```bash
   git grep -l -E "tools/legacy|hooks/legacy|scout/legacy|legacy-handler-adapter" \
     | grep -v "^plans/" \
     | grep -v "docs/journals/" | grep -v "docs/_archive-260703/" \
     | grep -v "gate-log.jsonl" | grep -v "meta-state.jsonl" \
     | grep -v "plans/260709-0241-rec5-6-legacy-rename" \
     | grep -v "coordination/hooks/" \
     | grep -v "\.claude/settings\.json$" | grep -v "\.mastracode/hooks\.json$" \
     | grep -v "baselines/fallow/" \
     | grep -v "file-index\.jsonl$" \
     | xargs sed -i \
       -e 's#tools/legacy/#tools/handlers/#g' \
       -e 's#hooks/legacy/#hooks/universal/#g' \
       -e 's#scout/legacy/#scout/pipeline/#g' \
       -e 's#legacy-handler-adapter#handler-adapter#g'
   ```
   This rewrites the ~110 non-gate consumers (source, repo-root prompts, `interface/`, docs,
   config, scripts, ~80 `__tests__/legacy-mcp/*.test.js`, phase-e tests, `legacy-cleanup.test.cjs`,
   `manifest.json` comment, `.fallowrc.json`, `run-pnpm-test-namespaced.mjs`, etc.) in one pass.
2. **Manual special case: `core/loop-introspect.js:113`** — the `{core,tools,hooks}/legacy/**`
   glob. The sed rewrote `tools/legacy/`→`tools/handlers/` and `hooks/legacy/`→`hooks/universal/`
   but left the stale `core/legacy/**` segment (core/legacy was flattened — absent on disk). Edit
   manually to `tools/handlers/**` + `hooks/universal/**` + `core/**` (drop `core/legacy/**`).
3. **Verify the sed did not over-reach.** Confirm `adaptLegacyHandler` still appears (symbol
   preserved): `git grep -c adaptLegacyHandler` should be unchanged. Confirm the `legacy-mcp` dir
   name is intact (the patterns don't match it, but verify). Confirm no conceptual "legacy" comment
   was altered — spot-check `core/README.md:94` ("legacy outbound compat") is unchanged.
4. **Spot-check the high-hit-count files** from the enumeration (`health-baseline.json` excluded —
   Phase 4; `interface/contract.js` 10 hits, `.fallowrc.json` 9, `RUNTIME_ONBOARDING.md` 8,
   `legacy-cleanup.test.cjs` 7, `contract.test.js` 7, `docs/architecture.md` 6) — confirm their
   `legacy/` refs are now the new names. (Baselines + file-index excluded here.)
5. **Re-grep to confirm Phase-2 scope is done (excluding wrappers/configs/baselines/file-index).**
   `git grep -n -E "tools/legacy|hooks/legacy|scout/legacy|legacy-handler-adapter" | grep -v ...same exclusions + coordination/hooks + settings.json + hooks.json + baselines + file-index`
   → expect zero hits outside the Phase-3/4 set.

## Success Criteria

- [ ] Repo-wide sed applied to the ~110 non-gate consumers (126 minus 12 wrappers, 2 configs, 2 baselines, file-index).
- [ ] `core/loop-introspect.js:113` stale `core/legacy/**` removed manually.
- [ ] `adaptLegacyHandler` symbol preserved (grep count unchanged); `legacy-mcp` dir name intact.
- [ ] `create-loop-workflow.js:4` repointed (3rd adapter importer — now covered by the sed).
- [ ] `run-pnpm-test-namespaced.mjs:36` repointed (prevents `mcp-tools` vacuous green — covered by sed).
- [ ] Repo-root `CLAUDE.md` + `AGENTS.md` + `interface/RUNTIME_ONBOARDING.md` repointed (covered by sed).
- [ ] **Coordination wrappers + direct-wire configs + baselines + file-index NOT touched** (Phase 3/4).
- [ ] No test run in this phase.

## Risk Assessment

- **Risk:** the sed over-reaches into a conceptual "legacy" mention. **Mitigation:** the 4 patterns
  are path-specific (`tools/legacy/`, `hooks/legacy/`, `scout/legacy/` with trailing slashes; `legacy-handler-adapter`
  as a filename substring). Substring analysis confirms they don't match `adaptLegacyHandler`, `legacy-mcp`,
  or "legacy enum/compat" comments. Step 3 verifies the symbol + dir name + a spot-check comment are intact.
- **Risk:** a file with a runtime-constructed `path.join(...,"legacy")` (no `legacy/` slash) is missed by the sed.
  **Mitigation:** such a literal would be `"legacy"` not `legacy/` — not in the 4 patterns. Phase 4 fallout +
  Phase 6's widened grep catch it; the enumeration's full-grep artifact lets Phase 2 scan for any `"legacy"`
  bare literal separately if needed.
- **Risk:** intermediate inconsistency (consumers point at `tools/handlers/` which doesn't exist yet).
  **Mitigation:** expected; no tests run; no runtime loads these paths between Phase 2 and Phase 3. Direct-wire
  configs stay on `hooks/legacy/` until Phase 3, so a concurrent `.mastracode`/fresh-`.claude` session's gates
  still resolve.