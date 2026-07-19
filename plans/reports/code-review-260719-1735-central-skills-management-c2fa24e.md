# Code Review — c2fa24e "feat(skills): canonical source + manifest-driven exclusion"

- **Target:** plans/260719-1428-central-skills-management/ Phase 2 + Phase 3 @ `c2fa24ed1f435648cc47296046e79493fe7db065` (base `9216b2a`)
- **Date:** 2026-07-19 · **Mode:** commit review (Stage 1 spec-compliance + Stage 2 code-quality subagent)
- **Verdict:** **CHANGES REQUESTED** — 2 Critical findings block the commit's headline F5 claim. Core implementation logic is sound; the defects are in tests and the trust-anchor read.

## Verification evidence (fresh, this session)

| Check | Result |
|---|---|
| Full suite `pnpm test:iter` | ✅ 2256 tests / 451 suites green |
| `sync-skills.test.js` / parity / contract / manifest | ✅ 10 / 6 / 64 / 14 green |
| `contract.js claude-code \| droid \| mastra-code` | ✅ all exit 0; mastra excluded on all surfaces |
| `pnpm skills:sync` ×2 | ✅ idempotent (no working-tree diff) |
| Canonical vs 3 mirrors sha256 (both internal skills) | ✅ byte-identical; matches `skills-lock.json` hashes |
| `check_runtime_agnostic(sync-skills.mjs)` | ✅ 6/6 |
| `pnpm fallow:gate` | exit 0 (1 warn: unused-export on `writeToAllSkills`, consumer outside fallow root) |
| Q4 deferral state | `.agents/skills/mastra` + symlinks retained; F11/F12 gate closed (requires per-runtime `sha256:` hashes, absent in placeholder ledger event) |

## Stage 1 spec compliance: PASS (with minors)

