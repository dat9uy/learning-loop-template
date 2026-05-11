---
phase: 1
title: "Bootstrap and UI Surfaces"
status: pending
priority: P2
effort: "2-3h"
dependencies: []
---

# Phase 1: Bootstrap and UI Surfaces

## Context Links

- Brainstorm: `plans/reports/brainstorm-260511-1900-product-shape-bootstrap.md`
- Parent plan: `plans/260511-0030-fastapi-reference-build/`
- Existing API entry: `product/api/src/main.py`
- Existing web router: `product/web/src/router.tsx`
- Existing search endpoint contract: `plans/260511-0030-fastapi-reference-build/phase-02b-symbol-search-vci-reroute.md`

## Overview

Skill phase. Ship the run-substrate and UI surfaces operator needs to walk the product end-to-end. Three concerns: (1) dev scripts so `pnpm dev:api` / `pnpm dev:web` start the servers; (2) `/` landing route + symbol-search UI exercising the phase-2b `/reference/search` endpoint; (3) `<Link>` navigation from equity list to company detail. No styling. No new deps.

## Key Insights

- API already binds `localhost:8000`, CORS allows `:3000` and `:5173`. Vite dev default is `:5173`. No CORS edit needed.
- `reference-client.ts` defaults `apiBaseUrl` to `http://localhost:8000`. Already works.
- Web has no `dev` script; `vite.config.ts` exists and uses `@vitejs/plugin-react`. Adding `"dev": "vite"` is sufficient.
- API has no `dev` script. Easiest path: add `pnpm dev:api` at the root `package.json` that runs `cd product/api && uv run uvicorn src.main:app --reload --port 8000`.
- Combined `pnpm dev` can use `pnpm` parallel run via `&` or a doc note. Avoid `concurrently` dep (no new deps constraint).

## Requirements

- Functional: Operator runs `pnpm dev:api` + `pnpm dev:web`, opens `http://localhost:5173/`, sees a landing page with title + search input + link to equity list. Search input calls `/reference/search`. Each result links to company detail. Equity list rows link to company detail.
- Non-functional: No styling beyond unstyled HTML. No new third-party deps. No record edits.

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│ Root package.json                                         │
│   scripts:                                                 │
│     dev:api  → cd product/api && uv run uvicorn ...        │
│     dev:web  → cd product/web && vite                     │
│     dev      → documented two-terminal flow (README)       │
└────────────────────────────────────────────────────────────┘
                │                              │
                ▼                              ▼
┌─────────────────────────────┐   ┌──────────────────────────┐
│ product/api  (unchanged)    │   │ product/web              │
│  uvicorn :8000              │   │   vite dev :5173         │
│  /reference/equity          │   │   / (NEW landing route)  │
│  /reference/company/{sym}   │   │   /reference/equity      │
│  /reference/search          │   │   /reference/company/$sym│
└─────────────────────────────┘   │   /reference/search (opt)│
                                  └──────────────────────────┘
                                            │
                                            ▼
                                  ┌──────────────────────────┐
                                  │ Components               │
                                  │   LandingPage  (NEW)     │
                                  │   SearchBox    (NEW)     │
                                  │   EquityTable  (NAV add) │
                                  │   CompanyDetail (unchg)  │
                                  │ lib/reference-client.ts  │
                                  │   fetchSearchSymbols(q)  │
                                  │     (NEW helper)         │
                                  └──────────────────────────┘
