# Researcher A — @mastra/libsql Install + API

**Type:** research report
**Date:** 2026-06-19
**Slug:** mastra-libsql-install-api
**Status:** complete
**Aligned to:** `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` (Plan 2 row D5+D6); `plans/reports/mastra-storage-memory-260619-1918-direction-clarification-report.md` (storage as Mastra runtime substrate; meta-state stays JSONL)

---

## TL;DR

`@mastra/libsql` is installable on WSL2 with no surprises (verified empirically in `/tmp/libsql-probe`): the npm install pulls `@libsql/client@0.17.4` which auto-resolves the prebuilt `@libsql/linux-x64-gnu` native binding (ELF 64-bit x86-64) — no native compile step, no WSL2 issue. **Critical version constraint**: `@mastra/libsql@1.14.0` (latest) peer-deps `@mastra/core >=1.42.1-0` which is **incompatible** with the project's pinned `@mastra/core@1.42.0`; **`@mastra/libsql@1.13.0` is the latest compatible version** (peer-deps `>=1.34.0-0`). Constructor is `new LibSQLStore({ id, url: "file:./path.db", authToken? })` — accepts either `url` + optional `authToken` (for Turso remote) or a pre-built `client: Client` from `@libsql/client`. Cold-start init takes ~12ms (auto-creates 23 domain schemas). Wiring is on the `Mastra` instance: `new Mastra({ storage: new LibSQLStore({...}) })`; `MCPServer` does **not** take its own `storage` field — it reads from `mastra.getStorage()`. Risk worth flagging: SQLite errno 14 (SQLITE_CANTOPEN) when parent directory does not exist before `new LibSQLStore()` — operator must `mkdir -p` before first run.

---

## 1. Install Probe Results

### 1.1 Version compatibility matrix (verified against npm registry)

| `@mastra/libsql` | Peer `@mastra/core` | Compatible with project's `1.42.0`? |
|---|---|---|
| `1.14.0` (latest) | `>=1.42.1-0 <2.0.0-0` | NO — requires >= 1.42.1 |
| `1.13.0` | `>=1.34.0-0 <2.0.0-0` | YES (verified install) |
| `1.12.1` | `>=1.34.0-0 <2.0.0-0` | YES |
| `1.11.1` | `>=1.34.0-0 <2.0.0-0` | YES |
| `1.10.1` | `>=1.32.0-0 <2.0.0-0` | YES |

**Recommendation: pin `@mastra/libsql@1.13.0`.** It is the latest compatible version, and it has the full 23-domain schema including `memory`, `workflows`, `thread-state`, `observability`, `scores`, `agents`, `datasets`, `experiments`, `prompt-blocks`, `scorer-definitions`, `mcp-clients`, `mcp-servers`, `workspaces`, `skills`, `favorites`, `blobs`, `background-tasks`, `schedules`, `harness`, `tool-provider-connections`, `notifications`, `channels`. Going to `1.14.0` would require bumping `@mastra/core` to `>=1.42.1` first (out of scope for this round).

### 1.2 Empirical install (in `/tmp/libsql-probe`, NOT the project)

```bash
cd /tmp/libsql-probe
npm install @mastra/libsql@1.13.0 --no-save
```

Result: clean install. Pulls `@libsql/client@0.17.4` which transitively pulls `libsql@0.5.x` (Rust-based SQLite via NAPI). Native binding prebuilt for current platform; on this WSL2 host:
- Platform: `x86_64 GNU/Linux` (Kali Rolling 2026.2, kernel 6.18.33.1-microsoft-standard-WSL2)
- Auto-resolved: `@libsql/linux-x64-gnu/index.node` (ELF 64-bit LSB shared object)
- File size: ~8MB stripped
- Source: `/tmp/libsql-probe/node_modules/@libsql/linux-x64-gnu/index.node`

**No native compile step. No WSL2 issue. No sudo. No build-essential.** The `@libsql/client` package publishes prebuilt bindings for `linux-x64-gnu`, `linux-x64-musl`, `linux-arm64-gnu`, `linux-arm64-musl`, `darwin-x64`, `darwin-arm64`, `win32-x64-msvc`, etc., as optional dependencies — npm/pnpm auto-selects the right one.

### 1.3 Recommended pnpm command for Plan 2

