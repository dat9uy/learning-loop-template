/**
 * Skills mirror parity test (Phase 4 of plans/260707-0114-loop-skill-layer-prerequisite/plan.md).
 *
 * Contract: every loop-maintained skill (those declaring `maturity:` frontmatter)
 * must be byte-identical across all 3 runtime surfaces (.claude, .factory,
 * .mastracode). The external `mastra` symlink is excluded.
 *
 * This is the backstop for "contract exits 0" — the contract check is
 * presence + tool-refs, not byte-identity (per red-team finding 11).
 */

import { test } from "vitest";
import assert from "node:assert";
import { readFileSync, existsSync, lstatSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const MCP_ROOT = new URL("../../../../", import.meta.url).pathname;
const SURFACES = [".claude", ".factory", ".mastracode"];
const LOOP_MAINTAINED_SKILLS = ["learning-loop", "coordination-gate"];

function readIfExists(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
}

function isExternalSymlink(surface, name) {
  // Real-repo shape: .claude/skills/mastra → ../../.agents/skills/mastra.
  // Symlinks are external, not loop-maintained.
  const linkPath = join(MCP_ROOT, surface, "skills", name);
  if (!existsSync(linkPath)) return false;
  try {
    return lstatSync(linkPath).isSymbolicLink();
  } catch {
    return false;
  }
}

function isLoopMaintainedSkillDir(surface, name) {
  const dir = join(MCP_ROOT, surface, "skills", name);
  if (!existsSync(dir)) return false;
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

for (const skill of LOOP_MAINTAINED_SKILLS) {
  test(`${skill} is byte-identical across all 3 runtime surfaces (mirror parity)`, () => {
    const contents = SURFACES.map((s) =>
      readIfExists(join(MCP_ROOT, s, "skills", skill, "SKILL.md")),
    );
    const present = contents.filter((c) => c !== null);
    assert.strictEqual(
      present.length,
      SURFACES.length,
      `${skill}: SKILL.md must exist in all 3 surfaces; found in ${present.length}`,
    );
    // Compare buffers (Buffer.equals is the byte-identity check).
    const buffers = contents.map((c) => Buffer.from(c, "utf8"));
    const reference = buffers[0];
    for (let i = 1; i < buffers.length; i++) {
      assert.ok(
        reference.equals(buffers[i]),
        `${skill}: ${SURFACES[i]} mirror diverges from ${SURFACES[0]}; first divergence at byte ${firstDivergence(reference, buffers[i])}`,
      );
    }
  });

  test(`${skill} declares maturity: frontmatter on every surface`, () => {
    for (const surface of SURFACES) {
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

test("manifest-driven exclusion: mastra is external:true in skills-lock.json", () => {
  // Phase 3 (F10) — load-bearing replacement for the original vacuous
  // "update" block (L108 assert.ok(true), L120 dead post-Phase-3).
  // The manifest is the trust anchor for mastra's exclusion.
  const manifestPath = join(MCP_ROOT, "skills-lock.json");
  assert.ok(existsSync(manifestPath), "skills-lock.json must exist");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.ok(manifest.skills, "manifest.skills must be defined");
  assert.ok(manifest.skills.mastra, "manifest.skills.mastra must be defined");
  assert.strictEqual(
    manifest.skills.mastra.external,
    true,
    "mastramust be declared external:true in the manifest (Phase 3 trust anchor)",
  );
});

test("manifest-driven exclusion: listLoopMaintainedSkills excludes mastra regardless of shape", () => {
  // Phase 3 — exercise the contract's exclusion via the manifest. The
  // manifest is the source of truth; filesystem shape (symlink vs real
  // dir) is irrelevant after Phase 3 ships.
  // We import the contract validator and call it against the real repo
  // root, then assert mastra is NOT in the enumerated skills list.
  return import("../../interface/contract.js").then((mod) => {
    const result = mod.validate("claude-code", MCP_ROOT);
    const req3 = result.path_map["skill-spec"];
    assert.ok(req3, "skill-spec must be present in path_map");
    const names = req3.skills.map((s) => s.name);
    assert.ok(!names.includes("mastra"), `mastra must be excluded by manifest (not isSymbolicLink): ${JSON.stringify(names)}`);
    // learning-loop + coordination-gate must be present.
    assert.ok(names.includes("learning-loop"), "learning-loop must be enumerated");
    assert.ok(names.includes("coordination-gate"), "coordination-gate must be enumerated");
  });
});