#!/usr/bin/env node
import { loopDescribeTool } from "#mcp/tools/loop-describe-tool.js";
import { resolveRoot } from "#lib/resolve-root.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const root = resolveRoot();
const result = await loopDescribeTool.handler({ tier: "cold" });
const text = result.content[0].text;
const json = JSON.parse(text);

const fixtureDir = new URL("../__tests__/fixtures/", import.meta.url);
mkdirSync(fixtureDir, { recursive: true });
const fixturePath = new URL("cold-tier-pre-refactor.json", fixtureDir);

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
