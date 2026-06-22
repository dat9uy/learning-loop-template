---
phase: 1
title: "1-install-probe"
status: pending
priority: P2
effort: "30min"
dependencies: []
---

# Phase 1: 1-install-probe

## Overview

Install `@mastra/libsql@1.13.0` at the **root** `package.json` (the brainstorm's `tools/learning-loop-mastra/package.json` reference is wrong — that file does not exist; the project has only one `package.json` at `/home/datguy/codingProjects/learning-loop-template/package.json`). Verify the native binding resolves on WSL2. Add `.gitignore` entries for the storage data directory. Document the `MASTRA_STORAGE_DRIVER` env var (`native` | `web` | `memory`) so downstream phases (Phase 5 Test 3) can branch on it.

## Why a dedicated install probe phase

The native binding (`@libsql/linux-x64-gnu`) is the only Plan 2 piece that depends on the host environment. If install fails on the operator's WSL2 distro (extremely rare on x86_64 glibc; verified by researcher A), Phase 1 surfaces it before any code is written. The fallback path (`MASTRA_STORAGE_DRIVER=memory`) is documented here so the operator can switch drivers without re-reading researcher A's report.

## Requirements

- **Functional:** `@mastra/libsql@1.13.0` (exact pin, NOT `^1.13.0`) installed at root `package.json`; `pnpm install` exits 0; `node_modules/@libsql/linux-x64-gnu/index.node` exists.
- **Non-functional:** `.gitignore` excludes storage runtime artifacts; `MASTRA_STORAGE_DRIVER` documented for downstream phases; install is reproducible (lockfile updated).

## Architecture

```
package.json (root, post-Phase 1)
├── dependencies
│   ├── @mastra/core: "1.42.0"           (existing — pinned)
│   ├── @mastra/mcp: "1.10.0"            (existing — pinned)
│   ├── @mastra/libsql: "1.13.0"         (NEW — Plan 2 — exact pin)
│   ├── @libsql/client: "0.17.4"         (NEW — Plan 2 — exact pin; direct dep for Q1.A lock)
│   └── ...
└── (no other changes)

.gitignore (post-Phase 1)
├── tools/learning-loop-mastra/data/      (NEW — runtime SQLite files)
├── **/*.db                              (NEW — defensive)
├── **/*.db-wal                          (NEW — WAL sidecar)
└── **/*.db-shm                          (NEW — shared-memory sidecar)

Environment (operator shell or CI)
└── MASTRA_STORAGE_DRIVER=native          (default; web|memory for fallback)

package.json (root, post-Phase 1)
└── scripts.test: adds 'tools/learning-loop-mastra/__tests__/*.test.cjs' to the glob
   (per BLOCKER #3 fix: picks up existing workflow-parity.test.cjs + new storage-parity.test.cjs)
```

**Version compatibility (from researcher A §1.1):**

| `@mastra/libsql` | Peer `@mastra/core` | Compatible with project's `1.42.0`? |
|---|---|---|
| `1.14.0` | `>=1.42.1-0 <2.0.0-0` | **NO** — requires >= 1.42.1 |
| `1.13.0` | `>=1.34.0-0 <2.0.0-0` | **YES** (verified install) |

Pin **exactly** `1.13.0`. The `^1.13.0` range would auto-resolve to `1.14.0` on a clean install and break the `@mastra/core@1.42.0` peer constraint.

## Related Code Files

- **Modify:** `/home/datguy/codingProjects/learning-loop-template/package.json` (add `@mastra/libsql` dep + extend `pnpm test` glob to include `*.test.cjs` under `tools/learning-loop-mastra/__tests__/`)
- **Modify:** `/home/datguy/codingProjects/learning-loop-template/.gitignore` (add storage entries)
- **Create:** `/home/datguy/codingProjects/learning-loop-template/.env.example` (optional — documents `MASTRA_STORAGE_DRIVER`)

## Implementation Steps

1. **Verify there is no `tools/learning-loop-mastra/package.json`.**
   ```bash
   ls /home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/ | grep -E '^package\.json$'
   # Expected: no output (file does not exist)
   ```
   If the file exists (it should not), abort and ask the operator — that file would change the dep resolution semantics.

2. **Install `@mastra/libsql@1.13.0` AND `@libsql/client` (direct dep for Q1.A lock) at root.**
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   pnpm add '@mastra/libsql@1.13.0' '@libsql/client@0.17.4' -w
   ```
   The `-w` flag is for workspace root (the project is a single-package repo; the flag is harmless). Verify the lockfile picked the exact pins:
   ```bash
   grep '"@mastra/libsql"' /home/datguy/codingProjects/learning-loop-template/package.json
   # Expected: "@mastra/libsql": "1.13.0"
   grep '"@libsql/client"' /home/datguy/codingProjects/learning-loop-template/package.json
   # Expected: "@libsql/client": "0.17.4"
   grep -A1 '@mastra/libsql@' /home/datguy/codingProjects/learning-loop-template/pnpm-lock.yaml | head -10
   # Expected: @mastra/libsql@1.13.0
   ```
   **Why `@libsql/client` is a direct dep (Q1.A lock, 2026-06-19):** the 2 storage workflows (Phase 3) and the substrate-direct tests (Phase 5) call `createClient` from `@libsql/client` directly, bypassing the `LibSQLStore` abstraction. `@libsql/client` is a transitive dep of `@mastra/libsql@1.13.0`, but Phase 2's `import { createClient } from "@libsql/client"` requires a direct dep to be safe (transitive deps can be hoisted, deduped, or pruned by future `pnpm install` runs — direct deps are guaranteed to resolve). Pinning `@libsql/client@0.17.4` matches the transitive version pinned by `@mastra/libsql@1.13.0` (no peer mismatch).

3. **Verify native binding resolved on WSL2.**
   ```bash
   ls /home/datguy/codingProjects/learning-loop-template/node_modules/@libsql/linux-x64-gnu/index.node
   # Expected: file exists, ~8MB
   file /home/datguy/codingProjects/learning-loop-template/node_modules/@libsql/linux-x64-gnu/index.node
   # Expected: ELF 64-bit LSB shared object, x86-64, version 1 (GNU/Linux)
   ```
   If the file does NOT exist (different platform, e.g., darwin-arm64), `@libsql/<platform>-<arch>` should auto-resolve. List the resolved platform:
   ```bash
   ls /home/datguy/codingProjects/learning-loop-template/node_modules/@libsql/
   ```

4. **Smoke-test the imports + constructor.** Create a temp script and run it to confirm `@mastra/libsql` exports `LibSQLStore` AND `@libsql/client` exports `createClient` (Q1.A lock — both are needed):
   ```bash
   cat > /tmp/libsql-smoke.mjs <<'EOF'
   import { LibSQLStore } from "@mastra/libsql";
   import { createClient } from "@libsql/client";
   import { mkdirSync } from "node:fs";
   mkdirSync("/tmp/libsql-smoke", { recursive: true });
   const s = new LibSQLStore({ id: "smoke", url: "file:/tmp/libsql-smoke/smoke.db?connection_limit=1" });
   await s.init();
   console.log("LibSQLStore init OK");
   await s.close();

   // Q1.A lock verification:
   const db = createClient({ url: "file:/tmp/libsql-smoke/smoke.db?connection_limit=1" });
   await db.execute("CREATE TABLE IF NOT EXISTS parity_records (id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL)");
   await db.execute({ sql: "INSERT INTO parity_records (id, kind, payload, created_at) VALUES (?, ?, ?, ?)", args: ["smoke-1", "smoke", "{}", new Date().toISOString()] });
   const r = await db.execute({ sql: "SELECT id FROM parity_records WHERE id = ?", args: ["smoke-1"] });
   console.log("createClient round-trip OK:", r.rows.length === 1 ? "PASS" : "FAIL");
   db.close();
   EOF
   cd /home/datguy/codingProjects/learning-loop-template
   node /tmp/libsql-smoke.mjs
   # Expected: "LibSQLStore init OK" + "createClient round-trip OK: PASS" in ~12ms
   rm -rf /tmp/libsql-smoke /tmp/libsql-smoke.mjs
   ```
   If the script fails with `Cannot find module '@mastra/libsql'` or `Cannot find module '@libsql/client'`, the install did not pick up — re-run `pnpm install`. If it fails with `SQLITE_CANTOPEN`, the `mkdirSync` ran but the URL is malformed — check the URL format. **Q1.A gate:** if `createClient` import succeeds but the round-trip fails, escalate (do not silently fall back to `LibSQLStore`).

5. **Update `.gitignore`** to exclude storage runtime artifacts:
   ```bash
   cat >> /home/datguy/codingProjects/learning-loop-template/.gitignore <<'EOF'

   # Plan 2 — Mastra LibSQL storage runtime artifacts (D5+D6)
   tools/learning-loop-mastra/data/
   **/*.db
   **/*.db-wal
   **/*.db-shm
   EOF
   ```
   Verify the entries were appended (idempotent: grep for them first; if present, skip):
   ```bash
   grep -c 'tools/learning-loop-mastra/data/' /home/datguy/codingProjects/learning-loop-template/.gitignore
   # Expected: 1
   ```

6. **Document the `MASTRA_STORAGE_DRIVER` env var.** Add to `.env.example` (create the file if absent):
   ```bash
   cat >> /home/datguy/codingProjects/learning-loop-template/.env.example <<'EOF'

   # Plan 2 — Mastra storage driver selection (D5+D6)
   # native  → file-backed LibSQL (default, production)
   # web     → @libsql/client/web (no native binding; CI fallback)
   # memory  → in-memory SQLite (CI safety net; Test 3 of storage-parity SKIPS)
   MASTRA_STORAGE_DRIVER=native
   EOF
   ```

7. **Set the env var in the current shell** so downstream phases see it:
   ```bash
   export MASTRA_STORAGE_DRIVER=native
   ```
   For persistent shell setup, add to `~/.bashrc` (operator's call; document in the PR description if not added).

8. **Update the `pnpm test` glob to include `*.test.cjs` under `tools/learning-loop-mastra/__tests__/`** (per BLOCKER #3 fix). The current glob at `package.json:17` only matches `*.test.js` under that directory, which excludes the existing `workflow-parity.test.cjs` (10 tests) and the planned `storage-parity.test.cjs`. Without this fix, Plan 1's workflow-parity harness and Plan 2's storage-parity harness are NOT picked up by `pnpm test`. Add the new glob entry:
   ```diff
   -    "test": "node --test 'tools/learning-loop-mcp/__tests__/*.test.js' '...' 'tools/learning-loop-mastra/__tests__/*.test.js' '.claude/coordination/__tests__/*.test.cjs' '.factory/hooks/__tests__/*.test.cjs'"
   +    "test": "node --test 'tools/learning-loop-mcp/__tests__/*.test.js' '...' 'tools/learning-loop-mastra/__tests__/*.test.js' 'tools/learning-loop-mastra/__tests__/*.test.cjs' '.claude/coordination/__tests__/*.test.cjs' '.factory/hooks/__tests__/*.test.cjs'"
   ```
   The added entry `'tools/learning-loop-mastra/__tests__/*.test.cjs'` picks up both `storage-parity.test.cjs` (new) and `workflow-parity.test.cjs` (Plan 1; already passing). Verify by running `pnpm test` and confirming the baseline test count increases from 1083 to 1098 (the +15 delta = existing .cjs tests now in the suite).

9. **Commit the install.**
   ```bash
   cd /home/datguy/codingProjects/learning-loop-template
   git add package.json pnpm-lock.yaml .gitignore .env.example
   git commit -m "feat(storage): install @mastra/libsql@1.13.0 + @libsql/client + storage runtime gitignore"
   ```
   Conventional commit; no AI references; no plan-id references in the message.

## Success Criteria

- [ ] `@mastra/libsql@1.13.0` (exact pin) in root `package.json` `dependencies`
- [ ] `@libsql/client@0.17.4` (exact pin) in root `package.json` `dependencies` (Q1.A lock; direct dep for `createClient`)
- [ ] `pnpm-lock.yaml` resolved `@mastra/libsql@1.13.0` and `@libsql/client@0.17.4` (exact, not range)
- [ ] `node_modules/@libsql/<platform>-<arch>/index.node` exists (native binding)
- [ ] Smoke script logs "LibSQLStore init OK" + "createClient round-trip OK: PASS" in <1s
- [ ] `.gitignore` contains `tools/learning-loop-mastra/data/`, `**/*.db`, `**/*.db-wal`, `**/*.db-shm`
- [ ] `.env.example` documents `MASTRA_STORAGE_DRIVER=native|web|memory`
- [ ] `package.json` `scripts.test` glob includes `'tools/learning-loop-mastra/__tests__/*.test.cjs'` (per BLOCKER #3 fix)
- [ ] `pnpm test` runs after glob update; baseline increases from 1083 to 1098 (verifies +15 existing .cjs tests now picked up)
- [ ] No code files created in this phase (mechanical install only)
- [ ] No `tools/learning-loop-mastra/package.json` exists (verified in step 1)

## Risk Assessment

- **Risk:** Install fails on a non-x86_64 platform (darwin-arm64, Alpine musl). **Mitigation:** the `@libsql/client` package publishes prebuilt bindings for `darwin-x64`, `darwin-arm64`, `linux-x64-gnu`, `linux-x64-musl`, `linux-arm64-gnu`, `linux-arm64-musl`, `win32-x64-msvc` (verified by researcher A §1.2). If the right binding does not auto-resolve, fall back to `MASTRA_STORAGE_DRIVER=web` (uses `@libsql/client/web`, no native binding). Document the fallback in the Phase 6 PR body.
- **Risk:** Operator's pnpm version is too old to handle `-w` flag. **Mitigation:** `-w` is a no-op for non-workspace projects; safe to omit (`pnpm add '@mastra/libsql@1.13.0'`). Document the alternative in step 2's verification.
- **Risk:** Lockfile drift from previous plans. **Mitigation:** `pnpm install` is run by `pnpm test` pre-commit hook; the lockfile stays in sync. If the operator runs into a lockfile conflict, `pnpm install --lockfile-only` regenerates it without changing `package.json`.

## Security Considerations

None. Install of a public npm package (`@mastra/libsql@1.13.0`) on a per-project `node_modules`. No new privileges, no network calls outside npm registry, no secrets.

## Next Steps

Phase 2 writes `tools/learning-loop-mastra/storage.js` (LibSQL config + `getMastraStorage()` + `getParityDb()` + `getParityDDL()` helpers — per Q1.A lock) with TDD-first 5 invariant tests (4 factory + 1 `getParityDb()`), using the install verified in this phase.
