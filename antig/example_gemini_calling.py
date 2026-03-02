import os
import csv
import json
import time
import random
import mimetypes
from dataclasses import dataclass
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timezone
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from google import genai
from google.genai import errors

# ----------------------------
# Config
# ----------------------------
API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
if not API_KEY:
    raise ValueError("Missing API key. Set GEMINI_API_KEY or GOOGLE_API_KEY.")

MODEL = os.getenv("GEMINI_MODEL", "gemini-3-pro-preview")
PERSONAS_CSV = os.getenv("PERSONAS_CSV", "personas.csv")
LINKS_CSV = os.getenv("LINKS_CSV", "links.csv")
OUTPUT_CSV = os.getenv("OUTPUT_CSV", "creative_reviews.csv")

# Optional cache to resume without re-calling Gemini
CACHE_JSONL = os.getenv("CACHE_JSONL", "creative_reviews_cache.jsonl")
USE_CACHE = os.getenv("USE_CACHE", "1") == "1"

# Download controls
MAX_VIDEO_MB = float(os.getenv("MAX_VIDEO_MB", "60"))  # cap to avoid huge files
MAX_VIDEO_BYTES = int(MAX_VIDEO_MB * 1024 * 1024)
DOWNLOAD_TIMEOUT_S = int(os.getenv("DOWNLOAD_TIMEOUT_S", "60"))

# Gemini retry controls
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "6"))
BASE_BACKOFF_SECONDS = float(os.getenv("BASE_BACKOFF_SECONDS", "1.5"))
RETRYABLE_CODES = {429, 500, 502, 503, 504}

client = genai.Client(api_key=API_KEY)

# ----------------------------
# Utilities
# ----------------------------
def utc_now_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def split_semicolon(s: str) -> List[str]:
    if not s:
        return []
    return [p.strip() for p in s.split(";") if p.strip()]


def stable_key(persona_id: str, ad_id: str) -> str:
    return f"{persona_id}__{ad_id}"


def backoff_sleep(attempt: int) -> None:
    sleep_s = BASE_BACKOFF_SECONDS * (2 ** max(0, attempt - 1))
    sleep_s = min(sleep_s, 60.0)
    sleep_s += random.uniform(0, 0.8)
    time.sleep(sleep_s)


def safe_get(d: Dict[str, str], *keys: str, default: str = "") -> str:
    for k in keys:
        if k in d and d[k] is not None:
            return str(d[k]).strip()
    return default


def _api_error_code(e: Exception) -> int:
    try:
        return int(getattr(e, "code", 0) or 0)
    except Exception:
        return 0


def read_personas_csv_with_header(path: str) -> List[Dict[str, str]]:
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        return [dict(r) for r in reader]


def read_links_no_header(path: str) -> List[str]:
    urls: List[str] = []
    with open(path, "r", encoding="utf-8-sig") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line:
                continue

            token = line.split(",")[0].strip()
            if (token.startswith('"') and token.endswith('"')) or (token.startswith("'") and token.endswith("'")):
                token = token[1:-1].strip()

            if token:
                urls.append(token)

    # de-dupe while preserving order
    seen = set()
    deduped = []
    for u in urls:
        if u not in seen:
            seen.add(u)
            deduped.append(u)
    return deduped


