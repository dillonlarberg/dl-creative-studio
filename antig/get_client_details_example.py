import json
import os
import sys
from pathlib import Path
from typing import Any, Iterable, List, Tuple

import requests


BASE_URL = "https://api.central.alliplatform.com"
HEADERS = {"Accept": "application/json"}
OUT_FILE = Path(__file__).resolve().parent / "pmgclient.json"
CLIENT_FIELDS: Tuple[str, ...] = ("id", "name", "enabled", "state", "timezone", "slug")


def _required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise EnvironmentError(f"{name} must be set in the environment")
    return value


def _dump_resp_details(resp: requests.Response) -> None:
    print(f"status={resp.status_code} content-type={resp.headers.get('content-type')}")


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


def _extract_client_record(client: dict) -> dict:
    return {field: client.get(field) for field in CLIENT_FIELDS}


def _print_clients(clients: Iterable[dict]) -> None:
    clients = list(clients)
    if not clients:
        print("No clients returned.")
        return

    for client in clients:
        print(json.dumps(client, indent=2))


def _write_json_file(payload: Any, path: Path) -> None:
    try:
        if isinstance(payload, (dict, list)):
            path.write_text(json.dumps(payload, indent=2))
        else:
            path.write_text(str(payload))
    except OSError as exc:
        print(f"Failed to write {path}: {exc}", file=sys.stderr)


def main() -> int:
    token = _required_env("ALLI_OAUTH_TOKEN")
    resp = requests.get(
        f"{BASE_URL}/clients",
        headers={
            "Authorization": f"Bearer {token}",
            **HEADERS,
        },
        timeout=10,
    )
    _dump_resp_details(resp)
    payload = _parse_payload(resp)
    if not resp.ok:
        print(f"Request failed: {resp.status_code}", file=sys.stderr)
        if isinstance(payload, str):
            print(payload, file=sys.stderr)
        return 1

    records = [_extract_client_record(client) for client in _clients_from_payload(payload)]
    _write_json_file(records, OUT_FILE)
    _print_clients(records)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except EnvironmentError as exc:
        print(exc, file=sys.stderr)
        raise
