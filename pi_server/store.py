"""Persistence. Redis when configured, SQLite on a laptop, memory on Vercel."""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import urllib.request
from pathlib import Path

from pi_server.model import DexError, blank_state, make_seed_state

log = logging.getLogger("pokedex.store")

REDIS_KEY = "pokedex:state"


class MemoryBackend:
    name = "memory"

    def __init__(self):
        self.doc = None

    def load(self):
        if not self.doc:
            return None
        return json.loads(self.doc)

    def save(self, data: dict) -> None:
        self.doc = json.dumps(data)


class SqliteBackend:
    name = "sqlite"

    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, doc TEXT NOT NULL)"
        )
        self.conn.commit()

    def load(self):
        row = self.conn.execute("SELECT doc FROM state WHERE id = 1").fetchone()
        if not row:
            return None
        return json.loads(row[0])

    def save(self, data: dict) -> None:
        doc = json.dumps(data)
        self.conn.execute(
            "INSERT INTO state (id, doc) VALUES (1, ?) "
            "ON CONFLICT(id) DO UPDATE SET doc = excluded.doc",
            (doc,),
        )
        self.conn.commit()


class RedisRestBackend:
    """Upstash / Vercel KV over HTTPS. No TCP client required."""

    name = "redis"

    def __init__(self, url: str, token: str):
        self.url = url.rstrip("/")
        self.token = token

    def load(self):
        result = self._command("GET", REDIS_KEY)
        if not result:
            return None
        return json.loads(result)

    def save(self, data: dict) -> None:
        self._command("SET", REDIS_KEY, json.dumps(data))

    def _command(self, *args):
        req = urllib.request.Request(
            self.url,
            data=json.dumps(list(args)).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        return body.get("result")


class RedisUrlBackend:
    name = "redis"

    def __init__(self, url: str):
        import redis

        self.client = redis.Redis.from_url(url, decode_responses=True)

    def load(self):
        raw = self.client.get(REDIS_KEY)
        if not raw:
            return None
        return json.loads(raw)

    def save(self, data: dict) -> None:
        self.client.set(REDIS_KEY, json.dumps(data))


class Store:
    def __init__(self, backend, seed: bool = True):
        self.backend = backend
        self.lock = threading.Lock()
        loaded = None
        try:
            loaded = backend.load()
        except Exception:
            log.exception("could not load %s; starting from the demo seed", backend.name)
        if loaded and loaded.get("contacts"):
            self.state = loaded
        elif seed:
            self.state = make_seed_state()
            self._persist()
        else:
            self.state = blank_state()

    @property
    def kind(self) -> str:
        return getattr(self.backend, "name", "memory")

    def reset(self) -> dict:
        with self.lock:
            self.state = make_seed_state()
            self._persist()
            return self.state

    def call(self, fn, *args, **kwargs):
        with self.lock:
            result = fn(self.state, *args, **kwargs)
            self._persist()
            return result

    def read(self, fn, *args, **kwargs):
        with self.lock:
            return fn(self.state, *args, **kwargs)

    def _persist(self) -> None:
        try:
            self.backend.save(self.state)
        except Exception:
            log.exception("save failed on %s; keeping this process's copy", self.kind)

    def list_contacts(self):
        from pi_server.model import list_contacts

        return self.read(list_contacts)

    def approve_contact(self, contact_id: int):
        from pi_server.model import approve_contact

        return self.call(approve_contact, int(contact_id))

    def skip_contact(self, contact_id: int):
        from pi_server.model import skip_contact

        return self.call(skip_contact, int(contact_id))


def kv_rest_credentials() -> tuple[str, str] | None:
    pairs = (
        ("KV_REST_API_URL", "KV_REST_API_TOKEN"),
        ("UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"),
    )
    for url_key, token_key in pairs:
        url = os.environ.get(url_key, "").strip()
        token = os.environ.get(token_key, "").strip()
        if url and token:
            return url, token
    return None


def make_store() -> Store:
    forced = os.environ.get("DEX_STORE", "").strip().lower()
    if forced == "memory":
        return Store(MemoryBackend())
    if forced == "sqlite":
        return Store(SqliteBackend(_sqlite_path()))

    creds = kv_rest_credentials()
    if creds and forced != "sqlite":
        try:
            backend = RedisRestBackend(*creds)
            backend.load()
            log.info("store: redis rest")
            return Store(backend)
        except Exception:
            log.exception("redis rest failed; falling back")

    redis_url = os.environ.get("REDIS_URL", "").strip()
    if redis_url and forced != "sqlite":
        try:
            backend = RedisUrlBackend(redis_url)
            backend.load()
            log.info("store: redis url")
            return Store(backend)
        except Exception:
            log.exception("REDIS_URL failed; falling back")

    if os.environ.get("VERCEL") or forced == "memory":
        log.info("store: memory (seeded)")
        return Store(MemoryBackend())

    path = _sqlite_path()
    log.info("store: sqlite %s", path)
    return Store(SqliteBackend(path))


def _sqlite_path() -> Path:
    raw = os.environ.get("DEX_DB", "").strip()
    if raw:
        return Path(raw)
    root = Path(__file__).resolve().parents[1]
    return root / "data" / "dex.sqlite"


# Re-export so callers can catch one error type.
__all__ = ["Store", "make_store", "DexError", "MemoryBackend"]
