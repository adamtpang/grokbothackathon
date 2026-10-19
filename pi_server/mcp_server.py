"""Streamable HTTP MCP. One JSON-RPC object per POST, JSON or SSE."""

from __future__ import annotations

import base64
import json

from pi_server.model import DexError

PROTOCOL_VERSIONS = ("2025-06-18", "2025-03-26", "2024-11-05")
DEFAULT_PROTOCOL = "2025-03-26"

INSTRUCTIONS = (
    "You are the researcher for a real-life Pokédex. People are scanned only "
    "with consent. scan_person (alias capture_badge) records a LinkedIn, X, "
    "Luma, or other URL QR plus an optional photo. Read the URL or the typed "
    "name, then attach_profile with name, category (for example 'the Founder "
    "Pokémon'), one or two types such as AI or Hardware, title, company, "
    "flavor_text, and email. queue_for_approval files the follow-up. The human "
    "presses A to approve and B to skip. Do not claim the message was sent "
    "until get_decision or wait_for_decisions says approved. Never do face "
    "recognition; the photo is only a pixel sprite."
)


def tools() -> list[dict]:
    scan = {
        "name": "scan_person",
        "description": (
            "Record a person as seen. Pass the QR URL (LinkedIn, X, Luma, or any "
            "https URL), any name and company they typed, and an optional photo. "
            "consent must be true — only scan people who agree. Returns the new "
            "dex number, the decoded URL, and the photo sprite. Does not identify faces."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "consent": {"type": "boolean", "description": "True only after the person agrees."},
                "url": {"type": "string", "description": "Decoded QR URL, if the camera or phone already read it."},
                "name": {"type": "string"},
                "company": {"type": "string"},
                "photo_base64": {"type": "string", "description": "Optional JPEG/PNG of the person, base64."},
                "qr_image_base64": {"type": "string", "description": "Optional photo of the QR code, base64."},
                "mime": {"type": "string"},
            },
            "required": ["consent"],
        },
    }
    alias = {
        "name": "capture_badge",
        "description": "Alias of scan_person. There are no paper badges at this event; this scans a person's QR and optional photo.",
        "inputSchema": scan["inputSchema"],
    }
    return [
        scan,
        alias,
        {
            "name": "list_contacts",
            "description": "List dex entries in scan order, with seen and caught counts.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "q": {"type": "string"},
                    "type": {"type": "string", "description": "Filter by one type tag."},
                    "sort": {"type": "string", "enum": ["number", "name", "type"]},
                },
            },
        },
        {
            "name": "attach_profile",
            "description": (
                "Write the researched profile onto a dex entry. category is a "
                "short epithet such as 'the Founder Pokémon'. types is one or two tags. "
                "flavor_text is the one-line summary."
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer", "description": "Dex entry id."},
                    "name": {"type": "string"},
                    "category": {"type": "string"},
                    "types": {
                        "type": "array",
                        "items": {"type": "string"},
                        "maxItems": 2,
                        "description": "One or two tags, such as AI or Hardware.",
                    },
                    "title": {"type": "string"},
                    "company": {"type": "string"},
                    "flavor_text": {"type": "string"},
                    "email": {"type": "string"},
                    "profile_url": {"type": "string"},
                    "notes": {"type": "string"},
                },
                "required": ["id"],
            },
        },
        {
            "name": "queue_for_approval",
            "description": "Queue a follow-up email. It is not sent until a person presses A.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "to": {"type": "string"},
                    "subject": {"type": "string"},
                    "body": {"type": "string"},
                    "contact_id": {"type": "integer"},
                },
                "required": ["to", "subject", "body"],
            },
        },
        {
            "name": "get_decision",
            "description": "Read whether a follow-up is pending, approved, or rejected.",
            "inputSchema": {
                "type": "object",
                "properties": {"id": {"type": "integer"}},
                "required": ["id"],
            },
        },
        {
            "name": "list_items",
            "description": "List follow-up drafts. Optional status: pending, approved, rejected, or all.",
            "inputSchema": {
                "type": "object",
                "properties": {"status": {"type": "string"}},
            },
        },
        {
            "name": "wait_for_decisions",
            "description": "Wait until a follow-up is approved or rejected. since is an ISO timestamp; omit it to wait for a new decision.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "since": {"type": "string"},
                    "timeout_ms": {"type": "integer"},
                },
            },
        },
    ]