All load-bearing Phase 2/3 requirements present: canonical source, materializer via `writeToAllSkills`, narrow gates (`skills-canonical`, `skills-manifest`; `BOUND_ARTIFACTS` untouched), F15 pid-tmp+finally fix, manifest-driven exclusion w/ F8/F9 explicit failure modes + tests, F2 fixture update, F10 load-bearing parity replacement, F4 manifest gating, no module-level cache, Q4 ledger-event deferral. Decision 4 (no new MCP tool), Decision 3 (real files), Decision 5 (no tools/**-wide gate) all honored.

Minor spec gaps: no automated sentinel fan-out test (phase-02 step 2) or self-heal test (step 13); F15 tests are source-regex greps not behavioral rename-failure simulations; gate tests assert `["ok","block"].includes(decision)` (vacuous) with no `hooks/**` negative and no marker-allowed positive.

## Stage 2 findings

### Critical

**C1 — The F5 partial-fan-out test is vacuous; the commit's headline safety claim is unproven.**
`tools/scripts/sync-skills.mjs:33` resolves `repoRoot` from `import.meta.url`; `process.cwd()` appears nowhere in the file. The test (`sync-skills.test.js:181`) runs the materializer with `cwd: <tmp fixture>` — ignored. The real-repo run exits 0, `assert.fail` (L183) throws, and the catch (L186-193) passes because `err.message` ("…read-only .mastracode") matches its own `/\.mastracode|divergent|failed/i` regex. The test passes whether the materializer succeeds OR fails. The chmod-0o555 fixture is dead code. Net: zero behavioral coverage of the exit-1-on-partial-fan-out path that the commit message cites as closing red-team F5.
**Fix:** add a root-override seam (argv/`SYNC_SKILLS_ROOT`) to sync-skills.mjs; run the test against the fixture; assert `code === 1` + stderr naming the divergent surface.

**C2 — Tests execute the real materializer against the live working tree.**
`sync-skills.test.js:83-86` (idempotence) and L181 run `sync-skills.mjs` against the real repo. Given C1 there is no fixture isolation at all. An uncommitted in-progress gated edit to any mirror (`.claude/skills/**`) is silently overwritten by `pnpm test` — `writeToAllSurfacesSection` renames over the target unconditionally.
**Fix:** same root-override seam; never fan out to the real repo from a test.

### Important

**I1 — Manifest lookup walks the prototype chain and crashes on null entries (trust-anchor read).**
`contract.js:247` + fallback L326: `manifest.skills?.[entry.name]`. A skill dir named `constructor`/`toString` resolves via `Object.prototype` → treated as manifest-declared internal, defeating F9. A manifest entry of `{"skills":{"x":null}}` passes the `undefined` check, then `null.external` throws `TypeError` — the validator crashes instead of failing with a contract reason.
**Fix:** `Object.prototype.hasOwnProperty.call(manifest.skills, name)` + null/typeof guard → `skill-not-in-manifest`.

**I2 — Symlink-shaped planted skills evade the F9 failure mode; the comment overclaims.**
`contract.js:238`: `Dirent.isDirectory()` is false for symlink-to-dir → silently skipped regardless of manifest. The L222-224 comment ("a planted skill the manifest doesn't know about is a contract violation") is false for the symlink shape — which is also the legitimate external-mastra shape today. Behavior parity with the old `isSymbolicLink()` skip (not a regression), but the F9 defense claim does not hold for symlinks.
**Fix:** detect `entry.isSymbolicLink()` explicitly and record excluded (or failed, if not in manifest) entries; or narrow the comment.

### Minor

- **M1** — sync-skills fails open on malformed `manifest.skills`: `sync-skills.mjs:105` — `Object.entries("string")` yields index-keyed garbage, all skipped, exit 0. Contract.js fails closed on the same input. Add a shape check → exit 2.
- **M2** — F11/F12 gate regex scans all of `runtime-state.jsonl`: `skills-manifest.test.js:189-193` — any future line with a `claude|factory|mastracode`-named key holding a `sha256:` activates the tests prematurely. Parse lines; scope to the event's own metadata.
- **M3** — `skills-canonical` block reason contradicts design: `evaluate-write-gate.js:125` claims "the materializer is the only write path" while L162-166 deliberately allows direct canonical writes post-preflight (validation Q1: detection-only). Reword.
- **M4 (Stage 1)** — `runtime-state.jsonl` ledger-event `npx-skills-mastra-roundtrip-2026-07-19` metadata is malformed: `pending_execution` is 7-deep nested arrays containing a literal `</item>` string (MCP wire-coercion artifact). Fingerprint covers the corrupt payload. Mechanism still works (no code consumer of that field), but the Q4 trust anchor is dirty and append-only — supersede with a corrected ledger-event; worth a `meta_state_report` on the `runtime_state_record` wire path.
- **M5 (Stage 1)** — `manifestExcluded` field set but never consumed (`contract.js`); `evaluateSkillsPreflight` reports `matched_rule` = mirror globs when blocking canonical/manifest paths; materializer rewrites content-equal files every run (mtime bump; phase-02 said "0 bytes second run"); commit message misattributes the mastra manifest entry + F11/F12 tests to this commit (both landed in `9216b2a`).

## Verified non-issues (checked, no action)

- Glob anchoring: `skills-lock.json` rule is root-anchored; nested `x/skills-lock.json` does not match; `normalize()` collapses `..` tricks. No rule shadowing; `BOUND_ARTIFACTS` order/contents untouched.
- surfaces.js F15 fix is backward-compatible; 11 importers + full suite green.
- Contract fails closed on non-object `manifest.skills` (string/array → `skill-not-in-manifest` on all entries).
- F14 atomicity: contract change landed while mastra is still symlink+`external:true` — exclusion holds for both shapes; intermediate state safe (verified ×3 runtimes).
- F11/F12 correctly dormant today; placeholder ledger event cannot open the gate (hash regex requires per-runtime hashes).

## Recommended fix order

1. C1+C2 together: root-override seam in `sync-skills.mjs`, rewire both tests to the fixture (one commit).
2. I1: hasOwnProperty + null guard in both lookup sites (`contract.js:247,326`).
3. I2/M3: comment/reason corrections + explicit symlink handling decision.
4. M1/M2: input-shape guards.
5. M4: append corrected ledger-event + file meta_state_report on the wire-coercion bug.

## Unresolved questions

- Should the planted-symlink shape fail (`skill-not-in-manifest`) or be recorded as excluded-external? Needs operator decision (affects how `.agents`-era symlinks are treated if one reappears).
