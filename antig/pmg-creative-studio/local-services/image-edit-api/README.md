# Local Image Edit API

FastAPI service for the `edit-image` workflow.

## Run locally

```bash
cd local-services/image-edit-api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

The frontend expects `http://127.0.0.1:8001` by default.
Set `VITE_IMAGE_EDIT_API_URL` to override.

## Endpoints

- `GET /health`
- `GET /assets/backgrounds`
- `POST /detect-text`
- `POST /render-variations`
- `GET /download/{output_id}`

Place optional image backgrounds in `backgrounds/` (jpg/png/webp).
Rendered files are written to `outputs/`.
