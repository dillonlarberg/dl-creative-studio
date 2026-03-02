#!/usr/bin/env python3
"""
Single-client cross_channel pull (self-contained).

Goals:
  - Pull ad ID + spend + clicks + impressions for a single client
  - Avoid environment variables; configure in-file constants or CLI args
  - Be resilient to multiple metric/column name variants
  - Provide strong debug output to troubleshoot schema issues

Usage:
  python3 fetch_cross_channel_single_client.py
  python3 fetch_cross_channel_single_client.py --slug acme --client-id ... --client-secret ...

Notes:
  - This script uses the same client_credentials flow as example_cross_channel.py.
  - It probes for valid measures/dimensions by trying candidates until the API accepts them.
"""
from __future__ import annotations

import csv
import io
import json
import os
import sys
from pathlib import Path
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter

# ---------- CONFIG ----------
CLIENT_FILE = Path(__file__).resolve().parent / "pmgclient.json"
TOKEN_ENV = "ALLI_OAUTH_TOKEN"

# Date range defaults: year-to-date
DEFAULT_DATE_FROM = f"{date.today().year}-01-01"
DEFAULT_DATE_TO = date.today().isoformat()

# API endpoints
TOKEN_URL = "https://login.alliplatform.com/token"
DE_BASE = "https://dataexplorer.alliplatform.com/api/v2"
MODEL = "cross_channel"
CENTRAL_BASE = "https://api.central.alliplatform.com"

# Candidate dimension/measure names (ordered by preference)
AD_ID_DIM_CANDIDATES = [
    "ad_id",
    "adId",
    "adid",
    "creative_id",
    "creativeId",
    "creativeid",
    "ad_identifier",
]

SPEND_MEASURE_CANDIDATES = [
    "spend",
    "cost",
    "media_spend",
    "media_cost",
    "total_spend",
]

CLICK_MEASURE_CANDIDATES = [
    "clicks",
    "click",
    "total_clicks",
]

IMPR_MEASURE_CANDIDATES = [
    "impressions",
    "impr",
    "total_impressions",
]

# Optional date dimension candidates (used only for date range filtering)
DATE_DIM_CANDIDATES = [
    "date",
    "date_day",
    "day",
]

TIMEOUT_HEADER = (10, 60)
TIMEOUT_STREAM = (10, 300)


# ---------- DATA STRUCTURES ----------
@dataclass
class ResolvedSchema:
    ad_id_dim: str
    spend_measure: str
    click_measure: str
    impr_measure: str
    date_dim: Optional[str]


# ---------- HTTP ----------
def make_session() -> requests.Session:
    s = requests.Session()
    adapter = HTTPAdapter(max_retries=0, pool_connections=10, pool_maxsize=20)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    s.headers.update({
        "Accept-Encoding": "gzip, deflate",
        "User-Agent": "alli-cross-channel-single/1.0",
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
    resp = session.post(
        TOKEN_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "central.read",
        },
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        },
        timeout=TIMEOUT_HEADER,
    )

    if resp.status_code >= 400:
        print("Token request failed:", file=sys.stderr)
        print(resp.text[:800], file=sys.stderr)
        resp.raise_for_status()

    tok = resp.json().get("access_token")
    if not tok:
        raise RuntimeError("No access_token in token response")
    return tok


# ---------- QUERY HELPERS ----------
def execute_query(
    session: requests.Session,
    token: str,
    slug: str,
    measures: List[str],
    dimensions: List[str],
    date_dim: Optional[str],
    date_from: str,
    date_to: str,
) -> requests.Response:
    url = f"{DE_BASE}/clients/{slug}/models/{MODEL}/execute-query"

    payload: Dict[str, object] = {
        "measures": measures,
        "dimensions": dimensions,
        "limit": 50000,
    }

    if date_dim:
        payload["timeDimensions"] = [
            {
                "dimension": date_dim,
                "dateRange": {"from": date_from, "to": date_to},
                "granularity": "day",
            }
        ]

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


def try_dimension(
    session: requests.Session,
    token: str,
    slug: str,
    dim_candidates: List[str],
    measure_candidates: List[str],
    date_dim: Optional[str],
    date_from: str,
    date_to: str,
) -> Optional[str]:
    for d in dim_candidates:
        for m in measure_candidates:
            resp = execute_query(
                session, token, slug, [m], [d], date_dim, date_from, date_to
            )
            if resp.status_code < 400:
                return d
            debug_response(resp, f"probe-dimension:{d}:{m}")
    return None


def try_measure(
    session: requests.Session,
    token: str,
    slug: str,
    measure_candidates: List[str],
    dim_probe: str,
    date_dim: Optional[str],
    date_from: str,
    date_to: str,
) -> Optional[str]:
    for m in measure_candidates:
        resp = execute_query(
            session, token, slug, [m], [dim_probe], date_dim, date_from, date_to
        )
        if resp.status_code < 400:
            return m
        debug_response(resp, f"probe-measure:{m}")
    return None


