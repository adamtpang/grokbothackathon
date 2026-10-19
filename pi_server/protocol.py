"""Game Boy link protocol. The Pi is the clock master.

See gameboy/PROTOCOL.md. The browser does not use this; the Pi bridge does.
"""

from __future__ import annotations

SYNC = 0xAA
POLL_A = 0xA5
POLL_B = 0x5A

CMD_HELLO = 0x01
CMD_SHOW = 0x02
CMD_IDLE = 0x04
CMD_ACK = 0x10
CMD_PING = 0x7E

EVT_A = 0x41
EVT_B = 0x42
EVT_UP = 0x55
EVT_DOWN = 0x44
EVT_LEFT = 0x4C
EVT_RIGHT = 0x52
EVT_NAK = 0x15

FLAG_CAUGHT = 0x01
FLAG_DRAFT = 0x02
FLAG_NAMED = 0x04


def sanitize(text: str, limit: int) -> bytes:
    out = bytearray()
    for ch in text or "":
        if ch == "\n":
            out.append(10)
        elif ch == "\r":
            continue
        elif 32 <= ord(ch) <= 126:
            out.append(ord(ch))
        else:
            out.append(ord("?"))
        if len(out) >= limit:
            break
    return bytes(out)


def pascal(text: str, limit: int) -> bytes:
    raw = sanitize(text, limit)
    return bytes([len(raw)]) + raw


def checksum(cmd: int, data: bytes) -> int:
    value = cmd ^ ((len(data) >> 8) & 0xFF) ^ (len(data) & 0xFF)
    for byte in data:
        value ^= byte
    return value & 0xFF


def build_packet(cmd: int, data: bytes = b"") -> bytes:
    if len(data) > 500:
        raise ValueError("packet too long")
    length = len(data)
    return bytes([SYNC, cmd, (length >> 8) & 0xFF, length & 0xFF]) + data + bytes([checksum(cmd, data)])


def build_poll() -> bytes:
    return bytes([POLL_A, POLL_B, 0x00])


def encode_show(entry: dict) -> bytes:
    data = bytes([
        (int(entry["id"]) >> 8) & 0xFF,
        int(entry["id"]) & 0xFF,
        int(entry["index"]) & 0xFF,
        int(entry["total"]) & 0xFF,
        int(entry["flags"]) & 0xFF,
    ])
    for key, limit in (
        ("name", 20),
        ("category", 22),
        ("types", 18),
        ("title", 20),
        ("company", 20),
        ("flavor", 96),
        ("area", 32),
        ("draft", 120),
    ):
        data += pascal(entry.get(key) or "", limit)
    return build_packet(CMD_SHOW, data)


def contact_entry(contact: dict, index: int, total: int) -> dict:
    flags = 0
    if contact.get("status") == "caught":
        flags |= FLAG_CAUGHT
    followup = contact.get("followup") or {}
    draft = ""
    if followup.get("status") == "pending":
        flags |= FLAG_DRAFT
        draft = followup.get("body") or ""
    if contact.get("name"):
        flags |= FLAG_NAMED
    types = "/".join(contact.get("types") or [])
    return {
        "id": contact["id"],
        "index": index,
        "total": total,
        "flags": flags,
        "name": contact.get("name") or "Unread",
        "category": contact.get("category") or "",
        "types": types,
        "title": contact.get("title") or "",
        "company": contact.get("company") or "",
        "flavor": contact.get("flavor_text") or "QR only. Waiting on a profile.",
        "area": contact.get("area") or "",
        "draft": draft or ("READY" if flags & FLAG_DRAFT else contact.get("followup_status") or "none"),
    }


def extract_event(rx: bytes) -> int:
    for event in (EVT_A, EVT_B, EVT_LEFT, EVT_RIGHT, EVT_UP, EVT_DOWN, EVT_NAK):
        if event in rx:
            return event
    return 0


def take_pascal(buf: bytes, index: int) -> tuple[str, int]:
    if index >= len(buf):
        raise ValueError("short pascal")
    length = buf[index]
    index += 1
    if index + length > len(buf):
        raise ValueError("pascal overruns packet")
    text = bytes(buf[index:index + length]).decode("ascii", "replace")
    return text, index + length


class GbSlaveSim:
    """Byte-accurate stand-in for the ROM's external-clock shift register."""

    def __init__(self):
        self.sb = 0
        self.event = 0
        self.nak = False
        self.state = "hunt"
        self.cmd = 0
        self.length = 0
        self.buf = bytearray()
        self.chk = 0
        self.bad = False
        self.fields: dict[str, str] = {}
        self.dex_id = 0
        self.index = 0
        self.total = 0
        self.flags = 0
        self.idle = False
        self.acks = 0

    def press(self, event: int) -> None:
        self.event = event

    def response(self) -> int:
        if self.event:
            return self.event
        if self.nak:
            return EVT_NAK
        return 0

    def exchange(self, data: bytes) -> bytes:
        out = bytearray()
        for byte in data:
            out.append(self.sb)
            self.consume(byte)
            self.sb = self.response()
        return bytes(out)

    def consume(self, byte: int) -> None:
        if self.state == "hunt":
            if byte == POLL_A:
                self.state = "poll"
            elif byte == SYNC:
                self.state = "cmd"
            return
        if self.state == "poll":
            self.state = "hunt"
            return
        if self.state == "cmd":
            self.cmd = byte
            self.chk = byte
            self.state = "len_hi"
            return
        if self.state == "len_hi":
            self.length = byte << 8
            self.chk ^= byte
            self.state = "len_lo"
            return
        if self.state == "len_lo":
            self.length |= byte
            self.chk ^= byte
            self.buf = bytearray()
            self.bad = self.length > 500
            self.state = "chk" if self.length == 0 else ("discard" if self.bad else "data")
            return
        if self.state in ("data", "discard"):
            if self.state == "data":
                self.buf.append(byte)
                self.chk ^= byte
            else:
                self.buf.append(byte)
            if len(self.buf) >= self.length:
                self.state = "chk"
            return
        if self.state == "chk":
            ok = byte == (self.chk & 0xFF) and not self.bad
            self.state = "hunt"
            self.bad = False
            if not ok:
                self.nak = True
                self.buf = bytearray()
                return
            self.nak = False
            self._apply()
            self.buf = bytearray()

    def _apply(self) -> None:
        if self.cmd == CMD_ACK:
            self.event = 0
            self.acks += 1
            return
        if self.cmd == CMD_IDLE:
            self.idle = True
            self.fields = {}
            return
        if self.cmd == CMD_HELLO:
            self.idle = False
            return
        if self.cmd != CMD_SHOW:
            return
        data = bytes(self.buf)
        if len(data) < 5:
            self.nak = True
            return
        self.dex_id = (data[0] << 8) | data[1]
        self.index = data[2]
        self.total = data[3]
        self.flags = data[4]
        index = 5
        fields = {}
        try:
            for key in ("name", "category", "types", "title", "company", "flavor", "area", "draft"):
                text, index = take_pascal(data, index)
                fields[key] = text
        except ValueError:
            self.nak = True
            return
        self.fields = fields
        self.idle = False
