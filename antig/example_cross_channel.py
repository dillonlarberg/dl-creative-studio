#!/usr/bin/env python3
"""
Cross-channel monthly aggregator.

For each client defined in full_input.csv:

  • authenticate using the same client_credentials flow as ad_performance script
  • query cross_channel for each month from 2024-01 to last full month
  • aggregate spend, clicks, impressions by platform
  • write one CSV per client per month:

        <slug>_<YYYY-MM>_cross_channel_summary.csv

full_input.csv must contain columns:
    slug
    date_column
    platform_column
    spend_metric
    click_metric
    impression_metric
"""

import csv
import io
import os
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Dict, List, Tuple

import requests
from requests.adapters import HTTPAdapter
from zoneinfo import ZoneInfo


# ---------- CONSTANTS ----------
TOKEN_URL = "https://login.alliplatform.com/token"
DE_BASE = "https://dataexplorer.alliplatform.com/api/v2"
MODEL = "cross_channel"
FULL_INPUT_CSV = "full_input.csv"

TIMEOUT_HEADER = (10, 120)
TIMEOUT_STREAM = (10, 600)

START_YEAR = 2025
START_MONTH = 11


# ---------- DATA STRUCTURES ----------
@dataclass
class ClientSchema:
    slug: str
    date_column: str
    platform_column: str
    spend_metric: str
    click_metric: str
    impression_metric: str


# ---------- AUTH ----------
def make_session() -> requests.Session:
    s = requests.Session()
    adapter = HTTPAdapter(max_retries=0, pool_connections=50, pool_maxsize=100)
    s.mount("https://", adapter)
    s.mount("http://", adapter)
    s.headers.update({
        "Accept-Encoding": "gzip, deflate",
        "User-Agent": "alli-cross-channel-agg/1.0",
    })
    return s


def get_token(session: requests.Session) -> str:
    cid = os.environ.get("STRATEGY_OAUTH_CLIENT_ID")
    csec = os.environ.get("STRATEGY_OAUTH_CLIENT_SECRET")

    if not cid or not csec:
        raise EnvironmentError("Missing STRATEGY_OAUTH_CLIENT_ID or STRATEGY_OAUTH_CLIENT_SECRET")

    resp = session.post(
        TOKEN_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": cid,
            "client_secret": csec,
            "scope": "central.read",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded",
                 "Accept": "application/json"},
        timeout=TIMEOUT_HEADER,
    )

    try:
        resp.raise_for_status()
    except Exception as e:
        print("Token request failed:", file=sys.stderr)
        print(resp.text[:500], file=sys.stderr)
        raise

    tok = resp.json().get("access_token")
    if not tok:
        raise RuntimeError("No access_token in token response")

    return tok


# ---------- SCHEMA ----------
def load_client_schemas(path: str) -> Dict[str, ClientSchema]:
    schemas = {}

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_slug = (row.get("slug") or "").strip()
            if not raw_slug:
                continue

            slug = raw_slug.lower()
            date_column = (row.get("date_column") or "").strip()
            platform_column = (row.get("platform_column") or "").strip()
            spend_metric = (row.get("spend_metric") or "").strip()
            click_metric = (row.get("click_metric") or "").strip()
            impression_metric = (row.get("impression_metric") or "").strip()

            missing = [
                name for name, val in [
                    ("date_column", date_column),
                    ("platform_column", platform_column),
                    ("spend_metric", spend_metric),
                    ("click_metric", click_metric),
                    ("impression_metric", impression_metric),
                ] if not val
            ]

            if missing:
                print(f"skipping slug '{raw_slug}': missing {missing}", file=sys.stderr)
                continue

            schemas[slug] = ClientSchema(
                slug=slug,
                date_column=date_column,
                platform_column=platform_column,
                spend_metric=spend_metric,
                click_metric=click_metric,
                impression_metric=impression_metric,
            )

    return schemas


# ---------- DATE HELPERS ----------
def last_full_month_ct() -> Tuple[int, int]:
    now = datetime.now(ZoneInfo("America/Chicago")).date()
    first_this_month = now.replace(day=1)
    last_prev = first_this_month - timedelta(days=1)
    return last_prev.year, last_prev.month


def month_iter(start_y, start_m, end_y, end_m):
    y, m = start_y, start_m
    while (y < end_y) or (y == end_y and m <= end_m):
        yield y, m
        m += 1
        if m == 13:
            y += 1
            m = 1


