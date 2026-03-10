from __future__ import annotations

import io
import json
import random
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageDraw, ImageFont

try:
    import cv2  # type: ignore
    import numpy as np
except ImportError:  # pragma: no cover - optional dependency for local setup
    cv2 = None
    np = None

try:
    import pytesseract  # type: ignore
except ImportError:  # pragma: no cover - optional dependency for local setup
    pytesseract = None

APP_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = APP_DIR / "outputs"
BACKGROUND_DIR = APP_DIR / "backgrounds"
OUTPUT_DIR.mkdir(exist_ok=True)
BACKGROUND_DIR.mkdir(exist_ok=True)

app = FastAPI(title="PMG Image Edit API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/outputs", StaticFiles(directory=str(OUTPUT_DIR)), name="outputs")
app.mount("/background-files", StaticFiles(directory=str(BACKGROUND_DIR)), name="background-files")


SOLID_BACKGROUNDS: list[dict[str, str]] = [
    {"id": "studio-white", "name": "Studio White", "value": "#f7f7f5"},
    {"id": "slate", "name": "Slate", "value": "#2f3a4a"},
    {"id": "sand", "name": "Warm Sand", "value": "#efe0c6"},
    {"id": "mint", "name": "Mint", "value": "#c7ebdd"},
    {"id": "sunrise", "name": "Sunrise", "value": "#ffd4a8"},
    {"id": "sky", "name": "Sky", "value": "#bfd8f8"},
]


def _load_image_from_upload(upload: UploadFile) -> Image.Image:
    raw = upload.file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Missing image file.")
    try:
        image = Image.open(io.BytesIO(raw)).convert("RGBA")
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=400, detail=f"Invalid image: {exc}") from exc
    return image


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    stripped = value.strip().lstrip("#")
    if len(stripped) != 6:
        return 255, 255, 255
    return int(stripped[0:2], 16), int(stripped[2:4], 16), int(stripped[4:6], 16)


def _extract_foreground_rgba(image: Image.Image) -> Image.Image:
    if cv2 is None or np is None:
        return image

    rgba = np.array(image)
    rgb = cv2.cvtColor(rgba, cv2.COLOR_RGBA2RGB)
    h, w = rgb.shape[:2]

    mask = np.zeros((h, w), np.uint8)
    bgd_model = np.zeros((1, 65), np.float64)
    fgd_model = np.zeros((1, 65), np.float64)

    margin_x = max(10, int(w * 0.06))
    margin_y = max(10, int(h * 0.06))
    rect = (margin_x, margin_y, max(1, w - 2 * margin_x), max(1, h - 2 * margin_y))

    try:
        cv2.grabCut(rgb, mask, rect, bgd_model, fgd_model, 4, cv2.GC_INIT_WITH_RECT)
        fg_mask = np.where((mask == 2) | (mask == 0), 0, 255).astype("uint8")
        rgba[:, :, 3] = fg_mask
        return Image.fromarray(rgba, mode="RGBA")
    except Exception:
        return image


def _build_background(background_id: str, size: tuple[int, int], request: Request) -> Image.Image:
    w, h = size

    solid = next((item for item in SOLID_BACKGROUNDS if item["id"] == background_id), None)
    if solid:
        return Image.new("RGBA", (w, h), _hex_to_rgb(solid["value"]) + (255,))

    background_file = BACKGROUND_DIR / background_id
    if background_file.exists():
        bg = Image.open(background_file).convert("RGBA")
        return bg.resize((w, h), Image.Resampling.LANCZOS)

    # Fallback for unknown ids
    return Image.new("RGBA", (w, h), (245, 245, 245, 255))


def _draw_text_layers(
    base: Image.Image,
    detections: list[dict[str, Any]],
    variation_index: int,
) -> None:
    draw = ImageDraw.Draw(base)
    w, h = base.size

    for det in detections:
        if det.get("include") is False:
            continue

        text = str(det.get("text", "")).strip()
        if not text:
            continue

        x = int(float(det.get("x", 0.1)) * w)
        y = int(float(det.get("y", 0.1)) * h)
        box_h = max(20, int(float(det.get("height", 0.08)) * h))
        font_size = max(12, min(72, int(box_h * 0.75)))

        try:
            font = ImageFont.truetype("Arial.ttf", font_size)
        except Exception:
            font = ImageFont.load_default()

        jitter = variation_index * 2
        draw.text((x + jitter, y + jitter), text, fill=(0, 0, 0, 110), font=font)
        draw.text((x, y), text, fill=(20, 20, 20, 255), font=font)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/assets/backgrounds")
