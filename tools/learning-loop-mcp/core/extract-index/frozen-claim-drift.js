// Mechanism 2 Scope A: hard-stop when a new extracted assertion contradicts a
// frozen-legacy claim, unless the claim's `notes` field records the
// supersession (`SUPERSEDED` substring or names the new assertion-id).
//
// Heuristic limit: only the explicit topic-tag opposition `X-required` ↔
// `X-not-required` triggers the check. Free-form contradiction detection is
// out of scope and remains operator judgment.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

const DIMENSIONS = ["static", "install", "runtime", "product"];

export function loadFrozenClaims(claimsDir) {
  if (!statSync(claimsDir, { throwIfNoEntry: false })?.isDirectory()) return [];
  const claims = [];
  for (const entry of readdirSync(claimsDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".yaml")) continue;
    const path = join(claimsDir, entry.name);
    try {
      const parsed = parseYaml(readFileSync(path, "utf8"));
      if (!parsed || typeof parsed !== "object") continue;
      claims.push(parsed);
    } catch (cause) {
      console.warn(`Warning: malformed claim ${entry.name}, skipping: ${cause.message}`);
    }
  }
  return claims;
}

function oppositeTag(tag) {
  if (tag.endsWith("-not-required")) return tag.slice(0, -"-not-required".length) + "-required";
  if (tag.endsWith("-required")) return tag.slice(0, -"-required".length) + "-not-required";
  return null;
}

function tagStem(tag) {
  if (tag.endsWith("-not-required")) return tag.slice(0, -"-not-required".length);
  if (tag.endsWith("-required")) return tag.slice(0, -"-required".length);
  return null;
}

function claimMentionsStem(claim, stem, dimension) {
  const haystacks = [claim.claim || ""];
  const dimBlock = claim.verification && claim.verification[dimension];
  if (dimBlock && typeof dimBlock.reason === "string") haystacks.push(dimBlock.reason);
  const stemRe = new RegExp(`\\b${stem.replace(/-/g, "[- ]")}\\b`, "i");
  return haystacks.some((h) => stemRe.test(h));
}

function notesRecordSupersession(notes, newId) {
  if (typeof notes !== "string" || notes.length === 0) return false;
  const lower = notes.toLowerCase();
  return lower.includes("superseded") || lower.includes(newId.toLowerCase());
}

export function checkFrozenClaimDrift(newEntries, claims) {
  const errors = [];
  if (!claims || claims.length === 0) return errors;

  const byCapDim = new Map();
  for (const claim of claims) {
    if (!claim.capability || !claim.verification) continue;
    for (const dim of DIMENSIONS) {
      const block = claim.verification[dim];
      if (!block) continue;
      if (block.status !== "verified" && block.status !== "approved") continue;
      const key = `${claim.capability}|${dim}`;
      if (!byCapDim.has(key)) byCapDim.set(key, []);
      byCapDim.get(key).push(claim);
    }
  }

  for (const entry of newEntries) {
    const opposite = oppositeTag(entry.topic_tag);
    if (!opposite) continue;
    const stem = tagStem(entry.topic_tag);
    if (!stem) continue;
    const key = `${entry.capability}|${entry.dimension}`;
    const matches = byCapDim.get(key) || [];
    for (const claim of matches) {
      if (!claimMentionsStem(claim, stem, entry.dimension)) continue;
      if (notesRecordSupersession(claim.notes, entry.id)) continue;
      errors.push(
        `Frozen-claim drift: ${entry.id} contradicts ${claim.id} ` +
          `(topic-tag ${entry.topic_tag} opposes "${stem}-required" / "${stem}-not-required" claimed by ${claim.id}). ` +
          `Operator must add "SUPERSEDED" or "${entry.id}" to ${claim.id}.notes, or split the new finding to a non-contradictory tag.`
      );
    }
  }
  return errors;
}
