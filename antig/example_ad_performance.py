#!/usr/bin/env python3
"""
hello Fetch Alli ad_performance for clients into a unified CSV at ad/campaign granularity.

Grouping dims we try to pull (any that exist will be included):
  date, core_media_channel, channel, platform, publisher_platform, account_name,
  campaign_name, marketing_objective, campaign_objective, adgroup_name, ad_name

Measures aggregated (SUM over the dims above):
  cost, impressions, clicks

Works in Alli Workflows:
  - set env var ALLI_CLIENT_SLUG=bose (or CLIENT_SLUG / FORCE_SLUG)
  - CLI flags still work locally: --slug bose
"""

import os
import io
import csv
import sys
import argparse
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from urllib3.util.retry import Retry
from requests.adapters import HTTPAdapter

# ---------- constants ----------
TOKEN_URL = "https://login.alliplatform.com/token"
DE_BASE   = "https://dataexplorer.alliplatform.com/api/v2"
MODEL     = "ad_performance"

OUTPUT_COLUMNS = [
    "date",
    "core_media_channel",
    "channel",
    "platform",
    "publisher_platform",
    "account_name",
    "campaign_name",
    "marketing_objective",
    "campaign_objective",
    "adgroup_name",
    "ad_name",
    "cost",
    "impressions",
    "clicks",
    "client_slug",
]

# field aliases to try per logical column
FIELD_CANDIDATES = {
    "date":               ["date", "date_day"],

    "core_media_channel": ["core_media_channel"],
    "channel":            ["channel", "channel_name"],
    "platform":           ["platform"],
    "publisher_platform": ["publisher_platform"],

    "account_name":       ["account_name", "account", "account_name_text"],
    "campaign_name":      ["campaign_name", "campaign"],
    "marketing_objective":["marketing_objective", "objective"],
    "campaign_objective": ["campaign_objective", "marketing_objective", "objective"],

    "adgroup_name":       ["adgroup_name", "ad_group_name", "ad_set_name", "adset_name", "adgroup", "ad_group"],
    "ad_name":            ["ad_name", "creative_name", "ad"],

    "cost":               ["cost"],
    "impressions":        ["impressions"],
    "clicks":             ["clicks"],
}

DEFAULT_DATE_FROM = "yesterday - 1"
DEFAULT_DATE_TO   = "yesterday"

TIMEOUT_HEADER = (10, 120)
TIMEOUT_STREAM = (10, 1200)
RETRY_CFG = Retry(
    total=3, connect=2, read=2, backoff_factor=0.4,
    status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=frozenset(["GET", "POST"]),
    respect_retry_after_header=True,
)

# ---------- HTTP helpers ----------
def make_session() -> requests.Session:
    s = requests.Session()
    adapter = HTTPAdapter(max_retries=RETRY_CFG, pool_connections=50, pool_maxsize=100)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    s.headers.update({
        "Accept-Encoding": "gzip, deflate",
        "User-Agent": "alli-ad-perf-fetch/1.8",
    })
    return s

def get_token(session: requests.Session) -> str:
    cid = os.environ.get("STRATEGY_OAUTH_CLIENT_ID")
    csec = os.environ.get("STRATEGY_OAUTH_CLIENT_SECRET")
    if not cid or not csec:
        raise EnvironmentError("Missing STRATEGY_OAUTH_CLIENT_ID or STRATEGY_OAUTH_CLIENT_SECRET")
    r = session.post(
        TOKEN_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": cid,
            "client_secret": csec,
            "scope": "central.read",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
        timeout=TIMEOUT_HEADER
    )
    r.raise_for_status()
    tok = r.json().get("access_token")
    if not tok:
        raise RuntimeError("No access_token in token response")
    return tok