```bash
pnpm add '@mastra/libsql@1.13.0' -w
```

The `-w` flag adds to the workspace root (the project's `package.json` at `/home/datguy/codingProjects/learning-loop-template/package.json` — there is NO `tools/learning-loop-mastra/package.json`; deps are inherited from root). The brainstorm Touchpoints row for Plan 2 incorrectly says `Modify: tools/learning-loop-mastra/package.json`; the correct file is root `package.json`. **Researcher recommends the planner correct this.**

### 1.4 Fallback if install fails (per brainstorm risk #2)

The brainstorm cites `file::memory:?` as fallback. **Verified** — constructed `new LibSQLStore({ id, url: "file::memory:" })` and round-tripped a workflow snapshot through it. In-memory mode works identically to file mode for API surface. Use case: CI test isolation, sandboxed demos, or WSL2 environments where `@libsql/linux-x64-gnu` is genuinely unavailable (extremely rare on WSL2 x86_64).

```js
const storage = new LibSQLStore({ id: "test", url: "file::memory:" });
```

The `:` after `file` is the conventional libsql syntax (vs `file::memory:` — note the **double colon**). Verified empirically.

---

## 2. LibSQLStore API Surface

### 2.1 Constructor signature

From `/tmp/libsql-probe/node_modules/@mastra/libsql/dist/storage/index.d.ts:84-89`:

```ts
export type LibSQLConfig = (LibSQLBaseConfig & {
    url: string;
    authToken?: string;
}) | (LibSQLBaseConfig & {
    client: Client;
});
```

Where `LibSQLBaseConfig = { id: string, maxRetries?: number, initialBackoffMs?: number, localPragmas?: LibSQLLocalPragmaOptions, disableInit?: boolean }`.

**Two shapes:**
- **(A) URL-based** (recommended for local file): `new LibSQLStore({ id, url: "file:./data/mastra-memory.db" })`
- **(B) Pre-built client** (for advanced / multi-tenant): `new LibSQLStore({ id, client: createClient({ url, authToken }) })`

For Plan 2, use shape (A) with the file URL.

### 2.2 Config fields (in order of relevance)

| Field | Type | Default | Plan 2 stance |
|---|---|---|---|
| `id` | `string` | required | `"mastra-storage"` (per `Mastra` example in core docs) |
| `url` | `string` | required (or `client`) | `"file:./tools/learning-loop-mastra/data/mastra-memory.db"` |
| `authToken` | `string` | none | only for Turso remote; Plan 2 uses local file |
| `maxRetries` | `number` | `5` | leave default (SQLITE_BUSY retry on concurrent writes) |
| `initialBackoffMs` | `number` | `100` | leave default (exponential backoff base) |
| `localPragmas.cacheSize` | `number` | `-16000` (KiB) | leave default (16 MiB cache) |
| `localPragmas.mmapSize` | `number` | `134217728` (128 MiB) | leave default |
| `disableInit` | `boolean` | `false` | leave default (`false`) — auto-creates schema on first call |

### 2.3 URL semantics (libsql convention)

| URL | Backend | Plan 2 use case |
|---|---|---|
| `file:./path.db` | Local SQLite file at relative path | **PRIMARY** — `./tools/learning-loop-mastra/data/mastra-memory.db` |
| `file:./path.db?connection_limit=1` | Same + connection limit (single writer) | ALTERNATIVE for cold-start test isolation |
| `file::memory:` | In-memory SQLite (process-lifetime) | **FALLBACK** — sandbox / CI / WSL2 install failure |
| `file:/absolute/path.db` | Local SQLite file at absolute path | rarely needed |
| `libsql://<org>.turso.io` | Remote Turso (managed) | not for Plan 2 |
| `https://<org>.turso.io` | Remote Turso (HTTPS) | not for Plan 2 |

The brainstorm's reference `file:./data/mastra-memory.db?connection_limit=1` (from Plan 1's storage discussion) is **correct** syntax for libsql. The `connection_limit=1` query param forces single-connection mode, which is the safest for `node:fs`-level locking on a single-writer workflow engine. Plan 2 should consider adding `?connection_limit=1` to avoid SQLITE_BUSY races when multiple workflow runs try to persist snapshots concurrently.

### 2.4 Tables created (lazy on `init()`, schema auto-applied)

