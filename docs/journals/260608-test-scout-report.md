# Test Codebase Scout Report

Generated: 2026-06-08T10:43:58.315Z
Project root: /home/datguy/codingProjects/learning-loop-template
Scout version: 0.1.0

## Deliverable 1: Test Inventory

| File | Last mod | Tests | Bucket | Dangling | Gap |
|------|----------|-------|--------|----------|-----|
| `.claude/coordination/__tests__/artifact-aware-gate.test.cjs` | 2026-06-08T05:46:50.124Z | 16 | C | false | false |
| `.claude/coordination/__tests__/bash-coordination-gate.test.cjs` | 2026-06-08T05:46:50.124Z | 0 | C | false | false |
| `.claude/coordination/__tests__/claude-code-mcp-loading.test.cjs` | 2026-06-08T05:46:50.124Z | 3 | C | false | false |
| `.claude/coordination/__tests__/gate-integration.test.cjs` | 2026-06-08T05:46:50.124Z | 0 | C | false | false |
| `.claude/coordination/__tests__/inbound-state-gate.test.cjs` | 2026-06-08T05:46:50.124Z | 0 | C | false | false |
| `.claude/coordination/__tests__/preflight-gate.test.cjs` | 2026-06-08T05:46:50.124Z | 14 | C | false | false |
| `.claude/coordination/__tests__/write-coordination-gate-minimal.test.cjs` | 2026-06-08T05:46:50.124Z | 15 | C | false | false |
| `.claude/coordination/__tests__/write-gate-index-capabilities.test.cjs` | 2026-06-08T05:46:50.124Z | 6 | A | false | false |
| `.factory/hooks/__tests__/loop-surface-inject-format-block.test.cjs` | 2026-06-06T06:44:13.537Z | 3 | A | false | false |
| `.factory/hooks/__tests__/loop-surface-inject-mcp-failure.test.cjs` | 2026-06-06T05:05:21.434Z | 3 | A | false | false |
| `.factory/hooks/__tests__/loop-surface-inject-real-spawn.test.cjs` | 2026-06-06T05:05:21.434Z | 1 | A | false | false |
| `.factory/hooks/__tests__/loop-surface-inject.test.cjs` | 2026-06-06T05:05:21.434Z | 6 | A | false | false |
| `node_modules/fast-uri/test/ajv.test.js` | 2026-06-06T05:11:33.428Z | 1 | A | false | false |
| `node_modules/fast-uri/test/equal.test.js` | 2026-06-06T05:11:33.444Z | 8 | A | false | false |
| `node_modules/fast-uri/test/parse.test.js` | 2026-06-06T05:11:33.464Z | 1 | A | false | false |
| `node_modules/fast-uri/test/resolve.test.js` | 2026-06-06T05:11:33.468Z | 3 | A | false | false |
| `node_modules/fast-uri/test/rfc-3986.test.js` | 2026-06-06T05:11:33.476Z | 1 | A | false | false |
| `node_modules/fast-uri/test/security-normalization.test.js` | 2026-06-06T05:11:33.480Z | 3 | A | false | false |
| `node_modules/fast-uri/test/security.test.js` | 2026-06-06T05:11:33.484Z | 9 | A | false | false |
| `node_modules/fast-uri/test/serialize.test.js` | 2026-06-06T05:11:33.484Z | 5 | A | false | false |
| `node_modules/fast-uri/test/uri-js-compatibility.test.js` | 2026-06-06T05:11:33.488Z | 2 | A | false | false |
| `node_modules/fast-uri/test/uri-js.test.js` | 2026-06-06T05:11:33.492Z | 35 | A | false | false |
| `node_modules/fast-uri/test/util.test.js` | 2026-06-06T05:11:33.492Z | 2 | A | false | false |
| `node_modules/json-schema-traverse/spec/index.spec.js` | 2026-06-06T05:11:33.428Z | 10 | A | false | false |
| `product/web/tests/smoke-reference.test.mjs` | 2026-06-06T05:05:21.470Z | 4 | A | true | false |
| `tools/check-budget/check-budget-function.test.js` | 2026-06-06T05:05:21.478Z | 7 | A | true | false |
| `tools/check-budget/check-budget.test.js` | 2026-06-06T05:05:21.478Z | 7 | A | false | false |
| `tools/learning-loop-mcp/__tests__/acceptance/sp3-drift.test.js` | 2026-06-07T07:23:01.144Z | 4 | C | true | false |
| `tools/learning-loop-mcp/__tests__/backfill-mechanism-check.test.js` | 2026-06-07T00:51:23.853Z | 4 | C | true | false |
| `tools/learning-loop-mcp/__tests__/bridge-1-e2e.test.js` | 2026-06-06T05:05:21.482Z | 1 | A | true | false |
| `tools/learning-loop-mcp/__tests__/bridge-2-unit.test.js` | 2026-06-06T05:05:21.482Z | 12 | A | true | false |
| `tools/learning-loop-mcp/__tests__/budget-option-c-e2e.test.js` | 2026-06-06T05:05:21.482Z | 7 | C | false | false |
| `tools/learning-loop-mcp/__tests__/build-inverse-indexes.test.js` | 2026-06-07T00:07:17.463Z | 3 | C | true | false |
| `tools/learning-loop-mcp/__tests__/candidate-block.test.js` | 2026-06-06T05:05:21.482Z | 8 | A | true | false |
| `tools/learning-loop-mcp/__tests__/check-grounding.test.js` | 2026-06-07T05:03:31.120Z | 30 | A | false | false |
| `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` | 2026-06-08T08:34:46.903Z | 5 | D | false | false |
| `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js` | 2026-06-08T02:17:35.789Z | 1 | C | true | false |
| `tools/learning-loop-mcp/__tests__/create-decision-record-tool.test.js` | 2026-06-06T06:37:34.767Z | 2 | A | false | false |
| `tools/learning-loop-mcp/__tests__/cross-surface.test.js` | 2026-06-06T05:05:21.482Z | 0 | A | false | false |
| `tools/learning-loop-mcp/__tests__/derive-status.test.js` | 2026-06-07T07:21:58.370Z | 25 | A | false | false |
| `tools/learning-loop-mcp/__tests__/experiment-update-verification-assertion-refs.test.js` | 2026-06-06T05:05:21.482Z | 1 | A | true | false |
| `tools/learning-loop-mcp/__tests__/extract-index.test.js` | 2026-06-06T05:05:21.482Z | 24 | B | true | false |
| `tools/learning-loop-mcp/__tests__/fastapi-adapter.test.js` | 2026-06-06T05:05:21.482Z | 5 | A | true | false |
| `tools/learning-loop-mcp/__tests__/field-coverage.test.js` | 2026-06-06T05:05:21.482Z | 8 | A | true | false |
| `tools/learning-loop-mcp/__tests__/findings-parser.test.js` | 2026-06-06T05:05:21.482Z | 13 | A | true | false |
| `tools/learning-loop-mcp/__tests__/fix-loop-design-refs.test.js` | 2026-06-07T00:50:21.628Z | 3 | C | true | false |
| `tools/learning-loop-mcp/__tests__/flatten-evidence-fields.test.js` | 2026-06-07T04:06:23.506Z | 3 | C | true | false |
| `tools/learning-loop-mcp/__tests__/frontmatter-splitter.test.js` | 2026-06-06T05:05:21.482Z | 6 | A | true | false |
| `tools/learning-loop-mcp/__tests__/g8-subcommand-class-entry.test.js` | 2026-06-06T05:05:21.482Z | 1 | A | true | false |
| `tools/learning-loop-mcp/__tests__/gate-logic-budget.test.js` | 2026-06-06T05:05:21.482Z | 0 | A | false | false |
| `tools/learning-loop-mcp/__tests__/gate-logic-no-budget.test.js` | 2026-06-06T05:05:21.482Z | 0 | A | false | false |
| `tools/learning-loop-mcp/__tests__/gate-logic-quoted-strings.test.js` | 2026-06-06T05:05:21.482Z | 0 | A | false | false |
| `tools/learning-loop-mcp/__tests__/gate-promoted-rules.test.js` | 2026-06-06T05:05:21.482Z | 50 | A | false | false |
| `tools/learning-loop-mcp/__tests__/gate-resolution-evidence.test.js` | 2026-06-07T08:12:45.723Z | 17 | C | false | false |
| `tools/learning-loop-mcp/__tests__/gate-scope-predicate.test.js` | 2026-06-07T04:23:39.083Z | 13 | C | true | false |
| `tools/learning-loop-mcp/__tests__/generate-capabilities.test.js` | 2026-06-06T05:05:21.482Z | 3 | A | true | false |
| `tools/learning-loop-mcp/__tests__/index-query-filter.test.js` | 2026-06-06T05:05:21.482Z | 6 | A | true | false |
| `tools/learning-loop-mcp/__tests__/integration-promoted-rule.test.js` | 2026-06-06T13:55:27.281Z | 9 | C | true | false |
| `tools/learning-loop-mcp/__tests__/list-probes.test.js` | 2026-06-06T05:05:21.482Z | 3 | A | true | false |
| `tools/learning-loop-mcp/__tests__/list-verified.test.js` | 2026-06-06T05:05:21.482Z | 7 | A | true | false |
| `tools/learning-loop-mcp/__tests__/loop-describe-cold-tier-superseded.test.js` | 2026-06-07T04:24:15.021Z | 4 | C | false | false |
| `tools/learning-loop-mcp/__tests__/loop-describe-description-mode.test.js` | 2026-06-07T07:42:38.720Z | 5 | A | true | false |
| `tools/learning-loop-mcp/__tests__/loop-describe-rule-and-loop-design.test.js` | 2026-06-06T13:45:33.152Z | 4 | C | false | false |
| `tools/learning-loop-mcp/__tests__/loop-describe-warm-tier.test.js` | 2026-06-06T13:42:47.200Z | 5 | A | false | false |
| `tools/learning-loop-mcp/__tests__/loop-describe.test.js` | 2026-06-06T13:42:28.767Z | 23 | C | false | false |
| `tools/learning-loop-mcp/__tests__/mcp-lifecycle-integration.test.js` | 2026-06-06T07:31:44.280Z | 4 | A | true | false |
| `tools/learning-loop-mcp/__tests__/meta-state-check-grounding-tool.test.js` | 2026-06-06T05:05:21.482Z | 8 | A | false | false |
| `tools/learning-loop-mcp/__tests__/meta-state-derive-status-tool.test.js` | 2026-06-07T07:22:07.570Z | 10 | A | false | false |
| `tools/learning-loop-mcp/__tests__/meta-state-evidence-coverage.test.js` | 2026-06-07T04:03:08.258Z | 3 | C | true | false |
| `tools/learning-loop-mcp/__tests__/meta-state-integration.test.js` | 2026-06-06T05:05:21.482Z | 5 | C | false | false |
| `tools/learning-loop-mcp/__tests__/meta-state-list-compact.test.js` | 2026-06-08T01:54:04.789Z | 5 | A | true | false |
| `tools/learning-loop-mcp/__tests__/meta-state-list-entry-kind-extended.test.js` | 2026-06-06T13:35:04.940Z | 5 | C | false | false |
| `tools/learning-loop-mcp/__tests__/meta-state-list-entry-kind.test.js` | 2026-06-06T05:05:21.482Z | 4 | C | false | false |
| `tools/learning-loop-mcp/__tests__/meta-state-log-change.test.js` | 2026-06-07T04:34:53.680Z | 9 | C | true | false |
| `tools/learning-loop-mcp/__tests__/meta-state-loop-design-schema.test.js` | 2026-06-06T13:24:21.670Z | 7 | A | false | false |
| `tools/learning-loop-mcp/__tests__/meta-state-patch-tool.test.js` | 2026-06-08T05:51:47.552Z | 7 | C | false | false |
| `tools/learning-loop-mcp/__tests__/meta-state-promote-rule-rule-entry.test.js` | 2026-06-06T13:32:22.446Z | 3 | C | true | false |
| `tools/learning-loop-mcp/__tests__/meta-state-propose-design-tool.test.js` | 2026-06-06T13:41:21.450Z | 5 | C | true | false |
| `tools/learning-loop-mcp/__tests__/meta-state-query-drift-tool.test.js` | 2026-06-06T05:05:21.482Z | 24 | A | false | false |
| `tools/learning-loop-mcp/__tests__/meta-state-refresh-fingerprint-tool.test.js` | 2026-06-06T05:05:21.482Z | 2 | A | false | false |
| `tools/learning-loop-mcp/__tests__/meta-state-relationships.test.js` | 2026-06-07T00:07:48.731Z | 4 | A | true | false |
| `tools/learning-loop-mcp/__tests__/meta-state-report-description.test.js` | 2026-06-06T06:37:49.248Z | 3 | A | false | false |
| `tools/learning-loop-mcp/__tests__/meta-state-report-tool-extension.test.js` | 2026-06-07T04:34:24.208Z | 3 | A | false | false |
| `tools/learning-loop-mcp/__tests__/meta-state-resolve-tool.test.js` | 2026-06-06T05:05:21.482Z | 3 | A | false | false |
| `tools/learning-loop-mcp/__tests__/meta-state-rule-schema.test.js` | 2026-06-06T13:23:59.857Z | 8 | A | false | false |
| `tools/learning-loop-mcp/__tests__/meta-state-schema.test.js` | 2026-06-07T04:59:50.188Z | 27 | C | false | false |
| `tools/learning-loop-mcp/__tests__/meta-state-sweep-summary.test.js` | 2026-06-07T00:11:19.330Z | 3 | A | true | false |
| `tools/learning-loop-mcp/__tests__/meta-state-sweep.test.js` | 2026-06-06T05:05:21.482Z | 7 | C | false | false |
| `tools/learning-loop-mcp/__tests__/meta-state-write-validation.test.js` | 2026-06-07T04:11:00.107Z | 5 | C | false | false |
| `tools/learning-loop-mcp/__tests__/migrate-rule-entry-kind.test.js` | 2026-06-06T13:33:30.869Z | 4 | C | false | false |
| `tools/learning-loop-mcp/__tests__/old-validate-records-function.test.js` | 2026-06-06T05:05:21.482Z | 5 | A | true | false |
| `tools/learning-loop-mcp/__tests__/old-validate-records.test.js` | 2026-06-06T05:05:21.482Z | 3 | A | true | false |
| `tools/learning-loop-mcp/__tests__/query-drift.test.js` | 2026-06-07T07:22:12.114Z | 27 | A | false | false |
| `tools/learning-loop-mcp/__tests__/schema-to-zod-spike.test.js` | 2026-06-06T05:05:21.482Z | 13 | A | true | false |
| `tools/learning-loop-mcp/__tests__/schema-to-zod.test.js` | 2026-06-06T05:05:21.482Z | 17 | A | true | false |
| `tools/learning-loop-mcp/__tests__/scout-bucket-classifier.test.js` | 2026-06-08T10:37:34.136Z | 10 | C | false | false |
| `tools/learning-loop-mcp/__tests__/scout-budget-estimator.test.js` | 2026-06-08T10:38:39.406Z | 4 | A | false | false |
| `tools/learning-loop-mcp/__tests__/scout-dangling-detector.test.js` | 2026-06-08T10:34:36.928Z | 12 | C | true | false |
| `tools/learning-loop-mcp/__tests__/scout-gap-analyzer.test.js` | 2026-06-08T10:32:58.958Z | 6 | A | false | false |
| `tools/learning-loop-mcp/__tests__/scout-run-scout.test.js` | 2026-06-08T10:28:03.865Z | 4 | A | true | false |
| `tools/learning-loop-mcp/__tests__/search-index.test.js` | 2026-06-06T05:05:21.482Z | 4 | A | true | false |
| `tools/learning-loop-mcp/__tests__/sp0-change-log-self-log.test.js` | 2026-06-06T05:05:21.482Z | 1 | A | true | false |
| `tools/learning-loop-mcp/__tests__/sp1-derive-status-acceptance.test.js` | 2026-06-07T07:24:10.905Z | 2 | C | true | false |
| `tools/learning-loop-mcp/__tests__/sp2-check-grounding-acceptance.test.js` | 2026-06-06T05:05:21.482Z | 2 | A | false | false |
| `tools/learning-loop-mcp/__tests__/tanstack-adapter.test.js` | 2026-06-06T05:05:21.482Z | 3 | A | true | false |
| `tools/learning-loop-mcp/__tests__/validation-centralization.test.js` | 2026-06-06T05:05:21.482Z | 5 | A | false | false |
| `tools/learning-loop-mcp/__tests__/vendor-doc-assist.test.js` | 2026-06-06T05:05:21.482Z | 21 | A | true | false |
| `tools/learning-loop-mcp/__tests__/verify-claim-scalar-rules.test.js` | 2026-06-06T05:05:21.482Z | 3 | A | true | false |
| `tools/learning-loop-mcp/__tests__/wire-format-coercion-fix.test.js` | 2026-06-08T05:47:37.617Z | 5 | A | false | false |
| `tools/learning-loop-mcp/core/__tests__/meta-state-g8-supersede.test.js` | 2026-06-07T04:31:41.635Z | 2 | C | false | false |
| `tools/learning-loop-mcp/core/__tests__/meta-state-superseded.test.js` | 2026-06-07T04:58:25.103Z | 7 | C | false | false |
| `tools/learning-loop-mcp/core/meta-state.test.js` | 2026-06-07T04:56:03.842Z | 19 | C | false | false |
| `tools/learning-loop-mcp/core/record-validation-rules.test.js` | 2026-06-06T06:36:43.221Z | 3 | A | false | false |
| `tools/learning-loop-mcp/core/workflow-registry.test.js` | 2026-06-06T05:05:21.486Z | 10 | A | false | false |
| `tools/learning-loop-mcp/lib/source-ref-validator.test.js` | 2026-06-06T06:33:38.166Z | 24 | A | false | false |
| `tools/learning-loop-mcp/tools/delete-record-tool.test.js` | 2026-06-06T05:05:21.490Z | 9 | A | true | false |
| `tools/learning-loop-mcp/tools/notify-artifact-tool.test.js` | 2026-06-06T05:05:21.490Z | 6 | A | false | false |
| `tools/learning-loop-mcp/tools/trigger-workflow-tool.test.js` | 2026-06-06T05:05:21.494Z | 5 | A | false | false |
| `tools/learning-loop-mcp/tools/workflow-candidate-to-experiment-tool.test.js` | 2026-06-06T05:05:21.494Z | 8 | A | false | false |
| `tools/lib/frontmatter-splitter.test.js` | 2026-06-06T05:05:21.494Z | 5 | A | false | false |
| `tools/validate-plan-loop/integration.test.js` | 2026-06-06T05:05:21.494Z | 5 | C | false | false |
| `tools/validate-plan-loop/validate-plan-loop.test.js` | 2026-06-06T05:05:21.494Z | 8 | C | false | false |