# ---------- low level query ----------
def post_csv(session, token, slug, measures, dimensions, date_dim, date_from, date_to, timeout):
    url = f"{DE_BASE}/clients/{slug}/models/{MODEL}/execute-query"
    payload = {
        "measures": measures,
        "dimensions": dimensions,
        "timeDimensions": [{
            "dimension": date_dim,
            "dateRange": {"from": date_from, "to": date_to},
            "granularity": "day"
        }],
        "order": {date_dim: "asc"}
    }
    resp = session.post(
        url, json=payload, stream=True,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "text/csv"},
        timeout=timeout
    )
    return resp

def detect_date_dim(session, token, slug, date_from, date_to):
    for dd in ("date", "date_day"):
        r = post_csv(session, token, slug, ["clicks"], [dd], dd, date_from, date_to, TIMEOUT_HEADER)
        try:
            r.raise_for_status()
            # ensure it actually returns a header
            r.raw.decode_content = True
            rdr = csv.reader(io.TextIOWrapper(r.raw, encoding="utf-8", newline=""))
            header = next(rdr, [])
            if header:
                return dd
        except Exception:
            pass
    return None

def find_working_alias(session, token, slug, date_dim, logical_key, date_from, date_to):
    """
    try aliases for one logical dimension. return the first alias that works, else None.
    """
    for alias in FIELD_CANDIDATES.get(logical_key, [logical_key]):
        r = post_csv(session, token, slug, ["clicks"], [date_dim, alias], date_dim, date_from, date_to, TIMEOUT_HEADER)
        try:
            r.raise_for_status()
            r.raw.decode_content = True
            rdr = csv.reader(io.TextIOWrapper(r.raw, encoding="utf-8", newline=""))
            header = next(rdr, [])
            if header and alias in header:
                return alias
        except Exception:
            continue
    return None

def discover_schema(session, token, slug, date_from, date_to):
    """
    discover date_dim, a list of working dimension field names, and available measures.
    """
    date_dim = detect_date_dim(session, token, slug, date_from, date_to)
    if not date_dim:
        return None, [], []

    # discover dims one-by-one so a bad alias doesn’t nuke the whole set
    logical_dims = [
        "core_media_channel","channel","platform","publisher_platform",
        "account_name","campaign_name","marketing_objective","campaign_objective",
        "adgroup_name","ad_name"
    ]
    dims = [date_dim]
    for key in logical_dims:
        alias = find_working_alias(session, token, slug, date_dim, key, date_from, date_to)
        if alias and alias not in dims:
            dims.append(alias)

   # fixed measures — request exactly these in the real stream
    measures = ["cost", "impressions", "clicks"]
    return date_dim, dims, measures

# ---------- streaming with live header mapping ----------
def stream_rows(session, token, slug, measures, dimensions, date_dim,
                writer, write_lock, date_from, date_to, enforce_cost_filter):
    resp = post_csv(session, token, slug, measures, dimensions, date_dim, date_from, date_to, TIMEOUT_STREAM)
    resp.raise_for_status()
    resp.raw.decode_content = True
    text_stream = io.TextIOWrapper(resp.raw, encoding="utf-8", newline="")
    reader = csv.reader(text_stream)

    header = next(reader, [])
    if not header:
        return 0
    hdr_idx = {name: i for i, name in enumerate(header)}

    def col_index(key):
        for cand in FIELD_CANDIDATES.get(key, [key]):
            if cand in hdr_idx:
                return hdr_idx[cand]
        return None

    live_index_map = {k: col_index(k) for k in OUTPUT_COLUMNS if k != "client_slug"}
    cost_idx = live_index_map.get("cost")

    n = 0
    for row in reader:
        if not row or (len(row) == 1 and row[0].strip() == ""):
            continue
        if enforce_cost_filter and cost_idx is not None:
            try:
                if float(row[cost_idx] or 0) <= 0:
                    continue
            except Exception:
                continue

        out = []
        for col in OUTPUT_COLUMNS:
            if col == "client_slug":
                out.append(slug)
            else:
                idx = live_index_map.get(col)
                out.append(row[idx] if idx is not None and idx < len(row) else "")
        with write_lock:
            writer.writerow(out)
        n += 1
    return n