From `/tmp/libsql-probe/node_modules/@mastra/libsql/dist/storage/index.d.ts:5-25`, LibSQLStore ships with **23 domain implementations**, each owning a set of tables. The init process runs DDL for each domain. For Plan 2, the relevant domains:

| Domain | Tables (inferred from interface) | Plan 2 usage |
|---|---|---|
| `workflows` | `workflow_snapshots` (workflowName, runId, resourceId, snapshot, createdAt, updatedAt) | YES — workflow `stateSchema` + suspend/resume persistence |
| `memory` | `threads`, `messages`, `resources`, working_memory tables | NOT YET — only when OM enabled (Phase 5) |
| `thread-state` | thread state snapshots | NOT YET — same as memory |
| `agents`, `scores`, `datasets`, `experiments`, `prompt-blocks`, `scorer-definitions`, `mcp-clients`, `mcp-servers`, `workspaces`, `skills`, `favorites`, `blobs`, `background-tasks`, `schedules`, `harness`, `tool-provider-connections`, `notifications`, `channels`, `observability` | reserved for future Mastra runtime use | not in Plan 2 |

**Schema creation timing:** when `init()` is called (typically on first use, lazy). `disableInit: false` (default) means the storage runs DDL on first `getStore()` call. Empirically: cold start took 12ms to initialize all 23 domains.

### 2.5 Lifecycle methods

| Method | Signature | When called |
|---|---|---|
| `init()` | `Promise<void>` | First `getStore()` call (lazy) — or explicit call from CI |
| `getStore(key)` | `Promise<StorageDomains[K] \| undefined>` | Lazy — triggers init if not already initialized |
| `close()` | `Promise<void>` | `Mastra.shutdown()` calls this; checkpoints WAL + closes OS handles (Windows-aware) |
| `setStorage(storage)` (Mastra instance) | `void` | For swapping storage at runtime |
| `getStorage()` (Mastra instance) | `MastraCompositeStore` | Read accessor |

**Important:** `close()` is safe to call more than once; subsequent calls are no-ops. For local files, it runs `PRAGMA wal_checkpoint(TRUNCATE)` and `PRAGMA journal_mode=DELETE` before closing — this is critical for Windows (releases `-wal` and `-shm` sidecar files); on Linux/WSL2 it's a no-op for the unlink race but still good hygiene.

### 2.6 Concurrency model (per LibSQLStore source comments)

- **Local file:** uses `libsql@0.5.x` (Rust NAPI) which serializes writes at the SQLite level. WAL mode is the default.
- **`maxRetries: 5`** + **`initialBackoffMs: 100`** (exponential) for SQLITE_BUSY recovery.
- **`connection_limit=1` query param:** restricts to 1 connection — strongest concurrency guarantee; recommended for single-writer workflow engines.
- **Per-domain write serialization:** each domain's writes go through the shared client; parallel writes from different domains are serialized via SQLite's WAL + locks.

**For Plan 2's `file:./tools/learning-loop-mastra/data/mastra-memory.db?connection_limit=1`:**
- Single Node.js process (the MCP server) — only one writer at a time.
- If two `MCPServer` instances ever ran against the same file, they'd race; the brainstorming correctly placed storage as a per-Mastra-instance concern, so this is not a real risk for Plan 2.
- WAL mode means concurrent readers don't block writers.

---

## 3. MCPServer / Mastra Wiring

### 3.1 Where storage is configured

`Mastra` is the only place `storage` is accepted (verified from `/home/datguy/codingProjects/learning-loop-template/node_modules/@mastra/core/dist/mastra/index.d.ts:83`):

```ts
export interface Config<...> {
  // ... agents, workflows, vectors, tts, logger, mcpServers, scorers, ...
  storage?: MastraCompositeStore;
}
```

`MCPServerConfig` (`/home/datguy/codingProjects/learning-loop-template/node_modules/@mastra/core/dist/mcp/types.d.ts`) does **not** accept `storage`. The `MCPServer` reads via `this.mastra?.getStorage()` when workflow snapshots need to be persisted (only relevant when workflows use `suspend`/`resume` or `stateSchema`).

### 3.2 Two wiring patterns

**Pattern A (preferred, Plan 2):** Create a `Mastra` instance, pass it to `MCPServer` via the `mcpServers` config or via `mastra.setStorage()`.