def handle(store, message: dict) -> dict | None:
    if not isinstance(message, dict):
        return _error(None, -32600, "Invalid request")
    method = message.get("method")
    msg_id = message.get("id")
    params = message.get("params") or {}
    if method and "id" not in message:
        return None
    if method == "initialize":
        requested = (params.get("protocolVersion") or DEFAULT_PROTOCOL)
        version = requested if requested in PROTOCOL_VERSIONS else DEFAULT_PROTOCOL
        return _result(msg_id, {
            "protocolVersion": version,
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": {"name": "pokedex-for-people", "version": "0.1.0"},
            "instructions": INSTRUCTIONS,
        })
    if method == "ping":
        return _result(msg_id, {})
    if method == "tools/list":
        return _result(msg_id, {"tools": tools()})
    if method == "tools/call":
        name = params.get("name")
        arguments = params.get("arguments") or {}
        try:
            payload, image = call_tool(store, name, arguments)
        except DexError as exc:
            return _result(msg_id, {
                "content": [{"type": "text", "text": exc.message}],
                "isError": True,
            })
        except Exception as exc:  # noqa: BLE001 — surface tool bugs to the bot
            return _result(msg_id, {
                "content": [{"type": "text", "text": str(exc)}],
                "isError": True,
            })
        content = [{"type": "text", "text": json.dumps(payload, indent=2)}]
        if image:
            content.append(image)
        return _result(msg_id, {"content": content, "isError": False})
    return _error(msg_id, -32601, f"Unknown method: {method}")


def call_tool(store, name: str, arguments: dict) -> tuple[dict, dict | None]:
    if name in ("scan_person", "capture_badge"):
        photo = _b64(arguments.get("photo_base64"))
        qr_image = _b64(arguments.get("qr_image_base64"))
        contact = store.call(
            __import__("pi_server.model", fromlist=["scan_person"]).scan_person,
            url=arguments.get("url") or "",
            name=arguments.get("name") or "",
            company=arguments.get("company") or "",
            photo=photo,
            qr_image=qr_image,
            consent=bool(arguments.get("consent")),
        )
        return _scan_payload(contact), _image_block(contact.get("sprite_url"))
    if name == "list_contacts":
        from pi_server.model import list_contacts, stats

        contacts = store.read(
            list_contacts,
            q=arguments.get("q") or "",
            type_name=arguments.get("type") or "",
            sort=arguments.get("sort") or "number",
        )
        counts = store.read(stats)
        return {"seen": counts["seen"], "caught": counts["caught"], "contacts": contacts}, None
    if name == "attach_profile":
        from pi_server.model import attach_profile

        if "id" not in arguments:
            raise DexError("missing_id", "attach_profile needs id.", 400)
        contact = store.call(attach_profile, int(arguments["id"]), arguments)
        return contact, None
    if name == "queue_for_approval":
        from pi_server.model import queue_for_approval

        item = store.call(
            queue_for_approval,
            to=arguments.get("to") or "",
            subject=arguments.get("subject") or "",
            body=arguments.get("body") or "",
            contact_id=int(arguments["contact_id"]) if arguments.get("contact_id") else None,
        )
        return item, None
    if name == "get_decision":
        from pi_server.model import get_item

        return store.read(get_item, int(arguments["id"])), None
    if name == "list_items":
        from pi_server.model import list_items

        status = arguments.get("status")
        return {"items": store.read(list_items, status)}, None
    if name == "wait_for_decisions":
        raise DexError("use_async", "wait_for_decisions is handled by the HTTP route.", 500)
    raise DexError("unknown_tool", f"Unknown tool: {name}", 404)


def _scan_payload(contact: dict) -> dict:
    return {
        "id": contact["id"],
        "number": contact["number"],
        "status": contact["status"],
        "name": contact["name"],
        "company": contact["company"],
        "url": contact["profile_url"],
        "profile_source": contact["profile_source"],
        "area": contact["area"],
        "sprite_url": contact["sprite_url"],
        "photo_url": contact["photo_url"],
        "next": (
            "Research this person from the URL or the typed name, then call "
            "attach_profile and queue_for_approval. Do not use face recognition."
        ),
    }


def _image_block(url: str | None) -> dict | None:
    if not url or not url.startswith("data:"):
        return None
    try:
        header, encoded = url.split(",", 1)
        mime = header.split(";")[0].split(":", 1)[1]
        base64.b64decode(encoded[:80], validate=False)
    except Exception:
        return None
    return {"type": "image", "data": encoded, "mimeType": mime}


def _b64(value) -> bytes | None:
    if not value or not isinstance(value, str):
        return None
    if "," in value and value.strip().startswith("data:"):
        value = value.split(",", 1)[1]
    return base64.b64decode(value)


def _result(msg_id, result: dict) -> dict:
    return {"jsonrpc": "2.0", "id": msg_id, "result": result}


def _error(msg_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": msg_id, "error": {"code": code, "message": message}}
