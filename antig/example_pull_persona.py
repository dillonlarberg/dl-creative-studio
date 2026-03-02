#!/usr/bin/env python3
"""
export_persona_summary.py

Single-script workflow:
 - Reads env vars:
     ALLI_OAUTH_TOKEN  (required)  -> JWT (can be "Bearer ..." or raw)
     ALLI_CLIENT_ID    (required)  -> client id for `clientid` header
     AUDIENCEPLANNER_HOST (optional) -> defaults to production host
 - Calls /api/persona/search to list personas (uses "published" view).
 - Falls back to limit/offset paging and archived=false if nothing found.
 - Calls /api/persona/{id} for each persona to fetch full details.
 - Writes:
     - persona_search.json
     - persona_search_briefs.json
     - persona_details.json
     - persona_details_by_id.csv  (id, full_json)
     - persona_summary.csv        (id, name, summary, motivations, characteristics)
"""
from __future__ import annotations

import base64
import csv
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ---------- CONFIG ----------
TOKEN = os.environ.get("ALLI_OAUTH_TOKEN", "").strip()
CLIENT_ID = (os.environ.get("ALLI_CLIENT_ID", "") or os.environ.get("ALLI_CLIENT_ID_HEADER", "")).strip()
HOST = os.environ.get("AUDIENCEPLANNER_HOST", "https://audienceplanner.alliplatform.com").strip().rstrip("/") or "https://audienceplanner.alliplatform.com"

# tweakable defaults - change here if you want different behavior
SEARCH_VIEWS = "published"
SLEEP_SECONDS = 0.15
LIMIT = 50
MAX_PAGES = 50
OUTDIR = Path(".")  # working dir; workflow will capture outputs here

# ---------- helpers ----------
def normalize_token(raw: str) -> str:
    s = raw.strip().strip('"').strip("'")
    if s.lower().startswith("bearer "):
        s = s[7:].strip()
    return "".join(s.split())

def jwt_payload(token: str) -> Dict[str, Any]:
    token = normalize_token(token)
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Not a JWT")
    payload_b64 = parts[1] + "=" * (-len(parts[1]) % 4)
    return json.loads(base64.urlsafe_b64decode(payload_b64.encode("utf-8")))

def is_jwt_expired(token: str) -> bool:
    payload = jwt_payload(token)
    exp = float(payload.get("exp", 0))
    return datetime.now(timezone.utc).timestamp() > exp

def make_headers(token: str, client_id: str) -> Dict[str, str]:
    token = normalize_token(token)
    return {
        "Authorization": f"Bearer {token}",
        "clientid": client_id,
        "Accept": "application/json",
    }

def setup_session(retries: int = 3, backoff_factor: float = 0.5, status_forcelist: Tuple[int, ...] = (429, 500, 502, 503, 504)) -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=retries,
        read=retries,
        connect=retries,
        status=retries,
        status_forcelist=status_forcelist,
        backoff_factor=backoff_factor,
        raise_on_status=False,
        allowed_methods=frozenset(["GET"]),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    return session

def request_json(session: requests.Session, method: str, url: str, headers: Dict[str, str], params: Optional[Dict[str, Any]] = None, timeout: int = 30) -> Any:
    r = session.request(method, url, headers=headers, params=params, timeout=timeout)
    if r.status_code >= 400:
        print(f"\nERROR {r.status_code} for {url}")
        print("Response (first 800 chars):", r.text[:800])
        r.raise_for_status()
    if not r.text:
        return None
    return r.json()

def extract_persona_list(data: Any) -> List[Dict[str, Any]]:
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        for key in ("data", "results", "personas"):
            if isinstance(data.get(key), list):
                return [x for x in data[key] if isinstance(x, dict)]
    return []

def join_list(value: Any) -> str:
    if not value:
        return ""
    if isinstance(value, list):
        out = []
        for v in value:
            if isinstance(v, (str, int, float)):
                out.append(str(v))
            elif isinstance(v, dict):
                for k in ("label", "name", "title", "displayName", "value"):
                    if k in v and v[k]:
                        out.append(str(v[k]))
                        break
                else:
                    out.append(json.dumps(v, ensure_ascii=False))
            else:
                out.append(str(v))
        return "; ".join(out)
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False)
    return str(value)

