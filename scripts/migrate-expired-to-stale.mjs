import { metaStateMigrateExpiredToStaleTool } from "../tools/learning-loop-mcp/tools/meta-state-migrate-expired-to-stale-tool.js";

const ids = [
  "meta-260606T1830Z-context-pollution-stale-workaround-language-audit-trail-nois",
  "meta-260606T2102Z-agent-used-direct-file-i-o-node-e-scripts-importing-core-met",
  "meta-260606T2106Z-agent-called-meta-state-log-change-mcp-tool-5-times-in-succe",
  "meta-260606T2202Z-top-level-array-and-boolean-parameters-in-mcp-tool-schemas-g",
  "meta-260607T0843Z-claude-code-mcp-test-added",
  "meta-260608T1522Z-test-1-cold-session-hangs-in-mcp-gapped-env",
  "meta-260608T1618Z-corrected-diagnosis-for-meta-260608t1522z-test-1-cold-sessio",
  "meta-260608T1746Z-test-product-web-tests-smoke-reference-test-mjs-line-4-impor",
  "meta-260608T1746Z-test-product-web-tests-smoke-reference-test-mjs-line-5-impor",
  "meta-260608T1746Z-test-product-web-tests-smoke-reference-test-mjs-line-6-impor",
  "meta-260608T1746Z-test-product-web-tests-smoke-reference-test-mjs-line-7-impor",
  "meta-260608T1746Z-test-tools-check-budget-check-budget-function-test-js-line-6",
  "meta-260608T1746Z-test-tools-learning-loop-mcp-tools-delete-record-tool-test-j",
];

let migrated = 0;
let skipped = 0;
const failures = [];
for (const id of ids) {
  const result = await metaStateMigrateExpiredToStaleTool.handler({ id });
  const parsed = JSON.parse(result.content[0].text);
  if (parsed.migrated) {
    migrated++;
    console.log(`OK    ${id} -> stale (last_verified_at=${parsed.last_verified_at})`);
  } else {
    skipped++;
    console.log(`SKIP  ${id} -> reason=${parsed.reason} current_status=${parsed.current_status ?? ""} entry_kind=${parsed.entry_kind ?? ""}`);
  }
}

console.log(`\nMigrated: ${migrated}/${ids.length}`);
console.log(`Skipped:  ${skipped}/${ids.length}`);
if (failures.length) {
  console.log("Failures:", failures);
  process.exitCode = 1;
}