def load_cache(cache_path: str) -> Dict[str, Dict[str, Any]]:
    cache: Dict[str, Dict[str, Any]] = {}
    if not USE_CACHE or not os.path.exists(cache_path):
        return cache
    with open(cache_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            k = obj.get("cache_key")
            if k:
                cache[k] = obj
    return cache


def append_cache(cache_path: str, obj: Dict[str, Any]) -> None:
    if not USE_CACHE:
        return
    with open(cache_path, "a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")


def guess_mime_type(url: str) -> str:
    # Favor video/mp4 if it ends with .mp4
    path = urlparse(url).path.lower()
    if path.endswith(".mp4"):
        return "video/mp4"
    mt, _ = mimetypes.guess_type(path)
    return mt or "application/octet-stream"


def download_video_bytes(url: str) -> bytes:
    """
    Downloads video bytes with a max size cap.
    Uses streaming read to avoid loading beyond MAX_VIDEO_BYTES.
    """
    headers = {
        "User-Agent": "creative-review-bot/1.0",
        "Accept": "*/*",
    }
    req = Request(url, headers=headers, method="GET")
    with urlopen(req, timeout=DOWNLOAD_TIMEOUT_S) as resp:
        # Size check via Content-Length if available
        cl = resp.headers.get("Content-Length")
        if cl:
            try:
                n = int(cl)
                if n > MAX_VIDEO_BYTES:
                    raise ValueError(
                        f"Video too large ({n / (1024*1024):.2f} MB) > MAX_VIDEO_MB={MAX_VIDEO_MB}"
                    )
            except ValueError:
                # if Content-Length is weird, ignore and rely on streaming cap
                pass

        chunks = []
        total = 0
        while True:
            buf = resp.read(1024 * 1024)  # 1 MB chunks
            if not buf:
                break
            chunks.append(buf)
            total += len(buf)
            if total > MAX_VIDEO_BYTES:
                raise ValueError(
                    f"Video exceeded MAX_VIDEO_MB={MAX_VIDEO_MB} while downloading."
                )
        return b"".join(chunks)


# ----------------------------
# Data models
# ----------------------------
@dataclass
class Persona:
    persona_id: str
    summary: str
    motivations: List[str]
    characteristics: List[str]


@dataclass
class AdLink:
    ad_id: str
    url: str


def parse_personas(rows: List[Dict[str, str]]) -> List[Persona]:
    personas: List[Persona] = []
    for i, r in enumerate(rows, start=1):
        persona_id = safe_get(r, "persona_id", "id", default=f"persona_{i:03d}")
        summary = safe_get(r, "summary", "persona_summary", "description")
        motivations = split_semicolon(safe_get(r, "motivations", "motivation"))
        characteristics = split_semicolon(safe_get(r, "characteristics", "traits", "attributes"))

        if not summary:
            raise ValueError(
                f"Personas CSV row {i} is missing a 'summary' (or equivalent) column/value."
            )

        personas.append(
            Persona(
                persona_id=persona_id,
                summary=summary,
                motivations=motivations,
                characteristics=characteristics,
            )
        )
    return personas


def build_ads_from_urls(urls: List[str]) -> List[AdLink]:
    return [AdLink(ad_id=f"ad_{i:03d}", url=u) for i, u in enumerate(urls, start=1)]


# ----------------------------
# Prompting + parsing
# ----------------------------
RESPONSE_SCHEMA_HINT = """
Return a single JSON object with these top-level keys:
{
  "overall_reaction": string,
  "clarity_of_message": {"score": number 1-10, "rationale": string},
  "brand_fit": {"score": number 1-10, "rationale": string},
  "emotional_resonance": {"score": number 1-10, "rationale": string},
  "credibility_trust": {"score": number 1-10, "rationale": string},
  "call_to_action": {"score": number 1-10, "rationale": string},
  "key_moments": [{"timestamp_or_section": string, "what_happens": string, "persona_response": string}],
  "what_works": [string],
  "what_doesnt": [string],
  "confusions_or_objections": [string],
  "improvements": [{"suggestion": string, "why": string, "expected_impact": string}],
  "predicted_behavior": {
    "likelihood_to_engage": {"score": number 1-10, "why": string},
    "likelihood_to_consider": {"score": number 1-10, "why": string},
    "likelihood_to_purchase": {"score": number 1-10, "why": string}
  },
  "persona_specific_notes": string
}

Rules:
- Scores must be numeric 1-10.
- Keep arrays non-empty when possible (at least 2-3 items), unless truly not applicable.
- Be critical and specific, not generic.
"""


def build_prompt(persona: Persona) -> str:
    mot = ", ".join(persona.motivations) if persona.motivations else "(none provided)"
    ch = ", ".join(persona.characteristics) if persona.characteristics else "(none provided)"

    return f"""
You are performing a creative review of a video advertisement from the perspective of a specific persona.

PERSONA
- id: {persona.persona_id}
- summary: {persona.summary}
- motivations: {mot}
- characteristics: {ch}

TASK
1) Watch the provided video ad fully.
2) Evaluate it as if you are this persona watching it.
3) Provide critical feedback on creative effectiveness, clarity, resonance, credibility, and CTA.
4) Identify concrete improvement ideas tailored to this persona.
5) Be specific about what in the video drives your feedback (scenes, lines, visuals, pacing).

OUTPUT FORMAT
{RESPONSE_SCHEMA_HINT}

Return ONLY valid JSON. No markdown. No extra commentary.
""".strip()


def extract_json(text: str) -> Dict[str, Any]:
    text = (text or "").strip()

    if text.startswith("{") and text.endswith("}"):
        return json.loads(text)

    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return json.loads(text[start : end + 1])

    raise ValueError("Model response did not contain a valid JSON object.")


def call_gemini_with_video(prompt: str, video_bytes: bytes, mime_type: str) -> Tuple[str, Dict[str, Any]]:
    """
    Sends a multimodal request: [text prompt, inline video bytes].
    Retries on retryable API codes and JSON formatting issues.
    """
    last_err: Optional[Exception] = None

    # Construct content parts (SDK supports inline_data dict-style parts)
    parts = [
        {"text": prompt},
        {"inline_data": {"mime_type": mime_type, "data": video_bytes}},
    ]

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = client.models.generate_content(
                model=MODEL,
                contents=parts,
            )
            raw = getattr(resp, "text", "") or ""
            parsed = extract_json(raw)
            return raw, parsed

        except errors.APIError as e:
            last_err = e
            code = _api_error_code(e)
            if code in RETRYABLE_CODES:
                backoff_sleep(attempt)
                continue
            raise

        except (json.JSONDecodeError, ValueError) as e:
            last_err = e
            repair_parts = [
                {"text": "Your previous response was not valid JSON. Return ONLY valid JSON matching the schema. No markdown.\n\n" + prompt},
                {"inline_data": {"mime_type": mime_type, "data": video_bytes}},
            ]
            try:
                resp = client.models.generate_content(
                    model=MODEL,
                    contents=repair_parts,
                )
                raw = getattr(resp, "text", "") or ""
                parsed = extract_json(raw)
                return raw, parsed
            except errors.APIError as e2:
                last_err = e2
                code = _api_error_code(e2)
                if code in RETRYABLE_CODES:
                    backoff_sleep(attempt)
                    continue
                raise
            except Exception as e2:
                last_err = e2
                backoff_sleep(attempt)
                continue

        except Exception as e:
            last_err = e
            backoff_sleep(attempt)
            continue

    raise RuntimeError(f"Gemini call failed after {MAX_RETRIES} attempts: {last_err}")


# ----------------------------
# Flatten JSON -> CSV row
# ----------------------------
def flatten_review(persona: Persona, ad: AdLink, review: Dict[str, Any]) -> Dict[str, Any]:
    def j(x: Any) -> str:
        return json.dumps(x, ensure_ascii=False)

    def score(*path: str) -> Optional[float]:
        cur: Any = review
        for p in path:
            if not isinstance(cur, dict) or p not in cur:
                return None
            cur = cur[p]
        try:
            return float(cur)
        except Exception:
            return None

    def text_at(*path: str) -> str:
        cur: Any = review
        for p in path:
            if not isinstance(cur, dict) or p not in cur:
                return ""
            cur = cur[p]
        return "" if cur is None else str(cur)

    return {
        "run_timestamp_utc": utc_now_str(),

        "persona_id": persona.persona_id,
        "persona_summary": persona.summary,
        "persona_motivations": "; ".join(persona.motivations),
        "persona_characteristics": "; ".join(persona.characteristics),

        "ad_id": ad.ad_id,
        "ad_url": ad.url,

        "overall_reaction": text_at("overall_reaction"),

        "clarity_score": score("clarity_of_message", "score"),
        "clarity_rationale": text_at("clarity_of_message", "rationale"),

        "brand_fit_score": score("brand_fit", "score"),
        "brand_fit_rationale": text_at("brand_fit", "rationale"),

        "emotional_resonance_score": score("emotional_resonance", "score"),
        "emotional_resonance_rationale": text_at("emotional_resonance", "rationale"),

        "credibility_trust_score": score("credibility_trust", "score"),
        "credibility_trust_rationale": text_at("credibility_trust", "rationale"),

        "cta_score": score("call_to_action", "score"),
        "cta_rationale": text_at("call_to_action", "rationale"),

        "pred_likelihood_engage_score": score("predicted_behavior", "likelihood_to_engage", "score"),
        "pred_likelihood_engage_why": text_at("predicted_behavior", "likelihood_to_engage", "why"),

        "pred_likelihood_consider_score": score("predicted_behavior", "likelihood_to_consider", "score"),
        "pred_likelihood_consider_why": text_at("predicted_behavior", "likelihood_to_consider", "why"),

        "pred_likelihood_purchase_score": score("predicted_behavior", "likelihood_to_purchase", "score"),
        "pred_likelihood_purchase_why": text_at("predicted_behavior", "likelihood_to_purchase", "why"),

        "key_moments_json": j(review.get("key_moments", [])),
        "what_works_json": j(review.get("what_works", [])),
        "what_doesnt_json": j(review.get("what_doesnt", [])),
        "confusions_or_objections_json": j(review.get("confusions_or_objections", [])),
        "improvements_json": j(review.get("improvements", [])),

        "persona_specific_notes": text_at("persona_specific_notes"),
    }


# ----------------------------
# Main
# ----------------------------
def run():
    personas_rows = read_personas_csv_with_header(PERSONAS_CSV)
    personas = parse_personas(personas_rows)

    urls = read_links_no_header(LINKS_CSV)
    if not urls:
        raise ValueError("No URLs found in links.csv (empty after cleaning).")
    ads = build_ads_from_urls(urls)

    cache = load_cache(CACHE_JSONL)
    output_rows: List[Dict[str, Any]] = []

    # Download each ad once and reuse bytes across personas
    # (saves bandwidth + time)
    ad_video_cache: Dict[str, Tuple[bytes, str]] = {}

    total = len(personas) * len(ads)
    idx = 0

    for ad in ads:
        if ad.ad_id in ad_video_cache:
            continue
        print(f"downloading {ad.ad_id}: {ad.url}")
        try:
            video_bytes = download_video_bytes(ad.url)
            mime_type = guess_mime_type(ad.url)
            ad_video_cache[ad.ad_id] = (video_bytes, mime_type)
            print(f"  downloaded {len(video_bytes) / (1024*1024):.2f} MB as {mime_type}")
        except Exception as e:
            # store failure marker; each persona row will record error
            ad_video_cache[ad.ad_id] = (b"", "application/octet-stream")
            print(f"  -> download FAILED: {e}")

    for persona in personas:
        persona_prompt = build_prompt(persona)

        for ad in ads:
            idx += 1
            ck = stable_key(persona.persona_id, ad.ad_id)

            if ck in cache:
                output_rows.append(cache[ck]["row"])
                print(f"[{idx}/{total}] cache hit: {ck}")
                continue

            video_bytes, mime_type = ad_video_cache.get(ad.ad_id, (b"", "application/octet-stream"))
            print(f"[{idx}/{total}] reviewing: persona={persona.persona_id} ad={ad.ad_id}")

            if not video_bytes:
                fail_row = {
                    "run_timestamp_utc": utc_now_str(),
                    "persona_id": persona.persona_id,
                    "persona_summary": persona.summary,
                    "persona_motivations": "; ".join(persona.motivations),
                    "persona_characteristics": "; ".join(persona.characteristics),
                    "ad_id": ad.ad_id,
                    "ad_url": ad.url,
                    "error": "Video download failed or was empty (see logs).",
                }
                output_rows.append(fail_row)
                continue

            try:
                raw_text, parsed = call_gemini_with_video(persona_prompt, video_bytes, mime_type)
                row = flatten_review(persona, ad, parsed)

                append_cache(
                    CACHE_JSONL,
                    {
                        "cache_key": ck,
                        "model": MODEL,
                        "persona_id": persona.persona_id,
                        "ad_id": ad.ad_id,
                        "ad_url": ad.url,
                        "raw_text": raw_text,
                        "parsed": parsed,
                        "row": row,
                    },
                )

                output_rows.append(row)

            except Exception as e:
                fail_row = {
                    "run_timestamp_utc": utc_now_str(),
                    "persona_id": persona.persona_id,
                    "persona_summary": persona.summary,
                    "persona_motivations": "; ".join(persona.motivations),
                    "persona_characteristics": "; ".join(persona.characteristics),
                    "ad_id": ad.ad_id,
                    "ad_url": ad.url,
                    "error": str(e),
                }
                output_rows.append(fail_row)
                print(f"  -> FAILED: {e}")

    # Write output CSV
    all_keys = set()
    for r in output_rows:
        all_keys.update(r.keys())

    preferred = [
        "run_timestamp_utc",
        "persona_id", "persona_summary", "persona_motivations", "persona_characteristics",
        "ad_id", "ad_url",
        "overall_reaction",
        "clarity_score", "clarity_rationale",
        "brand_fit_score", "brand_fit_rationale",
        "emotional_resonance_score", "emotional_resonance_rationale",
        "credibility_trust_score", "credibility_trust_rationale",
        "cta_score", "cta_rationale",
        "pred_likelihood_engage_score", "pred_likelihood_engage_why",
        "pred_likelihood_consider_score", "pred_likelihood_consider_why",
        "pred_likelihood_purchase_score", "pred_likelihood_purchase_why",
        "key_moments_json",
        "what_works_json",
        "what_doesnt_json",
        "confusions_or_objections_json",
        "improvements_json",
        "persona_specific_notes",
        "error",
    ]
    fieldnames = preferred + [k for k in sorted(all_keys) if k not in preferred]

    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for r in output_rows:
            writer.writerow(r)

    print(f"\nWrote {len(output_rows)} rows -> {OUTPUT_CSV}")
    if USE_CACHE:
        print(f"Cache (jsonl) -> {CACHE_JSONL}")


if __name__ == "__main__":
    run()
