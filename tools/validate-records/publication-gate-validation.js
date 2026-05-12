import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { deriveClaimAssurance, assuranceIndex } from "./derived-claim-assurance.js";

const defaultGate = {
  claims: {
    min_assurance: "static",
    required_outcome: "supports",
    scope: "planning",
    reject_on: ["rejected", "unresolved-conflict", "expired"],
  },
};

function packYamlFiles(packDir) {
  if (!existsSync(packDir)) return [];
  return readdirSync(packDir)
    .filter((name) => name.endsWith(".yaml"))
    .map((name) => join(packDir, name));
}

function loadPackManifest(packDir) {
  const manifestPath = join(packDir, "manifest.yaml");
  if (!existsSync(manifestPath)) return null;
  return parseYaml(readFileSync(manifestPath, "utf8"));
}

function loadPackClaims(packDir) {
  const claimsPath = join(packDir, "claims.yaml");
  if (existsSync(claimsPath)) {
    const parsed = parseYaml(readFileSync(claimsPath, "utf8"));
    return parsed.claims || [];
  }
  const factsPath = join(packDir, "facts.yaml");
  if (existsSync(factsPath)) {
    const parsed = parseYaml(readFileSync(factsPath, "utf8"));
    return parsed.facts || parsed.claims || [];
  }
  return [];
}

function loadPackCapabilities(packDir) {
  const capsPath = join(packDir, "capabilities.yaml");
  if (!existsSync(capsPath)) return [];
  const parsed = parseYaml(readFileSync(capsPath, "utf8"));
  return parsed.capabilities || [];
}

function resolveClaimRef(ref, recordsById) {
  if (typeof ref !== "string" || !ref.startsWith("record:")) return null;
  return recordsById.get(ref.slice("record:".length)) || null;
}

function findConflictingEntries(claims) {
  const byRef = new Map();
  for (const entry of claims) {
    if (!entry.record_ref) continue;
    const existing = byRef.get(entry.record_ref);
    if (existing) {
      if (existing.text !== entry.text || existing.status !== entry.status) {
        return [existing, entry];
      }
    } else {
      byRef.set(entry.record_ref, entry);
    }
  }
  return null;
}

function entryMeetsGate(entry, claim, gate, recordsById, records) {
  const errors = [];
  const claimGate = gate.claims || defaultGate.claims;

  if (!entry.record_ref) {
    errors.push("missing record_ref");
    return errors;
  }

  if (!claim) {
    errors.push(`unresolved record_ref ${entry.record_ref}`);
    return errors;
  }

  const derived = deriveClaimAssurance(claim, records);

  if (claimGate.reject_on?.includes("rejected") && derived.level === "blocked") {
    errors.push("claim is rejected/blocked");
  }

  const minAssurance = claimGate.min_assurance || "static";
  if (derived.level !== "blocked" && assuranceIndex(derived.level) < assuranceIndex(minAssurance)) {
    errors.push(`claim assurance ${derived.level} is below gate minimum ${minAssurance}`);
  }

  return errors;
}

export function validatePublicationGates(root, records, options = {}) {
  const { transitional = true, packsRoot: customPacksRoot } = options;
  const errors = [];
  const recordsById = new Map(records.map((r) => [r.id, r]));
  const packsRoot = customPacksRoot || join(root, "knowledge-packs");

  if (!existsSync(packsRoot)) return errors;

  for (const packName of readdirSync(packsRoot)) {
    const packDir = join(packsRoot, packName);
    const manifest = loadPackManifest(packDir);
    if (!manifest) continue;

    const gate = manifest.publication_gate || defaultGate;
    const claims = loadPackClaims(packDir);
    const packLabel = `knowledge-packs/${packName}`;

    const conflict = findConflictingEntries(claims);
    if (conflict && gate.claims?.reject_on?.includes("unresolved-conflict")) {
      const msg = `unresolved conflict between entries ${conflict[0].id} and ${conflict[1].id}`;
      if (transitional) {
        console.warn(`WARN ${packLabel}: ${msg}`);
      } else {
        errors.push(`${packLabel}: ${msg}`);
      }
    }

    for (const entry of claims) {
      const claim = resolveClaimRef(entry.record_ref, recordsById);
      const entryErrors = entryMeetsGate(entry, claim, gate, recordsById, records);
      for (const msg of entryErrors) {
        if (transitional) {
          console.warn(`WARN ${packLabel} claim ${entry.id}: ${msg}`);
        } else {
          errors.push(`${packLabel}: claim ${entry.id}: ${msg}`);
        }
      }
    }
  }

  return errors;
}
