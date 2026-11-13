# Naksha engine (`engine/`)

The Python valuation engine: data pipeline, training and benchmark, and the FastAPI service.

To run it, install the dependencies, then start the service from the repository root:

```bash
pip install -r engine/requirements.txt
```

```bash
python -m uvicorn --app-dir engine api:app --port 8000
```

OpenAPI docs are served at http://127.0.0.1:8000/docs.

| File | Role |
|---|---|
| `common.py` | Paths, stated market assumptions, text normalisation |
| `build_dataset.py` | Unify four listing sources, gazetteer geocoding, cleaning |
| `embed_points.py`, `aef.py` | AlphaEarth satellite embeddings (public GCS COGs, cached) |
| `features.py` | OSM access and comparable features |
| `train.py` | Training, conformal calibration, three-split benchmark → `../artifacts/` |
| `api.py` | `/api/value`, `/api/income`, `/api/search`, `/api/surface`, `/api/meta` |

Further reading:
- [../docs/MODEL.md](../docs/MODEL.md): method and results
- [../docs/API.md](../docs/API.md): endpoints
- [../docs/DATA.md](../docs/DATA.md): rebuilding from raw
