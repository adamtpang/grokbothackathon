"""The Pi uses this when HUB_URL points at the Vercel (or laptop) hub."""

from __future__ import annotations

import json
import urllib.error
import urllib.request


class HubError(RuntimeError):
    pass


class HubClient:
    def __init__(self, base_url: str):
        self.base = base_url.rstrip("/")

    def list_contacts(self) -> list[dict]:
        payload = self._request("GET", "/api/contacts")
        return payload["contacts"]

    def approve_contact(self, contact_id: int) -> dict:
        return self._request("POST", f"/api/contacts/{int(contact_id)}/approve")

    def skip_contact(self, contact_id: int) -> dict:
        return self._request("POST", f"/api/contacts/{int(contact_id)}/skip")

    def scan(self, payload: dict) -> dict:
        return self._request("POST", "/api/scans", payload)

    def _request(self, method: str, path: str, body: dict | None = None):
        data = None if body is None else json.dumps(body).encode("utf-8")
        req = urllib.request.Request(
            self.base + path,
            data=data,
            method=method,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:400]
            raise HubError(f"{method} {path} -> HTTP {exc.code}: {detail}") from exc
