import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { splitFrontmatter } from "../lib/frontmatter-splitter.js";

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

function loadClaims(root) {
  const claimsDir = join(root, "records", "claims");
  const claims = [];
  let files;
  try {
    files = readdirSync(claimsDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  } catch {
    return claims;
  }
  for (const file of files) {
    try {
      const content = readFileSync(join(claimsDir, file), "utf8");
      const record = parseYaml(content, { uniqueKeys: false });
      if (record && isVerifiedClaim(record)) {
        claims.push({
          id: record.id || file.replace(/\.yaml?$/, ""),
          subject: record.subject || "",
          verified_dimensions: getVerifiedDimensions(record),
        });
      }
    } catch {
      // skip unparseable
    }
  }
  return claims;
}

function loadEvidence(root) {
  const evidenceDir = join(root, "records", "evidence");
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

  walk(evidenceDir);
  return evidence;
}

export function listVerifiedClaims(root) {
  const claims = loadClaims(root);
  const evidence = loadEvidence(root);
  return { claims, evidence };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = process.cwd();
  const result = listVerifiedClaims(root);
  console.log("=== Verified Claims ===");
  for (const claim of result.claims) {
    console.log(`${claim.id} | ${claim.subject} | [${claim.verified_dimensions.join(",")}]`);
  }
  console.log("");
  console.log("=== Supporting Evidence ===");
  for (const ev of result.evidence) {
    console.log(`${ev.path} | ${ev.capability}/${ev.dimension}/${ev.scope} | ${ev.status}`);
  }
}