def list_backgrounds(request: Request) -> dict[str, list[dict[str, str]]]:
    catalog: list[dict[str, str]] = []

    for item in SOLID_BACKGROUNDS:
        catalog.append(
            {
                "id": item["id"],
                "name": item["name"],
                "type": "solid",
                "value": item["value"],
            }
        )

    for path in sorted(BACKGROUND_DIR.iterdir()):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
            continue

        preview = str(request.url_for("background-files", path=path.name))
        catalog.append(
            {
                "id": path.name,
                "name": path.stem.replace("_", " ").title(),
                "type": "image",
                "value": path.name,
                "previewUrl": preview,
            }
        )

    return {"backgrounds": catalog}


@app.post("/detect-text")
def detect_text(file: UploadFile = File(...), payload: str = Form("{}")) -> dict[str, Any]:
    image = _load_image_from_upload(file)
    parsed = json.loads(payload or "{}")

    brand_terms = {str(item).strip().lower() for item in parsed.get("brandTerms", []) if str(item).strip()}
    brand_fonts = [str(item).strip() for item in parsed.get("brandFonts", []) if str(item).strip()]

    detections: list[dict[str, Any]] = []

    if pytesseract is not None:
        rgb = image.convert("RGB")
        data = pytesseract.image_to_data(rgb, output_type=pytesseract.Output.DICT)
        width, height = rgb.size
        index = 0
        for i in range(len(data.get("text", []))):
            text = (data["text"][i] or "").strip()
            if not text:
                continue

            try:
                conf = float(data["conf"][i])
            except Exception:
                conf = 0.0
            if conf < 45:
                continue

            left = int(data["left"][i])
            top = int(data["top"][i])
            box_w = int(data["width"][i])
            box_h = int(data["height"][i])

            lowered = text.lower()
            is_brand = lowered in brand_terms
            fallback_font = brand_fonts[0] if brand_fonts else None

            detections.append(
                {
                    "id": f"det_{index}",
                    "text": text,
                    "confidence": round(conf / 100.0, 3),
                    "x": round(left / width, 6),
                    "y": round(top / height, 6),
                    "width": round(box_w / width, 6),
                    "height": round(box_h / height, 6),
                    "isBrandTerm": is_brand,
                    "fontFamily": fallback_font,
                    "fontFallbackApplied": bool(fallback_font),
                }
            )
            index += 1

    return {
        "detections": detections,
        "image": {"width": image.width, "height": image.height},
        "ocrEngine": "pytesseract" if pytesseract is not None else "disabled",
    }


@app.post("/render-variations")
def render_variations(
    request: Request,
    file: UploadFile = File(...),
    payload: str = Form("{}"),
) -> dict[str, list[dict[str, str]]]:
    image = _load_image_from_upload(file)
    parsed = json.loads(payload or "{}")

    background_id = str(parsed.get("backgroundId") or "studio-white")
    variation_count = int(parsed.get("variationCount", 4))
    variation_count = max(3, min(4, variation_count))

    confirmed_detections = parsed.get("confirmedDetections", [])
    if not isinstance(confirmed_detections, list):
        confirmed_detections = []

    foreground = _extract_foreground_rgba(image)
    base_w, base_h = image.size

    results: list[dict[str, str]] = []
    for idx in range(variation_count):
        background = _build_background(background_id, (base_w, base_h), request)

        # Keep subtle variation while preserving the same source composition
        scale_factor = 0.92 + (idx * 0.02)
        target_w = max(1, int(base_w * scale_factor))
        target_h = max(1, int(base_h * scale_factor))
        resized_foreground = foreground.resize((target_w, target_h), Image.Resampling.LANCZOS)
        pos_x = (base_w - target_w) // 2 + random.randint(-6, 6)
        pos_y = (base_h - target_h) // 2 + random.randint(-6, 6)
        background.alpha_composite(resized_foreground, (pos_x, pos_y))

        _draw_text_layers(background, confirmed_detections, idx)

        output_name = f"{uuid.uuid4().hex}.png"
        output_path = OUTPUT_DIR / output_name
        background.convert("RGB").save(output_path, format="PNG", optimize=True)

        output_url = str(request.url_for("outputs", path=output_name))
        results.append(
            {
                "id": uuid.uuid4().hex[:12],
                "fileName": output_name,
                "url": output_url,
                "downloadUrl": str(request.url_for("download-output", output_id=output_name)),
                "backgroundId": background_id,
            }
        )

    return {"variations": results}


@app.get("/download/{output_id}", name="download-output")
def download_output(output_id: str) -> FileResponse:
    safe_name = Path(output_id).name
    target = OUTPUT_DIR / safe_name
    if not target.exists():
        raise HTTPException(status_code=404, detail="Output not found")
    return FileResponse(path=str(target), filename=safe_name, media_type="image/png")
