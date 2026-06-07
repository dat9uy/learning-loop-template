#!/usr/bin/env node
import { loopDescribeTool } from "#mcp/tools/loop-describe-tool.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const args = new Set(process.argv.slice(2));
const confirmOverwrite = args.has("--confirm-overwrite");

const root = resolveRoot();
const result = await loopDescribeTool.handler({ tier: "cold" });
const text = result.content[0].text;
const json = JSON.parse(text);

const fixtureDir = new URL("../__tests__/fixtures/", import.meta.url);
mkdirSync(fixtureDir, { recursive: true });
const fixturePath = new URL("cold-tier-pre-refactor.json", fixtureDir);

// Defense in depth (M3): require an explicit flag to overwrite an existing
// baseline, and refuse to capture a "post-refactor" cold tier (one that
// already contains an `inverse_indexes` field, which the pre-refactor fixture
// is expected NOT to have). This prevents accidentally clobbering the
// regression baseline with a current-tier snapshot.
if (existsSync(fixturePath) && !confirmOverwrite) {
  console.error(
    `Refusing to overwrite existing fixture at ${fixturePath.pathname}.\n` +
    `Pass --confirm-overwrite to replace the baseline, or run capture-cold-tier\n` +
    `from a clean checkout where the fixture does not yet exist.`
  );
  process.exit(2);
}

if (json.inverse_indexes !== undefined) {
  console.error(
    `Refusing to capture a post-refactor cold tier (output already has 'inverse_indexes').\n` +
    `The fixture must reflect the pre-refactor shape. Either restore the pre-refactor\n` +
    `code, or update the cold-tier-regression test to use a different baseline name.`
  );
  process.exit(3);
}

writeFileSync(fixturePath, JSON.stringify(json, null, 2) + "\n", "utf8");

const sizeBytes = Buffer.byteLength(JSON.stringify(json, null, 2), "utf8");
const sizeTokens = Math.round(sizeBytes / 4); // rough estimate

console.log(`Fixture captured: ${fixturePath.pathname}`);
console.log(`Size: ${sizeBytes} bytes (~${sizeTokens} tokens)`);
console.log(`Tools: ${json.tools?.length ?? 0}`);
console.log(`All findings: ${json.all_findings?.length ?? 0}`);
console.log(`Loop designs: ${json.loop_designs?.length ?? 0}`);
console.log(`Superseded lineage: ${json.superseded_lineage?.length ?? 0}`);
console.log(`Orphans: ${json.orphans?.length ?? 0}`);