# ---------- main ----------
def main() -> None:
    # validate env
    if not TOKEN:
        raise SystemExit("Missing env var: ALLI_OAUTH_TOKEN")
    if not CLIENT_ID:
        raise SystemExit("Missing env var: ALLI_CLIENT_ID (or ALLI_CLIENT_ID_HEADER)")

    tok_norm = normalize_token(TOKEN)
    if "..." in tok_norm:
        raise SystemExit("Token appears truncated (contains '...')")

    if tok_norm.count(".") == 2:
        try:
            if is_jwt_expired(tok_norm):
                exp = jwt_payload(tok_norm).get("exp")
                raise SystemExit(f"Token expired at {datetime.fromtimestamp(float(exp), tz=timezone.utc).isoformat()}")
        except ValueError:
            # not a JWT - that's allowed; continue
            pass

    outdir = OUTDIR
    outdir.mkdir(parents=True, exist_ok=True)

    session = setup_session()
    headers = make_headers(TOKEN, CLIENT_ID)

    SEARCH_URL = f"{HOST}/api/persona/search"
    DETAIL_URL = f"{HOST}/api/persona/{{persona_id}}"

    search_runs: List[Dict[str, Any]] = []
    persona_briefs: Dict[str, Dict[str, Any]] = {}

    # primary search
    primary_params = {"views": SEARCH_VIEWS}
    print(f"Searching personas: {SEARCH_URL} params={primary_params} ...")
    data = request_json(session, "GET", SEARCH_URL, headers, params=primary_params)
    search_runs.append({"variant": "primary", "params": primary_params, "response": data})
    for p in extract_persona_list(data):
        pid = p.get("id") or p.get("_id")
        if pid:
            persona_briefs[str(pid)] = p

    # fallback to paging if none found
    if len(persona_briefs) == 0:
        print("No personas found via primary search. Trying limit/offset paging...")
        for page in range(MAX_PAGES):
            offset = page * LIMIT
            params = {"limit": LIMIT, "offset": offset}
            print(f"Searching personas: {SEARCH_URL} params={params} ...")
            data = request_json(session, "GET", SEARCH_URL, headers, params=params)
            search_runs.append({"variant": "limit_offset", "params": params, "response": data})
            before = len(persona_briefs)
            for p in extract_persona_list(data):
                pid = p.get("id") or p.get("_id")
                if pid and str(pid) not in persona_briefs:
                    persona_briefs[str(pid)] = p
            if len(persona_briefs) == before:
                break

        # try archived=false if still empty
        if len(persona_briefs) == 0:
            params = {"views": SEARCH_VIEWS, "archived": "false"}
            print(f"Searching personas: {SEARCH_URL} params={params} ...")
            data = request_json(session, "GET", SEARCH_URL, headers, params=params)
            search_runs.append({"variant": "views_archived_false", "params": params, "response": data})
            for p in extract_persona_list(data):
                pid = p.get("id") or p.get("_id")
                if pid:
                    persona_briefs[str(pid)] = p

    # write persona_search.json and briefs
    with open(outdir / "persona_search.json", "w", encoding="utf-8") as f:
        json.dump(search_runs, f, ensure_ascii=False, indent=2)
    with open(outdir / "persona_search_briefs.json", "w", encoding="utf-8") as f:
        json.dump(list(persona_briefs.values()), f, ensure_ascii=False, indent=2)

    print(f"Found {len(persona_briefs)} personas.")

    if len(persona_briefs) == 0:
        print("No personas found after fallbacks. Check persona_search.json for raw responses.")
        return

    # fetch details
    details: List[Dict[str, Any]] = []
    details_by_id: Dict[str, Dict[str, Any]] = {}

    for i, pid in enumerate(list(persona_briefs.keys()), start=1):
        print(f"[{i}/{len(persona_briefs)}] Fetching details for {pid} ...")
        try:
            d = request_json(session, "GET", DETAIL_URL.format(persona_id=pid), headers=headers)
            details.append(d if d is not None else {})
            details_by_id[str(pid)] = d if d is not None else {}
        except Exception as e:
            print(f"Warning: failed to fetch {pid}: {e}")
            details_by_id[str(pid)] = {"_error": str(e)}
        time.sleep(SLEEP_SECONDS)

    # write raw details
    with open(outdir / "persona_details.json", "w", encoding="utf-8") as f:
        json.dump(details, f, ensure_ascii=False, indent=2)

    # write details_by_id csv (id, full_json)
    with open(outdir / "persona_details_by_id.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "detail_json"])
        for pid, obj in details_by_id.items():
            try:
                w.writerow([pid, json.dumps(obj, ensure_ascii=False)])
            except Exception:
                w.writerow([pid, ""])

    # build and write summary CSV
    summary_path = outdir / "persona_summary.csv"
    with open(summary_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["id", "name", "summary", "motivations", "characteristics"])
        writer.writeheader()
        count = 0
        for obj in details:
            if not isinstance(obj, dict):
                continue
            pid = str(obj.get("id") or obj.get("_id") or "")
            name = obj.get("name") or obj.get("title") or ""
            summary = obj.get("summary") or obj.get("description") or ""
            motivations = join_list(obj.get("motivations") or obj.get("motivators") or [])
            characteristics = join_list(obj.get("characteristics") or [])
            writer.writerow({
                "id": pid,
                "name": name,
                "summary": summary,
                "motivations": motivations,
                "characteristics": characteristics,
            })
            count += 1

    print("Done.")
    print(f"Wrote: {outdir / 'persona_search.json'}")
    print(f"Wrote: {outdir / 'persona_search_briefs.json'}")
    print(f"Wrote: {outdir / 'persona_details.json'}")
    print(f"Wrote: {outdir / 'persona_details_by_id.csv'}")
    print(f"Wrote: {summary_path} ({count} rows)")

if __name__ == "__main__":
    main()
