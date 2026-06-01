import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { splitFrontmatter } from "#lib/frontmatter-splitter.js";

function isVerifiedClaim(record) {
  if (record.approval?.status !== "approved") return false;
  const verification = record.verification || {};
  for (const dim of Object.values(verification)) {
    if (dim && dim.status === "verified") return true;
  }
  return false;
}

function getVerifiedDimensions(record) {
  const dims = [];
  const verification = record.verification || {};
  for (const [key, val] of Object.entries(verification)) {
    if (val && val.status === "verified") dims.push(key);
  }
  return dims;
}

export const SURFACES = ["meta", "vnstock", "fastapi", "tanstack", "product"];

function loadClaims(root) {
  const claims = [];
  const collect = (dir) => {
    let files;
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
    } catch {
      return;
    }
    for (const file of files) {
      try {
        const content = readFileSync(join(dir, file), "utf8");
        const record = parseYaml(content, { uniqueKeys: false });
        if (record && isVerifiedClaim(record)) {
          claims.push({
            id: record.id || file.replace(/\.yaml?/, ""),
            subject: record.subject || "",
            verified_dimensions: getVerifiedDimensions(record),
          });
        }
      } catch {
        // skip unparseable
      }
    }
  };
  collect(join(root, "records", "claims"));
  for (const surface of SURFACES) {
    collect(join(root, "records", surface, "claims"));
  }
  return claims;
}

function loadEvidence(root) {
  const evidence = [];

  function walk(dir) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        try {
          const text = readFileSync(fullPath, "utf8");
          const { meta } = splitFrontmatter(text);
          if (meta && meta.claim_support === "supports") {
            evidence.push({
              path: fullPath.replace(root + "/", ""),
              capability: meta.capability || "?",
              dimension: meta.dimension || "?",
              scope: meta.scope || "?",
              status: meta.validation_status || "?",
            });
          }
        } catch {
          // skip unparseable
        }
      }
    }
  }

  walk(join(root, "records", "evidence"));
  for (const surface of SURFACES) {
    walk(join(root, "records", surface, "evidence"));
  }
  return evidence;
}

function loadAssertions(root, includeCandidates) {
  const assertions = [];

  const collect = (dir) => {
    let files;
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
    } catch {
      return;
    }
    for (const file of files) {
      try {
        const content = readFileSync(join(dir, file), "utf8");
        const record = parseYaml(content, { uniqueKeys: false });
        if (record && record.type === "extracted-assertion") {
          if (record.status === "candidate" && !includeCandidates) continue;
          assertions.push({
            id: record.id || file.replace(/\.yaml?/, ""),
            capability: record.capability || "?",
            dimension: record.dimension || "?",
            scope: record.scope || "?",
            status: record.status || "?",
            topic_tag: record.topic_tag || "?",
          });
        }
      } catch {
        // skip unparseable
      }
    }
  };

  collect(join(root, "records", "index"));
  for (const surface of SURFACES) {
    collect(join(root, "records", surface, "index"));
  }
  return assertions;
}

export function listVerifiedClaims(root, includeCandidates = false) {
  const claims = loadClaims(root);
  const evidence = loadEvidence(root);
  const assertions = loadAssertions(root, includeCandidates);
  return { claims, evidence, assertions };
}
