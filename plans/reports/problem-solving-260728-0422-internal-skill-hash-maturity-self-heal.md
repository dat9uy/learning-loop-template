# Resolution — internal-skill hash + maturity self-heal

Finding: `meta-260725T2311Z-process-gap-editing-a-canonical-internal-skill-tools-learnin`
Status: open · `active-no-signal` · drift=false (verified 2026-07-28)
Report date: 2026-07-28 · Technique: Simplification Cascade (+ Inversion check)

## 1. Problem (confirmed)

`normalizeManifest` (`tools/scripts/skills-lib.mjs:185-236`) splits entries two ways:

- **External** (`EXTERNAL_POLICY`, e.g. `mastra`): hash re-derived from content via `detectExternalHash` (L211-227).
- **Internal** (coordination-gate, learning-loop): the verbatim branch (L229-233) — `next.skills[name] = { ...entry }`. **No hash re-derivation.**

Authoring path `edit canonical → pnpm skills:sync → meta_state_log_change`: `sync-skills` fans the new canonical bytes to the 3 mirrors (good), then calls `normalizeManifest`, which byte-copies the internal entry — leaving `manifest.skills[name].hash` (and `.maturity`) at the pre-edit value. The backstop `skills-manifest.test.js:105` (`manifest.hash === sha256(canonicalSource)`) and `:90` (`manifest.maturity === frontmatter.maturity`) then trip. This is the 68101d1 incident. Current repo state is consistent only because the hash was re-derived by hand afterward (verified: both internals MATCH as of 2026-07-28).

**Maturity has the identical gap.** The finding names only `hash`, but `maturity` is read from the `.claude` mirror frontmatter and compared to `manifest.maturity`. Edit the canonical's maturity frontmatter → mirror updates → `manifest.maturity` stale → drift test trips. Same source (`canonicalSource`), same gap. Scope decision: **fold both in** (user-confirmed).

## 2. Technique — Simplification Cascade

Symptom match: "same thing implemented two ways, one a special case that broke." Unifying insight:

> The manifest fields that are *projections of the canonical content* (hash, maturity) are re-derived from the entry's authoritative source on every normalize. Internal → `canonicalSource` (deterministic, git-tracked). External → detected surface (mtime heuristic). **One rule, two source-resolvers; the verbatim-copy special case is deleted.**

If true, the "internal entries preserved byte-identical" contract is the special case to remove — it was never a safety property, it was the gap fossilized as a test.

### Inversion check (is "internal frozen" a deliberate safety property?)

Flip: *should internal hash/maturity stay frozen across canonical edits?* No. `hash` is *defined* as `sha256(canonicalSource)` (backstop test L105) and `maturity` as the canonical's frontmatter (L90). `canonicalSource` is git-tracked and authoritative. Re-deriving does not weaken a trust anchor — unlike the external case where `sync-skills.mjs:266-277` flags the fingerprint-vs-gate trade-off. For internals the canonical file *is* the anchor; the manifest fields are its fingerprint. Staleness is a pure bug, not a constraint. Inversion reveals no blocker.

## 3. Recommended fix — extend `normalizeManifest`

Replace the verbatim branch (`skills-lib.mjs:229-233`) with a re-derive branch. `readFileSync` is already imported (L9). Maturity parsing is DRY'd via a new exported `matchMaturityFrontmatter(content)` in `skills-lib.mjs` (see §11); both the normalizer and the backstop test's `readFrontmatterMaturity` consume it, removing the regex-duplication risk.

```js
// after the external-policy loop, replace L229-233:
const restoredInternals = [];
for (const [name, entry] of Object.entries(parsed.skills)) {
  if (name in next.skills) continue;            // policy-external, already handled
  if (entry.external === true) {               // unknown external: verbatim (surgical)
    next.skills[name] = { ...entry };
    continue;
  }
  // internal: re-derive hash + maturity from canonicalSource (self-heal).
  if (!entry.canonicalSource) {                // schema says internals always have it;
    next.skills[name] = { ...entry };          // defensive: can't re-derive → verbatim
    continue;
  }
  const canonAbs = join(repoRoot, entry.canonicalSource);
  if (!existsSync(canonAbs)) {
    return { manifest: parsed, changed: false, error: `normalize ${name}: canonicalSource missing at ${entry.canonicalSource}` };
  }
  const canon = readFileSync(canonAbs, "utf8");
  const nextHash = sha256(canon);
  const nextMaturity = matchMaturityFrontmatter(canon) ?? entry.maturity;  // absent → keep stored
  const rederived = { ...entry, hash: nextHash, maturity: nextMaturity };
  next.skills[name] = rederived;
  if (!entryEqual(parsed.skills[name], rederived)) {
    changed = true;
    restoredInternals.push(name);
  }
}
return { manifest: next, changed, restoredExternals, restoredInternals };
```

