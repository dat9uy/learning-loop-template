# Product API

FastAPI reference service for the local product slice.

## Run

From the repository root:

```bash
pnpm dev:api
```

The server listens on `http://localhost:8000`.

## Environment

Live reference endpoints require:

```bash
VNSTOCK_REFERENCE_LIVE_GATE=approved
```

Bootstrap is handled by the root command:

```bash
pnpm bootstrap:api
```

Do not rerun bootstrap unless the operator approves consuming the vendor device slot.

## Checks

```bash
curl http://localhost:8000/health
```

Expected shape:

```json
{"status":"ok"}
```