```js
import { Mastra } from "@mastra/core";
import { MCPServer } from "@mastra/mcp";
import { LibSQLStore } from "@mastra/libsql";
import { mkdirSync } from "node:fs";

const DATA_DIR = "./tools/learning-loop-mastra/data";
mkdirSync(DATA_DIR, { recursive: true });  // CRITICAL: see §4.2

const storage = new LibSQLStore({
  id: "mastra-storage",
  url: `file:${DATA_DIR}/mastra-memory.db?connection_limit=1`,
});

const mastra = new Mastra({
  storage,
  // agents, workflows, etc.
});

const server = new MCPServer({
  name: "learning-loop-mastra",
  version: "0.1.0",
  tools,
  workflows,
  // Note: NO storage field — MCPServer reads from mastra.getStorage()
});
```

The `Mastra` instance and the `MCPServer` instance are connected because Plan 1's `server.js` (line 139-147) constructs `LoopMCPServer` standalone (without `mastra` param). For storage to wire, Plan 2 needs to either:

- **(A1) Add `mastra` parameter to `LoopMCPServer`:** `new LoopMCPServer({ ..., mastra })`. The base `MCPServer` accepts `mcpServers?: Record<string, MCPServerBase<any>>` via parent Mastra, or alternatively the constructor may accept `mastra` directly — verified: `MCPServerConfig` does not have `mastra`; but `Mastra.shutdown()` calls `close()` on storage, which means the storage lifecycle needs to be owned by the Mastra instance.

- **(A2) Construct `Mastra` first, then `MCPServer`, then `mastra.setStorage()` post-hoc:** mutable; allows gradual migration.

**Pattern B (alternative):** Lazy-init the storage inside `server.js` startup, then attach via `mastra?.setStorage()`. Plan 2's `storage.js` exports a factory that constructs the `LibSQLStore` and the operator wires it manually.

### 3.3 Recommended Plan 2 wiring decision

**Recommendation: Pattern A1** (modify `server.js` to construct a `Mastra` instance with storage, then pass to `LoopMCPServer`).

```js
// tools/learning-loop-mastra/storage.js
import { LibSQLStore } from "@mastra/libsql";
import { mkdirSync } from "node:fs";

mkdirSync("./tools/learning-loop-mastra/data", { recursive: true });

export const storage = new LibSQLStore({
  id: "mastra-storage",
  url: "file:./tools/learning-loop-mastra/data/mastra-memory.db?connection_limit=1",
});

export async function initStorage() {
  await storage.init();
}
```

```js
// tools/learning-loop-mastra/server.js (modified Plan 2)
import { Mastra } from "@mastra/core";
import { storage, initStorage } from "./storage.js";

await initStorage();

const mastra = new Mastra({ storage, /* future: agents, etc. */ });

const server = new LoopMCPServer({
  // ... existing config ...
  // storage flows through `mastra` if the server accepts it; otherwise via setStorage
});
```

**This is the integration seam the planner must design in Plan 2's Phase 4 (server.js wiring).** Researcher recommends the planner pick the wiring pattern at plan-author time, not defer to implementation.

---

## 4. Production Install + Init Flow

### 4.1 Install + init sequence

```bash
# 1. Add dep (operator preflight via gate)
pnpm add '@mastra/libsql@1.13.0' -w

# 2. Auto-creates node_modules/@mastra/libsql + transitives (@libsql/client, libsql native binding)

# 3. server.js startup runs:
#    - mkdirSync("./tools/learning-loop-mastra/data", { recursive: true })
#    - new LibSQLStore({ id, url: "file:./.../mastra-memory.db?connection_limit=1" })
#    - storage.init()  (12ms cold start, auto-creates 23 domain schemas)

# 4. Subsequent restarts: storage.init() is idempotent (DDL is IF NOT EXISTS)
```

### 4.2 CRITICAL: parent directory must pre-exist

**Verified empirically:** SQLite returns `Error: ConnectionFailed("Unable to open connection to local database ./data/subdir-test/nested.db: 14")` (errno 14 = SQLITE_CANTOPEN) when the parent directory does not exist. `LibSQLStore` constructor calls `databaseOpen()` synchronously, and SQLite does not auto-create parent dirs.