```

## Related Code Files

- Modify: `package.json` (root — add `dev:api`, `dev:web`, `dev`)
- Modify: `product/web/package.json` (add `dev` script → `vite`)
- Modify: `product/web/src/router.tsx` (register new `/` and optional `/reference/search` routes)
- Modify: `product/web/src/components/EquityTable.tsx` (wrap `symbol` cell in `<Link>`)
- Modify: `product/web/src/lib/reference-client.ts` (add `fetchSearchSymbols(q)`)
- Create: `product/web/src/routes/index.tsx` (landing route — title, link to equity, search box)
- Create: `product/web/src/components/SearchBox.tsx` (input + result table)
- Create: `product/api/README.md`
- Create: `product/web/README.md`

## Implementation Steps

1. Read brainstorm report and existing files listed under Related Code Files.
2. Pre-flight: `product/api/.venv/bin/python -c 'import vnstock_data'`. If fails, STOP and report.
3. Add scripts to root `package.json`:
   - `"dev:api": "cd product/api && uv run uvicorn src.main:app --reload --port 8000"`
   - `"dev:web": "cd product/web && pnpm dev"`
   - `"dev": "pnpm /^dev:/ --parallel"` (pnpm built-in pattern) OR document two-terminal in README and skip combined script (KISS).
4. Add `"dev": "vite"` to `product/web/package.json` scripts.
5. Add `fetchSearchSymbols(q: string)` to `product/web/src/lib/reference-client.ts`:
   - Calls `${apiBaseUrl}/reference/search?q=${encodeURIComponent(q)}`.
   - Returns `DataFrameEnvelope<EquityRow>`.
6. Create `product/web/src/components/SearchBox.tsx`:
   - Controlled `<input>` + submit. On submit, calls `fetchSearchSymbols`, renders result rows.
   - Each result row's `symbol` is `<Link to={companyRoutePath} params={{symbol}}>`.
7. Modify `product/web/src/components/EquityTable.tsx`:
   - When rendering the `symbol` column, wrap value in `<Link to={companyRoutePath} params={{symbol: row.symbol}}>`.
   - Other columns render plain text as today.
8. Create `product/web/src/routes/index.tsx`:
   - Exports `indexRoutePath = '/'`, `IndexRoute` component.
   - `IndexRoute` renders title, `<Link>` to `/reference/equity`, `<SearchBox>`.
9. Modify `product/web/src/router.tsx`:
   - Import `indexRoutePath`, `IndexRoute`.
   - Add `indexRoute = createRoute({ getParentRoute: () => rootRoute, path: indexRoutePath, component: IndexRoute })`.
   - Include in `rootRoute.addChildren([indexRoute, equityReferenceRoute, companyReferenceRoute])`.
10. Create `product/api/README.md` documenting: `pnpm bootstrap:api` (parent plan), `pnpm dev:api`, port `:8000`, `/health`.
11. Create `product/web/README.md` documenting: `pnpm install` (one-time), `pnpm dev`, port `:5173`, `VITE_REFERENCE_API_BASE_URL` env var (default `http://localhost:8000`).
12. Smoke-run pre-flight (skill phase boundary — start each server briefly to confirm it boots, do NOT capture data; this is import-level confirmation):
    - `pnpm dev:api` → curl `localhost:8000/health` → expect `{"status":"ok"}`. Stop server.
    - `pnpm dev:web` → curl `localhost:5173/` → expect 200 with HTML. Stop server.
    - These are dev-server-up checks; they do NOT capture vnstock data. If unsure, defer to operator in phase 2.
13. Run web tests (`cd product/web && pnpm test`) — existing smoke tests must still pass.
14. Run `pnpm validate:records` + `pnpm check` — must pass (confirms no record edits).

## Pre-Drafted Constraint Prompt (for cook handoff)