## Deliverable 2: MCP-First Bucket Distribution

| Bucket | Count |
|--------|-------|
| A | 80 |
| B | 1 |
| C | 40 |
| D | 1 |
| error | 0 |

## Deliverable 3: Dangling Matches

| File | Pattern | Line | Match | Suggested Fix |
|------|---------|------|-------|---------------|
| `product/web/tests/smoke-reference.test.mjs` | D3 | 4 | React from "react" | remove import or restore the removed tool |
| `product/web/tests/smoke-reference.test.mjs` | D3 | 5 | renderToStaticMarkup from "react-dom/server" | remove import or restore the removed tool |
| `product/web/tests/smoke-reference.test.mjs` | D3 | 6 | createMemoryHistory from "@tanstack/react-router" | remove import or restore the removed tool |
| `product/web/tests/smoke-reference.test.mjs` | D3 | 6 | createRootRoute from "@tanstack/react-router" | remove import or restore the removed tool |
| `product/web/tests/smoke-reference.test.mjs` | D3 | 6 | createRoute from "@tanstack/react-router" | remove import or restore the removed tool |
| `product/web/tests/smoke-reference.test.mjs` | D3 | 6 | createRouter from "@tanstack/react-router" | remove import or restore the removed tool |
| `product/web/tests/smoke-reference.test.mjs` | D3 | 6 | RouterContextProvider from "@tanstack/react-router" | remove import or restore the removed tool |
| `product/web/tests/smoke-reference.test.mjs` | D3 | 7 | createServer from "vite" | remove import or restore the removed tool |
| `tools/check-budget/check-budget-function.test.js` | D3 | 6 | runCheckBudget from "#mcp/core/budget-checker.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/acceptance/sp3-drift.test.js` | D3 | 8 | readRegistry from "#mcp/core/meta-state.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/acceptance/sp3-drift.test.js` | D3 | 9 | resolveRoot from "#lib/resolve-root.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/backfill-mechanism-check.test.js` | D3 | 5 | readRegistry from "#mcp/core/meta-state.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/backfill-mechanism-check.test.js` | D3 | 6 | resolveRoot from "#lib/resolve-root.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/bridge-1-e2e.test.js` | D3 | 6 | parse as parseYaml from "yaml" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/bridge-1-e2e.test.js` | D3 | 7 | runExtraction from "#mcp/core/extract-index/extract-index.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/bridge-1-e2e.test.js` | D3 | 8 | validateRecords from "#mcp/core/record-validation-rules.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/bridge-1-e2e.test.js` | D3 | 9 | loadSchemas from "#mcp/core/schema-loader.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/bridge-1-e2e.test.js` | D3 | 10 | listVerifiedClaims from "#mcp/core/list-verified.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/bridge-1-e2e.test.js` | D3 | 11 | searchIndex from "#mcp/core/search-index.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/bridge-1-e2e.test.js` | D3 | 12 | parseDoc from "#mcp/core/vendor-doc-assist/doc-parser.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/bridge-1-e2e.test.js` | D3 | 13 | generateSuggestions from "#mcp/core/vendor-doc-assist/suggestion-engine.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/bridge-2-unit.test.js` | D3 | 6 | getTemplate from "#mcp/core/candidate-to-experiment/template-registry.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/bridge-2-unit.test.js` | D3 | 6 | applyTemplate from "#mcp/core/candidate-to-experiment/template-registry.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/bridge-2-unit.test.js` | D3 | 6 | listDimensions from "#mcp/core/candidate-to-experiment/template-registry.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/bridge-2-unit.test.js` | D3 | 7 | buildExperimentDraft from "#mcp/core/candidate-to-experiment/experiment-draft-builder.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/build-inverse-indexes.test.js` | D3 | 5 | resolveRoot from "#lib/resolve-root.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/candidate-block.test.js` | D3 | 3 | validateRecords from "#mcp/core/record-validation-rules.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/candidate-block.test.js` | D3 | 4 | loadSchemas from "#mcp/core/schema-loader.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/cold-tier-regression.test.js` | D3 | 2 | resolveRoot from "#lib/resolve-root.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/experiment-update-verification-assertion-refs.test.js` | D3 | 3 | zodObjectForProperties from "#mcp/core/schema-to-zod.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/experiment-update-verification-assertion-refs.test.js` | D3 | 4 | loadSchemas from "#mcp/core/schema-loader.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/extract-index.test.js` | D3 | 8 | parse as parseYaml from "yaml" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/extract-index.test.js` | D3 | 9 | computeHash from "#mcp/core/extract-index/hash-computer.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/extract-index.test.js` | D3 | 10 | buildIndexEntry from "#mcp/core/extract-index/index-entry-builder.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/extract-index.test.js` | D3 | 11 | runExtraction from "#mcp/core/extract-index/extract-index.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/extract-index.test.js` | D3 | 12 | loadSchemas from "#mcp/core/schema-loader.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/extract-index.test.js` | D3 | 13 | validateRecords from "#mcp/core/record-validation-rules.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/fastapi-adapter.test.js` | D3 | 3 | extract from "#mcp/core/generate-capabilities/adapters/fastapi-adapter.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/field-coverage.test.js` | D3 | 28 | parse as parseYaml from "yaml" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/field-coverage.test.js` | D3 | 30 | loadSchemas from "#mcp/core/schema-loader.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/field-coverage.test.js` | D3 | 31 | buildExperimentYaml from "#mcp/core/experiment-writer.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/field-coverage.test.js` | D3 | 32 | buildRiskYaml from "#mcp/core/risk-writer.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/field-coverage.test.js` | D3 | 33 | buildDecisionYaml from "#mcp/core/decision-writer.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/field-coverage.test.js` | D3 | 34 | buildObservationYaml from "#mcp/core/observation-writer.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/field-coverage.test.js` | D3 | 35 | experimentDimensions from "#mcp/core/claim-verification-rules.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/field-coverage.test.js` | D3 | 35 | verificationDimensions from "#mcp/core/claim-verification-rules.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/field-coverage.test.js` | D3 | 35 | proofStatuses from "#mcp/core/claim-verification-rules.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/field-coverage.test.js` | D3 | 35 | productStatuses from "#mcp/core/claim-verification-rules.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/findings-parser.test.js` | D3 | 3 | parseFindings from "#mcp/core/extract-index/findings-parser.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/fix-loop-design-refs.test.js` | D3 | 1 | readRegistry from "#mcp/core/meta-state.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/fix-loop-design-refs.test.js` | D3 | 1 | writeEntry from "#mcp/core/meta-state.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/fix-loop-design-refs.test.js` | D3 | 2 | resolveRoot from "#lib/resolve-root.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/flatten-evidence-fields.test.js` | D3 | 7 | metaStateFindingEntrySchema from "#mcp/core/meta-state.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/flatten-evidence-fields.test.js` | D3 | 7 | metaStateChangeEntrySchema from "#mcp/core/meta-state.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/flatten-evidence-fields.test.js` | D3 | 7 | metaStateRuleEntrySchema from "#mcp/core/meta-state.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/flatten-evidence-fields.test.js` | D3 | 7 | metaStateLoopDesignSchema from "#mcp/core/meta-state.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/flatten-evidence-fields.test.js` | D3 | 7 | readRegistry from "#mcp/core/meta-state.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/frontmatter-splitter.test.js` | D3 | 3 | splitFrontmatter from "#lib/frontmatter-splitter.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/g8-subcommand-class-entry.test.js` | D3 | 4 | resolveRoot from "#lib/resolve-root.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/gate-scope-predicate.test.js` | D3 | 7 | resolveRoot from "#lib/resolve-root.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/generate-capabilities.test.js` | D3 | 6 | YAML from "yaml" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/generate-capabilities.test.js` | D3 | 7 | generateCapabilities from "#mcp/core/generate-capabilities/generate-capabilities.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/index-query-filter.test.js` | D3 | 3 | searchIndex from "#mcp/core/search-index.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/index-query-filter.test.js` | D3 | 4 | listVerifiedClaims from "#mcp/core/list-verified.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/integration-promoted-rule.test.js` | D3 | 9 | resolveRoot from "#lib/resolve-root.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/list-probes.test.js` | D3 | 6 | listProbes from "#mcp/core/list-probes.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/list-verified.test.js` | D3 | 6 | listVerifiedClaims from "#mcp/core/list-verified.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/loop-describe-description-mode.test.js` | D3 | 4 | summarize from "#mcp/core/loop-introspect.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/mcp-lifecycle-integration.test.js` | D3 | 8 | createDecision from "#mcp/core/decision-writer.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/mcp-lifecycle-integration.test.js` | D3 | 9 | updateDecision from "#mcp/core/decision-writer.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/mcp-lifecycle-integration.test.js` | D3 | 10 | createExperiment from "#mcp/core/experiment-writer.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/mcp-lifecycle-integration.test.js` | D3 | 11 | updateExperiment from "#mcp/core/experiment-writer.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/mcp-lifecycle-integration.test.js` | D3 | 13 | validateSourceRefs from "#mcp/lib/source-ref-validator.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/mcp-lifecycle-integration.test.js` | D3 | 14 | loadRecords from "#mcp/core/record-loader.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/mcp-lifecycle-integration.test.js` | D3 | 15 | loadSchemas from "#mcp/core/schema-loader.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/mcp-lifecycle-integration.test.js` | D3 | 16 | validateRecords from "#mcp/core/record-validation-rules.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/mcp-lifecycle-integration.test.js` | D3 | 17 | stringify as stringifyYaml from "yaml" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/meta-state-evidence-coverage.test.js` | D3 | 3 | readRegistry from "#mcp/core/meta-state.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/meta-state-evidence-coverage.test.js` | D3 | 4 | resolveRoot from "#lib/resolve-root.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/meta-state-evidence-coverage.test.js` | D3 | 5 | metaStateFindingEntrySchema from "#mcp/core/meta-state.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/meta-state-evidence-coverage.test.js` | D3 | 5 | metaStateChangeEntrySchema from "#mcp/core/meta-state.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/meta-state-evidence-coverage.test.js` | D3 | 5 | metaStateRuleEntrySchema from "#mcp/core/meta-state.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/meta-state-evidence-coverage.test.js` | D3 | 5 | metaStateLoopDesignSchema from "#mcp/core/meta-state.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/meta-state-list-compact.test.js` | D3 | 5 | resolveRoot from "#lib/resolve-root.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/meta-state-log-change.test.js` | D3 | 3 | z from "zod" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/meta-state-promote-rule-rule-entry.test.js` | D3 | 6 | resolveRoot from "#lib/resolve-root.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/meta-state-propose-design-tool.test.js` | D3 | 5 | resolveRoot from "#lib/resolve-root.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/meta-state-relationships.test.js` | D3 | 4 | resolveRoot from "#lib/resolve-root.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/meta-state-sweep-summary.test.js` | D3 | 5 | resolveRoot from "#lib/resolve-root.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/old-validate-records-function.test.js` | D3 | 5 | runValidateRecords from "#mcp/core/negative-fixture-runner.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/old-validate-records.test.js` | D3 | 5 | loadSchemas from "#mcp/core/schema-loader.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/old-validate-records.test.js` | D3 | 6 | loadRecords from "#mcp/core/record-loader.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/old-validate-records.test.js` | D3 | 7 | validateRecords from "#mcp/core/record-validation-rules.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/schema-to-zod-spike.test.js` | D3 | 24 | z from "zod" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/schema-to-zod.test.js` | D3 | 15 | z from "zod" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/scout-dangling-detector.test.js` | D3 | 123 | removedTool from "../removed-tool.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/scout-dangling-detector.test.js` | D1 | 126 | .evidence.code_ref | migrate to top-level evidence_code_ref (per meta-260607T0008Z) |
| `tools/learning-loop-mcp/__tests__/scout-run-scout.test.js` | D3 | 7 | Ajv from "ajv" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/scout-run-scout.test.js` | D3 | 8 | addFormats from "ajv-formats" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/search-index.test.js` | D3 | 6 | searchIndex from "#mcp/core/search-index.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/sp0-change-log-self-log.test.js` | D3 | 4 | resolveRoot from "#lib/resolve-root.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/sp1-derive-status-acceptance.test.js` | D3 | 8 | resolveRoot from "#lib/resolve-root.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/tanstack-adapter.test.js` | D3 | 3 | extract from "#mcp/core/generate-capabilities/adapters/tanstack-adapter.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/vendor-doc-assist.test.js` | D3 | 3 | parseDoc from "#mcp/core/vendor-doc-assist/doc-parser.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/vendor-doc-assist.test.js` | D3 | 4 | generateSuggestions from "#mcp/core/vendor-doc-assist/suggestion-engine.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/vendor-doc-assist.test.js` | D3 | 4 | detectCapability from "#mcp/core/vendor-doc-assist/suggestion-engine.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/vendor-doc-assist.test.js` | D3 | 4 | detectDimension from "#mcp/core/vendor-doc-assist/suggestion-engine.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/vendor-doc-assist.test.js` | D3 | 4 | computeConfidence from "#mcp/core/vendor-doc-assist/suggestion-engine.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/vendor-doc-assist.test.js` | D3 | 4 | generateTopicTag from "#mcp/core/vendor-doc-assist/suggestion-engine.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/__tests__/verify-claim-scalar-rules.test.js` | D3 | 3 | assertWritablePlainString from "#mcp/core/claim-update.js" | remove import or restore the removed tool |
| `tools/learning-loop-mcp/tools/delete-record-tool.test.js` | D3 | 7 | stringify as stringifyYaml from "yaml" | remove import or restore the removed tool |