def resolve_schema(
    session: requests.Session,
    token: str,
    slug: str,
    date_from: str,
    date_to: str,
) -> ResolvedSchema:
    # Resolve a working spend measure first (we need a valid measure for probes)
    spend_measure = None
    for m in SPEND_MEASURE_CANDIDATES:
        resp = execute_query(session, token, slug, [m], [], None, date_from, date_to)
        if resp.status_code < 400:
            spend_measure = m
            break
        debug_response(resp, f"probe-measure-only:{m}")

    # Resolve date dimension (optional). Use any valid measure if we found one,
    # otherwise fall back to trying each spend candidate.
    date_dim = None
    probe_measures = [spend_measure] if spend_measure else SPEND_MEASURE_CANDIDATES
    for d in DATE_DIM_CANDIDATES:
        for m in probe_measures:
            resp = execute_query(session, token, slug, [m], [d], None, date_from, date_to)
            if resp.status_code < 400:
                date_dim = d
                break
            debug_response(resp, f"probe-date-dim:{d}:{m}")
        if date_dim:
            break

    ad_id_dim = try_dimension(
        session,
        token,
        slug,
        AD_ID_DIM_CANDIDATES,
        SPEND_MEASURE_CANDIDATES,
        date_dim,
        date_from,
        date_to,
    )
    if not ad_id_dim:
        raise RuntimeError("Could not resolve ad id dimension from candidates.")

    spend_measure = try_measure(
        session, token, slug, SPEND_MEASURE_CANDIDATES, ad_id_dim, date_dim, date_from, date_to
    )
    if not spend_measure:
        raise RuntimeError("Could not resolve spend measure from candidates.")

    click_measure = try_measure(
        session, token, slug, CLICK_MEASURE_CANDIDATES, ad_id_dim, date_dim, date_from, date_to
    ) or CLICK_MEASURE_CANDIDATES[0]

    impr_measure = try_measure(
        session, token, slug, IMPR_MEASURE_CANDIDATES, ad_id_dim, date_dim, date_from, date_to
    ) or IMPR_MEASURE_CANDIDATES[0]

    return ResolvedSchema(
        ad_id_dim=ad_id_dim,
        spend_measure=spend_measure,
        click_measure=click_measure,
        impr_measure=impr_measure,
        date_dim=date_dim,
    )


# ---------- MAIN ----------
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

    print("Resolving schema...")
    print(f"Date range: {DEFAULT_DATE_FROM} to {DEFAULT_DATE_TO}")
    schema = resolve_schema(sess, token, slug, DEFAULT_DATE_FROM, DEFAULT_DATE_TO)
    print("Resolved schema:")
    print(json.dumps(schema.__dict__, indent=2))

    measures = [
        schema.spend_measure,
        schema.click_measure,
        schema.impr_measure,
    ]
    dimensions = [schema.ad_id_dim]
    if schema.date_dim:
        dimensions.append(schema.date_dim)
    else:
        print("Warning: no date dimension found; YTD filter cannot be applied.")

    print("Running final query...")
    resp = execute_query(
        sess,
        token,
        slug,
        measures,
        dimensions,
        schema.date_dim,
        DEFAULT_DATE_FROM,
        DEFAULT_DATE_TO,
    )
    debug_response(resp, "final-query")
    resp.raise_for_status()

    # Stream CSV to disk, and normalize column names
    resp.raw.decode_content = True
    reader = csv.reader(io.TextIOWrapper(resp.raw, encoding="utf-8", newline=""))
    header = next(reader, [])
    if not header:
        raise SystemExit("No data returned (empty CSV header).")

    header_idx = {name: i for i, name in enumerate(header)}
    ad_idx = header_idx.get(schema.ad_id_dim)
    date_idx = header_idx.get(schema.date_dim) if schema.date_dim else None
    spend_idx = header_idx.get(schema.spend_measure)
    click_idx = header_idx.get(schema.click_measure)
    impr_idx = header_idx.get(schema.impr_measure)

    if ad_idx is None:
        raise SystemExit(f"Ad id dimension '{schema.ad_id_dim}' not found in response header.")

    out_name = "cross_channel_ad_level.csv"
    with open(out_name, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        out_header = ["ad_id", "spend", "clicks", "impressions"]
        if schema.date_dim:
            out_header.insert(1, "date")
        w.writerow(out_header)
        n = 0
        for row in reader:
            if not row:
                continue
            ad_id = row[ad_idx] if ad_idx is not None else ""
            spend = row[spend_idx] if spend_idx is not None else ""
            clicks = row[click_idx] if click_idx is not None else ""
            impr = row[impr_idx] if impr_idx is not None else ""
            # Filter: impressions > 0
            try:
                impr_val = float(impr or 0)
            except Exception:
                impr_val = 0.0
            if impr_val <= 0:
                continue

            if schema.date_dim:
                date_val = row[date_idx] if date_idx is not None else ""
                if not date_val:
                    # skip rows with missing date when date_dim is present
                    continue
                w.writerow([ad_id, date_val, spend, clicks, impr])
            else:
                w.writerow([ad_id, spend, clicks, impr])
            n += 1

    print(f"Done. Wrote {out_name} ({n} rows).")


if __name__ == "__main__":
    main()
