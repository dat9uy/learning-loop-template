# 2026-06-27 — Phase E Dead-Code Sweep

**What shipped:** 6 file deletions (3 source + 3 test), `.fallowrc.json` config, fallow audit wired into CI, 4 regression baselines committed, admission rule documented in `core/README.md`.

**Why it matters:** `core/` no longer carries legacy migration residue. Mechanism A (placement manifest) prevents new accumulation; the CI guard prevents re-accumulation. The admission rule is now machine-enforced, not operator-history-only.

**Files deleted:**
- `core/list-probes.js` + `__tests__/legacy-mcp/list-probes.test.js` (3 tests)
- `core/lib/source-ref-validator.js` + `core/lib/source-ref-validator.test.js` (24 tests)
- `core/record-validation-rules.js` + `core/record-validation-rules.test.js` (3 tests)

**Test delta:** 1338 → 1308 (−30 tests). All core globs green. 4 pre-existing MCP server failures (unrelated to deletions).

**Lessons:**
- The manifest path "bug" (manifest.json referencing `tools/X-tool.js` vs. files living in `tools/legacy/`) was a loader convention at `mastra/server.js:26-27`, not a bug. A comment fixes the confusion — but JSONC comments break `JSON.parse()`, requiring a comment-strip shim in 4 files.
- Fallow's `dynamicallyLoaded` config is the right tool for JSON-manifest-driven dynamic imports; `entry` is for static imports. Hooks and interface files also need `dynamicallyLoaded` (loaded by external systems at runtime).
- `fallow audit --gate new-only` is better than `fallow dead-code --ci` for PR guards: severity-aware + introduced-vs-inherited attribution.
- The static auditor missed `record-validation-rules.js` as dead code — its only consumer was `source-ref-validator.js` which was itself dead. Fallow's graph analysis caught this transitive dead chain.

**Followups:**
- 25 unused exports in `core/` remain at warn-level (advisory). These are exports in live files — not dead code, just unused public API surface.
- Pre-existing MCP server test failures (4 globs) need separate investigation — `loop_describe` cache/tier issues and `discoverability_hints` assertions.