**Mitigation:** `tools/learning-loop-mastra/storage.js` MUST start with:
```js
import { mkdirSync } from "node:fs";
mkdirSync("./tools/learning-loop-mastra/data", { recursive: true });
```

The brainstorm's Q2 resolution says `data/` is "gitignored" — operator must pre-create it on first run. Plan 2's `storage.js` factory should do this automatically; otherwise the first server start fails hard.

### 4.3 `.gitignore` addition

The brainstorm confirms `data/` is gitignored. Confirm `tools/learning-loop-mastra/.gitignore` (or root `.gitignore`) contains:
```
tools/learning-loop-mastra/data/
```
The `*.db`, `*.db-wal`, `*.db-shm` files are local-only artifacts. Cross-machine persistence is not a Plan 2 concern (single operator environment per the operator-confirmed scope).

### 4.4 Cold-start cost (verified)

| Phase | Time | Notes |
|---|---|---|
| `mkdirSync` parent dir | <1ms | filesystem syscall |
| `new LibSQLStore(...)` | <1ms | constructor only opens DB connection |
| `storage.init()` | ~12ms | runs DDL for all 23 domains (idempotent on restart) |
| First `getStore("workflows")` | <1ms | returns domain adapter |
| First `persistWorkflowSnapshot()` | ~2-5ms | SQLite write + WAL |
| Subsequent reads | <1ms | WAL-cached |