**Why here, not `sync-skills.mjs` alone:** `normalizeManifest` is the self-heal fn, shared by `sync-skills` *and* `normalize-skills` — fix lands once, both surfaces benefit. It stays pure (parsed + repoRoot → result). Internal re-derivation is *simpler* than the external path (deterministic, no mtime heuristic) — the cascade collapses the harder case into the easier.

### Edge cases

| Case | Behavior |
|---|---|
| canonical missing | fail-closed (error returned) — matches external posture |
| internal w/o `canonicalSource` | verbatim (defensive; schema requires it, so shouldn't happen) |
| maturity frontmatter absent in canonical | keep stored `entry.maturity` (don't null) |
| unknown external (not in policy) | verbatim, unchanged (surgical-replace preserved) |
| re-run on consistent manifest | `entryEqual` true → `changed=false` → no write, no mtime bump (idempotent) |

## 4. Contract change — the test that encodes the gap

`normalize-skills.test.js:230` "internal entries preserved byte-identical (coordination-gate + learning-loop untouched)" **encodes the gap as a contract.** The fixture (`buildClobberedFixture` L54-56, L101-112) builds internals already-consistent (canonical content = manifest hash/maturity), so the re-derive yields identical values and this test still passes *structurally* — but its name/intent would mask the self-heal. Per dev-rules ("preserve public contracts unless the change intentionally updates them and the user accepted that scope"), this is an intentional contract update:

- **Rescope** `:230` → "internal entries re-derived from canonical; unchanged when canonical matches manifest" (keep the consistent-fixture assertion — it now proves idempotence on the internal path, not preservation).
- **Add** a new **unit** test in `normalize-skills.test.js`: "internal self-heal: drifted canonical → manifest hash + maturity re-derived, `changed=true`, `restoredInternals=[name]`". Fixture variant where canonical content/maturity diverges from the manifest's stored values; assert post-normalize matches the canonical, not the stale stored values.
- **Add** a new **CLI** test in `sync-skills.test.js` exercising the full documented authoring path end-to-end: mutate canonical (content + maturity) → run `sync-skills.mjs <fixture-root>` → assert `skills-lock.json` `hash` + `maturity` now equal `sha256(canonicalSource)` / canonical frontmatter, and `restoredInternals` appears in stdout. This locks the operator-facing path the finding describes, not just the unit contract.
- **Add** "restoredInternals enumerated in result" assertion (item 2 below).

No other test asserts internal-preservation (grep confirms: `skills-mirror-parity.test.js` byte-identity is *cross-surface mirror* parity — unaffected; `sync-skills.test.js` byte-identity is fan-out propagation — unaffected).

## 5. Item 2 — enumerate restored internals

Mirror `restoredExternals` (already returned + logged at `sync-skills.mjs:285`). `normalizeManifest` returns `restoredInternals: string[]`. Log lines:

`sync-skills.mjs` (extend the existing normalized line, L285-287):
```js
const ri = norm.restoredInternals ?? [];
console.log(
  `[sync-skills] normalized skills-lock.json` +
  ` (restored ${(norm.restoredExternals ?? []).length} external: ${(norm.restoredExternals ?? []).join(", ") || "—"};` +
  ` re-derived ${ri.length} internal: ${ri.join(", ") || "—"})`,
);
```

`normalize-skills.mjs` (parallel line, L106-108):
```js
const ri = result.restoredInternals ?? [];
console.log(
  `[normalize-skills] normalized skills-lock.json` +
  ` (restored ${(result.restoredExternals ?? []).length} external: ${(result.restoredExternals ?? []).join(", ") || "—"};` +
  ` re-derived ${ri.length} internal: ${ri.join(", ") || "—"})`,
);
```

Operators see exactly which internal skills self-healed each run — useful for audit, matches the external precedent.

## 6. Item 3 — trust-anchor change-log

The external re-derive already shifted hash from "independent gate" to "content fingerprint" (`sync-skills.mjs:266-277`, change-log `meta-260720T1909Z`). Internals were *never* an independent gate (canonical is the anchor), so the internal shift is consistent — but the maturity re-derivation is a new formalization (manifest.maturity is now auto-maintained, not hand-maintained). Recommend a `meta_state_log_change` entry recording:

- change_dimension: `process` · change_target: `skills-lock.json internal entry maintenance`
- change_diff: `normalizeManifest re-derives internal hash + maturity from canonicalSource (was: byte-copied verbatim, leaving stale on canonical edit)`
- reason: closes `meta-260725T2311Z-process-gap-...`; aligns internal path with external self-heal; `pnpm skills:sync` now fully maintains the manifest for the documented authoring path.

Cite this change-log id in the finding's `source_refs` when resolving.

## 7. Write-gate note (not a blocker)

`skills-lock.json` is hook-gated for Claude Edit/Write (`skills-manifest.test.js:157` "trust anchor"). The incident was fixed "via the gated write path" (preflight marker). After the fix, `pnpm skills:sync` writes via fs directly — **bypassing the hook gate**, exactly as the external normalize write-back already does (`sync-skills.mjs:283`). This is intended: `pnpm skills:sync` is the blessed operator channel; the gate exists to block *ad-hoc* edits, not the CLI. No new gate concern — consistent with today's external behavior.

## 8. Acceptance criteria

1. Mutate a canonical `SKILL.md` (content + maturity) → `pnpm skills:sync` → `skills-lock.json` `hash` + `maturity` now equal `sha256(canonicalSource)` / canonical frontmatter. No manual re-derive.
2. New test: drifted-canonical fixture → `normalizeManifest` returns `changed=true`, `restoredInternals=[name]`, re-derived fields match canonical.
3. Rescoped `:230` test: consistent fixture → internal entries structurally equal pre/post (idempotence on internal path).
4. Existing idempotence test (`:163`) stays green (consistent fixture → `changed=false`, no mtime bump).
5. Existing backstop tests `skills-manifest.test.js:90,105` stay green — now confirmations, not tripwires.
6. `restoredInternals` enumerated in both CLI log lines.
7. Change-log entry recorded (item 3); finding resolved with `source_refs` citing it.

## 9. Alternatives rejected

- **B. Re-hash in `sync-skills.mjs` only, keep `normalizeManifest` external-only.** Keeps the "surgical externals" contract literal, but duplicates re-derive logic and skips `normalize-skills` callers. Less DRY, partial coverage. Reject.
- **C. Drop stored `hash` for internals** (always `sha256(canonicalSource)` → redundant). Deepest simplification, but breaks the unified-schema invariant (`hash` required for all entries, `:69`), external/internal shape symmetry, and write-gate "trust anchor" framing. Blast radius exceeds the gap. Reject for now.
- **D. Process-only fix — document the manual re-hash step.** Status quo that already produced the 68101d1 incident. Process docs don't catch code-reachable gaps. Reject.

## 10. Decisions resolved

1. **Scope expansion acknowledgment → patch the finding.** Use `meta_state_patch` to extend the finding description to include `maturity` (same root cause, same fix — no separate `reopens`-linked finding). Patch *before* resolving so the resolution `source_refs` cite a finding whose description matches what was actually fixed.
2. **Test placement → both unit + CLI.** Unit test in `normalize-skills.test.js` locks the normalize contract; CLI test in `sync-skills.test.js` locks the documented authoring path end-to-end (the surface the finding describes). See §4.
3. **Maturity parsing → export a shared helper.** Add `matchMaturityFrontmatter(content)` to `skills-lib.mjs`; the normalizer and the backstop test's `readFrontmatterMaturity` both consume it. See §11.

## 11. Shared maturity helper (DRY)

`skills-manifest.test.js:37-42` currently inlines the maturity regex inside a path-reading helper. To avoid the regex drifting between the backstop test and the new normalizer re-derive, export the content-matching primitive from `skills-lib.mjs` and have the test import it.

`skills-lib.mjs` (new export):
```js
/**
 * Match the maturity frontmatter value in SKILL.md content.
 * Shared by normalizeManifest (internal re-derive) and the backstop
 * drift test so the regex cannot drift between the two call sites.
 * @param {string} content
 * @returns {string|null} "state-1" | "state-2" | "state-3" | null
 */
export function matchMaturityFrontmatter(content) {
  const m = content.match(/^maturity:\s*(state-1|state-2|state-3)\s*$/m);
  return m ? m[1] : null;
}
```

`skills-manifest.test.js:37-42` (refactor to consume it):
```js
import { matchMaturityFrontmatter } from "../../../../scripts/skills-lib.mjs";
function readFrontmatterMaturity(skillPath) {
  if (!existsSync(skillPath)) return null;
  return matchMaturityFrontmatter(readFileSync(skillPath, "utf8"));
}
```

Net: one regex, two consumers, zero drift surface.