# ---------- presence csv ----------
def read_presence_slugs(path):
    slugs = []
    try:
        with open(path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if (row.get("has_ad_performance") or "").strip().lower() == "yes":
                    s = (row.get("client_slug") or "").strip()
                    if s:
                        slugs.append(s)
    except FileNotFoundError:
        pass
    # de-dupe preserve order
    seen = set(); out = []
    for s in slugs:
        if s not in seen:
            seen.add(s); out.append(s)
    return out

# ---------- per-client ----------
def process_client(slug, token, writer, write_lock, date_from, date_to, enforce_cost_filter):
    sess = make_session()
    date_dim, dims, measures = discover_schema(sess, token, slug, date_from, date_to)
    if not date_dim or not dims or not measures:
        return slug, 0, "no-fields"

    try:
        n = stream_rows(
            sess, token, slug, measures, dims, date_dim,
            writer, write_lock,
            date_from, date_to,
            enforce_cost_filter=enforce_cost_filter
        )
        return slug, n, "ok"
    except requests.RequestException as e:
        return slug, 0, f"stream-error:{str(e)[:160]}"

# ---------- main ----------
def main():
    ap = argparse.ArgumentParser(description="Fetch Alli ad_performance for clients into a unified CSV")
    ap.add_argument("--presence", default="ad_perf_presence.csv",
                    help="CSV from step 2 - still supported and left in for later use")
    ap.add_argument("--slug", default=None,
                    help="single client slug to fetch (overrides --presence if provided)")
    ap.add_argument("--out", default="ad_performance.csv",
                    help="output CSV filename (default: ad_performance.csv)")
    ap.add_argument("--workers", type=int, default=8, help="parallel workers (default: 8)")
    ap.add_argument("--from", dest="date_from", default=DEFAULT_DATE_FROM,
                    help=f"date range start (default: {DEFAULT_DATE_FROM})")
    ap.add_argument("--to", dest="date_to", default=DEFAULT_DATE_TO,
                    help=f"date range end (default: {DEFAULT_DATE_TO})")
    ap.add_argument("--no-cost-filter", action="store_true",
                    help="do not filter cost > 0 even if cost is present")
    args = ap.parse_args()

    # allow override via env vars in Alli Workflows
    env_slug = (os.environ.get("ALLI_CLIENT_SLUG") or os.environ.get("CLIENT_SLUG") or os.environ.get("FORCE_SLUG"))
    if env_slug and not args.slug:
        args.slug = env_slug.strip().lower()

    if args.slug:
        slugs = [s.strip().lower() for s in str(args.slug).split(",") if s.strip()]
    else:
        slugs = read_presence_slugs(args.presence)
    if not slugs:
        print("no clients provided via --slug/ALLI_CLIENT_SLUG and none marked yes in presence CSV", file=sys.stderr)
        sys.exit(1)
    
    # auto-name the output when there's exactly one slug and the user didn't override --out
    if (not args.out) or (args.out == "ad_performance.csv"):
        if len(slugs) == 1:
            args.out = f"{slugs[0]}_ad_performance.csv"

    root = make_session()
    token = get_token(root)

    write_lock = threading.Lock()
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(OUTPUT_COLUMNS)

        max_workers = min(args.workers, max(1, len(slugs)))
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = [
                pool.submit(
                    process_client, slug, token, writer, write_lock,
                    args.date_from, args.date_to,
                    enforce_cost_filter=(not args.no_cost_filter),
                )
                for slug in slugs
            ]
            total = 0
            for fut in as_completed(futures):
                slug, n, status = fut.result()
                total += n
                print(f"{slug}: {status} ({n} rows)")

    print(f"\ncombined output -> {args.out}  |  total rows written: {total}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)