def month_bounds(y: int, m: int) -> Tuple[str, str]:
    start = date(y, m, 1)
    if m == 12:
        end = date(y + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(y, m + 1, 1) - timedelta(days=1)

    return start.isoformat(), end.isoformat()


def month_key_from_date(date_str: str, fallback_y, fallback_m):
    if not date_str:
        return f"{fallback_y:04d}-{fallback_m:02d}"

    try:
        if "-" in date_str:
            dt = datetime.fromisoformat(date_str.replace("Z", "")).date()
        elif "/" in date_str:
            m, d, y = date_str.split("/")
            dt = date(int(y), int(m), int(d))
        else:
            raise ValueError
        return f"{dt.year:04d}-{dt.month:02d}"
    except Exception:
        return f"{fallback_y:04d}-{fallback_m:02d}"


# ---------- DE QUERY ----------
def post_cross_channel(
    session, token, schema, date_from, date_to, slug
) -> requests.Response:
    url = f"{DE_BASE}/clients/{slug}/models/{MODEL}/execute-query"

    payload = {
        "measures": [
            schema.spend_metric,
            schema.click_metric,
            schema.impression_metric,
        ],
        "dimensions": [schema.platform_column],
        "timeDimensions": [
            {
                "dimension": schema.date_column,
                "dateRange": {"from": date_from, "to": date_to},
                "granularity": "day",
            }
        ],
        "order": {schema.spend_metric: "desc"},
        "limit": 50000,
    }

    resp = session.post(
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

    return resp


def aggregate_from_response(
    resp, schema, slug, y, m, agg_map
) -> int:
    """
    Reads CSV rows, aggregates into agg_map[(slug, month, platform)].
    Returns count of source rows processed.
    """

    resp.raise_for_status()
    resp.raw.decode_content = True
    reader = csv.reader(io.TextIOWrapper(resp.raw, encoding="utf-8", newline=""))
    header = next(reader, [])

    if not header:
        return 0

    header_idx = {name: i for i, name in enumerate(header)}

    date_col = schema.date_column
    if date_col not in header_idx:
        if date_col == "date" and "date_day" in header_idx:
            date_col = "date_day"
        elif date_col == "date_day" and "date" in header_idx:
            date_col = "date"

    if date_col not in header_idx:
        return 0

    plat_idx = header_idx.get(schema.platform_column)
    spend_idx = header_idx.get(schema.spend_metric)
    click_idx = header_idx.get(schema.click_metric)
    impr_idx = header_idx.get(schema.impression_metric)
    date_idx = header_idx[date_col]

    nrows = 0

    for row in reader:
        if not row:
            continue

        try:
            date_val = row[date_idx]
            platform = row[plat_idx]
        except Exception:
            continue

        if not platform:
            continue

        platform = platform.strip()
        month_key = month_key_from_date(date_val, y, m)

        def num(x):
            try:
                return float(x or 0)
            except:
                return 0.0

        spend = num(row[spend_idx]) if spend_idx is not None else 0.0
        clicks = num(row[click_idx]) if click_idx is not None else 0.0
        impr = num(row[impr_idx]) if impr_idx is not None else 0.0

        bucket = agg_map[(slug, month_key, platform)]
        bucket["spend"] += spend
        bucket["clicks"] += clicks
        bucket["impressions"] += impr

        nrows += 1

    return nrows


# ---------- PROCESS PER CLIENT ----------
def process_client(slug, schema, token, months):
    sess = make_session()
    client_agg = defaultdict(lambda: {"spend": 0.0, "clicks": 0.0, "impressions": 0.0})
    total_rows = 0

    for (y, m) in months:
        date_from, date_to = month_bounds(y, m)
        resp = post_cross_channel(sess, token, schema, date_from, date_to, slug)

        if resp.status_code in (400, 404) or resp.status_code >= 500:
            continue

        n = aggregate_from_response(resp, schema, slug, y, m, client_agg)
        total_rows += n

    print(f"{slug}: {total_rows} rows processed")
    return slug, client_agg


# ---------- WRITE OUTPUT ----------
def write_client_month_files(global_agg):
    per_client_month = defaultdict(list)

    for (slug, month, platform), vals in global_agg.items():
        per_client_month[(slug, month)].append(
            (slug, month, platform, vals["spend"], vals["clicks"], vals["impressions"])
        )

    for (slug, month), rows in sorted(per_client_month.items()):
        out_name = f"{slug}_{month}_cross_channel_summary.csv"
        with open(out_name, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(
                ["client_slug", "month", "platform", "spend", "clicks", "impressions"]
            )
            for r in rows:
                writer.writerow(r)

        print(f"wrote {out_name} ({len(rows)} rows)")


# ---------- MAIN ----------
def main():
    schemas = load_client_schemas(FULL_INPUT_CSV)
    if not schemas:
        print("no valid schemas found", file=sys.stderr)
        sys.exit(1)

    slugs = sorted(schemas.keys())
    print("clients:", ", ".join(slugs))

    end_y, end_m = last_full_month_ct()
    months = list(month_iter(START_YEAR, START_MONTH, end_y, end_m))

    root_sess = make_session()
    token = get_token(root_sess)

    # global agg: (slug, month, platform) → metrics
    global_agg = defaultdict(lambda: {"spend": 0.0, "clicks": 0.0, "impressions": 0.0})

    with ThreadPoolExecutor(max_workers=min(16, len(slugs))) as pool:
        futures = [
            pool.submit(process_client, slug, schemas[slug], token, months)
            for slug in slugs
        ]

        for fut in as_completed(futures):
            slug, client_agg = fut.result()
            for key, vals in client_agg.items():
                bucket = global_agg[key]
                bucket["spend"] += vals["spend"]
                bucket["clicks"] += vals["clicks"]
                bucket["impressions"] += vals["impressions"]

    write_client_month_files(global_agg)


if __name__ == "__main__":
    main()
