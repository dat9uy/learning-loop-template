# MCP read opt-out implementation report

## Result

The `.claude` runtime now routes the seven loop read tools through `bin/loop.mjs` while retaining MCP for writes. The other two runtimes remain on the full MCP surface.

## Verification

- MCP registration: default `33` tools; opted `26`; exclusions are exactly `CLI_READ_TOOLS`; write tools and `mastra_update_r2_allowlist` remain registered.
- Read parity: all seven CLI results normalized deep-equal to their MCP responses with a field-set guard.
- SessionStart: opted normal and fatal/degraded outputs include the CLI transport banner; the non-opted helper path is byte-identical to the pre-change output.
- Wiring: `.mcp.json` alone carries `LOOP_READS_VIA_CLI=1`; `.factory/mcp.json` and `.mastracode/mcp.json` are unchanged.
- Live CLI smoke: `LOOP_SURFACE=.claude node tools/learning-loop-mastra/bin/loop.mjs loop_describe '{"tier":"summary"}'` returned a real non-degraded summary (`tool_count: 32`, `record_type_count: 2`, `rule_count: 12`).
- Full suite: `2375` tests across `479` suites; `2374` passed, `1` pending, `0` failed.
- Code review: `9.5/10`; `0` critical, high, or medium findings; all eight acceptance criteria pass.
- Diff hygiene: `git diff --check` clean.

## Runtime-agnostic audit

- `core/cli-tools.js`: 6/6 pass.
- `bin/loop.mjs`: 6/6 pass.
- The adapter files (`mastra/server.js` and the Claude-only SessionStart hook) reproduce the exact same checklist failures on `HEAD`: the checker rejects the pre-existing Mastra adapter location and Claude-specific hook protocol/path shape. Independent diagnosis found no new runtime-agnostic regression and recommended against gaming the checklist. The new shared mechanism is in `core/cli-tools.js`; the server and hook remain thin adapters.

## T2 read-path evidence protocol

### Collect

During normal `.claude` dogfood sessions, note:

- attempts to call an absent `mastra_<read>` tool before switching to CLI;
- malformed CLI JSON arguments or stdout parsing failures;
- confusion between exit 1 (handler error) and exit 2 (usage/configuration);
- missing or insufficient SessionStart routing guidance.

### Record

- File a `loop-anti-pattern` finding when the same ergonomics failure recurs.
- Record a positive change-log note after multiple clean sessions using CLI reads without redirection or parse recovery.

### Closure gate for W

The write-capable CLI plan remains blocked on evidence, not on this implementation's completion. Greenlight W only after `.claude` demonstrates reliable CLI reads without chronic routing or argument-shape friction and the operator confirms W's tool boundary.

## W preparation

The self-footgun lock proves a promoted gate regex can currently intercept `node .../bin/loop.mjs`; W must add a promotion-path self-match guard or keep `meta_state_promote_rule` MCP-only. The complete recommendations are in `plans/reports/w-design-decisions-260722-1119-write-cli-prep.md`. `--schema` and write-capable CLI behavior remain deferred to W.
