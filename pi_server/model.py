"""Dex rules: numbers, seen versus caught, profiles, and follow-up drafts.

A phone, the browser, the Game Boy bridge, and MCP all call this module.
Nothing here knows about HTTP.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from pi_server.catalog import EVENT, SEED, lookup_profile
from pi_server.images import data_url, monogram_sprite, shrink_photo, sprite_from_bytes, store_image
from pi_server.qr import classify_url, decode_qr

CT = ZoneInfo("America/Chicago")


class DexError(Exception):
    def __init__(self, code: str, message: str, http: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.http = http


def event_name() -> str:
    return os.environ.get("DEX_EVENT", EVENT)


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def parse_ts(value: str) -> datetime:
    text = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def format_clock(iso: str) -> str:
    local = parse_ts(iso).astimezone(CT)
    return local.strftime("%I:%M %p").lstrip("0")


def make_area(event: str, iso: str) -> str:
    return f"{event} · {format_clock(iso)}"


def blank_state() -> dict:
    return {
        "version": 1,
        "contacts": [],
        "items": [],
        "next_contact_id": 1,
        "next_item_id": 1,
    }


def make_seed_state() -> dict:
    state = blank_state()
    moment = datetime.now(timezone.utc)
    event = event_name()
    for person in SEED:
        caught_at = (moment - timedelta(minutes=person["minutes_ago"])).strftime(
            "%Y-%m-%dT%H:%M:%S.%fZ"
        )
        sprite = data_url(monogram_sprite(person["name"], person["minutes_ago"]), "image/png")
        contact = _new_contact(
            state,
            name=person["name"],
            event=event,
            caught_at=caught_at,
            profile_url=person["profile_url"],
            sprite_url=sprite,
        )
        contact["category"] = person["category"]
        contact["types"] = list(person["types"])
        contact["title"] = person["title"]
        contact["company"] = person["company"]
        contact["flavor_text"] = person["flavor_text"]
        contact["email"] = person["email"]
        contact["profile_source"] = classify_url(person["profile_url"])
        if person["body"]:
            item = _add_item(
                state,
                contact_id=contact["id"],
                to=person["email"],
                subject=person["subject"],
                body=person["body"],
                created_at=caught_at,
            )
            if person["caught"]:
                decided = (moment - timedelta(minutes=max(5, person["minutes_ago"] // 5))).strftime(
                    "%Y-%m-%dT%H:%M:%S.%fZ"
                )
                item["status"] = "approved"
                item["decided_at"] = decided
                contact["status"] = "caught"
                contact["followup_status"] = "approved"
            else:
                contact["followup_status"] = "pending"
    return state


def stats(state: dict) -> dict:
    contacts = state["contacts"]
    caught = sum(1 for contact in contacts if contact["status"] == "caught")
    return {"seen": len(contacts), "caught": caught, "total": len(contacts)}


def list_contacts(state: dict, q: str = "", type_name: str = "", sort: str = "number") -> list[dict]:
    rows = [view_contact(state, contact) for contact in state["contacts"]]
    needle = (q or "").strip().lower()
    if needle:
        rows = [
            row
            for row in rows
            if needle
            in " ".join(
                [
                    row["name"],
                    row["company"],
                    row["title"],
                    row["category"],
                    row["flavor_text"],
                    " ".join(row["types"]),
                ]
            ).lower()
        ]
    if type_name:
        wanted = type_name.strip().lower()
        rows = [row for row in rows if any(item.lower() == wanted for item in row["types"])]
    if sort == "name":
        rows.sort(key=lambda row: (row["name"] or "\uffff").lower())
    elif sort == "type":
        rows.sort(key=lambda row: ((row["types"][0] if row["types"] else "\uffff").lower(), row["id"]))
    else:
        rows.sort(key=lambda row: row["id"])
    return rows


def get_contact(state: dict, contact_id: int) -> dict:
    return view_contact(state, _require_contact(state, contact_id))


def scan_person(
    state: dict,
    *,
    url: str = "",
    name: str = "",
    company: str = "",
    photo: bytes | None = None,
    qr_image: bytes | None = None,
    consent: bool = False,
    keep_photo: bool = True,
) -> dict:
    if not consent:
        raise DexError(
            "consent_required",
            "Ask first. Scan only people who agree to the photo and the QR.",
            400,
        )
    decoded = decode_qr(qr_image)
    profile_url = (url or decoded or "").strip()
    name = (name or "").strip()
    company = (company or "").strip()
    if not profile_url and not name and not company and not photo:
        raise DexError(
            "empty_scan",
            "Photograph a LinkedIn, X, or Luma QR, or type a name and company.",
            400,
        )
    caught_at = now_iso()
    sprite_bytes = sprite_from_bytes(photo) if photo else monogram_sprite(name or company or "??", state["next_contact_id"])
    contact = _new_contact(
        state,
        name=name,
        event=event_name(),
        caught_at=caught_at,
        profile_url=profile_url,
        sprite_url="",
    )
    contact["company"] = company
    contact["profile_source"] = classify_url(profile_url)
    contact["sprite_url"] = store_image(sprite_bytes, "image/png", f"sprites/{contact['id']}.png")
    if photo and keep_photo:
        try:
            jpeg = shrink_photo(photo)
            contact["photo_url"] = store_image(jpeg, "image/jpeg", f"photos/{contact['id']}.jpg")
        except Exception:
            contact["photo_url"] = ""
    return view_contact(state, contact)


def attach_profile(state: dict, contact_id: int, fields: dict) -> dict:
    contact = _require_contact(state, contact_id)
    if "types" in fields and fields["types"] is not None:
        contact["types"] = _clean_types(fields["types"])
    flavor = fields.get("flavor_text") or fields.get("summary") or ""
    if isinstance(flavor, str) and flavor.strip():
        contact["flavor_text"] = flavor.strip()[:180]
    for key, limit in (
        ("name", 80),
        ("category", 48),
        ("title", 80),
        ("company", 80),
        ("email", 120),
        ("notes", 500),
    ):
        value = fields.get(key)
        if isinstance(value, str) and value.strip():
            contact[key] = value.strip()[:limit]
    if isinstance(fields.get("profile_url"), str) and fields["profile_url"].strip():
        contact["profile_url"] = fields["profile_url"].strip()[:300]
        contact["profile_source"] = classify_url(contact["profile_url"])
    if isinstance(fields.get("area"), str) and fields["area"].strip():
        contact["area"] = fields["area"].strip()[:80]
    if contact["name"] and contact["sprite_url"].startswith("data:") and not contact["photo_url"]:
        # Replace the placeholder monogram once we know who they are,
        # unless a real photo was already dithered into the sprite.
        if "monogram" not in contact["sprite_url"]:
            pass
    return view_contact(state, contact)


def research_standin(state: dict, contact_id: int) -> dict:
    """Fill a known demo URL the way Grok Bot would, using the same writes."""
    contact = _require_contact(state, contact_id)
    profile = lookup_profile(contact.get("profile_url", ""), contact.get("name", ""))
    if not profile:
        raise DexError(
            "unknown_person",
            "No local notes for this QR. Grok Bot should read the URL and call attach_profile.",
            404,
        )
    attach_profile(
        state,
        contact_id,
        {
            "name": profile["name"],
            "category": profile["category"],
            "types": profile["types"],
            "title": profile["title"],
            "company": profile["company"],
            "flavor_text": profile["flavor_text"],
            "email": profile["email"],
            "profile_url": profile["profile_url"],
        },
    )
    item = None
    if profile.get("body"):
        item = queue_for_approval(
            state,
            to=profile["email"],
            subject=profile["subject"],
            body=profile["body"],
            contact_id=contact_id,
        )
    viewed = view_contact(state, _require_contact(state, contact_id))
    viewed["research"] = "stand-in"
    if item:
        viewed["queued_item_id"] = item["id"]
    return viewed


def queue_for_approval(
    state: dict,
    *,
    to: str,
    subject: str,
    body: str,
    contact_id: int | None = None,
) -> dict:
    to = (to or "").strip()
    subject = (subject or "").strip()
    body = (body or "").strip()
    if not to or not subject or not body:
        raise DexError("missing_draft", "A follow-up needs to, subject, and body.", 400)
    contact = _require_contact(state, contact_id) if contact_id else None
    existing = _pending_item(state, contact["id"]) if contact else None
    if existing:
        existing["to"] = to
        existing["subject"] = subject
        existing["body"] = body
        item = existing
    else:
        item = _add_item(
            state,
            contact_id=contact["id"] if contact else None,
            to=to,
            subject=subject,
            body=body,
            created_at=now_iso(),
        )
    if contact:
        contact["followup_status"] = "pending"
        if not contact["email"]:
            contact["email"] = to
    return view_item(item)


def get_item(state: dict, item_id: int) -> dict:
    item = _find_item(state, item_id)
    if not item:
        raise DexError("not_found", "No follow-up with that id.", 404)
    return view_item(item)


def list_items(state: dict, status: str | None = None) -> list[dict]:
    rows = state["items"]
    if status and status != "all":
        rows = [item for item in rows if item["status"] == status]
    return [view_item(item) for item in rows]


def decided_since(state: dict, since_iso: str) -> list[dict]:
    threshold = parse_ts(since_iso)
    found = []
    for item in state["items"]:
        if item["status"] not in ("approved", "rejected") or not item.get("decided_at"):
            continue
        if parse_ts(item["decided_at"]) > threshold:
            found.append(view_item(item))
    return found


def decide(state: dict, item_id: int, status: str) -> dict:
    if status not in ("approved", "rejected"):
        raise DexError("bad_status", "Status must be approved or rejected.", 400)
    item = _find_item(state, item_id)
    if not item:
        raise DexError("not_found", "No follow-up with that id.", 404)
    if item["status"] != "pending":
        raise DexError("already_decided", f"This follow-up is already {item['status']}.", 409)
    item["status"] = status
    item["decided_at"] = now_iso()
    if item.get("contact_id"):
        contact = _find_contact(state, item["contact_id"])
        if contact:
            contact["followup_status"] = status
            if status == "approved":
                contact["status"] = "caught"
    return view_item(item)


def approve_contact(state: dict, contact_id: int) -> dict:
    contact = _require_contact(state, contact_id)
    item = _pending_item(state, contact["id"])
    if not item:
        raise DexError("no_followup", "No follow-up is waiting on this entry.", 409)
    decide(state, item["id"], "approved")
    return view_contact(state, contact)


def skip_contact(state: dict, contact_id: int) -> dict:
    contact = _require_contact(state, contact_id)
    item = _pending_item(state, contact["id"])
    if item:
        decide(state, item["id"], "rejected")
    contact["followup_status"] = "skipped"
    if contact["status"] != "caught":
        contact["status"] = "seen"
    return view_contact(state, contact)


def view_contact(state: dict, contact: dict) -> dict:
    item = _latest_item(state, contact["id"])
    number = f"{int(contact['id']):03d}"
    return {
        "id": contact["id"],
        "number": number,
        "name": contact["name"],
        "category": contact["category"],
        "types": list(contact["types"]),
        "title": contact["title"],
        "company": contact["company"],
        "flavor_text": contact["flavor_text"],
        "email": contact["email"],
        "event": contact["event"],
        "caught_at": contact["caught_at"],
        "area": contact["area"],
        "status": contact["status"],
        "profile_url": contact["profile_url"],
        "profile_source": contact["profile_source"],
        "sprite_url": contact["sprite_url"],
        "photo_url": contact["photo_url"],
        "followup_status": contact["followup_status"],
        "followup": view_item(item) if item else None,
        "notes": contact["notes"],
        "created_at": contact["created_at"],
    }


def view_item(item: dict) -> dict:
    return {
        "id": item["id"],
        "contact_id": item.get("contact_id"),
        "to": item["to"],
        "subject": item["subject"],
        "body": item["body"],
        "status": item["status"],
        "created_at": item["created_at"],
        "decided_at": item.get("decided_at"),
    }


def _new_contact(state, *, name, event, caught_at, profile_url, sprite_url) -> dict:
    contact_id = state["next_contact_id"]
    state["next_contact_id"] = contact_id + 1
    contact = {
        "id": contact_id,
        "name": name,
        "category": "",
        "types": [],
        "title": "",
        "company": "",
        "flavor_text": "",
        "email": "",
        "event": event,
        "caught_at": caught_at,
        "area": make_area(event, caught_at),
        "status": "seen",
        "profile_url": profile_url,
        "profile_source": classify_url(profile_url),
        "sprite_url": sprite_url,
        "photo_url": "",
        "followup_status": "none",
        "notes": "",
        "created_at": caught_at,
    }
    state["contacts"].append(contact)
    return contact


def _add_item(state, *, contact_id, to, subject, body, created_at) -> dict:
    item_id = state["next_item_id"]
    state["next_item_id"] = item_id + 1
    item = {
        "id": item_id,
        "contact_id": contact_id,
        "to": to,
        "subject": subject,
        "body": body,
        "status": "pending",
        "created_at": created_at,
        "decided_at": None,
    }
    state["items"].append(item)
    return item


def _clean_types(value) -> list[str]:
    if isinstance(value, str):
        parts = [part.strip() for part in value.split(",")]
    elif isinstance(value, list):
        parts = [str(part).strip() for part in value]
    else:
        raise DexError("bad_types", "Types should be one or two short tags.", 400)
    types = [part[:24] for part in parts if part]
    if len(types) > 2:
        raise DexError("too_many_types", "Use one or two types, such as AI or Hardware.", 400)
    return types


def _find_contact(state, contact_id: int):
    for contact in state["contacts"]:
        if contact["id"] == int(contact_id):
            return contact
    return None


def _require_contact(state, contact_id: int):
    contact = _find_contact(state, contact_id)
    if not contact:
        raise DexError("not_found", "No entry with that number.", 404)
    return contact


def _find_item(state, item_id: int):
    for item in state["items"]:
        if item["id"] == int(item_id):
            return item
    return None


def _pending_item(state, contact_id: int):
    for item in reversed(state["items"]):
        if item.get("contact_id") == contact_id and item["status"] == "pending":
            return item
    return None


def _latest_item(state, contact_id: int):
    for item in reversed(state["items"]):
        if item.get("contact_id") == contact_id:
            return item
    return None
