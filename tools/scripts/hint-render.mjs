#!/usr/bin/env node
/**
 * hint-render.mjs — debug CLI for the hint-renderer pipeline.
 * Phase 4 of plans/260717-1826-unify-context-injection.
 *
 * Prints the byte-exact render the runtime would inject for a given channel,
 * plus per-hint provenance (slug + kind + source) when --provenance is set.
 * Use to inspect what each session-start would see WITHOUT starting a session.
 *
 * Usage:
 *   node tools/scripts/hint-render.mjs --channel <name> [--partition N] [--provenance]
 *
 * Channels:
 *   claude-session-start — 2-partition render (discoverability + process)
 *   factory-session-start — single block (factory hook stdout)
 *   mcp-warm             — structured JSON array
 *   sidecar              — session-context.json payload
 *
 * Exit codes:
 *   0 — success
 *   2 — unknown channel
 *
 * No MCP spawn, no registry writes. Read-only.
 */
import { renderHints, listChannels } from "../learning-loop-mastra/core/hint-renderer.js";
import { HINT_REGISTRY } from "../learning-loop-mastra/core/hint-registry.js";

function parseArgs(argv) {
  const out = { channel: null, partition: null, provenance: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--channel") out.channel = argv[++i];
    else if (a === "--partition") out.partition = parseInt(argv[++i], 10);
    else if (a === "--provenance") out.provenance = true;
    else if (a === "--help" || a === "-h") {
      console.log("Usage: node tools/scripts/hint-render.mjs --channel <name> [--partition N] [--provenance]");
      console.log("Channels: " + listChannels().join(", "));
      process.exit(0);
    }
    else {
      console.error(`Unknown arg: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.channel) {
    console.error("error: --channel <name> is required");
    console.error("Channels: " + listChannels().join(", "));
    process.exit(2);
  }
  if (!listChannels().includes(args.channel)) {
    console.error(`error: unknown channel '${args.channel}'`);
    console.error("Channels: " + listChannels().join(", "));
    process.exit(2);
  }

  // Mock rulesById with hint_text for each rule-derived entry so the projection
  // resolves cleanly without a registry read. Real production renderers thread
  // the precomputed `loadPromotedRules(root)` map; the CLI is for inspection,
  // not production injection.
  const rulesById = new Map(
    HINT_REGISTRY
      .filter((e) => e.derived_from_rule)
      .map((e) => [e.derived_from_rule, { hint_text: `[mocked hint_text for ${e.slug}]` }])
  );

  const { partitions, provenance } = renderHints({
    channel: args.channel,
    charBudget: 9500,
    rulesById,
  });

  if (args.partition !== null) {
    if (args.partition < 0 || args.partition >= partitions.length) {
      console.error(`error: --partition ${args.partition} out of range (0..${partitions.length - 1})`);
      process.exit(2);
    }
    const text = partitions[args.partition];
    process.stdout.write(text);
    if (!text.endsWith("\n")) process.stdout.write("\n");
    if (args.provenance) {
      console.error("\n--- provenance for partition", args.partition, "---");
      for (const p of provenance) {
        console.error(`  ${p.slug} (${p.kind}) ← ${p.source}`);
      }
    }
    return;
  }

  for (let i = 0; i < partitions.length; i++) {
    console.log(`--- partition ${i} (${partitions[i].length} chars) ---`);
    process.stdout.write(partitions[i]);
    if (!partitions[i].endsWith("\n")) process.stdout.write("\n");
  }
  if (args.provenance) {
    console.error(`\n--- provenance (${provenance.length} entries) ---`);
    for (const p of provenance) {
      console.error(`  ${p.slug} (${p.kind}) ← ${p.source}`);
    }
  }
}

main();