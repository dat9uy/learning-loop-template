# vnstock_data Capabilities

Standalone feasibility scripts for the `vnstock_data` Python library.

## Structure

| File | Domain | Purpose |
|------|--------|---------|
| `capability-00-discovery.py` | Discovery | `show_api`, `show_doc`, import check |
| `capability-01-reference.py` | Reference | Listings, company info, search |
| `capability-02-market.py` | Market | OHLCV, quote, order book, foreign flow |
| `capability-03-fundamental.py` | Fundamental | Financial statements, ratios |
| `capability-04-insights-macro.py` | Insights + Macro | Rankings, GDP, CPI, exchange rates |

## Execution Modes

### As a script
```bash
python capability-01-reference.py
```

### Cell-by-cell (Interactive Python)
Use VS Code with the Jupyter extension:
- Click "Run Cell" above any `# %%` marker
- Requires the Python environment where `vnstock_data` is installed

## Environment Note

These scripts assume `vnstock_data` is installed in `product/api/.venv`. Bootstrap that environment from the repo root with `pnpm bootstrap:api`; the command runs `uv sync` and then an explicit vendor installer stage requiring `VNSTOCK_API_KEY`. The device-limit mechanism (see `records/claims/claim-vnstock-device-limit-mechanism.yaml`) means only one Linux installation per account is permitted. Run these capabilities on the registered device.
