---
phase: 5
title: "Index Regeneration & Ref Validation"
status: pending
priority: P1
effort: "20m"
dependencies: [4]
---

# Phase 5: Index Regeneration & Ref Validation

## Overview

Delete old index files (their paths and `source_refs` are stale), regenerate index from scratch using updated `extract-index`, then run validation to catch broken `local:` references.

## Requirements

- Functional: Old index files deleted and regenerated into `records/<surface>/index/`.
- Functional: `pnpm check` validates all `local:` and `record:` cross-references.
- Functional: No broken `local:` refs pointing to old flat evidence paths.

## Capability-to-Surface Mapping

The extractor and index writer need to map capability tags to surfaces:

| Capability Prefix | Surface |
|---|---|
| `vnstock-data` | `vnstock` |
| `fundamental` | `product` |
| `fastapi` | `fastapi` |
| `tanstack` | `tanstack` |
| `product` | `product` |
| `meta` | `meta` |
| `loop` | `meta` (legacy, merge to meta) |

Unknown capability prefixes default to `product` or raise an error.

## Related Code Files

- Delete: `records/<surface>/index/*` (old flat index files moved in phase 4)
- Create: `records/<surface>/index/*` (regenerated)
- Create: `tools/migrate-local-refs.js` — automated script to fix 221 `local:` refs
- Modify: Any YAML files with stale `local:records/evidence/...` or `local:records/experiments/...` paths

## Implementation Steps

1. Delete old index files (moved to surface dirs in phase 4 but still stale):
   ```bash
   git rm records/*/index/*.yaml
   ```

2. Run `pnpm extract:index` to regenerate from migrated evidence files.

3. Run `pnpm check` to validate all records.

4. **If `pnpm check` reports broken `local:` refs** (expected: ~221 refs):
   - Generate a list of all broken refs:
     ```bash
     pnpm check 2>&1 | grep "local:" | sort -u > /tmp/broken-local-refs.txt
     ```
   - Run the automated ref migration script (see script template below) to batch-fix all `local:` paths:
     ```bash
     node tools/migrate-local-refs.js --dry-run   # preview changes
     node tools/migrate-local-refs.js --apply     # apply changes
     ```
   - The script maps old flat paths to new surface-first paths using the surface mapping table:
     - `local:records/evidence/meta/...` → `local:records/meta/evidence/...`
     - `local:records/evidence/vnstock-data/...` → `local:records/vnstock/evidence/...`
     - `local:records/evidence/loop/...` → `local:records/meta/evidence/...`
     - `local:records/evidence/product-build/...` → `local:records/fastapi/evidence/...` or `local:records/tanstack/evidence/...`
     - `local:records/experiments/...` → `local:records/<surface>/experiments/...` (derive surface from filename)
     - `local:records/decisions/...` → `local:records/<surface>/decisions/...`
   - Review diff, then re-run `pnpm check`.

5. Repeat steps 3-4 until `pnpm check` passes cleanly.

### Automated `local:` Ref Migration Script Template

Create `tools/migrate-local-refs.js`:

```javascript
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SURFACE_MAP = {
  "records/evidence/meta": "records/meta/evidence",
  "records/evidence/loop": "records/meta/evidence",
  "records/evidence/vnstock-data": "records/vnstock/evidence",
  "records/evidence/product-build": "records/fastapi/evidence", // fastapi-specific
  "records/evidence/product": "records/product/evidence",
  "records/experiments": "records/*/experiments", // derive per-file
  "records/decisions": "records/*/decisions",
  "records/claims": "records/*/claims",
  "records/risks": "records/*/risks",
  "records/capabilities": "records/*/capabilities",
};

function findYamlFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...findYamlFiles(path));
    else if (entry.name.endsWith(".yaml")) files.push(path);
  }
  return files;
}

function migrateFile(filePath, dryRun) {
  let content = readFileSync(filePath, "utf8");
  let changed = false;
  for (const [oldPrefix, newPrefix] of Object.entries(SURFACE_MAP)) {
    const regex = new RegExp(`local:${oldPrefix.replace(/\//g, "\\/")}([^\s"']*)`, "g");
    content = content.replace(regex, (match, rest) => {
      changed = true;
      return `local:${newPrefix}${rest}`;
    });
  }
  if (changed && !dryRun) writeFileSync(filePath, content);
  return changed;
}

const dryRun = process.argv.includes("--dry-run");
const files = findYamlFiles("records");
let count = 0;
for (const file of files) {
  if (migrateFile(file, dryRun)) {
    count++;
    console.log(dryRun ? "Would fix: " + file : "Fixed: " + file);
  }
}
console.log(`${dryRun ? "Would fix" : "Fixed"} ${count} files`);
```

Note: The `records/experiments` and `records/decisions` mappings need per-file surface derivation (from the filename). Enhance the script to derive surface from the YAML `id` or filename before applying.

## Tests Before

- `extract-index` test suite was updated in phase 3.

## Refactor

- Delete stale index files.
- Fix broken `local:` refs in experiments, decisions, claims, risks.

## Tests After

- `pnpm extract:index` completes without errors
- `pnpm check` exits 0
- Index files exist in `records/<surface>/index/`

## Success Criteria

- [ ] Old flat `records/index/` directory removed or empty
- [ ] New index files created in `records/<surface>/index/`
- [ ] `pnpm extract:index` exits 0
- [ ] `pnpm check` exits 0 with no broken `local:` refs
- [ ] All index `source_refs` point to valid evidence paths

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `local:` refs in many files | `pnpm check` reports them line-by-line; batch fix with grep/sed script |
| Extractor fails on new structure | Already verified in phase 3 that tools support surface-first |
| Index entries missing after regen | Check count before/after; verify extractor walks all evidence dirs |

## Regression Gate

```bash
pnpm extract:index && pnpm check
```