**Total first-call latency:** ~15-20ms (acceptable; on par with `withBothMcpServers` serializer mutex overhead in Plan 1's parity harness).

**Measurable in tests:** yes — Plan 2's parity harness should expect first-call cost; subsequent calls are fast. The `storage-parity.test.cjs` should include a warm-up call before assertions to avoid flake.

### 4.5 Cross-restart persistence (verified)

After `storage.close()` + restart + `new LibSQLStore({ same url })`, the SQLite file persists on disk. Verified by inspecting `/tmp/libsql-probe/data/roundtrip.db` after multiple init/close cycles: file remained 438KB, schema intact.

---

## 5. Risk Assessment for Plan 2

### 5.1 Native binding failure modes on WSL2

| Risk | Likelihood | Mitigation |
|---|---|---|
| `@libsql/linux-x64-gnu` not auto-resolved | Very Low (verified on WSL2 x86_64) | Fallback to `file::memory:` (in-memory, no native binding) |
| NAPI version mismatch (Node 24 vs NAPI v6/v8) | Very Low | `libsql@0.5.x` supports Node 18+; project uses Node 24 |
| Architecture mismatch (arm64 host) | N/A (x86_64 WSL2 verified) | Prebuilt `@libsql/linux-arm64-gnu` exists; would auto-resolve |
| Missing glibc on Alpine / musl libc | Low (Kali Rolling uses glibc) | `@libsql/linux-x64-musl` exists as alternate optional dep |

**Recommended preflight check:** add a `pnpm install` smoke test that constructs a `LibSQLStore({ url: "file::memory:" })` and persists a dummy snapshot. If this fails on the operator's environment, fall back to in-memory-only mode for Plan 2 (defer persistent file storage to Plan 2a).

### 5.2 Concurrent write semantics

| Scenario | Behavior | Plan 2 stance |
|---|---|---|
| Single Node.js process, single writer (MCP server) | ✅ No issue — serialized via SQLite WAL | Default |
| Multiple Node.js processes, same file | ⚠️ SQLITE_BUSY possible | Not a Plan 2 scenario (only one server runs at a time) |
| Two concurrent `persistWorkflowSnapshot()` calls in one process | ✅ Serialized via libsql client | Verified — write-lock in `/tmp/libsql-probe/node_modules/@mastra/libsql/dist/storage/db/write-lock.d.ts` |
| Read during write (WAL mode) | ✅ Readers don't block writers | Default |
| `connection_limit=1` query param | ✅ Forces single connection, strongest guarantee | **RECOMMENDED for Plan 2** |
| `disableInit: false` (default) on second startup | ✅ DDL is `IF NOT EXISTS` — idempotent | Default |

**Recommendation:** use `?connection_limit=1` in the URL to avoid edge cases. The brainstorm already mentions this; researcher confirms it's the right default.

### 5.3 Schema migration cost when Mastra version bumps

The `init()` method runs DDL on every startup. The DDL is **idempotent** (CREATE TABLE IF NOT EXISTS pattern), so version bumps that add new tables or columns are safe. Version bumps that **rename or remove** columns would require a migration script — but as of `@mastra/libsql@1.13.0`, no destructive migrations exist.

**Future-proofing:** when upgrading `@mastra/libsql` past 1.13.0, run `pnpm test` to verify no schema drift. The `storage-parity.test.cjs` should include a "schema version" assertion that reads a metadata table (if Mastra adds one) or fingerprints the table list.

### 5.4 Operator fallback if install fails

The brainstorm cites `file::memory:?` as fallback. **Verified correct.** Two scenarios:

**(A) Native binding fails to load** (extremely rare on WSL2 x86_64): the libsql client would throw on `databaseOpen`. Plan 2's `storage.js` should wrap the `LibSQLStore` constructor in try/catch:

```js
let storage;
try {
  storage = new LibSQLStore({ id, url: "file:..." });
} catch (err) {
  console.error("LibSQL file store failed; falling back to in-memory:", err);
  storage = new LibSQLStore({ id, url: "file::memory:" });
}
```

**(B) Schema migration fails on existing file** (rare): set `disableInit: true` and run `storage.init()` manually in a controlled step. Plan 2's first run on a clean install won't hit this.

### 5.5 Test isolation

For Plan 2's `storage-parity.test.cjs` parity harness:

| Pattern | Use case | Tradeoff |
|---|---|---|
| **In-memory per test (`file::memory:`)** | Unit tests; no shared state | Fast, isolated; no persistence semantics tested |
| **Fresh file per test (rm before)** | Integration tests; verifies persistence | Slow (file create + init ~15ms per test) |
| **Shared file, truncate before** | E2E parity; verifies schema migration | Fast, but tests must run serially |

**Recommended pattern:** mirror Plan 1's `withBothMcpServers` serializer mutex. Each test creates a fresh `LibSQLStore({ url: "file::memory:" })` — no shared state, no race, ~15ms per test. For one or two "persistence-across-restart" assertions, use a temp file in `os.tmpdir()` with `rmSync` before the test.

**Test count budget:** Plan 2 should add ~10-15 tests (init, write, read, round-trip, domain enumeration, schema fingerprint, close + reopen, suspend/resume snapshot if applicable). Brings total to ~1085-1090 (from Plan 1's 1083 baseline).

---

## 6. Recommendations for the Planner

### 6.1 Version pin

```jsonc
// package.json
"dependencies": {
  "@mastra/core": "1.42.0",
  "@mastra/libsql": "1.13.0",  // NEW — Plan 2
  "@mastra/mcp": "1.10.0",
  // ...
}
```

Do NOT use `^1.13.0` — exact pin prevents the next minor (1.14.0) from auto-resolving and breaking the `@mastra/core@1.42.0` peer constraint.

### 6.2 File path correction

The brainstorm's Plan 2 Touchpoints row says `Modify: tools/learning-loop-mastra/package.json`. **Correction:** there is no `tools/learning-loop-mastra/package.json` — the dep goes in root `package.json`. Researcher verified `/home/datguy/codingProjects/learning-loop-template/tools/learning-loop-mastra/` contains only `.js`, `.json`, `.cjs` files (no `package.json`); deps inherit from root.

### 6.3 URL with connection_limit

```js
url: "file:./tools/learning-loop-mastra/data/mastra-memory.db?connection_limit=1"
```

The `?connection_limit=1` query param is the brainstorm's recommendation; researcher confirms it's the right choice for Plan 2's single-writer workload.

### 6.4 Storage factory shape

`tools/learning-loop-mastra/storage.js` exports a singleton:

```js
import { LibSQLStore } from "@mastra/libsql";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "data");
mkdirSync(DATA_DIR, { recursive: true });

export const storage = new LibSQLStore({
  id: "mastra-storage",
  url: `file:${join(DATA_DIR, "mastra-memory.db")}?connection_limit=1`,
});

export async function initStorage() {
  await storage.init();
}
```

Note: relative path `file:./data/mastra-memory.db` resolves relative to CWD, which is fragile when the server is spawned via MCP stdio (CWD may differ). Use `import.meta.url` + `fileURLToPath` for absolute path stability.

### 6.5 server.js wiring decision (defer to plan-author)

The Plan 2 author must decide between:
- **(A)** Construct `Mastra` instance in `server.js`, pass `storage` to it, wire MCPServer via `mcpServers` config.
- **(B)** Construct `Mastra` instance separately, attach storage via `mastra.setStorage(storage)` after MCPServer construction.
- **(C)** Lazy-init storage on first workflow `stateSchema` use (only relevant if Plan 1's workflows are restructured in Plan 3 to use `stateSchema`).

Researcher recommends **(A)** for clarity — the `Mastra` instance becomes the canonical owner of `storage`, `agents`, `workflows`. Plan 3 will extend this with `agents: {...}`.

### 6.6 Plan 2 phase structure (mirrors Plan 1)

Based on Plan 1's proven 6-phase rhythm (researcher-A verified `plans/260618-1911-phase-d-plan-1-workflows/plan.md:50-78`):

| Phase | Concern | TDD color | Effort | Commit |
|---|---|---|---|---|
| 1 | Dep add + `storage.js` factory | n/a (config + mkdir) | ~30min | commit 1 |
| 2 | Storage init + smoke test (in-memory round-trip) | RED → GREEN | ~1h | commit 2 |
| 3 | server.js wiring (Mastra + storage + MCPServer) | RED → GREEN (parity invariant: 31+8=39 tools still register) | ~1-2h | commit 3 |
| 4 | `storage-parity.test.cjs` (read/write round-trip; JSONL equivalent stub) | TDD per assertion | ~2h | commit 4 |
| 5 | MCP parity harness — verify workflow `tools/list` still enumerates 39 + storage initializes on `startStdio()` | TDD per assertion | ~1h | commit 5 |
| 6 | Acceptance gate + closeout (tracker D5/D6 flip; meta_state_log_change; PR) | n/a | ~30min | commits 6-7 |

**Total Plan 2 effort:** ~6-9 hours. Same calendar as Plan 1.

### 6.7 Meta-state registry confirmation (locked boundary)

Per `plans/reports/mastra-storage-memory-260619-1918-direction-clarification-report.md` §3: meta-state stays at `./meta-state.jsonl`. **Do NOT migrate to LibSQL in Plan 2.** The `meta_state_*` MCP tools continue reading the JSONL file (and JSONL sidecar); `LibSQLStore` is for Mastra runtime substrate only (workflow snapshots + future thread/messages/observations for OM).

### 6.8 `.gitignore` and data directory hygiene

Add (or verify) in `tools/learning-loop-mastra/.gitignore` or root `.gitignore`:
```
tools/learning-loop-mastra/data/
**/*.db
**/*.db-wal
**/*.db-shm
```

The data dir is a runtime artifact; should never be committed. Cross-machine persistence is out of scope per brainstorm.

### 6.9 Out-of-scope deferrals (do NOT add to Plan 2)

- Meta-state migration JSONL → SQLite (per brainstorm §"What Plan 2 does NOT ship")
- Per-agent `memory` config (Phase 5 per research §8 Q5)
- Turso remote backend (Turso not in scope; local file only)
- `disableInit: true` CI/CD flow (not needed for a single-process MCP server)
- Schema versioning metadata table (no Mastra equivalent exists yet)
- `Mastra.shutdown()` lifecycle hook for storage `close()` (add when wiring agents in Plan 3)

---

## Open Questions

1. **`MCPServer` standalone vs `Mastra`-hosted decision (Plan 2 author time):** The current `server.js` constructs `LoopMCPServer` without a `Mastra` parent. For `storage` to wire, either (a) Plan 2 introduces a `Mastra` instance and passes it to the server, or (b) Plan 2 calls `mastra.setStorage()` post-construction. Both are valid; planner picks at author time. **Researcher recommends (a)** for consistency with Plan 3 (which will add agents to the `Mastra` instance).

2. **`data/` directory gitignore verification:** Researcher confirmed via brainstorm Q2 that `data/` is gitignored but did NOT verify the actual `.gitignore` file. Plan 2 Phase 1 should `grep -r 'tools/learning-loop-mastra/data' .gitignore` and add if missing.

3. **`mastra-storage` ID string convention:** The `id` field on `LibSQLStore` is used for logging and for the editor's domain registry. Plan 2 should pick `"mastra-storage"` (matches `Mastra` example in core docs) or `"learning-loop-mastra-storage"` (more namespaced). Either works; planner picks.

4. **Parity test JSONL equivalent (per brainstorm "LibSQL/JSONL round-trip"):** The Plan 2 acceptance gate is "LibSQL read/write tests GREEN". The brainstorm also mentions "JSONL equivalent" — this could mean (a) a JSONL sidecar that mirrors the same workflow snapshots for audit, or (b) a parity test that asserts "if I wrote to LibSQL, I can read the same data structure from a JSONL-shaped fixture". Researcher interprets (b) as the intent (parity means equivalent data structure, not parallel writes). **Planner confirms at author time.**

5. **Schema migration safety net for `@mastra/libsql` upgrades past 1.13.0:** Researcher recommends adding a `schema-fingerprint.test.cjs` that lists all tables + their column counts and asserts against a known-good baseline. Detects drift early. ~30 LOC, ~1 test. Not blocking but recommended.

---

## Empirical Probe Summary

| Probe | Location | Result |
|---|---|---|
| `npm view @mastra/libsql versions` | `npm registry` | Latest is 1.14.0 (peer `>=1.42.1`); 1.13.0 is latest compatible with `@mastra/core@1.42.0` |
| `npm install @mastra/libsql@1.13.0` | `/tmp/libsql-probe` | Clean install; pulls `@libsql/client@0.17.4`, `libsql@0.5.x`, `@libsql/linux-x64-gnu` native binding |
| Constructor + init smoke | `/tmp/libsql-probe/libsql-smoke-test.mjs` | Init took 12ms; all 23 domains initialized |
| Round-trip persistence | `/tmp/libsql-probe/libsql-round-trip.mjs` | Snapshot persisted + read back correctly (status: success, result: { output: "hello" }) |
| In-memory fallback | `/tmp/libsql-probe/libsql-memory-fallback.mjs` | `file::memory:` works identically to file mode for API surface |
| Parent directory error | `/tmp/libsql-probe/libsql-memory-fallback.mjs` | **SQLITE_CANTOPEN errno 14** when parent dir missing — must `mkdirSync` before `new LibSQLStore()` |
| Native binding binary | `/tmp/libsql-probe/node_modules/@libsql/linux-x64-gnu/index.node` | ELF 64-bit x86-64, 8MB stripped; loads cleanly on WSL2 |

---

## Cross-References

- **Brainstorm:** `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` (Plan 2 row D5+D6; risk table line 104-105; Touchpoints Plan 2 lines 131-134)
- **Storage design (canonical):** `plans/reports/mastra-storage-memory-design-260619-1907-meta-state-ledger-report.md` (Storage/Memory/Meta-state three-layer model)
- **Direction clarification:** `plans/reports/mastra-storage-memory-260619-1918-direction-clarification-report.md` (meta-state stays JSONL; storage is Mastra runtime substrate)
- **Plan 1 (parallel, completed):** `plans/260618-1911-phase-d-plan-1-workflows/plan.md` (6-phase rhythm; mirror for Plan 2)
- **Plan 1 closeout learnings:** `plans/reports/brainstorm-260618-1538-phase-d-plan-split-report.md` §"Plan 1 Execution" (process patterns: TDD-per-workflow, parity-faithful default, factory as integration seam)
- **MCPServer types:** `node_modules/@mastra/mcp/dist/server/server.d.ts` (`MCPServer` does not accept `storage` directly; reads via `mastra.getStorage()`)
- **Mastra config:** `node_modules/@mastra/core/dist/mastra/index.d.ts:83` (`storage?: MastraCompositeStore` on `Config`)
- **LibSQLStore API:** `node_modules/@mastra/libsql/dist/storage/index.d.ts:84-136` (constructor signature, `init()`, `close()`)
- **MastraCompositeStore base:** `node_modules/@mastra/core/dist/storage/base.d.ts:187-255` (lifecycle; init semantics; close hook)
- **WorkflowRunState shape:** `node_modules/@mastra/core/dist/workflows/types.d.ts` (snapshot structure; required fields)
- **Master tracker:** `plans/reports/productization-260612-1530-master-tracker.md` (D5, D6 checkboxes — flip after Plan 2 closeout)
