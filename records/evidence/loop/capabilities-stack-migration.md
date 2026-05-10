# Capabilities Stack Migration Evidence

This is loop-architecture evidence for the per-stack capability script migration.

## Pre-Migration Layout

```text
product/
├── pyproject.toml
├── .venv/
├── .vnstock/
└── capabilities/vnstock-data/
```

## Post-Migration Layout

```text
product/
├── README.md
├── api/
│   ├── pyproject.toml
│   ├── .venv/
│   ├── .vnstock/
│   └── capabilities/vnstock-data/
└── web/
    └── capabilities/README.md
```

`git ls-files product/` after staging shows only `product/api/capabilities/...`, `product/api/pyproject.toml`, and `product/web/capabilities/README.md`; no tracked file remains under the old `product/capabilities/` path.

## Validator Fixture Summary

- `capability-source-outside-allowlist`: rejected with `local source must stay under records/evidence, knowledge-packs, product/*/capabilities`.
- `non-capability-source-in-product`: rejected with `local source must stay under records/evidence or knowledge-packs`.
- `capability-source-glob-traversal`: rejected with `local source must stay under records/evidence, knowledge-packs, product/*/capabilities`.
- Live ledger validation passed with the capability schema loaded.

## Runtime Check

Command class: local stack virtualenv metadata-only capability script run.

```text
product/api/.venv/bin/python product/api/capabilities/vnstock-data/capability-00-discovery.py
```

Result: passed. The script imported `vnstock_data` and printed the Reference API tree and method signature metadata.

Note: `uv sync --extra vendor` could not resolve the private `vnstock_data` distribution from the current registry. The stack virtualenv was recreated, public dependencies were installed from the package index, and private vendor packages were copied from the old local virtualenv after the registry miss. No raw provider data or credentials were captured.

## Validation Output

```text
$ pnpm validate:records
Validated 17 records.

$ pnpm check
Validated 17 records.
```

## Deferred Axes

Deferred glob expressiveness, open-string stack handling, and stack-manifest validator enforcement remain documented in `records/evidence/meta/capability-allowlist-deferred-axes.md`.
