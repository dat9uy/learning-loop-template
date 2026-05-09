# vnstock capability runtime execution

The approved `vnstock_data` capability runtime experiment completed on the registered Linux environment. A shared Python environment now lives at `product/.venv`, with tracked metadata in `product/pyproject.toml` and runtime/vendor side-effect directories ignored by `.gitignore`.

The official installer path succeeded with `VNSTOCK_API_KEY` inherited from the operator shell. `vnstock_data` imports from `product/.venv/bin/python`; package metadata reports `vnstock_data` version `3.1.7`, while the module `__version__` reports `3.0.0`.

All five staged capability scripts executed against live endpoints. The only script change was in `capability-04-insights-macro.py`: GDP and CPI calls were changed from unsupported `period="quarter"` to supported `period="year"`.

The evidence envelope at `records/evidence/vnstock-data/capability-runtime-output.md` captures only schema shape, row counts, and column names. It does not retain raw row values, credentials, full DataFrames, config contents, or installer logs.

The runtime experiment record now has `result: supports`, and `claim-vnstock-install-sandbox` now marks the runtime dimension as `verified` with the experiment as proof. `pnpm check` validates the record set.