```text
Task: Add dev scripts and landing/search UI surfaces for the FastAPI Reference Build.

Work context: /home/datguy/codingProjects/learning-loop-template

Read first:
- plans/reports/brainstorm-260511-1900-product-shape-bootstrap.md
- plans/260511-1900-product-shape-bootstrap/plan.md
- plans/260511-1900-product-shape-bootstrap/phase-01-bootstrap-and-ui-surfaces.md
- product/api/src/main.py
- product/api/src/routers/reference.py
- product/web/src/router.tsx
- product/web/src/lib/reference-client.ts
- product/web/src/components/EquityTable.tsx
- product/web/package.json
- package.json (root)

Pre-flight check (MUST pass before any code):
- Run: product/api/.venv/bin/python -c 'import vnstock_data'
- If this fails, STOP. Report: "Bootstrap missing. Run pnpm bootstrap:api and retry."
- Do NOT run scripts/install-vnstock.sh or any installer.

Goal:
- Add pnpm dev:api and pnpm dev:web scripts at root.
- Add vite dev script in product/web/package.json.
- Add fetchSearchSymbols helper to reference-client.ts.
- Add SearchBox component and / (index) route.
- Wrap symbol cells in EquityTable with <Link> to company detail.
- Document run commands in product/api/README.md and product/web/README.md.

Allowed write paths:
- package.json (root, scripts block only)
- product/api/README.md
- product/web/README.md
- product/web/package.json (scripts block only)
- product/web/src/router.tsx
- product/web/src/routes/index.tsx (new)
- product/web/src/components/SearchBox.tsx (new)
- product/web/src/components/EquityTable.tsx (modify symbol cell only)
- product/web/src/lib/reference-client.ts (add helper)

Forbidden actions:
- Do NOT create or modify any file under records/.
- Do NOT add new npm or Python deps.
- Do NOT add CSS files or import a styling library.
- Do NOT capture raw external data, credentials, or config contents.
- Do NOT use bare "capability" or "user" language.
- Do NOT run scripts/install-vnstock.sh.

Validation:
- pnpm install (web) and pnpm dev:web build cleanly.
- pnpm dev:api boots and /health returns ok.
- cd product/web && pnpm test — existing smoke tests pass.
- pnpm validate:records and pnpm check — must pass (confirms no record edits).

Stop conditions:
- Pre-flight import check fails.
- Skill attempts to write outside allowed paths or to records/.
- Tests fail and cannot be fixed in skill context.
```

## Todo List

- [ ] Read brainstorm + plan + existing source files.
- [ ] Pre-flight vnstock import check.
- [ ] Add root `dev:api` + `dev:web` scripts.
- [ ] Add `vite` dev script to web `package.json`.
- [ ] Add `fetchSearchSymbols` helper.
- [ ] Create `SearchBox` component.
- [ ] Create `/` index route + register in router.
- [ ] Add `<Link>` to `EquityTable` symbol cells.
- [ ] Write `product/api/README.md`.
- [ ] Write `product/web/README.md`.
- [ ] Smoke-run dev servers + curl `/health` and `/`.
- [ ] Web test suite passes.
- [ ] `pnpm validate:records` + `pnpm check` pass.

## Success Criteria

### Process Steps
- [ ] All required input files read.
- [ ] Dev scripts added at root and in web stack.
- [ ] `fetchSearchSymbols` helper, `SearchBox` component, `/` route shipped.
- [ ] `EquityTable` symbol cells link to company detail.
- [ ] READMEs document run commands.
- [ ] Web smoke tests pass.
- [ ] `pnpm validate:records` + `pnpm check` pass — confirms no record edits.

### Experiment Outcome
- `supports` — dev servers boot, routes render, web tests pass, no record files modified.

## Risk Assessment

- **Risk**: Skill drifts into CSS / styling. **Mitigation**: forbidden list in pre-drafted prompt; reviewer rejects diff if `.css` files appear.
- **Risk**: `pnpm dev` parallel pattern misbehaves on user's shell. **Mitigation**: fall back to two-terminal flow documented in README — explicit acceptance criterion.
- **Risk**: Adding `/` route changes loader semantics for existing routes. **Mitigation**: index route uses no loader; equity and company routes unchanged.
- **Risk**: `fetchSearchSymbols` typo or wrong query param. **Mitigation**: read `routers/reference.py` first to confirm endpoint signature.
- **Risk**: Skill phase edits records. **Mitigation**: explicit forbidden list; validation step confirms records untouched.

## Security Considerations

- No new attack surface — all surfaces already exist in product. New code only wires UI to existing endpoints.
- `SearchBox` user input is sent as URL query param to `/reference/search`; existing endpoint validates / filters. No client-side query injection vector.
- READMEs do not contain credentials, device IDs, or vnstock API key references.

## Approval Gate

Operator approval required before phase 2. Review:
- Diff under `product/web/src/`.
- Confirm no files under `records/` modified.
- Confirm no new deps added (`product/web/package.json` and root `package.json` diff — scripts block only).
- Confirm READMEs do not contain credentials.

## Next Steps

After phase 1 approval:
- Phase 2 (loop) captures operator walkthrough as experiment record + drops tripwire meta file.
