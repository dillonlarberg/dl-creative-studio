#!/usr/bin/env python3
"""
Single-client creative_insights_data_export pull (self-contained).

Pulls:
  - ad_id
  - url
  - creative_type (excludes "thumbnail")
  - brand_visuals (boolean-like)

Uses:
  - ALLI_OAUTH_TOKEN from environment (same as get_client.py)
  - pmgclient.json for client slug (output of get_client.py)

Outputs:
  creative_insights_export.csv
"""
from __future__ import annotations

import csv
import io
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests
from requests.adapters import HTTPAdapter

# ---------- CONFIG ----------
CLIENT_FILE = Path(__file__).resolve().parent / "pmgclient.json"
TOKEN_ENV = "ALLI_OAUTH_TOKEN"


# API endpoints
DE_BASE = "https://dataexplorer.alliplatform.com/api/v2"
MODEL = "creative_insights_data_export"
CENTRAL_BASE = "https://api.central.alliplatform.com"
QUALIFY_FIELDS = os.environ.get("DE_QUALIFY_FIELDS", "").strip() in {"1", "true", "TRUE", "yes", "YES"}
CUBE_PREFIX = os.environ.get("DE_CUBE_PREFIX", MODEL)
DEBUG_PAYLOAD = os.environ.get("DE_DEBUG", "").strip() in {"1", "true", "TRUE", "yes", "YES"}

# Fixed columns (per your working SQL)
# Note: omit hash entirely to avoid backend quoting errors.
DIMENSIONS = ["ad_id", "url", "creative_type", "brand_visuals"]
MEASURES = ["cpm", "ctr"]

TIMEOUT_STREAM = (10, 300)


def make_session() -> requests.Session:
    s = requests.Session()
    adapter = HTTPAdapter(max_retries=0, pool_connections=10, pool_maxsize=20)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    s.headers.update({
        "Accept-Encoding": "gzip, deflate",
        "User-Agent": "alli-creative-insights-export/1.0",
    })
    return s


def _dump_resp_details(resp: requests.Response, label: str) -> None:
    print(f"[{label}] status={resp.status_code} content-type={resp.headers.get('content-type')}")


def _parse_payload(resp: requests.Response) -> Any:
    content_type = (resp.headers.get("Content-Type") or "").split(";")[0].lower()
    if content_type == "application/json":
        try:
            return resp.json()
        except ValueError:
            return resp.text
    return resp.text or None


def _clients_from_payload(payload: Any) -> List[dict]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("results", "data"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
    return []


def resolve_single_client_slug(session: requests.Session, token: str) -> str:
    resp = session.get(
        f"{CENTRAL_BASE}/clients",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
        timeout=10,
    )
    _dump_resp_details(resp, "clients")
    payload = _parse_payload(resp)
    if not resp.ok:
        raise RuntimeError(f"Failed to list clients: {resp.status_code} {payload}")

    clients = _clients_from_payload(payload)
    if not clients:
        raise RuntimeError("No clients returned from /clients.")
    if len(clients) > 1:
        slugs = [c.get("slug") for c in clients if c.get("slug")]
        raise RuntimeError(
            "Multiple clients returned; pass --slug explicitly. "
            f"Candidates: {', '.join(slugs)}"
        )
    slug = clients[0].get("slug")
    if not slug:
        raise RuntimeError("Single client returned but missing slug.")
    return str(slug)


def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise EnvironmentError(f"{name} must be set in the environment")
    return value


def get_token() -> str:
    token = _required_env(TOKEN_ENV).strip()
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    return token


def execute_query(
    session: requests.Session,
    token: str,
    slug: str,
    measures: List[str],
    dimensions: List[str],
    filters: Optional[List[dict]] = None,
) -> requests.Response:
    url = f"{DE_BASE}/clients/{slug}/models/{MODEL}/execute-query"

    if QUALIFY_FIELDS:
        measures = [
            m if "__" in m else f"{CUBE_PREFIX}__{m}"
            for m in measures
        ]
        dimensions = [
            d if "__" in d else f"{CUBE_PREFIX}__{d}"
            for d in dimensions
        ]
        if filters:
            for f in filters:
                member = f.get("member")
                if member and "__" not in member:
                    f["member"] = f"{CUBE_PREFIX}__{member}"

    payload: Dict[str, object] = {
        "measures": measures,
        "dimensions": dimensions,
        "limit": 50000,
    }

    if filters:
        payload["filters"] = filters

    if DEBUG_PAYLOAD:
        print("[final-query] payload:")
        print(json.dumps(payload, indent=2, sort_keys=True))

    return session.post(
        url,
        json=payload,
        stream=True,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "text/csv",
        },
        timeout=TIMEOUT_STREAM,
    )


