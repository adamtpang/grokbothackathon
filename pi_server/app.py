"""HTTP hub: dex UI, /scan, REST, and MCP."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
import urllib.request
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from pi_server import __version__
from pi_server.catalog import SAMPLES
from pi_server.images import monogram_sprite
from pi_server.mcp_server import DEFAULT_PROTOCOL, handle
from pi_server.model import (
    DexError,
    approve_contact,
    attach_profile,
    decide,
    decided_since,
    get_contact,
    get_item,
    list_contacts,
    list_items,
    now_iso,
    queue_for_approval,
    research_standin,
    scan_person,
    skip_contact,
    stats,
)
from pi_server.store import make_store

log = logging.getLogger("pokedex.app")
STATIC = Path(__file__).resolve().parent / "static"
MAX_IMAGE = 4_000_000


def create_app(store=None) -> FastAPI:
    store = store or make_store()
    app = FastAPI(title="Pokédex for people", version=__version__)
    app.state.store = store
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(DexError)
    async def on_dex_error(_request: Request, exc: DexError):
        return JSONResponse({"error": exc.code, "message": exc.message}, status_code=exc.http)

    @app.get("/")
    def index():
        return FileResponse(STATIC / "index.html")

    @app.get("/scan")
    def scan_page():
        return FileResponse(STATIC / "scan.html")

    app.mount("/static", StaticFiles(directory=STATIC), name="static")

    @app.get("/api/health")
    def health():
        counts = store.read(stats)
        return {
            "ok": True,
            "version": __version__,
            "store": store.kind,
            "blob": bool(os.environ.get("BLOB_READ_WRITE_TOKEN")),
            "event": os.environ.get("DEX_EVENT", "Grok Bot Hackathon, Austin"),
            "mcp": "/mcp",
            "scan": "/scan",
            **counts,
        }

    @app.get("/api/stats")
    def get_stats():
        return store.read(stats)

    @app.get("/api/contacts")
    def contacts(q: str = "", type: str = "", sort: str = "number", limit: int = 100, offset: int = 0):
        rows = store.read(list_contacts, q=q, type_name=type, sort=sort)
        window = rows[max(0, offset): max(0, offset) + max(1, min(limit, 200))]
        counts = store.read(stats)
        return {**counts, "contacts": window}

    @app.get("/api/contacts/{contact_id}")
    def one_contact(contact_id: int):
        return store.read(get_contact, contact_id)

    @app.post("/api/contacts/{contact_id}/profile")
    async def profile(contact_id: int, request: Request):
        body = await request.json()
        return store.call(attach_profile, contact_id, body)

    @app.post("/api/contacts/{contact_id}/research")
    def research(contact_id: int):
        return store.call(research_standin, contact_id)

    @app.post("/api/contacts/{contact_id}/approve")
    def approve(contact_id: int):
        result = store.call(approve_contact, contact_id)
        _notify(result.get("followup"))
        log.info(
            "DECISION approved dex #%s %s",
            result.get("number"),
            result.get("name") or result.get("profile_url"),
        )
        return result

    @app.post("/api/contacts/{contact_id}/skip")
    def skip(contact_id: int):
        result = store.call(skip_contact, contact_id)
        _notify(result.get("followup"))
        log.info("DECISION skipped dex #%s %s", result.get("number"), result.get("name"))
        return result

    @app.get("/api/items")
    def items(status: str = "all"):
        return {"items": store.read(list_items, status)}

    @app.get("/api/items/{item_id}")
    def one_item(item_id: int):
        return store.read(get_item, item_id)

    @app.post("/api/items")
    async def create_item(request: Request):
        body = await request.json()
        item = store.call(
            queue_for_approval,
            to=body.get("to") or "",
            subject=body.get("subject") or "",
            body=body.get("body") or "",
            contact_id=body.get("contact_id"),
        )
        return item

    @app.post("/api/items/{item_id}/approve")
    def approve_item(item_id: int):
        item = store.call(decide, item_id, "approved")
        _notify(item)
        return item

    @app.post("/api/items/{item_id}/reject")
    def reject_item(item_id: int):
        item = store.call(decide, item_id, "rejected")
        _notify(item)
        return item

    @app.post("/api/scans")
    async def scans(request: Request):
        payload = await _read_scan(request)
        research = payload.pop("research", False)
        contact = store.call(scan_person, **payload)
        if research:
            try:
                contact = store.call(research_standin, contact["id"])
            except DexError as exc:
                contact = {**contact, "research_error": exc.message}
        log.info(
            "SEEN dex #%s url=%s name=%s",
            contact.get("number"),
            contact.get("profile_url"),
            contact.get("name"),
        )
        return contact

    @app.post("/api/scans/sample")
    async def sample_scan(request: Request):
        body = await request.json()
        if not body.get("consent"):
            raise DexError("consent_required", "Ask first. Check consent before a demo scan.", 400)
        who = (body.get("who") or "luis").lower()
        sample = SAMPLES.get(who)
        if not sample:
            raise DexError("unknown_sample", "Sample should be luis or samira.", 404)
        sprite = monogram_sprite(sample["name"], abs(hash(who)) % 90)
        # scan_person dithers a photo if given. Pass the monogram as the photo
        # so the sprite is still a four-green image of "them" for the demo.
        contact = store.call(
            scan_person,
            url=sample["profile_url"],
            name="",
            company="",
            photo=sprite,
            qr_image=None,
            consent=True,
            keep_photo=False,
        )
        return contact

    @app.post("/api/demo/reset")
    def reset():
        store.reset()
        counts = store.read(stats)
        return {"ok": True, **counts}

    @app.post("/mcp")
    async def mcp(request: Request):
        _check_mcp_token(request)
        raw = await request.body()
        if not raw.strip():
            return JSONResponse(_rpc_error(None, -32700, "Empty body"), status_code=400)
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            return JSONResponse(_rpc_error(None, -32700, "Parse error"), status_code=400)
        if isinstance(message, list):
            responses = []
            for item in message:
                one = await _dispatch(store, item)
                if one is not None:
                    responses.append(one)
            if not responses:
                return Response(status_code=202)
            payload = responses
        else:
            payload = await _dispatch(store, message)
            if payload is None:
                return Response(status_code=202)
        session = request.headers.get("mcp-session-id") or "pokedex"
        headers = {"Mcp-Session-Id": session, "MCP-Protocol-Version": DEFAULT_PROTOCOL}
        accept = request.headers.get("accept", "")
        if "text/event-stream" in accept and "application/json" not in accept:
            body = "event: message\ndata: " + json.dumps(payload) + "\n\n"
            return Response(content=body, media_type="text/event-stream", headers=headers)
        return JSONResponse(payload, headers=headers)

    @app.get("/mcp")
    def mcp_get():
        return JSONResponse(
            {"error": "method_not_allowed", "message": "POST JSON-RPC to /mcp."},
            status_code=405,
        )

    @app.delete("/mcp")
    def mcp_delete():
        return Response(status_code=200)

    return app


async def _dispatch(store, message: dict):
    params = (message or {}).get("params") or {}
    if message.get("method") == "tools/call" and (params.get("name") == "wait_for_decisions"):
        if "id" not in message:
            return None
        arguments = params.get("arguments") or {}
        found = await _wait_for_decisions(store, arguments.get("since"), arguments.get("timeout_ms"))
        return {
            "jsonrpc": "2.0",
            "id": message.get("id"),
            "result": {
                "content": [{"type": "text", "text": json.dumps({"decisions": found}, indent=2)}],
                "isError": False,
            },
        }
    return handle(store, message)


async def _wait_for_decisions(store, since: str | None, timeout_ms) -> list[dict]:
    try:
        timeout_ms = int(timeout_ms if timeout_ms is not None else 15000)
    except (TypeError, ValueError):
        timeout_ms = 15000
    timeout_ms = max(0, min(timeout_ms, 25000))
    threshold = since or now_iso()
    deadline = asyncio.get_event_loop().time() + (timeout_ms / 1000)
    while True:
        found = store.read(decided_since, threshold)
        if found or asyncio.get_event_loop().time() >= deadline:
            return found
        await asyncio.sleep(0.25)


async def _read_scan(request: Request) -> dict:
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        body = await request.json()
        photo = _decode_b64(body.get("photo_base64"))
        qr_image = _decode_b64(body.get("qr_image_base64"))
        return {
            "url": body.get("url") or "",
            "name": body.get("name") or "",
            "company": body.get("company") or "",
            "photo": photo,
            "qr_image": qr_image,
            "consent": bool(body.get("consent")),
            "research": bool(body.get("research")),
        }
    form = await request.form()
    consent = str(form.get("consent") or "").lower() in ("1", "true", "yes", "on")
    photo = await _upload_bytes(form.get("photo"))
    qr_image = await _upload_bytes(form.get("qr_image"))
    return {
        "url": str(form.get("url") or ""),
        "name": str(form.get("name") or ""),
        "company": str(form.get("company") or ""),
        "photo": photo,
        "qr_image": qr_image,
        "consent": consent,
        "research": str(form.get("research") or "").lower() in ("1", "true", "yes", "on"),
    }


async def _upload_bytes(upload) -> bytes | None:
    if upload is None or not hasattr(upload, "read"):
        return None
    data = await upload.read()
    if not data:
        return None
    if len(data) > MAX_IMAGE:
        raise DexError("image_too_large", "That photo is over 4 MB. Retake it a little smaller.", 413)
    return data


def _decode_b64(value) -> bytes | None:
    if not value or not isinstance(value, str):
        return None
    import base64

    if value.startswith("data:") and "," in value:
        value = value.split(",", 1)[1]
    try:
        data = base64.b64decode(value)
    except Exception as exc:
        raise DexError("bad_image", "Could not read that image.", 400) from exc
    if len(data) > MAX_IMAGE:
        raise DexError("image_too_large", "That photo is over 4 MB.", 413)
    return data


def _check_mcp_token(request: Request) -> None:
    expected = os.environ.get("MCP_TOKEN", "").strip()
    if not expected:
        return
    header = request.headers.get("authorization", "")
    supplied = header.removeprefix("Bearer ").strip() if header.lower().startswith("bearer ") else ""
    supplied = supplied or request.headers.get("x-mcp-token", "")
    if supplied != expected:
        raise DexError("unauthorized", "MCP token does not match.", 401)


def _notify(item: dict | None) -> None:
    url = os.environ.get("DECISION_WEBHOOK_URL", "").strip()
    if not url or not item or item.get("status") not in ("approved", "rejected"):
        return

    def send():
        data = json.dumps(item).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            urllib.request.urlopen(req, timeout=5).read()
        except Exception:
            log.exception("decision webhook failed")

    threading.Thread(target=send, daemon=True).start()


def _rpc_error(msg_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}
