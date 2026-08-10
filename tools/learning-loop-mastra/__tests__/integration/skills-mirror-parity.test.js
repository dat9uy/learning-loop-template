/**
 * Skills mirror parity test (Phase 4 of plans/260707-0114-loop-skill-layer-prerequisite/plan.md
 * + Phase 3 of plans/260719-1428-central-skills-management).
 *
 * Contract: every loop-maintained skill (those declaring `maturity:` frontmatter)
 * must be byte-identical across all 3 runtime surfaces (.claude, .factory,
 * .mastracode). The external `mastra` skill is excluded from the loop-maintained
 * set by manifest `external:true` (Phase 3 — was a pre-Phase-3 symlink).
 *
 * Phase 3 additions:
 *   - F10: load-bearing manifest-external assertion (replaces the vacuous update block).
 *   - F11: `.mastracode/skills/mastra` presence (gap closure — was missing pre-Phase-3).
 *   - F12: mastra cross-surface byte-identity (external skills drift silently otherwise
 *          — `npx update` is per-runtime; a forgotten `pnpm skills:sync` would drift).
 *
 * This is the backstop for "contract exits 0" — the contract check is
 * presence + tool-refs, not byte-identity (per red-team finding 11).
 */

import { test } from "vitest";
import assert from "node:assert";
import { readFileSync, existsSync, lstatSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const MCP_ROOT = new URL("../../../../", import.meta.url).pathname;
const SURFACES = [".claude", ".factory", ".mastracode"];
const LOOP_MAINTAINED_SKILLS = ["learning-loop", "coordination-gate"];

function readIfExists(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
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

// Walk a skill dir and return a map of relpath → file bytes for every real
// file (symlinks skipped — external skills are real files post-Phase-3).
function readSkillTree(surface, name) {
  const root = join(MCP_ROOT, surface, "skills", name);
  const out = {};
  (function walk(dir, rel) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rp = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory() && !e.isSymbolicLink()) walk(join(dir, e.name), rp);
      else if (e.isFile() && !e.isSymbolicLink()) out[rp] = readFileSync(join(dir, e.name), "utf8");
    }
  })(root, "");
  return out;
}

test("F11: mastra is present as real files (not a symlink) on every surface, including .mastracode", () => {
  // Phase 3 red-team F11 — the .mastracode gap was unenforced pre-Phase-3.
  // Post-Phase-3 the npx copy lands on the detected runtime (.claude) and
  // the materializer fans out real files to the undetected runtimes.
  for (const surface of SURFACES) {
    const dir = join(MCP_ROOT, surface, "skills", "mastra");
    assert.ok(existsSync(dir), `${surface}/skills/mastra must exist`);
    let st;
    try {
      st = lstatSync(dir);
    } catch {
      assert.fail(`${surface}/skills/mastra must be statable`);
    }
    assert.ok(st.isDirectory(), `${surface}/skills/mastra must be a directory`);
    assert.ok(!st.isSymbolicLink(), `${surface}/skills/mastra must be real files, not a symlink (pre-Phase-3 shape retired)`);
    assert.ok(existsSync(join(dir, "SKILL.md")), `${surface}/skills/mastra/SKILL.md must exist`);
  }
});

test("F12: mastra tree is byte-identical across all 3 surfaces (external cross-surface parity)", () => {
  // Phase 3 red-team F12 — mastra is external (out of LOOP_MAINTAINED_SKILLS)
  // so the internal parity loop does not cover it. `npx skills update` is
  // per-runtime; without this test, a forgotten `pnpm skills:sync` after an
  // npx update would drift silently. This test closes that gap.
  const reference = readSkillTree(SURFACES[0], "mastra");
  const refKeys = Object.keys(reference).sort();
  assert.ok(refKeys.length > 1, `mastra tree must have more than just SKILL.md (references/+scripts/): ${JSON.stringify(refKeys)}`);
  for (let i = 1; i < SURFACES.length; i++) {
    const tree = readSkillTree(SURFACES[i], "mastra");
    const treeKeys = Object.keys(tree).sort();
    assert.deepStrictEqual(
      treeKeys,
      refKeys,
      `${SURFACES[i]}: mastra file set diverges from ${SURFACES[0]}: ${JSON.stringify(treeKeys)} vs ${JSON.stringify(refKeys)}`,
    );
    for (const k of refKeys) {
      assert.strictEqual(
        tree[k],
        reference[k],
        `${SURFACES[i]}/skills/mastra/${k}: byte-divergence from ${SURFACES[0]}`,
      );
    }
  }
});

test("F6: manifest mastra hash matches the installed SKILL.md (load-bearing hash)", () => {
  // Phase 3 F6 — the manifest hash is the trust anchor for the npx round-trip.
  // sha256(SKILL.md) on any surface must equal manifest.skills.mastra.hash.
  const manifest = JSON.parse(readFileSync(join(MCP_ROOT, "skills-lock.json"), "utf8"));
  const expected = manifest.skills.mastra.hash;
  assert.ok(typeof expected === "string" && expected.length === 64, "manifest.skills.mastra.hash must be a sha256 hex");
  for (const surface of SURFACES) {
    const skillMd = join(MCP_ROOT, surface, "skills", "mastra", "SKILL.md");
    const content = readFileSync(skillMd, "utf8");
    const actual = createHash("sha256").update(content, "utf8").digest("hex");
    assert.strictEqual(actual, expected, `${surface}: mastra SKILL.md sha256 must match manifest hash (F6)`);
  }
});