## Deliverable 4: Gap Table

| Surface | Total | Covered | % | Missing |
|---------|-------|---------|---|---------|
| mcp-tools | 104 | 22 | 21.15 | 82 item(s) |
| schemas | 8 | 7 | 87.5 | 1 item(s) |
| gate-patterns | 0 | 0 | 100 | 0 item(s) |
| entry-kinds | 4 | 4 | 100 | 0 item(s) |
| error-paths | 5 | 2 | 40 | 3 item(s) |

## Deliverable 5: Prompt Budget Audit (per-test)

| File | Test | File reads | MCP calls | Wall clock est | Timeout | Utilization | Risk |
|------|------|-----------|-----------|----------------|---------|-------------|------|
| `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` | agent cites code via meta_state_report and local:meta-state refs | 0 | 0 | 29s | 60s | 48% | low |
| `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` | \n | 0 | 0 | 35s | 60s | 58% | medium |
| `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` | \n | 0 | 0 | 29s | 60s | 48% | low |
| `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` | discoverability surface works via direct MCP server spawn | 0 | 0 | 29s | 60s | 48% | low |
| `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` | \n | 0 | 0 | 23s | 60s | 38% | low |
| `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` | \n | 0 | 1 | 31s | 60s | 52% | medium |
| `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` | \n | 0 | 1 | 31s | 60s | 52% | medium |
| `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` | droid exec CLI catalog lists runtime-namespaced MCP tools (L1 probe) | 0 | 0 | 23s | 60s | 38% | low |
| `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` | cold-session test soft-deletes persisted finding on gap-close | 0 | 1 | 31s | 60s | 52% | medium |
| `tools/learning-loop-mcp/__tests__/cold-session-discoverability.test.cjs` | agent runtime exposes mcp__learning_loop_mcp__* tools to the AI (L2 probe) | 0 | 3 | 47s | 60s | 78% | high |
