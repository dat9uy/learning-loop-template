import { readFileSync, readdirSync, statSync, lstatSync } from "node:fs";
import { join, relative, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { splitFrontmatter } from "#lib/frontmatter-splitter.js";
import { parseFindings } from "./findings-parser.js";
import { computeHash } from "./hash-computer.js";
import { buildIndexEntry } from "./index-entry-builder.js";
import { readExistingIndex, shouldWrite, writeIndexEntry } from "./file-writer.js";
import { loadFrozenClaims, checkFrozenClaimDrift } from "./frozen-claim-drift.js";

// Pure logic module — root path is passed by caller, never computed here

const SURFACES = ["meta", "vnstock", "fastapi", "tanstack", "product"];

function* walkEvidenceFiles(root) {
  const dirs = [join(root, "records", "evidence")];
  for (const surface of SURFACES) {
    dirs.push(join(root, "records", surface, "evidence"));
  }
  for (const dir of dirs) {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue;
    yield* _walkEvidenceDir(dir);
  }
}

function* _walkEvidenceDir(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      yield* _walkEvidenceDir(path);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      yield path;
    }
  }
}

function buildExperimentMap(root) {
  const map = new Map();
  const dirs = [join(root, "records", "experiments")];
  for (const surface of SURFACES) {
    dirs.push(join(root, "records", surface, "experiments"));
  }
  for (const experimentsDir of dirs) {
    if (!statSync(experimentsDir, { throwIfNoEntry: false })?.isDirectory()) continue;
    for (const entry of readdirSync(experimentsDir, { withFileTypes: true })) {
      if (!entry.name.endsWith(".yaml")) continue;
      const path = join(experimentsDir, entry.name);
      try {
        const text = readFileSync(path, "utf8");
        const yaml = parseYaml(text);
        if (!yaml || !Array.isArray(yaml.source_refs)) continue;
        for (const ref of yaml.source_refs) {
          if (typeof ref === "string" && ref.startsWith("local:")) {
            const list = map.get(ref) || [];
            list.push(yaml.id);
            map.set(ref, list);
          }
        }
      } catch (cause) {
        console.warn(`Warning: malformed experiment ${entry.name}, skipping: ${cause.message}`);
      }
    }
  }
  return map;
}

