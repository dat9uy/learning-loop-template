/**
 * Skills mirror parity test.
 *
 * Retained contract: each canonical loop-maintained skill (identified by
 * valid `maturity:` frontmatter in its canonical source) is byte-identical
 * across the surviving runtime surfaces that actually consume project-local
 * skill mirrors. The provider-owned lockfile and provider-managed external
 * skills are deliberately outside this contract.
 */

import { test } from "vitest";
import assert from "node:assert";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MCP_ROOT = new URL("../../../../", import.meta.url).pathname;
// The target topology in #154 retains Claude Code and Hermes as project-local
// skill-mirror consumers. Codex receives native Initial Delivery and is not a
// project-local skill-mirror target.
const MIRROR_CONSUMERS = [".claude", ".hermes"];
const CANONICAL_SKILLS_ROOT = join(MCP_ROOT, "tools/learning-loop-mastra/skills");

function listLoopMaintainedSkills() {
  return readdirSync(CANONICAL_SKILLS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const content = readIfExists(join(CANONICAL_SKILLS_ROOT, entry.name, "SKILL.md"));
      return content !== null && /^maturity:\s*state-[123]\s*$/m.test(content) ? entry.name : null;
    })
    .filter(Boolean)
    .sort();
}

function readIfExists(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

for (const skill of listLoopMaintainedSkills()) {
  test(`${skill} is byte-identical across retained mirror consumers`, () => {
    const contents = [
      readFileSync(join(CANONICAL_SKILLS_ROOT, skill, "SKILL.md"), "utf8"),
      ...MIRROR_CONSUMERS.map((s) =>
      readIfExists(join(MCP_ROOT, s, "skills", skill, "SKILL.md")),
      ),
    ];
    const present = contents.filter((c) => c !== null);
    assert.strictEqual(
      present.length,
      MIRROR_CONSUMERS.length + 1,
      `${skill}: canonical source and all ${MIRROR_CONSUMERS.length} retained mirror consumers must exist; found in ${present.length}`,
    );
    // Compare buffers (Buffer.equals is the byte-identity check).
    const buffers = contents.map((c) => Buffer.from(c, "utf8"));
    const reference = buffers[0];
    for (let i = 1; i < buffers.length; i++) {
      assert.ok(
        reference.equals(buffers[i]),
        `${skill}: ${i === 1 ? MIRROR_CONSUMERS[0] : MIRROR_CONSUMERS[i - 1]} diverges from canonical source; first divergence at byte ${firstDivergence(reference, buffers[i])}`,
      );
    }
  });

  test(`${skill} declares maturity: frontmatter on every surface`, () => {
    for (const surface of MIRROR_CONSUMERS) {
      const content = readIfExists(join(MCP_ROOT, surface, "skills", skill, "SKILL.md"));
      assert.ok(content !== null, `${surface}/skills/${skill}/SKILL.md must exist`);
      assert.ok(
        /^maturity:\s*(state-1|state-2|state-3)\s*$/m.test(content),
        `${surface}/skills/${skill}/SKILL.md must declare a valid maturity: field`,
      );
    }
  });
}

function firstDivergence(a, b) {
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) return i;
  }
  return a.length === b.length ? -1 : len;
}