def debug_response(resp: requests.Response, label: str) -> None:
    print(f"\n[{label}] status={resp.status_code}")
    ct = resp.headers.get("Content-Type")
    if ct:
        print(f"[{label}] content-type={ct}")
    if resp.status_code >= 400:
        try:
            print(f"[{label}] error body (first 800 chars):")
            print(resp.text[:800])
        except Exception:
            pass


def _read_client_slug_from_file(path: Path) -> Optional[str]:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text())
    except Exception:
        return None
    if isinstance(payload, dict):
        return payload.get("slug")
    if isinstance(payload, list) and payload:
        return payload[0].get("slug")
    return None


def _is_hash_error(resp: requests.Response) -> bool:
    if resp.status_code < 400:
        return False
    try:
        return "hash" in resp.text.lower()
    except Exception:
        return False


def _run_query_with_fallbacks(
    sess: requests.Session,
    token: str,
    slug: str,
    base_dims: List[str],
    base_measures: List[str],
) -> requests.Response:
    """
    Try progressively simpler payloads to work around model errors.
    Filters are applied client-side to avoid backend SQL issues.
    """
    attempts = [
        (base_measures, base_dims),
        ([], base_dims),
        ([], ["ad_id", "url"]),
        ([], ["ad_id"]),
    ]
    last_resp: Optional[requests.Response] = None
    for measures, dims in attempts:
        resp = execute_query(sess, token, slug, measures, dims, filters=None)
        last_resp = resp
        if resp.status_code < 400:
            return resp
        if _is_hash_error(resp):
            debug_response(resp, "final-query")
            continue
    return last_resp


def main() -> None:
    sess = make_session()
    token = get_token()
    print("Token OK.")

    slug = _read_client_slug_from_file(CLIENT_FILE)
    if slug:
        print(f"Resolved client slug from {CLIENT_FILE}: {slug}")
    else:
        print("No client file found (or missing slug). Resolving via /clients ...")
        slug = resolve_single_client_slug(sess, token)
        print(f"Resolved client slug: {slug}")

    measures = MEASURES
    dimensions = DIMENSIONS

    print("Running final query...")
    resp = _run_query_with_fallbacks(sess, token, slug, dimensions, measures)
    debug_response(resp, "final-query")
    resp.raise_for_status()

    resp.raw.decode_content = True
    reader = csv.reader(io.TextIOWrapper(resp.raw, encoding="utf-8", newline=""))
    header = next(reader, [])
    if not header:
        raise SystemExit("No data returned (empty CSV header).")

    header_idx = {name: i for i, name in enumerate(header)}
    def _idx(name: str) -> Optional[int]:
        if name in header_idx:
            return header_idx[name]
        # try fully qualified header names
        for k in header_idx.keys():
            if k.endswith(f"__{name}"):
                return header_idx[k]
        return None

    ad_idx = _idx("ad_id")
    url_idx = _idx("url")
    ct_idx = _idx("creative_type")
    bv_idx = _idx("brand_visuals")

    out_name = "creative_insights_export.csv"
    with open(out_name, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["ad_id", "url", "creative_type", "brand_visuals"])
        n = 0
        for row in reader:
            if not row:
                continue
            creative_type = row[ct_idx] if ct_idx is not None else ""
            if str(creative_type).strip().lower() == "thumbnail":
                continue
            w.writerow([
                row[ad_idx] if ad_idx is not None else "",
                row[url_idx] if url_idx is not None else "",
                creative_type,
                row[bv_idx] if bv_idx is not None else "",
            ])
            n += 1

    print(f"Done. Wrote {out_name} ({n} rows).")


if __name__ == "__main__":
    main()