function collectSiblingFieldValues(evidenceDir, field) {
  const values = new Map();
  for (const entry of readdirSync(evidenceDir, { withFileTypes: true })) {
    if (!entry.name.endsWith(".md")) continue;
    const path = join(evidenceDir, entry.name);
    try {
      const text = readFileSync(path, "utf8");
      const { meta } = splitFrontmatter(text);
      if (meta && meta[field] !== undefined) {
        values.set(meta[field], (values.get(meta[field]) || 0) + 1);
      }
    } catch {
      // ignore unreadable siblings
    }
  }
  return Array.from(values.entries()).sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

function validateFrontmatter(meta, evidencePath, errors) {
  const required = ["capability", "dimension", "scope", "validation_status"];
  const missing = required.filter((f) => meta[f] === undefined || meta[f] === null);

  const evidenceDir = dirname(evidencePath);
  const suggestions = missing.map((field) => {
    const vals = collectSiblingFieldValues(evidenceDir, field);
    return vals.length ? ` (suggested ${field}: ${vals.join(", ")})` : "";
  });

  if (missing.length > 0) {
    errors.push(
      `Missing required frontmatter fields: ${missing.map((f, i) => `${f}${suggestions[i]}`).join(", ")}`
    );
    return false;
  }

  if (!/^[a-z0-9-]+$/.test(meta.capability)) {
    errors.push(`capability must match [a-z0-9-]+, got "${meta.capability}"`);
  }

  const validDimensions = ["static", "install", "runtime", "product"];
  if (!validDimensions.includes(meta.dimension)) {
    errors.push(`dimension must be one of ${validDimensions.join(", ")}, got "${meta.dimension}"`);
  }

  const validStatuses = ["passed", "pending", "failed", "draft"];
  if (!validStatuses.includes(meta.validation_status)) {
    errors.push(`validation_status must be one of ${validStatuses.join(", ")}, got "${meta.validation_status}"`);
  }

  return errors.length === 0;
}

function parseDisproofNotes(text) {
  const lines = text.split("\n");
  let inSection = false;
  const ids = [];
  for (const line of lines) {
    if (/^##\s+Confirmation\s*\/\s*Disproof\s+Notes\s*$/.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+/.test(line)) break;
    if (inSection) {
      const match = line.match(/(assertion-[a-z0-9-]+-(static|install|runtime|product)-[a-z0-9-]+)/g);
      if (match) ids.push(...match);
    }
  }
  return ids;
}

function loadExistingIndexEntries(root) {
  const entries = new Map();
  const dirs = [join(root, "records", "index")];
  for (const surface of SURFACES) {
    dirs.push(join(root, "records", surface, "index"));
  }
  for (const indexDir of dirs) {
    if (!statSync(indexDir, { throwIfNoEntry: false })?.isDirectory()) continue;
    for (const entry of readdirSync(indexDir, { withFileTypes: true })) {
      if (!entry.name.endsWith(".yaml")) continue;
      const path = join(indexDir, entry.name);
      const existing = readExistingIndex(path);
      if (existing && existing.id) {
        entries.set(existing.id, existing);
      }
    }
  }
  return entries;
}

function checkSupersession(newEntries, existingEntries, disproofIds, errors) {
  for (const entry of newEntries) {
    const existing = existingEntries.get(entry.id);
    if (!existing) continue;

    if (existing.assertion !== entry.assertion) {
      if (disproofIds.includes(existing.id)) {
        errors.push(
          `Supersession detected: ${entry.id} replaces "${existing.assertion}" with "${entry.assertion}" (disproof note confirms)`
        );
      } else {
        errors.push(
          `Supersession hard-stop: ${entry.id} assertion text changed from "${existing.assertion}" to "${entry.assertion}". Operator must add ## Confirmation / Disproof Notes naming ${existing.id}.`
        );
      }
    }
  }
}

function oppositeTopicTag(tag) {
  if (tag.endsWith("-not-required")) return tag.slice(0, -"-not-required".length) + "-required";
  if (tag.endsWith("-required")) return tag.slice(0, -"-required".length) + "-not-required";
  return null;
}

function applySupersessionWriteBack(newEntries, existingEntries, parsed, errors) {
  // Build Map<new_id, Set<old_id>> from disproof notes.
  // Disproof notes attach to an evidence file, not to a specific finding inside
  // it. When the file produces one finding the pairing is unambiguous. When the
  // file produces multiple findings we disambiguate by the explicit topic-tag
  // opposition (`X-required` ↔ `X-not-required`) to avoid cross-pollinating the
  // `supersedes` field onto unrelated findings.
  const findingsByFile = new Map();
  for (const item of parsed) {
    const list = findingsByFile.get(item.evidencePath) || [];
    list.push(item);
    findingsByFile.set(item.evidencePath, list);
  }

  const intents = new Map();
  for (const item of parsed) {
    if (!item.disproofIds || item.disproofIds.length === 0) continue;
    const siblings = findingsByFile.get(item.evidencePath) || [];
    const multi = siblings.length > 1;
    const opposite = multi ? oppositeTopicTag(item.finding.topicTag) : null;
    const newId = `assertion-${item.meta.capability}-${item.meta.dimension}-${item.finding.topicTag}`;
    for (const oldId of item.disproofIds) {
      if (oldId === newId) continue;
      if (multi) {
        if (!opposite || !oldId.endsWith(`-${opposite}`)) continue;
      }
      if (!intents.has(newId)) intents.set(newId, new Set());
      intents.get(newId).add(oldId);
    }
  }

  // Set supersedes on new entries
  for (const entry of newEntries) {
    const set = intents.get(entry.id);
    if (set && set.size > 0) {
      entry.supersedes = [...set].sort();
    }
  }

  // Build reverse map and mutate old entries
  const newById = new Map(newEntries.map((e) => [e.id, e]));
  const mutatedOld = [];
  const seenOld = new Set();
  for (const [newId, oldIds] of intents) {
    for (const oldId of oldIds) {
      if (seenOld.has(oldId)) continue;
      seenOld.add(oldId);
      const target = newById.get(oldId) || existingEntries.get(oldId);
      if (!target) {
        errors.push(
          `Supersession orphan: disproof note names non-existent assertion-id ${oldId} (referenced by ${newId})`
        );
        continue;
      }
      target.superseded_by = newId;
      target.status = "superseded";
      if (!newById.has(oldId)) mutatedOld.push(target);
    }
  }
  return mutatedOld;
}

export function runExtraction(root, args) {
  const now = new Date().toISOString().slice(0, -5) + "Z";
  const agentRun = `extract-index-${now}`;
  const experimentMap = buildExperimentMap(root);
  const existingEntries = loadExistingIndexEntries(root);

  const errors = [];
  const skipped = [];
  const parsed = [];
  let filesProcessed = 0;
  let filesWithFindings = 0;

  for (const filePath of walkEvidenceFiles(root)) {
    const relPath = relative(root, filePath);
    filesProcessed += 1;

    try {
      const buffer = readFileSync(filePath);
      const text = buffer.toString("utf8");
      const { meta, body } = splitFrontmatter(text);

      if (!meta) {
        if (args.verbose) console.warn(`Skipped ${relPath}: no frontmatter`);
        skipped.push(`${relPath}: no frontmatter`);
        continue;
      }

      const fileErrors = [];
      if (!validateFrontmatter(meta, filePath, fileErrors)) {
        errors.push(`${relPath}: ${fileErrors.join("; ")}`);
        continue;
      }

      if (args.capability && meta.capability !== args.capability) {
        if (args.verbose) console.warn(`Skipped ${relPath}: capability mismatch`);
        continue;
      }

      if (meta.validation_status === "failed") {
        if (args.verbose) console.warn(`Skipped ${relPath}: validation_status is failed`);
        skipped.push(`${relPath}: validation_status failed`);
        continue;
      }

      if (meta.validation_status === "draft") {
        if (args.verbose) console.warn(`Skipped ${relPath}: validation_status is draft`);
        skipped.push(`${relPath}: validation_status draft`);
        continue;
      }

      const findings = parseFindings(body);
      if (findings.length === 0) {
        if (args.verbose) console.warn(`Skipped ${relPath}: no ## Findings section`);
        continue;
      }

      filesWithFindings += 1;
      const hash = computeHash(buffer);
      const disproofIds = parseDisproofNotes(body);

      for (const finding of findings) {
        parsed.push({
          finding,
          meta,
          evidencePath: relPath,
          hash,
          disproofIds,
        });
      }
    } catch (cause) {
      errors.push(`${relPath}: ${cause.message}`);
    }
  }

  // Aggregate by assertion ID
  const aggregation = new Map();
  for (const item of parsed) {
    const id = `assertion-${item.meta.capability}-${item.meta.dimension}-${item.finding.topicTag}`;
    let agg = aggregation.get(id);
    if (!agg) {
      agg = {
        sourceRefs: [],
        hashes: [],
        items: [],
      };
      aggregation.set(id, agg);
    }
    agg.items.push(item);
    agg.hashes.push(item.hash);
    agg.sourceRefs.push({
      file: `local:${item.evidencePath}`,
      section: "## Findings",
      bullet_index: item.finding.bulletIndex,
      line_anchor: item.finding.lineAnchor,
    });
  }

  // Compute combined hashes and build entries
  const newEntries = [];
  for (const [id, agg] of aggregation) {
    const uniqueHashes = Array.from(new Set(agg.hashes)).sort();
    const combinedHash = computeHash(Buffer.from(uniqueHashes.join("\n")));
    const nCount = agg.sourceRefs.length;

    const existing = existingEntries.get(id);
    const firstExtractedAt = existing?.extraction?.first_extracted_at || now;

    const firstItem = agg.items[0];
    const entry = buildIndexEntry({
      finding: firstItem.finding,
      meta: firstItem.meta,
      evidencePath: firstItem.evidencePath,
      hash: combinedHash,
      sourceRefs: agg.sourceRefs,
      nCount,
      experimentMap,
      agentRun,
      firstExtractedAt,
      lastUpdatedAt: now,
    });

    if (entry) {
      newEntries.push(entry);
    }
  }

  // Supersession check
  const allDisproofIds = Array.from(new Set(parsed.flatMap((p) => p.disproofIds)));
  checkSupersession(newEntries, existingEntries, allDisproofIds, errors);

  // Supersession write-back (mutates new entries' supersedes and old entries' superseded_by/status)
  const mutatedOld = applySupersessionWriteBack(newEntries, existingEntries, parsed, errors);

  // Frozen-claim drift check (Mechanism 2 Scope A)
  const claimsDirs = [join(root, "records", "claims")];
  for (const surface of SURFACES) {
    claimsDirs.push(join(root, "records", surface, "claims"));
  }
  const frozenClaims = [];
  for (const claimsDir of claimsDirs) {
    frozenClaims.push(...loadFrozenClaims(claimsDir));
  }
  const driftErrors = checkFrozenClaimDrift(newEntries, frozenClaims);
  for (const err of driftErrors) errors.push(err);

  // Hard-stop: do not write anything when errors exist
  if (errors.length > 0) {
    return {
      stats: { filesProcessed, filesWithFindings, entriesProduced: newEntries.length, written: 0, unchanged: 0 },
      errors,
      skipped,
      newEntries,
    };
  }

  // Write or report
  let written = 0;
  let unchanged = 0;
  for (const entry of newEntries) {
    const existing = existingEntries.get(entry.id);
    if (!shouldWrite(existing, entry)) {
      unchanged += 1;
      continue;
    }
    if (args.dryRun) {
      console.log(`[dry-run] would write ${entry.id}.yaml`);
      written += 1;
    } else {
      writeIndexEntry(root, entry);
      written += 1;
    }
  }

  // Write mutated old entries (supersession write-back)
  for (const old of mutatedOld) {
    if (args.dryRun) {
      console.log(`[dry-run] would update ${old.id}.yaml (supersession)`);
      written += 1;
    } else {
      writeIndexEntry(root, old);
      written += 1;
    }
  }

  return {
    stats: { filesProcessed, filesWithFindings, entriesProduced: newEntries.length, written, unchanged },
    errors,
    skipped,
    newEntries,
  };
}

// Pure logic module — CLI entry point lives in tools/extract-index-cli.js
